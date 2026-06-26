import { NextRequest, NextResponse } from "next/server";
import {
  getApiBaseUrl,
  relayJsonResponse,
  requireAuthToken,
} from "../../baselines/helpers";
import { saveAnalysisRunTraceForDebug } from "@/src/lib/debug-baseline-analysis-trace-store";

export const runtime = "nodejs";

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
  } catch (error) {
    console.error("Failed to decode user id from JWT", error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (error) {
    return error;
  }

  try {
    const payload = await req.json();
    if (process.env.NODE_ENV !== "production") {
      console.log("[web/api/analysis/run] request", {
        baselineId: payload?.baselineId ?? payload?.baseline_id ?? null,
        jobId: payload?.jobId ?? payload?.job_id ?? null,
      });
    }
    const baselineId = payload?.baselineId ?? payload?.baseline_id ?? null;
    const jobId = payload?.jobId ?? payload?.job_id ?? null;
    const response = await fetch(`${baseUrl}/analysis/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        baselineId,
        jobId,
        debug: payload?.debug,
      }),
    });

    if (process.env.NODE_ENV !== "production") {
      const responseBody =
        response.headers.get("content-type")?.includes("application/json")
          ? await response.clone().json().catch(() => null)
          : null;
      const body =
        responseBody;
      console.log("[web/api/analysis/run] response", {
        assessmentId: body?.assessmentId ?? null,
        baselineId: body?.baselineId ?? null,
        score: body?.score ?? body?.fit_score ?? null,
      });
      const userId = decodeUserIdFromJwt(token);
      const assessmentId = typeof body?.assessmentId === "string" ? body.assessmentId : null;
      const responseBaselineId = typeof body?.baselineId === "string" ? body.baselineId : null;
      const responseScore =
        typeof body?.score === "number"
          ? body.score
          : typeof body?.fit_score === "number"
            ? body.fit_score
            : null;
      if (userId && assessmentId && responseBaselineId && typeof responseScore === "number") {
        saveAnalysisRunTraceForDebug(userId, {
          assessmentId,
          baselineId: responseBaselineId,
          score: responseScore,
          createdAt:
            typeof body?.createdAt === "string" && body.createdAt.trim().length > 0
              ? body.createdAt
              : new Date().toISOString(),
        });
      }
    }
    return relayJsonResponse(response);
  } catch (error) {
    console.error("Failed to run fit assessment", error);
    return NextResponse.json(
      {
        error: "Unable to reach the fit assessment service",
      },
      { status: 502 },
    );
  }
}
