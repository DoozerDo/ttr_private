import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl, requireAuthToken } from "../../baselines/helpers";
import { extractAssessmentsFromPayload } from "@/lib/assessmentSource";
import { getGenerationReadiness } from "@/lib/generationReadiness";
import { getGenerationAuthorityState } from "@/lib/generationAuthority";
import { buildGenerationProductReadiness } from "@/lib/generationProductReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const baselineId = req.nextUrl.searchParams.get("baselineId")?.trim() ?? "";
  if (!baselineId) {
    return NextResponse.json({ error: "baselineId is required" }, { status: 400 });
  }

  const baseUrl = getApiBaseUrl();
  const { token, error } = requireAuthToken(req);
  if (!baseUrl) {
    return NextResponse.json({ error: "API base URL is not configured" }, { status: 500 });
  }
  if (error) {
    return error;
  }

  const search = new URLSearchParams({ baselineId, limit: "1" }).toString();
  const response = await fetch(`${baseUrl}/analysis/fit-assessments?${search}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json(
      { error: "Unable to load latest assessment", status: response.status, body },
      { status: response.status },
    );
  }

  const payload = await response.json();
  const [latest] = extractAssessmentsFromPayload(payload);
  const generationReadiness = getGenerationReadiness(
    latest
      ? {
          score: latest.score,
          compliance_flags: latest.complianceFlags,
        }
      : null,
    null,
  );
  const authority = getGenerationAuthorityState(generationReadiness);
  const readiness = buildGenerationProductReadiness({
    score: latest?.score ?? null,
    authorityState: authority,
    hasCanonicalAssessment: Boolean(latest?.assessmentId),
    hasRequiredContext: Boolean(baselineId),
    isPro: true,
  });

  return NextResponse.json(
    {
      baselineId,
      latestAssessmentId: latest?.assessmentId ?? null,
      score: latest?.score ?? null,
      readiness: {
        status: generationReadiness.status,
        authority,
        generation_readiness: readiness.generation_readiness,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
