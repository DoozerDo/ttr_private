import { describe, expect, it } from "vitest";

import { getGenerationAuthorityState } from "@/lib/generationAuthority";
import { buildGenerationProductReadiness } from "@/lib/generationProductReadiness";
import { getGenerationReadiness } from "@/lib/generationReadiness";
import {
  buildTargetCtaContract,
  resolveTargetDisplayResult,
} from "@/lib/targetGenerationContract";

describe("target generation contract", () => {
  it("keeps low score results on the fit-review path", () => {
    const generationReadiness = getGenerationReadiness(
      {
        score: 19,
        compliance_flags: [],
      },
      null,
    );
    const productReadiness = buildGenerationProductReadiness({
      score: 19,
      authorityState: getGenerationAuthorityState(generationReadiness),
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    const contract = buildTargetCtaContract({
      score: 19,
      generationReadiness,
      productReadiness,
      studioHref: "/studio?analysisId=analysis-19&jobId=job-19&baselineId=base-19",
      resolveGapsHref: "/resolve-gaps?analysisId=analysis-19&jobId=job-19&baselineId=base-19",
      scoreSource: "fresh_computation",
    });

    expect(contract).toMatchObject({
      state: "BLOCKED",
      label: "Start Fit Review",
      actionType: "resolve_gaps",
      href: "/resolve-gaps?analysisId=analysis-19&jobId=job-19&baselineId=base-19",
      isStudioDestination: false,
      score: 19,
    });
  });

  it("renders the studio-ready CTA from one readiness contract", () => {
    const generationReadiness = getGenerationReadiness(
      {
        score: 82,
        compliance_flags: [],
      },
      null,
    );
    const productReadiness = buildGenerationProductReadiness({
      score: 82,
      authorityState: getGenerationAuthorityState(generationReadiness),
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    const contract = buildTargetCtaContract({
      score: 82,
      generationReadiness,
      productReadiness,
      studioHref: "/studio?analysisId=analysis-82&jobId=job-82&baselineId=base-82",
      resolveGapsHref: "/resolve-gaps?analysisId=analysis-82&jobId=job-82&baselineId=base-82",
      scoreSource: "fresh_computation",
    });

    expect(contract).toMatchObject({
      state: "READY",
      label: "Open Studio",
      actionType: "open_studio_generate",
      href: "/studio?analysisId=analysis-82&jobId=job-82&baselineId=base-82",
      isStudioDestination: true,
      score: 82,
    });
  });

  it("routes limited readiness back to Fit Review instead of Studio", () => {
    const generationReadiness = getGenerationReadiness(
      {
        score: 78,
        compliance_flags: [{ code: "limited_personalization", severity: "warn" }],
      },
      null,
    );
    const productReadiness = buildGenerationProductReadiness({
      score: 78,
      authorityState: getGenerationAuthorityState(generationReadiness),
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    const contract = buildTargetCtaContract({
      score: 78,
      generationReadiness,
      productReadiness,
      studioHref: "/studio?analysisId=analysis-78&jobId=job-78&baselineId=base-78",
      resolveGapsHref: "/resolve-gaps?analysisId=analysis-78&jobId=job-78&baselineId=base-78",
      scoreSource: "fresh_computation",
    });

    expect(contract).toMatchObject({
      state: "LIMITED",
      label: "Start Fit Review",
      actionType: "resolve_gaps",
      href: "/resolve-gaps?analysisId=analysis-78&jobId=job-78&baselineId=base-78",
      isStudioDestination: false,
      score: 78,
    });
  });

  it("prefers the fresh computation over a stale persisted assessment", () => {
    const freshResult = { baselineId: "base-1", jobId: "job-1", score: 19, assessmentId: "fresh-1" };
    const persistedResult = {
      baselineId: "base-1",
      jobId: "job-1",
      score: 91,
      assessmentId: "persisted-1",
    };

    const resolved = resolveTargetDisplayResult({
      currentResult: freshResult,
      persistedResult,
      baselineId: "base-1",
      jobId: "job-1",
    });

    expect(resolved.source).toBe("fresh_computation");
    expect(resolved.result).toBe(freshResult);
  });
});
