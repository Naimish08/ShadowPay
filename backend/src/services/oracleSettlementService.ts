import { keccak256, stringToBytes } from "viem";
import { fail } from "@/lib/errors";
import { completeJob, disputeJob, getJob } from "@/services/jobService";
import { release } from "@/services/paymentService";
import { recordEvent } from "@/services/reputationService";
import { updateOnChainReputationFromOracle } from "@/services/onChainReputationService";

interface OracleProofPayload {
    jobId: string;
    deliverableHash: string;
    oracleReportRef?: string;
    notes?: string;
    responseTimeMs?: number;
}

interface SettleFromOracleInput {
    jobId: string;
    approved: boolean;
    proof: OracleProofPayload;
    proofHash?: `0x${string}`;
    oracleTxHash?: string | null;
    reason?: string | null;
}

const isHash32 = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value);

const computeProofHash = (proof: OracleProofPayload) =>
    keccak256(stringToBytes(JSON.stringify(proof)));

export const settleJobFromOracle = async (input: SettleFromOracleInput) => {
    if (!input.jobId?.trim()) throw fail("jobId is required", 400);
    if (!input.proof || typeof input.proof !== "object") {
        throw fail("proof payload is required", 400);
    }
    if (input.proof.jobId !== input.jobId) {
        throw fail("proof.jobId must match jobId", 400);
    }
    if (!input.proof.deliverableHash?.trim()) {
        throw fail("proof.deliverableHash is required", 400);
    }

    const expectedProofHash = computeProofHash(input.proof);
    if (input.proofHash) {
        if (!isHash32(input.proofHash)) throw fail("proofHash must be a 32-byte hex hash", 400);
        if (input.proofHash.toLowerCase() !== expectedProofHash.toLowerCase()) {
            throw fail("proofHash does not match canonical proof payload", 400);
        }
    }

    const before = await getJob(input.jobId);
    if (!before.posterId) {
        throw fail("Job is missing poster owner", 400);
    }
    if (!before.hiredAgentId) {
        throw fail("Job has no hired agent", 400);
    }
    if (before.status !== "delivered") {
        throw fail("Only delivered jobs can be oracle-settled", 400);
    }

    if (input.approved) {
        const job = await completeJob(input.jobId, before.posterId);
        const payment = await release(input.jobId, input.oracleTxHash ?? undefined);

        const onChainReputation = await updateOnChainReputationFromOracle({
            localAgentId: before.hiredAgentId,
            success: true,
            responseTimeMs: input.proof.responseTimeMs,
        });

        await recordEvent(
            before.hiredAgentId,
            input.jobId,
            1,
            "Oracle approved deliverable",
            payment.txHash ?? undefined,
        );
        await recordEvent(
            before.posterId,
            input.jobId,
            0.2,
            "Oracle-approved settlement completed",
            payment.txHash ?? undefined,
        );

        return {
            status: "approved",
            proofHash: expectedProofHash,
            job,
            payment,
            onChainReputation,
            oracleTxHash: input.oracleTxHash ?? null,
            reason: input.reason ?? null,
        };
    }

    const job = await disputeJob(input.jobId, before.posterId);

    const onChainReputation = await updateOnChainReputationFromOracle({
        localAgentId: before.hiredAgentId,
        success: false,
    });

    await recordEvent(
        before.hiredAgentId,
        input.jobId,
        -1,
        "Oracle rejected deliverable",
        input.oracleTxHash ?? undefined,
    );

    return {
        status: "rejected",
        proofHash: expectedProofHash,
        job,
        payment: null,
        onChainReputation,
        oracleTxHash: input.oracleTxHash ?? null,
        reason: input.reason ?? "Oracle rejected deliverable",
    };
};
