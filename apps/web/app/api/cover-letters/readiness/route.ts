import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";

export const runtime = "nodejs";

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

  // Defensive logging: this route is a thin proxy, but we need visibility into 500s in production.
  // Keep logs compact and safe (no auth tokens), and rely on upstream to redact sensitive fields.
  try {
    console.log("[web][cover_letters.readiness] request", {
      hasBody: body != null,
      bodyType: typeof body,
    });
  } catch {
    // ignore logging failures
  }

  const upstreamUrl = `${baseUrl}/cover-letters/readiness`;
  try {
    console.log("[web][cover_letters.readiness] forward", { upstreamUrl });
  } catch {
    // ignore
  }

  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    try {
      const text = await response.clone().text();
      console.error("[web][cover_letters.readiness] upstream_error", {
        status: response.status,
        statusText: response.statusText,
        body: text.slice(0, 1200),
      });
    } catch {
      // ignore
    }
  }

  return relayApiResponse(response);
}
