import { NextRequest } from "next/server";
import { fail } from "@/lib/errors";
import { json, withErrorHandling } from "@/lib/http";
import { requireAuth } from "@/lib/routeAuth";
import {
    assertPaymentWithinBudget,
    parsePaymentRequiredHeader,
    signJobScopedPaymentProof,
    waitForSepoliaPaymentConfirmation,
} from "@/services/x402PaymentService";

const isTxHash = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value);

export async function POST(req: NextRequest) {
    return withErrorHandling(async () => {
        await requireAuth(req);
        const body = await req.json();

        const jobId = String(body?.jobId || "").trim();
        const paymentRequiredHeader = String(body?.paymentRequiredHeader || "").trim();
        const maxBudgetEth = String(body?.maxBudgetEth || "").trim();

        if (!jobId) throw fail("jobId is required", 400);
        if (!paymentRequiredHeader) throw fail("paymentRequiredHeader is required", 400);
        if (!maxBudgetEth) throw fail("maxBudgetEth is required", 400);

        const requirement = parsePaymentRequiredHeader(paymentRequiredHeader);
        assertPaymentWithinBudget({ requirement, maxBudgetEth });

        const proof = await signJobScopedPaymentProof({
            jobId,
            requirement,
            chain: "sepolia",
        });

        let confirmation: Awaited<
            ReturnType<typeof waitForSepoliaPaymentConfirmation>
        > | null = null;

        const txHash =
            typeof body?.txHash === "string" && body.txHash.trim().length > 0
                ? body.txHash.trim()
                : null;

        if (txHash) {
            if (!isTxHash(txHash)) throw fail("txHash must be a 0x-prefixed 32-byte hash", 400);
            confirmation = await waitForSepoliaPaymentConfirmation({
                txHash: txHash as `0x${string}`,
                minConfirmations: Number(body?.minConfirmations || 1),
            });
        }

        return json(
            {
                status: "signed",
                requirement,
                proof,
                confirmation,
            },
            200,
        );
    });
}
