import { createBlueprint } from "@/services/councilBlueprintService";
import { createJob } from "@/services/jobService";
import { buildHeyElsaOrchestrationPlan } from "@/services/heyElsaOrchestrationService";
import { postBlueprintToSepolia } from "@/services/heyElsaOnChainService";

const renderBlueprintMarkdown = (input: {
    userPrompt: string;
    plan: ReturnType<typeof buildHeyElsaOrchestrationPlan>;
}) => {
    const tasksSection = input.plan.tasks
        .map(
            (task) =>
                `- ${task.type} (preferred: ${task.preferredModel}, cap: ${task.maxBudgetSepoliaEth} ETH)`,
        )
        .join("\n");

    return [
        "# Strategic Blueprint",
        "",
        "## User Request",
        input.userPrompt,
        "",
        "## Council Contract",
        "- Council deliberates in parallel and must surface disagreements.",
        "- Output must converge into one unified strategic blueprint.",
        "",
        "## Planned Subtasks",
        tasksSection || "- strategy_plan (fallback)",
        "",
        "## Quoted Budget",
        `- Total max quote: ${input.plan.quote.totalMaxCostEth} ETH on Sepolia`,
        `- Payment protocol: ${input.plan.quote.paymentProtocol}`,
        "",
        "## Execution Pipeline",
        ...input.plan.pipeline.map((step) => `- ${step}`),
    ].join("\n");
};

export const executeHeyElsaPipeline = async (input: {
    requestId: string;
    createdByAgentId: string;
    userPrompt: string;
    title?: string | null;
    plan?: ReturnType<typeof buildHeyElsaOrchestrationPlan>;
}) => {
    const plan =
        input.plan ?? buildHeyElsaOrchestrationPlan({ userPrompt: input.userPrompt });
    const markdown = renderBlueprintMarkdown({ userPrompt: input.userPrompt, plan });

    const blueprint = await createBlueprint({
        requestId: input.requestId,
        createdByAgentId: input.createdByAgentId,
        title: input.title?.trim() || "Strategic Blueprint",
        markdown,
        inputJson: {
            userPrompt: input.userPrompt,
            orchestration: plan,
        },
    });

    const job = await createJob(input.createdByAgentId, {
        title: input.title?.trim() || "ELSA Strategic Execution",
        description: "Auto-generated from Elsa marketplace orchestration",
        budgetMin: "0",
        budgetMax: plan.quote.totalMaxCostEth,
        blueprintId: blueprint.id,
        blueprintRef: blueprint.storageRef,
        blueprintHash: blueprint.contentHash,
    });

    const onChain = await postBlueprintToSepolia({
        plan,
        blueprintFingerprint: `${blueprint.contentHash}:${job.id}`,
    });

    return {
        status: "created",
        plan,
        onChain,
        blueprint: {
            id: blueprint.id,
            requestId: blueprint.requestId,
            storageRef: blueprint.storageRef,
            contentHash: blueprint.contentHash,
            fileverseDocId: blueprint.fileverseDocId,
        },
        job: {
            id: job.id,
            title: job.title,
            status: job.status,
            blueprintId: job.blueprintId,
            blueprintRef: job.blueprintRef,
            blueprintHash: job.blueprintHash,
        },
        evidenceBundleDraft: {
            job_id: job.id,
            blueprint_hash: blueprint.storageRef,
            subtasks: plan.evidenceBundleTemplate.subtasks,
            total_paid_sepolia: `${plan.quote.totalMaxCostEth} ETH`,
            posting_tx:
                onChain.status === "posted"
                    ? onChain.txHash
                    : null,
            on_chain_task_id:
                onChain.status === "posted"
                    ? onChain.onChainTaskId
                    : null,
            assembled_output: null,
            dispute_window_closes: null,
        },
    };
};
