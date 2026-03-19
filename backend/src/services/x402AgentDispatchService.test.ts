import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    mockParsePaymentRequiredHeader,
    mockAssertPaymentWithinBudget,
    mockSignJobScopedPaymentProof,
    mockWaitForSepoliaPaymentConfirmation,
} = vi.hoisted(() => ({
    mockParsePaymentRequiredHeader: vi.fn(),
    mockAssertPaymentWithinBudget: vi.fn(),
    mockSignJobScopedPaymentProof: vi.fn(),
    mockWaitForSepoliaPaymentConfirmation: vi.fn(),
}));

vi.mock("@/services/x402PaymentService", () => ({
    parsePaymentRequiredHeader: mockParsePaymentRequiredHeader,
    assertPaymentWithinBudget: mockAssertPaymentWithinBudget,
    signJobScopedPaymentProof: mockSignJobScopedPaymentProof,
    waitForSepoliaPaymentConfirmation: mockWaitForSepoliaPaymentConfirmation,
}));

import { dispatchAgentRequestWithX402 } from "@/services/x402AgentDispatchService";

describe("x402AgentDispatchService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ELSA_X402_DISPATCH_TIMEOUT_MS = "5000";
    });

    it("returns immediately when provider does not challenge with 402", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );

        const out = await dispatchAgentRequestWithX402({
            jobId: "job-1",
            endpoint: "https://agent.example/execute",
            maxBudgetEth: "0.0100",
            body: { task: "run" },
        });

        expect(out.status).toBe("completed_without_x402");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(mockParsePaymentRequiredHeader).not.toHaveBeenCalled();

        fetchMock.mockRestore();
    });

    it("completes full x402 challenge and paid retry", async () => {
        mockParsePaymentRequiredHeader.mockReturnValue({
            amountEth: "0.001",
            token: "ETH",
            recipient: "0x0000000000000000000000000000000000000001",
        });
        mockSignJobScopedPaymentProof.mockResolvedValue({
            paymentId: "pay-1",
            message: "msg",
            messageHash: "0x11",
            signature: "0x22",
            signer: "0x0000000000000000000000000000000000000002",
            createdAt: new Date().toISOString(),
        });
        mockWaitForSepoliaPaymentConfirmation.mockResolvedValue({
            confirmed: true,
            blockNumber: "100",
            txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            confirmations: 1,
        });

        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                new Response("payment required", {
                    status: 402,
                    headers: {
                        "x-payment-required": JSON.stringify({
                            amount: "0.001",
                            token: "ETH",
                            recipient: "0x0000000000000000000000000000000000000001",
                        }),
                    },
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ accepted: true }), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );

        const out = await dispatchAgentRequestWithX402({
            jobId: "job-1",
            endpoint: "https://agent.example/execute",
            maxBudgetEth: "0.0100",
            paymentTxHash:
                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            body: { task: "run" },
        });

        expect(out.status).toBe("completed_with_x402");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(mockAssertPaymentWithinBudget).toHaveBeenCalled();
        expect(out.finalResponse?.status).toBe(200);

        fetchMock.mockRestore();
    });

    it("requires paymentTxHash unless explicitly allowed", async () => {
        mockParsePaymentRequiredHeader.mockReturnValue({
            amountEth: "0.001",
            token: "ETH",
            recipient: "0x0000000000000000000000000000000000000001",
        });
        mockSignJobScopedPaymentProof.mockResolvedValue({
            paymentId: "pay-1",
            message: "msg",
            messageHash: "0x11",
            signature: "0x22",
            signer: "0x0000000000000000000000000000000000000002",
            createdAt: new Date().toISOString(),
        });

        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                new Response("payment required", {
                    status: 402,
                    headers: {
                        "x-payment-required": JSON.stringify({
                            amount: "0.001",
                            token: "ETH",
                            recipient: "0x0000000000000000000000000000000000000001",
                        }),
                    },
                }),
            );

        await expect(
            dispatchAgentRequestWithX402({
                jobId: "job-1",
                endpoint: "https://agent.example/execute",
                maxBudgetEth: "0.0100",
                body: { task: "run" },
            }),
        ).rejects.toThrow(/paymentTxHash is required/i);

        fetchMock.mockRestore();
    });
});
