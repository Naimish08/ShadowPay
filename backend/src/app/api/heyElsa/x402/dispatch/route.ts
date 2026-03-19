import { NextRequest } from "next/server";
import { fail } from "@/lib/errors";
import { json, withErrorHandling } from "@/lib/http";
import { requireAuth } from "@/lib/routeAuth";
import { dispatchAgentRequestWithX402 } from "@/services/x402AgentDispatchService";

const isHttpMethod = (value: string): value is "GET" | "POST" | "PUT" | "PATCH" | "DELETE" =>
    ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value);

const isTxHash = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value);

export async function POST(req: NextRequest) {
    return withErrorHandling(async () => {
        await requireAuth(req);
        const body = await req.json();

        const jobId = String(body?.jobId || "").trim();
        const endpoint = String(body?.endpoint || "").trim();
        const maxBudgetEth = String(body?.maxBudgetEth || "").trim();

        if (!jobId) throw fail("jobId is required", 400);
        if (!endpoint) throw fail("endpoint is required", 400);
        if (!maxBudgetEth) throw fail("maxBudgetEth is required", 400);

        const methodRaw = String(body?.method || "POST").toUpperCase();
        if (!isHttpMethod(methodRaw)) throw fail("method is invalid", 400);

        const paymentTxHash =
            typeof body?.paymentTxHash === "string" && body.paymentTxHash.trim().length > 0
                ? body.paymentTxHash.trim()
                : null;

        if (paymentTxHash && !isTxHash(paymentTxHash)) {
            throw fail("paymentTxHash must be a 0x-prefixed 32-byte hash", 400);
        }

        const out = await dispatchAgentRequestWithX402({
            jobId,
            endpoint,
            method: methodRaw,
            headers:
                body?.headers && typeof body.headers === "object"
                    ? (body.headers as Record<string, string>)
                    : undefined,
            body: body?.body,
            maxBudgetEth,
            paymentTxHash: paymentTxHash as `0x${string}` | null,
            minConfirmations: Number(body?.minConfirmations || 1),
            allowUnconfirmedRetry: body?.allowUnconfirmedRetry === true,
            timeoutMs:
                body?.timeoutMs == null ? undefined : Number(body.timeoutMs),
        });

        return json(out, 200);
    });
}
