import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    mockGetJob,
    mockCompleteJob,
    mockDisputeJob,
    mockRelease,
    mockRecordEvent,
    mockUpdateOnChainReputationFromOracle,
} = vi.hoisted(() => ({
    mockGetJob: vi.fn(),
    mockCompleteJob: vi.fn(),
    mockDisputeJob: vi.fn(),
    mockRelease: vi.fn(),
    mockRecordEvent: vi.fn(),
    mockUpdateOnChainReputationFromOracle: vi.fn(),
}));

vi.mock("@/services/jobService", () => ({
    getJob: mockGetJob,
    completeJob: mockCompleteJob,
    disputeJob: mockDisputeJob,
}));

vi.mock("@/services/paymentService", () => ({
    release: mockRelease,
}));

vi.mock("@/services/reputationService", () => ({
    recordEvent: mockRecordEvent,
}));

vi.mock("@/services/onChainReputationService", () => ({
    updateOnChainReputationFromOracle: mockUpdateOnChainReputationFromOracle,
}));

import { settleJobFromOracle } from "@/services/oracleSettlementService";

describe("oracleSettlementService", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockUpdateOnChainReputationFromOracle.mockResolvedValue({
            status: "skipped",
            reason: "HEYELSA_ONCHAIN_REPUTATION_ENABLED is not true",
        });

        mockGetJob.mockResolvedValue({
            id: "job-1",
            posterId: "poster-1",
            hiredAgentId: "agent-1",
            status: "delivered",
        });
    });

    it("completes and releases payment when oracle approves", async () => {
        mockCompleteJob.mockResolvedValue({ id: "job-1", status: "completed" });
        mockRelease.mockResolvedValue({ id: "tx-1", txHash: "0xabc" });

        const out = await settleJobFromOracle({
            jobId: "job-1",
            approved: true,
            proof: {
                jobId: "job-1",
                deliverableHash: "ipfs://Qm1",
            },
            reason: "Passed policy checks",
        });

        expect(out.status).toBe("approved");
        expect(mockCompleteJob).toHaveBeenCalledWith("job-1", "poster-1");
        expect(mockRelease).toHaveBeenCalledWith("job-1", undefined);
        expect(mockUpdateOnChainReputationFromOracle).toHaveBeenCalledWith(
            expect.objectContaining({ localAgentId: "agent-1", success: true }),
        );
        expect(mockRecordEvent).toHaveBeenCalledTimes(2);
    });

    it("moves job to disputed when oracle rejects", async () => {
        mockDisputeJob.mockResolvedValue({ id: "job-1", status: "disputed" });

        const out = await settleJobFromOracle({
            jobId: "job-1",
            approved: false,
            proof: {
                jobId: "job-1",
                deliverableHash: "ipfs://Qm2",
            },
            reason: "Insufficient quality",
        });

        expect(out.status).toBe("rejected");
        expect(mockDisputeJob).toHaveBeenCalledWith("job-1", "poster-1");
        expect(mockRelease).not.toHaveBeenCalled();
        expect(mockUpdateOnChainReputationFromOracle).toHaveBeenCalledWith(
            expect.objectContaining({ localAgentId: "agent-1", success: false }),
        );
        expect(mockRecordEvent).toHaveBeenCalledTimes(1);
    });

    it("rejects mismatched proofHash", async () => {
        await expect(
            settleJobFromOracle({
                jobId: "job-1",
                approved: true,
                proof: {
                    jobId: "job-1",
                    deliverableHash: "ipfs://Qm3",
                },
                proofHash:
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
            }),
        ).rejects.toThrow(/proofHash does not match/i);
    });
});
