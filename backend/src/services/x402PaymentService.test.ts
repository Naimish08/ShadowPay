import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrivateKeyToAccount, mockWaitForTransactionReceipt } = vi.hoisted(() => ({
    mockPrivateKeyToAccount: vi.fn(),
    mockWaitForTransactionReceipt: vi.fn(),
}));

vi.mock("viem/accounts", () => ({
    privateKeyToAccount: mockPrivateKeyToAccount,
}));

vi.mock("viem", async () => {
    const actual = await vi.importActual<typeof import("viem")>("viem");
    return {
        ...actual,
        createPublicClient: vi.fn(() => ({
            waitForTransactionReceipt: mockWaitForTransactionReceipt,
        })),
    };
});

import {
    assertPaymentWithinBudget,
    parsePaymentRequiredHeader,
    signJobScopedPaymentProof,
    waitForSepoliaPaymentConfirmation,
} from "@/services/x402PaymentService";

describe("x402PaymentService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ELSA_SIGNER_PRIVATE_KEY =
            "0x1111111111111111111111111111111111111111111111111111111111111111";
        process.env.SEPOLIA_RPC_URL = "https://example-rpc";
    });

    it("parses valid X-Payment-Required header", () => {
        const requirement = parsePaymentRequiredHeader(
            JSON.stringify({
                amount: "0.001",
                token: "eth",
                recipient: "0x0000000000000000000000000000000000000001",
            }),
        );

        expect(requirement.amountEth).toBe("0.001");
        expect(requirement.token).toBe("ETH");
    });

    it("rejects payment requirement above budget", () => {
        const requirement = parsePaymentRequiredHeader(
            JSON.stringify({
                amount: "0.02",
                token: "ETH",
                recipient: "0x0000000000000000000000000000000000000001",
            }),
        );

        expect(() =>
            assertPaymentWithinBudget({ requirement, maxBudgetEth: "0.01" }),
        ).toThrowError(/exceeds quoted budget/i);
    });

    it("creates job-scoped proof with local signing", async () => {
        mockPrivateKeyToAccount.mockReturnValue({
            address: "0x0000000000000000000000000000000000000002",
            signMessage: vi.fn(async () =>
                "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            ),
        });

        const requirement = parsePaymentRequiredHeader(
            JSON.stringify({
                amount: "0.001",
                token: "ETH",
                recipient: "0x0000000000000000000000000000000000000001",
            }),
        );

        const proof = await signJobScopedPaymentProof({
            jobId: "job-1",
            requirement,
            chain: "sepolia",
        });

        expect(proof.paymentId).toMatch(/^pay-/);
        expect(proof.message).toContain('"jobId":"job-1"');
        expect(proof.signature.startsWith("0x")).toBe(true);
    });

    it("waits for Sepolia confirmations", async () => {
        mockWaitForTransactionReceipt.mockResolvedValue({
            status: "success",
            blockNumber: 123n,
        });

        const out = await waitForSepoliaPaymentConfirmation({
            txHash:
                "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            minConfirmations: 1,
        });

        expect(out.confirmed).toBe(true);
        expect(out.blockNumber).toBe("123");
    });
});
