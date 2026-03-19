import { NextRequest } from "next/server";
import { fail } from "@/lib/errors";
import { json, withErrorHandling } from "@/lib/http";
import { settleJobFromOracle } from "@/services/oracleSettlementService";

const requireOracleSecret = (req: NextRequest) => {
    const configured = process.env.ELSA_ORACLE_WEBHOOK_SECRET;
    if (!configured) {
        throw fail("ELSA_ORACLE_WEBHOOK_SECRET is not configured", 500);
    }

    const provided = req.headers.get("x-oracle-secret");
    if (!provided || provided !== configured) {
        throw fail("Unauthorized oracle callback", 401);
    }
};

export async function POST(req: NextRequest) {
    return withErrorHandling(async () => {
        requireOracleSecret(req);
        const body = await req.json();

        const jobId = String(body?.jobId || "").trim();
        if (!jobId) throw fail("jobId is required", 400);

        const approved = body?.approved === true;

        const proof = {
            jobId,
            deliverableHash: String(body?.proof?.deliverableHash || "").trim(),
            oracleReportRef:
                body?.proof?.oracleReportRef == null
                    ? undefined
                    : String(body.proof.oracleReportRef),
            notes:
                body?.proof?.notes == null ? undefined : String(body.proof.notes),
            responseTimeMs:
                body?.proof?.responseTimeMs == null
                    ? undefined
                    : Number(body.proof.responseTimeMs),
        };

        const out = await settleJobFromOracle({
            jobId,
            approved,
            proof,
            proofHash:
                typeof body?.proofHash === "string" && body.proofHash.trim().length > 0
                    ? (body.proofHash as `0x${string}`)
                    : undefined,
            oracleTxHash:
                typeof body?.oracleTxHash === "string" ? body.oracleTxHash : null,
            reason: typeof body?.reason === "string" ? body.reason : null,
        });

        return json(out, 200);
    });
}
