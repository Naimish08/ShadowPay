import { NextResponse } from "next/server";
import { buildHeyElsaOrchestrationPlan } from "@/services/heyElsaOrchestrationService";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userPrompt = String(body?.userPrompt || "").trim();
    const walletAddress =
      body?.walletAddress == null ? null : String(body.walletAddress);

    if (!userPrompt) {
      return NextResponse.json(
        { error: "userPrompt is required" },
        { status: 400 },
      );
    }

    const orchestration = buildHeyElsaOrchestrationPlan({
      userPrompt,
      walletAddress,
    });

    return NextResponse.json(orchestration, { status: 200 });
  } catch (error) {
    console.error("[HeyElsa API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}