import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";

export const runtime = "nodejs";

function shouldBypassTier() {
  return process.env.NODE_ENV !== "production" || process.env.TTR_BETA_BYPASS === "true";
}

const ALLOWED_FORMATS = new Set(["docx", "pdf"]);

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (!auth.token) return auth.error;

  const rawFormat = req.nextUrl.searchParams.get("format");
  const droppedFormat = rawFormat ? rawFormat.toLowerCase() : "";
  if (rawFormat && !ALLOWED_FORMATS.has(droppedFormat)) {
    return NextResponse.json({ error: "Invalid format parameter" }, { status: 400 });
  }
  const format = rawFormat ? droppedFormat : "docx";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": "application/json",
  };

  const bypass = shouldBypassTier();
  if (bypass) {
    headers["X-TTR-Beta-Bypass"] = "true";
    headers["X-TTR-BYPASS"] = "true";
    headers["X-TTR-BYPASS-TIER"] = "true";
    headers["X-Beta-Bypass"] = "true";
    headers["X-Bypass-Tier"] = "true";
    headers["X-Dev-Bypass"] = "true";
    headers["X-TTR-Tier"] = "pro";
    headers["X-TTR-Plan"] = "pro";
    headers["X-TTR-Entitlement"] = "pro";
  }

  const url = `${baseUrl}/resume/export/${encodeURIComponent(format)}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return relayApiResponse(response);
}
