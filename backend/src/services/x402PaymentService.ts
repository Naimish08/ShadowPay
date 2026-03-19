import {
    createPublicClient,
    hashMessage,
    http,
    isAddress,
    parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { fail } from "@/lib/errors";

export interface X402PaymentRequirement {
    amountEth: string;
    token: "ETH";
    recipient: `0x${string}`;
    memo?: string;
}

export interface X402SignedPaymentProof {
    paymentId: string;
    message: string;
    messageHash: string;
    signature: `0x${string}`;
    signer: `0x${string}`;
    createdAt: string;
}

const createPaymentId = () =>
    `pay-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const requirePrivateKey = () => {
    const pk = process.env.ELSA_SIGNER_PRIVATE_KEY;
    if (!pk) throw fail("ELSA_SIGNER_PRIVATE_KEY is required for x402 signing", 500);
    return pk.startsWith("0x") ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`);
};

export const parsePaymentRequiredHeader = (
    headerValue: string | null | undefined,
): X402PaymentRequirement => {
    if (!headerValue) throw fail("Missing X-Payment-Required header", 400);

    let parsed: unknown;
    try {
        parsed = JSON.parse(headerValue);
    } catch {
        throw fail("Invalid X-Payment-Required header JSON", 400);
    }

    const obj = parsed as Record<string, unknown>;
    const amountEth = String(obj.amount || "").trim();
    const token = String(obj.token || "").trim().toUpperCase();
    const recipient = String(obj.recipient || "").trim();
    const memo =
        obj.memo == null || String(obj.memo).trim().length === 0
            ? undefined
            : String(obj.memo).trim();

    if (!amountEth) throw fail("x402 header requires amount", 400);
    if (token !== "ETH") throw fail("Only ETH token is currently supported", 400);
    if (!recipient || !isAddress(recipient)) {
        throw fail("x402 header requires a valid recipient address", 400);
    }

    try {
        const amountWei = parseEther(amountEth);
        if (amountWei <= 0n) throw fail("x402 amount must be > 0", 400);
    } catch {
        throw fail("x402 amount is invalid", 400);
    }

    return {
        amountEth,
        token: "ETH",
        recipient: recipient as `0x${string}`,
        memo,
    };
};

export const assertPaymentWithinBudget = (input: {
    requirement: X402PaymentRequirement;
    maxBudgetEth: string;
}) => {
    const requested = parseEther(input.requirement.amountEth);
    const budget = parseEther(input.maxBudgetEth);
    if (requested > budget) {
        throw fail("x402 requested amount exceeds quoted budget", 402);
    }
};

export const signJobScopedPaymentProof = async (input: {
    jobId: string;
    requirement: X402PaymentRequirement;
    chain: "sepolia";
}): Promise<X402SignedPaymentProof> => {
    const pk = requirePrivateKey();
    const account = privateKeyToAccount(pk);
    const paymentId = createPaymentId();
    const createdAt = new Date().toISOString();

    const messageObject = {
        paymentId,
        protocol: "x402",
        chain: input.chain,
        jobId: input.jobId,
        recipient: input.requirement.recipient,
        amountEth: input.requirement.amountEth,
        token: input.requirement.token,
        memo: input.requirement.memo || null,
        createdAt,
        replayProtection: {
            scope: "job",
            singleUse: true,
        },
    };

    const message = JSON.stringify(messageObject);
    const signature = await account.signMessage({ message });

    return {
        paymentId,
        message,
        messageHash: hashMessage(message),
        signature,
        signer: account.address,
        createdAt,
    };
};

export const waitForSepoliaPaymentConfirmation = async (input: {
    txHash: `0x${string}`;
    minConfirmations: number;
}) => {
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) throw fail("SEPOLIA_RPC_URL is required for confirmation checks", 500);

    const fallbackConfirmations = Number(
        process.env.ELSA_X402_MIN_CONFIRMATIONS || "1",
    );
    const confirmations = Math.max(
        1,
        Math.floor(input.minConfirmations || fallbackConfirmations || 1),
    );

    const client = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl),
    });

    const receipt = await client.waitForTransactionReceipt({
        hash: input.txHash,
        confirmations,
    });

    return {
        confirmed: receipt.status === "success",
        blockNumber: String(receipt.blockNumber),
        txHash: input.txHash,
        confirmations,
    };
};
