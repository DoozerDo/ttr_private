import { NextRequest, NextResponse } from "next/server";
import {
  getApiBaseUrl,
  relayJsonResponse,
  requireAuthToken,
} from "../../../../../../baselines/helpers";

export const runtime = "nodejs";

function extractScoreCandidate(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { score?: unknown; fit_score?: unknown };
  if (typeof record.score === "number") return record.score;
  if (typeof record.fit_score === "number") return record.fit_score;
  return null;
}

function buildZeroScoreFailure(details: Record<string, unknown>) {
  return NextResponse.json(
    {
      error: {
        code: "cx_fit_zero_score_invariant_failed",
        message:
          "CX Fit scoring returned an impossible zero score for non-empty baseline and job inputs.",
        details,
      },
    },
    { status: 502 },
  );
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string; baselineId: string }> },
) {
  const baseUrl = getApiBaseUrl();
  const auth = requireAuthToken(req);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "API base URL is not configured" },
      { status: 500 },
    );
  }

  if (!auth.token) return auth.error;

  const { jobId, baselineId } = await context.params;

  if (!jobId || !baselineId) {
    return NextResponse.json(
      { error: "Missing jobId or baselineId parameter" },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${baseUrl}/analysis/job/${encodeURIComponent(
      jobId,
    )}/baseline/${encodeURIComponent(baselineId)}/latest`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    },
  );

  const responseBody =
    response.headers.get("content-type")?.includes("application/json")
      ? await response.clone().json().catch(() => null)
      : null;

  const scoreCandidate = extractScoreCandidate(responseBody);
  if (response.ok && scoreCandidate === 0) {
    const body = responseBody as
      | {
          baselineId?: unknown;
          jobId?: unknown;
          scorerVersion?: unknown;
          scoring_v2?: {
            scorerVersion?: unknown;
            rubric?: {
              dimensionPercents?: Record<string, number>;
            };
          };
        }
      | null;
    return buildZeroScoreFailure({
      baselineId: body?.baselineId ?? baselineId,
      jobId: body?.jobId ?? jobId,
      scorerVersion: body?.scorerVersion ?? body?.scoring_v2?.scorerVersion ?? null,
      categoryBreakdown: body?.scoring_v2?.rubric?.dimensionPercents ?? undefined,
    });
  }

  return relayJsonResponse(response);
}
