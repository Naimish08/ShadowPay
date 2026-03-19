import {
    createPublicClient,
    createWalletClient,
    decodeEventLog,
    http,
    keccak256,
    parseEther,
    stringToBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { buildHeyElsaOrchestrationPlan } from "@/services/heyElsaOrchestrationService";

const ELSA_ORCHESTRATOR_ABI = [
    {
        type: "function",
        name: "executeBlueprint",
        stateMutability: "payable",
        inputs: [
            { name: "blueprintHash", type: "bytes32" },
            { name: "taskType", type: "string" },
            { name: "category", type: "uint8" },
            { name: "maxBudget", type: "uint256" },
        ],
        outputs: [{ name: "taskId", type: "uint256" }],
    },
    {
        type: "event",
        name: "BlueprintExecuted",
        inputs: [
            { indexed: true, name: "taskId", type: "uint256" },
            { indexed: true, name: "blueprintHash", type: "bytes32" },
            { indexed: false, name: "taskType", type: "string" },
            { indexed: false, name: "category", type: "uint8" },
            { indexed: false, name: "maxBudget", type: "uint256" },
            { indexed: true, name: "signer", type: "address" },
            { indexed: false, name: "nonce", type: "uint256" },
        ],
    },
] as const;

type OrchestrationPlan = ReturnType<typeof buildHeyElsaOrchestrationPlan>;

export type OnChainPostingResult =
    | {
        status: "skipped";
        reason: string;
    }
    | {
        status: "posted";
        chainId: number;
        network: "sepolia";
        orchestratorAddress: string;
        txHash: string;
        blockNumber: string;
        onChainTaskId: string | null;
    }
    | {
        status: "failed";
        reason: string;
    };

const isOnChainEnabled = () => process.env.HEYELSA_ONCHAIN_ENABLED === "true";

const getCategoryCode = (category: "CRYPTO" | "WEB2") =>
    category === "CRYPTO" ? 0 : 1;

export const postBlueprintToSepolia = async (input: {
    plan: OrchestrationPlan;
    blueprintFingerprint: string;
}): Promise<OnChainPostingResult> => {
    if (!isOnChainEnabled()) {
        return {
            status: "skipped",
            reason: "HEYELSA_ONCHAIN_ENABLED is not true",
        };
    }

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    const privateKey = process.env.ELSA_SIGNER_PRIVATE_KEY;
    const orchestratorAddress = process.env.ELSA_ORCHESTRATOR_ADDRESS;
    const confirmations = Number(process.env.ELSA_ONCHAIN_MIN_CONFIRMATIONS || "1");

    if (!rpcUrl || !privateKey || !orchestratorAddress) {
        return {
            status: "failed",
            reason:
                "Missing SEPOLIA_RPC_URL, ELSA_SIGNER_PRIVATE_KEY, or ELSA_ORCHESTRATOR_ADDRESS",
        };
    }

    try {
        const account = privateKeyToAccount(
            privateKey.startsWith("0x") ? (privateKey as `0x${string}`) : (`0x${privateKey}` as `0x${string}`),
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

        const blueprintHash = keccak256(stringToBytes(input.blueprintFingerprint));
        const maxBudgetWei = parseEther(input.plan.onChainPostingHint.maxBudgetEth);

        const txHash = await walletClient.writeContract({
            address: orchestratorAddress as `0x${string}`,
            abi: ELSA_ORCHESTRATOR_ABI,
            functionName: "executeBlueprint",
            args: [
                blueprintHash,
                input.plan.onChainPostingHint.taskType,
                getCategoryCode(input.plan.onChainPostingHint.category),
                maxBudgetWei,
            ],
            value: maxBudgetWei,
            chain: sepolia,
            account,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations,
        });

        let onChainTaskId: string | null = null;
        for (const log of receipt.logs) {
            try {
                const decoded = decodeEventLog({
                    abi: ELSA_ORCHESTRATOR_ABI,
                    data: log.data,
                    topics: log.topics,
                });
                if (decoded.eventName === "BlueprintExecuted") {
                    const maybeTaskId = decoded.args.taskId;
                    if (maybeTaskId != null) {
                        onChainTaskId = String(maybeTaskId);
                        break;
                    }
                }
            } catch {
                // Ignore unrelated logs.
            }
        }

        return {
            status: "posted",
            chainId: sepolia.id,
            network: "sepolia",
            orchestratorAddress,
            txHash,
            blockNumber: String(receipt.blockNumber),
            onChainTaskId,
        };
    } catch (error) {
        return {
            status: "failed",
            reason: error instanceof Error ? error.message : "Unknown on-chain posting error",
        };
    }
};
