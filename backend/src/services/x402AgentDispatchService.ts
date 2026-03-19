import { fail } from "@/lib/errors";
import {
    assertPaymentWithinBudget,
    parsePaymentRequiredHeader,
    signJobScopedPaymentProof,
    waitForSepoliaPaymentConfirmation,
} from "@/services/x402PaymentService";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface AgentDispatchInput {
    jobId: string;
    endpoint: string;
    method?: HttpMethod;
    headers?: Record<string, string>;
    body?: unknown;
    maxBudgetEth: string;
    paymentTxHash?: `0x${string}` | null;
    minConfirmations?: number;
    allowUnconfirmedRetry?: boolean;
    timeoutMs?: number;
}

interface AgentResponseSummary {
    status: number;
    headers: Record<string, string>;
    body: unknown;
}

const toBody = (body: unknown) => {
    if (body == null) return undefined;
    if (typeof body === "string") return body;
    return JSON.stringify(body);
};

const readBody = async (res: Response): Promise<unknown> => {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const normalizeHeaders = (headers: Headers): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of headers.entries()) {
        out[key] = value;
    }
    return out;
};

const fetchWithTimeout = async (
    url: string,
    init: RequestInit,
    timeoutMs: number,
) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        return res;
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw fail("x402 dispatch request timed out", 504);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const toSummary = async (res: Response): Promise<AgentResponseSummary> => ({
    status: res.status,
    headers: normalizeHeaders(res.headers),
    body: await readBody(res),
});

export const dispatchAgentRequestWithX402 = async (
    input: AgentDispatchInput,
) => {
    const timeoutMs =
        input.timeoutMs || Number(process.env.ELSA_X402_DISPATCH_TIMEOUT_MS || 15000);
    const method = input.method || "POST";
    const body = toBody(input.body);

    const baseHeaders: Record<string, string> = {
        Accept: "application/json",
        ...(input.headers || {}),
    };

    if (body && !baseHeaders["Content-Type"]) {
        baseHeaders["Content-Type"] = "application/json";
    }

    const initialResponse = await fetchWithTimeout(
        input.endpoint,
        {
            method,
            headers: baseHeaders,
            body,
        },
        timeoutMs,
    );

    if (initialResponse.status !== 402) {
        return {
            status: "completed_without_x402" as const,
            initialResponse: await toSummary(initialResponse),
            payment: null,
            finalResponse: null,
        };
    }

    const paymentRequiredHeader =
        initialResponse.headers.get("x-payment-required") ||
        initialResponse.headers.get("X-Payment-Required");

    const requirement = parsePaymentRequiredHeader(paymentRequiredHeader);
    assertPaymentWithinBudget({
        requirement,
        maxBudgetEth: input.maxBudgetEth,
    });

    const proof = await signJobScopedPaymentProof({
        jobId: input.jobId,
        requirement,
        chain: "sepolia",
    });

    let confirmation: Awaited<
        ReturnType<typeof waitForSepoliaPaymentConfirmation>
    > | null = null;

    if (input.paymentTxHash) {
        confirmation = await waitForSepoliaPaymentConfirmation({
            txHash: input.paymentTxHash,
            minConfirmations: input.minConfirmations || 1,
        });
    } else if (!input.allowUnconfirmedRetry) {
        throw fail(
            "paymentTxHash is required before retrying x402 payment request",
            400,
        );
    }

    const paymentProofHeader = JSON.stringify({
        proof,
        txHash: input.paymentTxHash || null,
        confirmation,
    });

    const paidResponse = await fetchWithTimeout(
        input.endpoint,
        {
            method,
            headers: {
                ...baseHeaders,
                "X-Payment-Proof": paymentProofHeader,
            },
            body,
        },
        timeoutMs,
    );

    return {
        status: "completed_with_x402" as const,
        initialResponse: await toSummary(initialResponse),
        payment: {
            requirement,
            proof,
            confirmation,
            proofHeader: paymentProofHeader,
        },
        finalResponse: await toSummary(paidResponse),
    };
};
