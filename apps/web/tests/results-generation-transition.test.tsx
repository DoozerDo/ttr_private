import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import ResultsPage from "@/app/(app)/results/page";
import { mockRouterReplace, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results generation transition", () => {
  it("auto-routes score >= 80 directly into Studio (Results is not a stopping point)", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
        return jsonResponse({
          assessmentId: "analysis-current",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 92,
          strengths: ["Incident management"],
          verification_coverage: {
            totalClaims: 1,
            verifiedClaims: 1,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: ["Incident management"],
            unverifiedRequirements: [],
          },
        });
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return jsonResponse({ status: "ready", blocked: false, reasons: [] });
      }
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const href = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(href.startsWith("/studio")).toBe(true);
    expect(href).toContain("jobId=job-1");
    expect(href).toContain("baselineId=base-1");

    // Results UI must not render in this lane.
    expect(screen.queryByTestId("results-hero-primary-cta")).toBeNull();
  });

  it("preserves Results UI for score < 80", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
        return jsonResponse({
          assessmentId: "analysis-current",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 79,
          strengths: ["Incident management"],
          verification_coverage: {
            totalClaims: 1,
            verifiedClaims: 1,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: ["Incident management"],
            unverifiedRequirements: [],
          },
        });
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return jsonResponse({ status: "ready", blocked: false, reasons: [] });
      }
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    await screen.findByTestId("results-hero-primary-cta");
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});

