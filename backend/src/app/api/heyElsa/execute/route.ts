import { NextRequest } from "next/server";
import { json, withErrorHandling } from "@/lib/http";
import { requireAuth } from "@/lib/routeAuth";
import { fail } from "@/lib/errors";
import { buildHeyElsaOrchestrationPlan } from "@/services/heyElsaOrchestrationService";
import { executeHeyElsaPipeline } from "@/services/heyElsaExecutionService";

const makeRequestId = () => `req-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export async function POST(req: NextRequest) {
    return withErrorHandling(async () => {
        const auth = await requireAuth(req);
        const body = await req.json();

        const userPrompt = String(body?.userPrompt || "").trim();
        if (!userPrompt) throw fail("userPrompt is required", 400);

        const plan = buildHeyElsaOrchestrationPlan({ userPrompt });

        if (body?.acceptQuote !== true) {
            return json(
                {
                    status: "quote_required",
                    message:
                        "Quote must be accepted before execution. Re-submit with acceptQuote=true.",
                    quote: plan.quote,
                    tasks: plan.tasks,
                },
                428,
            );
        }

        const requestId =
            typeof body?.requestId === "string" && body.requestId.trim().length > 0
                ? body.requestId.trim()
                : makeRequestId();

        const result = await executeHeyElsaPipeline({
            requestId,
            createdByAgentId: auth.id,
            userPrompt,
            title: typeof body?.title === "string" ? body.title : null,
            plan,
        });

        return json(result, 201);
    });
}
