import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../../baselines/helpers";

export const runtime = "nodejs";

function redactErrorBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 500);
}

function shouldBypassTier() {
  const nodeEnv = process.env.NODE_ENV;
  const bypass = nodeEnv !== "production" || process.env.TTR_BETA_BYPASS === "true";
  if (nodeEnv === "production" && process.env.TTR_BETA_BYPASS === "true") {
    const globalKey = "__ttr_beta_bypass_warned__";
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    if (!globalRecord[globalKey]) {
      globalRecord[globalKey] = true;
      console.warn("[TTR_BETA_BYPASS][production] Tier bypass active", {
        TTR_BETA_BYPASS: process.env.TTR_BETA_BYPASS,
        production: true,
        context: "apps/web/app/api/cover-letters/generate/route.ts",
      });
    }
  }
  return bypass;
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);
  const route = "apps/web/app/api/cover-letters/generate/route.ts";
  const method = req.method;

  const bodyText = await req.text().catch(() => "");
  let body: Record<string, unknown> | null = null;
  try {
    body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }

  console.info("[DOCGEN][PROXY][COVER_LETTER][ENTER]", {
    route,
    method,
    authTokenPresent: Boolean(auth.token),
    baseUrl: baseUrl ?? null,
    baselineId: typeof body?.baselineId === "string" ? body.baselineId : null,
    baselineVersionId: typeof body?.baselineVersionId === "string" ? body.baselineVersionId : null,
    jobId: typeof body?.jobId === "string" ? body.jobId : null,
    analysisId: typeof body?.analysisId === "string" ? body.analysisId : null,
  });

  if (!baseUrl) {
    console.info("[DOCGEN][PROXY][COVER_LETTER][EXIT]", {
      route,
      method,
      status: 500,
      reason: "missing_api_base_url",
    });
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (!auth.token) {
    console.info("[DOCGEN][PROXY][COVER_LETTER][EXIT]", {
      route,
      method,
      status: 401,
      reason: "missing_auth_token",
    });
    return auth.error;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": req.headers.get("content-type") ?? "application/json",
  };

  if (shouldBypassTier()) {
    headers["X-TTR-Beta-Bypass"] = "true";
  }

  const response = await fetch(`${baseUrl}/cover-letters/generate`, {
    method: "POST",
    headers,
    body: bodyText || undefined,
  });

  if (!response.ok) {
    const errorBody = redactErrorBody(await response.clone().text().catch(() => ""));
    console.info("[DOCGEN][PROXY][COVER_LETTER][UPSTREAM_NON_2XX]", {
      route,
      method,
      status: response.status,
      ok: response.ok,
      errorBody,
      baselineId: typeof body?.baselineId === "string" ? body.baselineId : null,
      baselineVersionId: typeof body?.baselineVersionId === "string" ? body.baselineVersionId : null,
      jobId: typeof body?.jobId === "string" ? body.jobId : null,
      analysisId: typeof body?.analysisId === "string" ? body.analysisId : null,
    });
  } else {
    console.info("[DOCGEN][PROXY][COVER_LETTER][UPSTREAM_OK]", {
      route,
      method,
      status: response.status,
      ok: response.ok,
      baselineId: typeof body?.baselineId === "string" ? body.baselineId : null,
      baselineVersionId: typeof body?.baselineVersionId === "string" ? body.baselineVersionId : null,
      jobId: typeof body?.jobId === "string" ? body.jobId : null,
      analysisId: typeof body?.analysisId === "string" ? body.analysisId : null,
    });
  }

  return relayApiResponse(response);
}
