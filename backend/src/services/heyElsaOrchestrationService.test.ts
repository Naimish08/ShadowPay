import { describe, expect, it } from "vitest";

import { buildHeyElsaOrchestrationPlan } from "@/services/heyElsaOrchestrationService";

describe("heyElsaOrchestrationService", () => {
    it("enforces council disagreement and quote-before-signing semantics", () => {
        const out = buildHeyElsaOrchestrationPlan({
            userPrompt:
                "Audit this Solidity contract, research VCs in India, draft cold email, and write an announcement thread.",
            walletAddress: "0xabc",
        });

        expect(out.status).toBe("processing");
        expect(out.council.disagreementRequired).toBe(true);
        expect(out.quote.requiredBeforeSigning).toBe(true);
        expect(out.quote.minConfirmations).toBe(1);
        expect(out.quote.network).toBe("sepolia");

        const taskTypes = out.tasks.map((task) => task.type);
        expect(taskTypes).toContain("smart_contract_audit");
        expect(taskTypes).toContain("market_research");
        expect(taskTypes).toContain("email_draft");
        expect(taskTypes).toContain("social_content");
    });

    it("falls back to strategy task when prompt is generic", () => {
        const out = buildHeyElsaOrchestrationPlan({ userPrompt: "Help me" });

        expect(out.tasks).toHaveLength(1);
        expect(out.tasks[0].type).toBe("strategy_plan");
        expect(out.quote.totalMaxCostEth).toBe("0.0025");
    });
});
