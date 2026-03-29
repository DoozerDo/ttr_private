import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ResultsPage from "@/app/(app)/results/page";
import { mockRouterReplace, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results re-analysis loop", () => {
  it("shows re-analyze CTA when baseline changed and re-runs same role", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
        return jsonResponse({
          assessmentId: "analysis-current",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 80,
          strengths: ["Incident management", "SLA ownership"],
        });
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-2", versionNumber: 2 }]);
      }
      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([
          {
            assessmentId: "analysis-current",
            score: 80,
            strengths: ["Incident management", "SLA ownership"],
          },
          {
            assessmentId: "analysis-previous",
            score: 68,
            strengths: ["Incident management"],
          },
        ]);
      }
      if (url.includes("/api/analysis/history")) {
        return jsonResponse({
          recentAnalyses: [],
          alignmentPattern: { strongestAlignmentRoles: [], totalAnalyses: 0, averageScore: 0 },
          badges: [],
          generatedAt: new Date().toISOString(),
        });
      }
      if (url.includes("/api/analysis/run") && init?.method === "POST") {
        return jsonResponse({ assessmentId: "analysis-next" });
      }
      if (url.includes("/api/opportunities") && init?.method === "POST") {
        return jsonResponse({ id: "opp-1" });
      }
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    expect(await screen.findByText("Updated Baseline Detected")).toBeInTheDocument();
    expect(await screen.findByText("You've improved your fit")).toBeInTheDocument();
    expect(await screen.findByText("+12 points (68 -> 80)")).toBeInTheDocument();
    expect(await screen.findByText("Apply moment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to this role" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save this opportunity" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Re-run Analysis" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/analysis/run",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ jobId: "job-1", baselineId: "base-1" }),
        }),
      );
    });

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith("/results?assessmentId=analysis-next");
    });
  });
});
