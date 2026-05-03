import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FitReviewClient from "@/app/(app)/fit-review/FitReviewClient";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("FitReview score reliability warning", () => {
  it("renders a warning when scoringReliability is unreliable (and exposes reason for inspection)", async () => {
    overrideSearchParams({ jobId: "job-1" });

    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/job/job-1/latest")) {
        return createResponse({
          jobId: "job-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-4",
          assessmentId: "analysis-77",
          score: 11,
          verdict: "skip",
          summary: "No keywords found in the job description.",
          scoringReliability: "unreliable",
          scoringReliabilityReason: "job_description_terms_empty",
          score_breakdown: { total_score: 11, dimensions: [] },
          verification_coverage: { unverifiedRequirements: [] },
        });
      }

      return createResponse({}, false, 404);
    });
    setFetchImplementation(fetchMock);

    render(<FitReviewClient />);

    const warning = await screen.findByTestId("fit-review-score-reliability-warning");
    expect(warning).toHaveTextContent("score may be unreliable");
    expect(warning.getAttribute("data-reliability-reason")).toBe("job_description_terms_empty");
  });

  it("does not enable guided unlock primary action when scoringReliability is unreliable (even if score is in range)", async () => {
    overrideSearchParams({ jobId: "job-1" });

    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";

        if (url.includes("/api/analysis/job/job-1/latest")) {
          return createResponse({
            jobId: "job-1",
            baselineId: "baseline-1",
            baselineVersionId: "baseline-version-4",
            assessmentId: "analysis-77",
            score: 77,
            verdict: "consider",
            summary: "Almost there, but one evidence gap is blocking generation.",
            scoringReliability: "unreliable",
            scoringReliabilityReason: "job_description_terms_empty",
            score_breakdown: { total_score: 77, dimensions: [] },
            verification_coverage: { unverifiedRequirements: [] },
          });
        }

        return createResponse({}, false, 404);
      }),
    );

    render(<FitReviewClient />);

    expect(await screen.findByTestId("fit-review-score-reliability-warning")).toBeInTheDocument();
    expect(screen.queryByTestId("fit-review-primary-gap")).toBeNull();
    const guidance = screen.getByTestId("fit-review-unreliable-score-guidance");
    expect(guidance.getAttribute("data-reliability-reason")).toBe("job_description_terms_empty");
  });

  it("does not render a warning when scoringReliability is ok", async () => {
    overrideSearchParams({ jobId: "job-1" });

    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/analysis/job/job-1/latest")) {
          return createResponse({
            jobId: "job-1",
            baselineId: "baseline-1",
            assessmentId: "analysis-1",
            score: 77,
            verdict: "consider",
            summary: "Summary",
            scoringReliability: "ok",
            score_breakdown: { total_score: 77, dimensions: [] },
            verification_coverage: { unverifiedRequirements: [] },
          });
        }
        return createResponse({}, false, 404);
      }),
    );

    render(<FitReviewClient />);

    await screen.findByText(/Score:/);
    expect(screen.queryByTestId("fit-review-score-reliability-warning")).toBeNull();
  });

  it("does not render a warning when scoringReliability is missing", async () => {
    overrideSearchParams({ jobId: "job-1" });

    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/analysis/job/job-1/latest")) {
          return createResponse({
            jobId: "job-1",
            baselineId: "baseline-1",
            assessmentId: "analysis-2",
            score: 77,
            verdict: "consider",
            summary: "Summary",
            score_breakdown: { total_score: 77, dimensions: [] },
            verification_coverage: { unverifiedRequirements: [] },
          });
        }
        return createResponse({}, false, 404);
      }),
    );

    render(<FitReviewClient />);

    await screen.findByText(/Score:/);
    expect(screen.queryByTestId("fit-review-score-reliability-warning")).toBeNull();
  });
});
