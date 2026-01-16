import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../baselines/helpers";

export const runtime = "nodejs";

function shouldBypassTier() {
  return process.env.NODE_ENV === "development" || process.env.TTR_BETA_BYPASS === "true";
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (!auth.token) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": "application/json",
    "X-TTR-Request-Preview": "true",
  };

  if (shouldBypassTier()) {
    headers["X-TTR-Beta-Bypass"] = "true";
  }

  const response = await fetch(`${baseUrl}/resume/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}
