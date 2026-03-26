import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, requireAuthToken } from "../../baselines/helpers";
import { getAnalysisRunTraceForDebug } from "@/src/lib/debug-baseline-analysis-trace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeUserIdFromJwt(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: string;
      userId?: string;
      id?: string;
    };
    return payload.sub ?? payload.userId ?? payload.id ?? null;
  } catch {
    return null;
  }
}

type BackendTrace = {
  baselineId: string;
  userId: string;
  persistedAssessment: {
    exists: boolean;
    assessmentId?: string;
    baselineId?: string;
    userId?: string;
    createdAt?: string;
    score?: number;
  };
  baselineSummary: {
    baselineId: string;
    latestAssessmentId?: string;
    hasCompletedAssessment: boolean;
    latestFitScore?: number;
    latestAssessmentCreatedAt?: string;
  };
};

export async function GET(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (error) {
    return error;
  }

  const baselineId = req.nextUrl.searchParams.get("baselineId")?.trim();
  if (!baselineId) {
    return NextResponse.json({ error: "baselineId is required" }, { status: 400 });
  }

  const backendUrl = `${baseUrl}/baselines/debug/baseline-analysis-trace?baselineId=${encodeURIComponent(
    baselineId,
  )}`;
  const backendResponse = await fetch(backendUrl, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!backendResponse.ok) {
    const text = await backendResponse.text();
    return NextResponse.json(
      { error: "Unable to load backend baseline analysis trace", status: backendResponse.status, body: text },
      { status: backendResponse.status },
    );
  }

  const backendTrace = (await backendResponse.json()) as BackendTrace;
  const userId = backendTrace.userId || decodeUserIdFromJwt(token) || "";
  const analysisRunTrace = userId ? getAnalysisRunTraceForDebug(userId, baselineId) : undefined;

  return NextResponse.json(
    {
      baselineId: backendTrace.baselineId,
      userId,
      analysisRun: analysisRunTrace ? { lastResponse: analysisRunTrace } : {},
      persistedAssessment: backendTrace.persistedAssessment,
      baselineSummary: backendTrace.baselineSummary,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
