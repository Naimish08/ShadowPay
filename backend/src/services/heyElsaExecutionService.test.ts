import { beforeEach, describe, expect, it, vi } from "vitest";
import type { buildHeyElsaOrchestrationPlan } from "@/services/heyElsaOrchestrationService";

const {
    mockCreateBlueprint,
    mockCreateJob,
    mockBuildPlan,
    mockPostBlueprintToSepolia,
} = vi.hoisted(() => ({
    mockCreateBlueprint: vi.fn(),
    mockCreateJob: vi.fn(),
    mockBuildPlan: vi.fn(),
    mockPostBlueprintToSepolia: vi.fn(),
}));

vi.mock("@/services/councilBlueprintService", () => ({
    createBlueprint: mockCreateBlueprint,
}));

vi.mock("@/services/jobService", () => ({
    createJob: mockCreateJob,
}));

vi.mock("@/services/heyElsaOrchestrationService", () => ({
    buildHeyElsaOrchestrationPlan: mockBuildPlan,
}));

vi.mock("@/services/heyElsaOnChainService", () => ({
    postBlueprintToSepolia: mockPostBlueprintToSepolia,
}));

import { executeHeyElsaPipeline } from "@/services/heyElsaExecutionService";

describe("heyElsaExecutionService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("creates blueprint and job using orchestration quote", async () => {
        const plan = {
            quote: {
                totalMaxCostEth: "0.0100",
                paymentProtocol: "x402-via-heyelsa",
            },
            tasks: [
                {
                    id: 1,
                    type: "strategy_plan",
                    preferredModel: "GPT",
                    maxBudgetSepoliaEth: "0.0025",
                    status: "bidding",
                },
            ],
            pipeline: ["Council deliberation in parallel"],
            evidenceBundleTemplate: {
                subtasks: [],
            },
        } as unknown as ReturnType<typeof buildHeyElsaOrchestrationPlan>;

        mockBuildPlan.mockReturnValue(plan);

        mockCreateBlueprint.mockResolvedValue({
            id: "bp-1",
            requestId: "req-1",
            storageRef: "ipfs://bp-1",
            contentHash: "hash-bp-1",
            fileverseDocId: "doc-1",
        });

        mockCreateJob.mockResolvedValue({
            id: "job-1",
            title: "My Task",
            status: "open",
            blueprintId: "bp-1",
            blueprintRef: "ipfs://bp-1",
            blueprintHash: "hash-bp-1",
        });

        mockPostBlueprintToSepolia.mockResolvedValue({
            status: "skipped",
            reason: "HEYELSA_ONCHAIN_ENABLED is not true",
        });

        const out = await executeHeyElsaPipeline({
            requestId: "req-1",
            createdByAgentId: "agent-1",
            userPrompt: "Build GTM plan",
            title: "My Task",
            plan,
        });

        expect(mockCreateBlueprint).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: "req-1",
                createdByAgentId: "agent-1",
            }),
        );
        expect(mockCreateJob).toHaveBeenCalledWith(
            "agent-1",
            expect.objectContaining({
                title: "My Task",
                budgetMax: "0.0100",
                blueprintId: "bp-1",
            }),
        );

        expect(out.status).toBe("created");
        expect(out.job.id).toBe("job-1");
        expect(out.blueprint.id).toBe("bp-1");
        expect(out.onChain.status).toBe("skipped");
        expect(mockBuildPlan).not.toHaveBeenCalled();
    });
});
