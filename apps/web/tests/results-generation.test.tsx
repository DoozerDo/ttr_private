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

describe("results generation (routing contract)", () => {
  it("does not perform generation on Results for score >= 80 and routes to Studio immediately", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
        return jsonResponse({
          assessmentId: "analysis-current",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 84,
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
      if (method === "POST" && (url.endsWith("/api/resume") || url.endsWith("/api/cover-letters"))) {
        return jsonResponse({ ok: true });
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

    // Results UI should not render and must not attempt generation mutations.
    expect(screen.queryByTestId("results-hero-primary-cta")).toBeNull();
    const postCalls = fetchMock.mock.calls.filter(([_input, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCalls.some(([input]) => String(input).endsWith("/api/resume"))).toBe(false);
    expect(postCalls.some(([input]) => String(input).endsWith("/api/cover-letters"))).toBe(false);
  });
});

