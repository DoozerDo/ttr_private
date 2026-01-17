import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../baselines/helpers";

export const runtime = "nodejs";

function shouldBypassTier() {
  return process.env.NODE_ENV === "development" || process.env.TTR_BETA_BYPASS === "true";
}

async function parseJsonBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  if (!auth.token) return auth.error;

  const response = await fetch(`${baseUrl}/cover-letters`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  return relayApiResponse(response);
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  if (!auth.token) return auth.error;

  const body = await parseJsonBody(req);
  if (body === null) {
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

  const response = await fetch(`${baseUrl}/cover-letters/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}
