import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/errors";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const json = (data: unknown, status = 200) => {
  return NextResponse.json(JSON.parse(JSON.stringify(data)), {
    status,
    headers: corsHeaders,
  });
};

export const withErrorHandling = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status, headers: corsHeaders });
  }
};
