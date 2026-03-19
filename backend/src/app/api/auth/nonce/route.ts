import { NextRequest, NextResponse } from "next/server";
import { issueNonce } from "@/lib/auth";
import { fail } from "@/lib/errors";
import { withErrorHandling, json } from "@/lib/http";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json();
    const walletAddress = String(body.walletAddress || "").toLowerCase();
    if (!walletAddress) throw fail("walletAddress is required", 400);

    const nonce = issueNonce(walletAddress);
    return json({ nonce });
  });
}
