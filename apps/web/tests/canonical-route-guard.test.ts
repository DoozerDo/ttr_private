import { describe, expect, it, vi } from "vitest";

import {
  assertCanonicalRouteHref,
  getFitReviewHref,
  getResultsHref,
  getStudioHref,
} from "@/src/navigation/routes";

describe("canonical route guard", () => {
  it("accepts canonical product routes", () => {
    const fitReviewHref = getFitReviewHref({
      jobId: "job-1",
      baselineId: "base-1",
      assessmentId: "analysis-1",
    });
    const studioHref = getStudioHref({
      jobId: "job-1",
      baselineId: "base-1",
      assessmentId: "analysis-1",
    });
    const resultsHref = getResultsHref({
      jobId: "job-1",
      baselineId: "base-1",
      assessmentId: "analysis-1",
    });

    expect(
      assertCanonicalRouteHref({
        kind: "fit_review",
        href: fitReviewHref,
        canonicalHref: fitReviewHref,
        state: "BLOCKED",
        baselineId: "base-1",
        jobId: "job-1",
        entrySource: "test",
      }),
    ).toBe(fitReviewHref);
    expect(
      assertCanonicalRouteHref({
        kind: "studio",
        href: studioHref,
        canonicalHref: studioHref,
        state: "READY",
        baselineId: "base-1",
        jobId: "job-1",
        entrySource: "test",
      }),
    ).toBe(studioHref);
    expect(
      assertCanonicalRouteHref({
        kind: "results",
        href: resultsHref,
        canonicalHref: resultsHref,
        state: "READY",
        baselineId: "base-1",
        jobId: "job-1",
        entrySource: "test",
      }),
    ).toBe(resultsHref);
  });

  it("fails loudly when a legacy resolve-gaps href appears", () => {
    const canonicalHref = getFitReviewHref({
      jobId: "job-1",
      baselineId: "base-1",
      assessmentId: "analysis-1",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      assertCanonicalRouteHref({
        kind: "fit_review",
        href: "/resolve-gaps?jobId=job-1&baselineId=base-1&assessmentId=analysis-1",
        canonicalHref,
        state: "BLOCKED",
        baselineId: "base-1",
        jobId: "job-1",
        entrySource: "test",
      }),
    ).toThrow(/non-canonical fit_review href resolved/);

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
