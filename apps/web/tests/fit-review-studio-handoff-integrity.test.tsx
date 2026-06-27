import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FitReviewClient from "@/app/(app)/fit-review/FitReviewClient";
import * as sessionModule from "@/app/(app)/lib/session";
import { mockRouterPush, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("Fit Review -> Studio handoff integrity", () => {
  it("prefers the current analysisId over a newer stored analysis snapshot", async () => {
    overrideSearchParams({
      jobId: "job-1",
      analysisId: "analysis-current",
      assessmentId: "analysis-current",
    });
    const staleAnalysis = {
      savedAt: "2026-06-26T01:00:00.000Z",
      analysis: {
        assessmentId: "analysis-stale",
        baselineId: "baseline-1",
        jobId: "job-1",
        score: 71,
        overallScore: 71,
        fitScore: 71,
        verdict: "consider",
        summary: "Persisted stale analysis",
      },
      baselineId: "baseline-1",
      jobId: "job-1",
      jobSource: { type: "unknown" },
      fitScore: 71,
    } as const;
    const readLastAnalysisSpy = vi.spyOn(sessionModule, "readLastAnalysis").mockReturnValue(staleAnalysis as never);

    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
        return createResponse({
          assessmentId: "analysis-current",
          jobId: "job-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-1",
          score: 88,
          verdict: "apply",
          summary: "Fresh current analysis",
          scoring_v2: {
            score: 88,
            rubric: {
              dimensionPercents: {
                experienceAlignment: 92,
                leadershipLevel: 88,
                technicalPlatformFit: 83,
                industryContext: 79,
                strategicTacticalFit: 85,
              },
              dimensionPoints: {
                experienceAlignment: 28,
                leadershipLevel: 18,
                technicalPlatformFit: 17,
                industryContext: 12,
                strategicTacticalFit: 13,
              },
            },
          },
        });
      }
      if (url.includes("/api/analysis/job/job-1/latest")) {
        return createResponse({
          jobId: "job-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-1",
          assessmentId: "analysis-stale",
          score: 71,
          verdict: "consider",
          summary: "Older persisted analysis",
        });
      }
      return createResponse({}, false, 404);
    });
    setFetchImplementation(fetchMock);

    render(<FitReviewClient />);

    expect(await screen.findByText("Score: 88.0")).toBeInTheDocument();
    expect(screen.queryByText("Score: 71.0")).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        return url.includes("/api/analysis/fit-assessments/analysis-current");
      }),
    ).toBe(true);

    readLastAnalysisSpy.mockRestore();
  });

  it("does not render placeholder verifiedClaim=next and does not include it in the Studio return link", async () => {
    overrideSearchParams({ jobId: "job-1", highlightClaim: "next" });

    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/analysis/job/job-1/latest")) {
          return createResponse({
            jobId: "job-1",
            baselineId: "baseline-1",
            baselineVersionId: "baseline-version-1",
            assessmentId: "analysis-1",
            score: 77,
            verdict: "consider",
            summary: "Ok",
            verification_coverage: { unverifiedRequirements: [] },
          });
        }
        return createResponse({}, false, 404);
      }),
    );

    render(<FitReviewClient />);

    await screen.findByRole("heading", { name: "Fit Review" });
    expect(screen.queryByText("Claim to verify")).toBeNull();
    expect(screen.queryByText(/^next$/i)).toBeNull();
  });

  it("keeps user in Fit Review and offers re-analyze when return-to-studio context is missing", async () => {
    overrideSearchParams({ jobId: "job-1", highlightClaim: "I shipped a feature." });

    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/analysis/job/job-1/latest")) {
          return createResponse({
            jobId: "job-1",
            baselineId: "baseline-1",
            baselineVersionId: "baseline-version-1",
            assessmentId: null,
            score: 77,
            verdict: "consider",
            summary: "Ok",
            verification_coverage: { unverifiedRequirements: [] },
          });
        }
        return createResponse({}, false, 404);
      }),
    );

    render(<FitReviewClient />);

    const confirm = await screen.findByRole("button", { name: "Confirm and return to Studio" });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(screen.getByText("We couldn’t load your analysis")).toBeInTheDocument();
    });
    expect(screen.getByText("Reload the role analysis before returning to Studio.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Analyze again" })).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining("/studio?"));
  });
});
