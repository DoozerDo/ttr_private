import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, relayApiResponse, requireAuthToken } from "../baselines/helpers";

export const runtime = "nodejs";

function shouldBypassTier() {
  return process.env.NODE_ENV !== "production" || process.env.TTR_BETA_BYPASS === "true";
}

function shouldDebugDocgen() {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_DOCGEN === "true";
}

type CoverLetterRouteBody = {
  jobId?: string;
  baselineId?: string;
  baselineVersionId?: string;
  analysisId?: string;
  closingTemplateKey?: string;
  oneTap?: boolean;
  jobContext?: {
    allowedCompanies?: string[];
    allowedRoleTitles?: string[];
  };
  documentType?: string;
  [key: string]: unknown;
};

async function parseJsonBody(req: NextRequest): Promise<CoverLetterRouteBody | null> {
  try {
    return (await req.json()) as CoverLetterRouteBody;
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

  // Avoid noisy runtime logs in the web proxy route.

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }

  if (!auth.token) return auth.error;

  const body = await parseJsonBody(req);
  if (body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (shouldDebugDocgen()) {
    console.log("[DOCGEN][REQUEST_RECEIVED][WEB][COVER_LETTER]", {
      baselineId: typeof body.baselineId === "string" ? body.baselineId : null,
      baselineVersionId: typeof body.baselineVersionId === "string" ? body.baselineVersionId : null,
      jobId: typeof body.jobId === "string" ? body.jobId : null,
      analysisId: typeof body.analysisId === "string" ? body.analysisId : null,
      oneTap: Boolean(body.oneTap),
    });
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

  if (shouldDebugDocgen()) {
    console.log("[DOCGEN][UPSTREAM_RESPONSE][WEB][COVER_LETTER]", {
      status: response.status,
      ok: response.ok,
    });
  }

  return relayApiResponse(response);
}
