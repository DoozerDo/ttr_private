import { vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import ResultsPage from "@/app/(app)/results/page";
import { mockRouterReplace, mockRouterPush, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results target-flow context preservation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockRouterReplace.mockClear();
    mockRouterPush.mockClear();
  });

  it("preserves baselineId + jobId in the URL when hydrating latest for a pair", async () => {
    // This simulates coming from the Target flow with an explicit pair in the URL.
    overrideSearchParams({ baselineId: "base-1", jobId: "job-1" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
        return jsonResponse({
          assessmentId: "analysis-current",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 78,
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
      if (url.includes("/api/analysis/history")) {
        return jsonResponse({
          recentAnalyses: [],
          alignmentPattern: { strongestAlignmentRoles: [], totalAnalyses: 0, averageScore: 0 },
          badges: [],
          generatedAt: new Date().toISOString(),
        });
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return jsonResponse({
          status: "ready",
          blocked: false,
          reasonCodes: [],
          reasons: [],
          badgeLabel: "READY",
          summary: "Ready.",
          verificationIssues: [],
        });
      }
      if (url.includes("/api/studio/artifacts")) {
        return jsonResponse({ resume: { status: "missing" }, coverLetter: { status: "missing" } });
      }
      if (url.endsWith("/api/resume")) {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith("/api/cover-letters")) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
      const destinations = mockRouterReplace.mock.calls.map(([arg]) => String(arg));
      expect(destinations.some((dest) => dest.includes("baselineId=base-1"))).toBe(true);
      expect(destinations.some((dest) => dest.includes("jobId=job-1"))).toBe(true);
    });

    const pushed = mockRouterPush.mock.calls.map(([arg]) => String(arg));
    const replaced = mockRouterReplace.mock.calls.map(([arg]) => String(arg));
    expect([...pushed, ...replaced].some((dest) => dest.startsWith("/baseline"))).toBe(false);
  });
});

