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

describe("FitReview score cap messaging", () => {
  it("shows a plain score-capped explanation when insufficient_baseline_support is applied", async () => {
    overrideSearchParams({ jobId: "job-1" });

    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/job/job-1/latest")) {
        return createResponse({
          jobId: "job-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-4",
          assessmentId: "analysis-82",
          verdict: "consider",
          summary: "Some keyword match, but evidence is too thin for the full scope.",
          scoring_v2: {
            score: 79,
            rubric: {
              dimensionPercents: {
                experienceAlignment: 38,
                leadershipLevel: 31,
                technicalPlatformFit: 22,
                industryContext: 18,
                strategicTacticalFit: 25,
              },
              dimensionPoints: {
                experienceAlignment: 12,
                leadershipLevel: 10,
                technicalPlatformFit: 7,
                industryContext: 5,
                strategicTacticalFit: 8,
              },
              penalties: [
                {
                  code: "insufficient_baseline_support",
                  points: 0,
                  reason:
                    "Score capped below strong-apply territory due to insufficient baseline evidence (baseline_recall=11.2% responsibility_overlap=38.7% required_tool_coverage=9.5%).",
                },
              ],
            },
          },
        });
      }

      return createResponse({}, false, 404);
    });
    setFetchImplementation(fetchMock);

    render(<FitReviewClient />);

    expect(
      await screen.findByText(
        "Score capped because the verified baseline does not show enough support for this role scope.",
      ),
    ).toBeInTheDocument();

    const warning = screen.getByTestId("fit-review-score-cap-warning");
    expect(warning).toHaveTextContent("Baseline recall: 11.2%");
    expect(warning).toHaveTextContent("Responsibility overlap: 38.7%");
    expect(warning).toHaveTextContent("Required tool coverage: 9.5%");
  });
});

