import { describe, expect, it, vi } from "vitest";

import { getGenerationAuthorityState } from "@/lib/generationAuthority";
import { buildGenerationProductReadiness } from "@/lib/generationProductReadiness";
import { getGenerationReadiness } from "@/lib/generationReadiness";
import {
  assertTargetCtaAnalyticsMatchesRenderedCta,
  buildTargetCtaContract,
  buildTargetCtaClickedAnalyticsPayload,
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
      19,
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
      fitReviewHref: "/fit-review?analysisId=analysis-19&jobId=job-19&baselineId=base-19",
      scoreSource: "fresh_computation",
    });

    expect(contract).toMatchObject({
      state: "BLOCKED",
      label: "Start Fit Review",
      actionType: "resolve_gaps",
      href: "/fit-review?analysisId=analysis-19&jobId=job-19&baselineId=base-19",
      isStudioDestination: false,
      score: 19,
    });

    const analyticsPayload = buildTargetCtaClickedAnalyticsPayload(contract);
    expect(analyticsPayload).toEqual({
      state: "BLOCKED",
      score: 19,
      label: "Start Fit Review",
      href: "/fit-review?analysisId=analysis-19&jobId=job-19&baselineId=base-19",
      actionType: "resolve_gaps",
    });
    expect(() => assertTargetCtaAnalyticsMatchesRenderedCta(contract, analyticsPayload)).not.toThrow();
  });

  it("renders the studio-ready CTA from one readiness contract", () => {
    const generationReadiness = getGenerationReadiness(
      {
        score: 82,
        compliance_flags: [],
      },
      null,
      82,
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
      fitReviewHref: "/fit-review?analysisId=analysis-82&jobId=job-82&baselineId=base-82",
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

    const analyticsPayload = buildTargetCtaClickedAnalyticsPayload(contract);
    expect(analyticsPayload).toEqual({
      state: "READY",
      score: 82,
      label: "Open Studio",
      href: "/studio?analysisId=analysis-82&jobId=job-82&baselineId=base-82",
      actionType: "open_studio_generate",
    });
  });

  it("routes limited readiness back to Fit Review instead of Studio", () => {
    const generationReadiness = getGenerationReadiness(
      {
        score: 78,
        compliance_flags: [{ code: "limited_personalization", severity: "warn" }],
      },
      null,
      78,
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
      fitReviewHref: "/fit-review?analysisId=analysis-78&jobId=job-78&baselineId=base-78",
      scoreSource: "fresh_computation",
    });

    expect(contract).toMatchObject({
      state: "LIMITED",
      label: "Start Fit Review",
      actionType: "resolve_gaps",
      href: "/fit-review?analysisId=analysis-78&jobId=job-78&baselineId=base-78",
      isStudioDestination: false,
      score: 78,
    });

    const analyticsPayload = buildTargetCtaClickedAnalyticsPayload(contract);
    expect(analyticsPayload).toEqual({
      state: "LIMITED",
      score: 78,
      label: "Start Fit Review",
      href: "/fit-review?analysisId=analysis-78&jobId=job-78&baselineId=base-78",
      actionType: "resolve_gaps",
    });
  });

  it("keeps trust-gated high scores off the Studio path", () => {
    const generationReadiness = getGenerationReadiness(
      {
        score: 88,
        compliance_flags: [{ code: "limited_personalization", severity: "warn" }],
      },
      null,
      88,
    );
    const productReadiness = {
      generation_readiness: {
        canGenerate: false,
        canExport: false,
        reasonsBlocked: ["trust_gate_blocked"],
      },
      state: "BLOCKED" as const,
      confidence: "LOW" as const,
      needsVerification: true,
      tier: "fit_review_only" as const,
      canOpenStudio: false,
      generationMode: "draft" as const,
    };

    const contract = buildTargetCtaContract({
      score: 88,
      generationReadiness,
      productReadiness,
      studioHref: "/studio?analysisId=analysis-88&jobId=job-88&baselineId=base-88",
      fitReviewHref: "/fit-review?analysisId=analysis-88&jobId=job-88&baselineId=base-88",
      scoreSource: "fresh_computation",
    });

    expect(contract.actionType).toBe("resolve_gaps");
    expect(contract.label).toBe("Start Fit Review");
    expect(contract.href).toContain("/fit-review");
    expect(buildTargetCtaClickedAnalyticsPayload(contract)).toEqual({
      state: contract.state,
      score: 88,
      label: "Start Fit Review",
      href: contract.href,
      actionType: "resolve_gaps",
    });
  });

  it("logs and throws when the emitted analytics payload diverges from the rendered CTA", () => {
    const generationReadiness = getGenerationReadiness(
      {
        score: 19,
        compliance_flags: [],
      },
      null,
      19,
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
      fitReviewHref: "/fit-review?analysisId=analysis-19&jobId=job-19&baselineId=base-19",
      scoreSource: "fresh_computation",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      assertTargetCtaAnalyticsMatchesRenderedCta(contract, {
        state: "READY",
        score: 19,
        label: "Open Studio",
        href: "/studio?analysisId=analysis-19&jobId=job-19&baselineId=base-19",
        actionType: "open_studio_generate",
      }),
    ).toThrow("[target-cta] analytics payload mismatch");

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("fails loudly when the fresh and persisted active-pair results disagree", () => {
    const freshResult = { baselineId: "base-1", jobId: "job-1", score: 19, assessmentId: "fresh-1" };
    const persistedResult = {
      baselineId: "base-1",
      jobId: "job-1",
      score: 91,
      assessmentId: "persisted-1",
    };

    expect(() =>
      resolveTargetDisplayResult({
        currentResult: freshResult,
        persistedResult,
        baselineId: "base-1",
        jobId: "job-1",
      }),
    ).toThrow("[canonical-decision] fresh and persisted results disagree for the active pair");
  });
});
