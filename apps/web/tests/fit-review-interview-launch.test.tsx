import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import FitReviewClient from "@/app/(app)/fit-review/FitReviewClient";
import { mockRouterPush, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("FitReview interview launch", () => {
  it("starts canonical interview and redirects to interview session", async () => {
    overrideSearchParams({ jobId: "job-1" });

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/job/job-1/latest")) {
        return createResponse({
          jobId: "job-1",
          baselineId: "baseline-1",
          baselineVersionId: "baseline-version-4",
          score: 54,
          verdict: "consider",
          summary: "Needs stronger evidence",
          scoring_v2: {
            rubric: {
              dimensionPercents: {
                experienceAlignment: 40,
                leadershipLevel: 60,
                technicalPlatformFit: 70,
                industryContext: 80,
                strategicTacticalFit: 75,
              },
              dimensionPoints: {
                experienceAlignment: 8,
                leadershipLevel: 12,
                technicalPlatformFit: 14,
                industryContext: 16,
                strategicTacticalFit: 15,
              },
            },
          },
        });
      }

      if (url === "/api/interviews/start" && init?.method === "POST") {
        return createResponse({ id: "interview-123" });
      }

      return createResponse({}, false, 404);
    });
    setFetchImplementation(fetchMock);

    render(<FitReviewClient />);

    const cta = await screen.findByRole("button", { name: "I think I'm qualified" });
    fireEvent.click(cta);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/interviews/interview-123");
    });

    const startCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      return url === "/api/interviews/start" && init?.method === "POST";
    });

    expect(startCall).toBeDefined();
    expect(startCall?.[1]?.body).toBe(
      JSON.stringify({
        jobId: "job-1",
        baselineVersionId: "baseline-version-4",
        baselineId: "baseline-1",
        fitAssessmentId: undefined,
      }),
    );
  });
});
