import { beforeEach, describe, expect, it } from "vitest";

import { updateOnChainReputationFromOracle } from "@/services/onChainReputationService";

describe("onChainReputationService", () => {
    beforeEach(() => {
        process.env.HEYELSA_ONCHAIN_REPUTATION_ENABLED = "false";
        delete process.env.ELSA_AGENT_ID_MAP;
    });

    it("skips when feature is disabled", async () => {
        const out = await updateOnChainReputationFromOracle({
            localAgentId: "agent-1",
            success: true,
            responseTimeMs: 1200,
        });

        expect(out.status).toBe("skipped");
    });

    it("skips when no local->onchain mapping exists", async () => {
        process.env.HEYELSA_ONCHAIN_REPUTATION_ENABLED = "true";
        process.env.SEPOLIA_RPC_URL = "https://example-rpc";
        process.env.ELSA_SIGNER_PRIVATE_KEY =
            "0x1111111111111111111111111111111111111111111111111111111111111111";
        process.env.ELSA_REPUTATION_ENGINE_ADDRESS =
            "0x0000000000000000000000000000000000000001";

        const out = await updateOnChainReputationFromOracle({
            localAgentId: "agent-1",
            success: false,
        });

        expect(out.status).toBe("skipped");
    });
});
