import {
    ELSA_CORE_RULES,
    ELSA_MARKETPLACE_SYSTEM_PROMPT,
    ELSA_MARKETPLACE_SYSTEM_PROMPT_ID,
} from "@/prompts/elsaMarketplaceSystemPrompt";

type CouncilModel = "Gemini" | "GPT" | "Claude" | "Grok";

type PlannedTaskType =
    | "smart_contract_audit"
    | "market_research"
    | "strategy_plan"
    | "email_draft"
    | "social_content"
    | "sentiment_analysis";

interface PlannedTask {
    id: number;
    type: PlannedTaskType;
    status: "bidding" | "ranked" | "selected";
    preferredModel: CouncilModel;
    maxBudgetSepoliaEth: string;
}

type OnChainTaskCategory = "CRYPTO" | "WEB2";

const toOnChainTaskType = (type: PlannedTaskType) =>
    type.toUpperCase();

const toOnChainCategory = (type: PlannedTaskType): OnChainTaskCategory => {
    if (type === "smart_contract_audit") return "CRYPTO";
    return "WEB2";
};

const TASK_BUDGETS: Record<PlannedTaskType, number> = {
    smart_contract_audit: 0.004,
    market_research: 0.003,
    strategy_plan: 0.0025,
    email_draft: 0.0015,
    social_content: 0.0015,
    sentiment_analysis: 0.002,
};

const toEthString = (n: number) => n.toFixed(4);

const includesAny = (text: string, terms: string[]) =>
    terms.some((term) => text.includes(term));

const inferTaskSet = (userPrompt: string): PlannedTask[] => {
    const normalized = userPrompt.toLowerCase();
    const tasks: Omit<PlannedTask, "id" | "status">[] = [];

    if (
        includesAny(normalized, [
            "audit",
            "solidity",
            "reentrancy",
            "access control",
            "overflow",
            "vulnerability",
            "security",
            "contract",
        ])
    ) {
        tasks.push({
            type: "smart_contract_audit",
            preferredModel: "Claude",
            maxBudgetSepoliaEth: toEthString(TASK_BUDGETS.smart_contract_audit),
        });
    }

    if (
        includesAny(normalized, [
            "research",
            "market",
            "competitor",
            "vc",
            "investor",
            "fintech",
            "data",
        ])
    ) {
        tasks.push({
            type: "market_research",
            preferredModel: "Gemini",
            maxBudgetSepoliaEth: toEthString(TASK_BUDGETS.market_research),
        });
    }

    if (
        includesAny(normalized, [
            "strategy",
            "go-to-market",
            "gtm",
            "plan",
            "positioning",
            "roadmap",
        ]) || tasks.length === 0
    ) {
        tasks.push({
            type: "strategy_plan",
            preferredModel: "GPT",
            maxBudgetSepoliaEth: toEthString(TASK_BUDGETS.strategy_plan),
        });
    }

    if (
        includesAny(normalized, [
            "email",
            "cold email",
            "pitch",
            "outreach",
            "investor email",
            "draft mail",
        ])
    ) {
        tasks.push({
            type: "email_draft",
            preferredModel: "GPT",
            maxBudgetSepoliaEth: toEthString(TASK_BUDGETS.email_draft),
        });
    }

    if (
        includesAny(normalized, [
            "thread",
            "social",
            "announcement",
            "tweet",
            "post",
            "launch",
            "sentiment",
            "market mood",
            "timing",
        ])
    ) {
        tasks.push({
            type: "social_content",
            preferredModel: "Grok",
            maxBudgetSepoliaEth: toEthString(TASK_BUDGETS.social_content),
        });

        if (includesAny(normalized, ["sentiment", "market mood", "timing"])) {
            tasks.push({
                type: "sentiment_analysis",
                preferredModel: "Grok",
                maxBudgetSepoliaEth: toEthString(TASK_BUDGETS.sentiment_analysis),
            });
        }
    }

    const unique = tasks.filter(
        (task, index, arr) =>
            arr.findIndex((other) => other.type === task.type) === index,
    );

    return unique.map((task, index) => ({
        ...task,
        id: index + 1,
        status: "bidding",
    }));
};

const sumBudget = (tasks: PlannedTask[]) => {
    const total = tasks.reduce(
        (acc, task) => acc + Number(task.maxBudgetSepoliaEth),
        0,
    );
    return toEthString(total);
};

export const buildHeyElsaOrchestrationPlan = (input: {
    userPrompt: string;
    walletAddress?: string | null;
}) => {
    const tasks = inferTaskSet(input.userPrompt);
    const primaryTask = tasks[0];

    return {
        status: "processing",
        message: "Intent delegated to AI Agent Marketplace",
        systemPromptId: ELSA_MARKETPLACE_SYSTEM_PROMPT_ID,
        systemPrompt: ELSA_MARKETPLACE_SYSTEM_PROMPT,
        walletAddress: input.walletAddress?.trim() || null,
        council: {
            members: [
                {
                    model: "Gemini" as const,
                    domain: "deep_research",
                    responsibility: "Market data, competitor analysis, factual grounding",
                },
                {
                    model: "GPT" as const,
                    domain: "strategy",
                    responsibility: "Planning, framing, executive communication",
                },
                {
                    model: "Claude" as const,
                    domain: "security",
                    responsibility: "Contract and protocol risk analysis",
                },
                {
                    model: "Grok" as const,
                    domain: "sentiment",
                    responsibility: "Market mood and social pulse",
                },
            ],
            deliberationMode: "parallel_with_conflict_resolution",
            disagreementRequired: true,
            outputContract: "single_unified_strategic_blueprint",
        },
        quote: {
            requiredBeforeSigning: true,
            currency: "ETH",
            network: "sepolia",
            totalMaxCostEth: sumBudget(tasks),
            paymentProtocol: "x402-via-heyelsa",
            minConfirmations: 1,
        },
        ranking: {
            formula:
                "score = (0.5 * on_chain_reputation) + (0.3 * inverse_cost) + (0.2 * execution_speed)",
            onChainSourceOfTruth: true,
        },
        onChainPostingHint: {
            enabledByConfig: true,
            network: "sepolia",
            taskType: toOnChainTaskType(primaryTask.type),
            category: toOnChainCategory(primaryTask.type),
            maxBudgetEth: sumBudget(tasks),
            sourceTaskId: primaryTask.id,
        },
        pipeline: [
            "Council deliberation in parallel",
            "Surface disagreements and reconcile into one blueprint",
            "Upload strategic blueprint to Fileverse and pin content hash",
            "Post blind job stub on-chain (metadata only)",
            "Run deterministic ranking and select best agent",
            "Issue encrypted key envelope to selected agent only",
            "Require x402 payment proof and 1 block confirmation",
            "Verify job-scoped proof via oracle",
            "Release escrow after oracle verification",
            "Update reputation on-chain",
            "Assemble and return user-verifiable evidence bundle",
        ],
        tasks,
        safeguards: [...ELSA_CORE_RULES],
        evidenceBundleTemplate: {
            job_id: "0x...",
            blueprint_hash: "ipfs://Qm...",
            subtasks: tasks.map((task) => ({
                type: task.type,
                agent: "0x...",
                deliverable_hash: "ipfs://Qm...",
                payment_tx: "0x...",
                proof_hash: "0x...",
                oracle_verification: true,
            })),
            total_paid_sepolia: `${sumBudget(tasks)} ETH`,
            assembled_output: "ipfs://Qm...",
            dispute_window_closes: "block #...",
        },
    };
};
