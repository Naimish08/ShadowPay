import {
    createPublicClient,
    createWalletClient,
    http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const REPUTATION_ENGINE_ABI = [
    {
        type: "function",
        name: "recordSuccess",
        stateMutability: "nonpayable",
        inputs: [
            { name: "agentId", type: "uint256" },
            { name: "responseTimeMs", type: "uint256" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "recordFailure",
        stateMutability: "nonpayable",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [],
    },
] as const;

type OnChainReputationResult =
    | { status: "skipped"; reason: string }
    | {
        status: "posted";
        txHash: string;
        blockNumber: string;
        onChainAgentId: string;
        action: "recordSuccess" | "recordFailure";
    }
    | { status: "failed"; reason: string };

const isEnabled = () =>
    process.env.HEYELSA_ONCHAIN_REPUTATION_ENABLED === "true";

const parseAgentMap = (): Record<string, string> => {
    const raw = process.env.ELSA_AGENT_ID_MAP;
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const map: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "number" || typeof value === "string") {
                const asString = String(value).trim();
                if (asString.length > 0) map[key] = asString;
            }
        }
        return map;
    } catch {
        return {};
    }
};

const toOnChainAgentId = (localAgentId: string): bigint | null => {
    const mapping = parseAgentMap();
    const mapped = mapping[localAgentId];
    if (!mapped) return null;
    if (!/^\d+$/.test(mapped)) return null;
    return BigInt(mapped);
};

export const updateOnChainReputationFromOracle = async (input: {
    localAgentId: string;
    success: boolean;
    responseTimeMs?: number;
}): Promise<OnChainReputationResult> => {
    if (!isEnabled()) {
        return {
            status: "skipped",
            reason: "HEYELSA_ONCHAIN_REPUTATION_ENABLED is not true",
        };
    }

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    const privateKey = process.env.ELSA_SIGNER_PRIVATE_KEY;
    const reputationEngineAddress = process.env.ELSA_REPUTATION_ENGINE_ADDRESS;
    const confirmations = Number(process.env.ELSA_ONCHAIN_MIN_CONFIRMATIONS || "1");

    if (!rpcUrl || !privateKey || !reputationEngineAddress) {
        return {
            status: "failed",
            reason:
                "Missing SEPOLIA_RPC_URL, ELSA_SIGNER_PRIVATE_KEY, or ELSA_REPUTATION_ENGINE_ADDRESS",
        };
    }

    const onChainAgentId = toOnChainAgentId(input.localAgentId);
    if (onChainAgentId == null) {
        return {
            status: "skipped",
            reason: "No on-chain agent mapping found for local agent",
        };
    }

    try {
        const account = privateKeyToAccount(
            privateKey.startsWith("0x")
                ? (privateKey as `0x${string}`)
                : (`0x${privateKey}` as `0x${string}`),
        );

        const transport = http(rpcUrl);
        const walletClient = createWalletClient({
            account,
            chain: sepolia,
            transport,
        });
        const publicClient = createPublicClient({
            chain: sepolia,
            transport,
        });

        const action = input.success ? "recordSuccess" : "recordFailure";

        const txHash = await walletClient.writeContract({
            address: reputationEngineAddress as `0x${string}`,
            abi: REPUTATION_ENGINE_ABI,
            functionName: action,
            args: input.success
                ? [onChainAgentId, BigInt(Math.max(0, Math.floor(input.responseTimeMs || 0)))]
                : [onChainAgentId],
            chain: sepolia,
            account,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: Math.max(1, confirmations),
        });

        return {
            status: "posted",
            txHash,
            blockNumber: String(receipt.blockNumber),
            onChainAgentId: String(onChainAgentId),
            action,
        };
    } catch (error) {
        return {
            status: "failed",
            reason:
                error instanceof Error
                    ? error.message
                    : "Unknown on-chain reputation update error",
        };
    }
};
