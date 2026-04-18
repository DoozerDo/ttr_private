import { vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ResultsPage from "@/app/(app)/results/page";
import { overrideSearchParams, setFetchImplementation, mockRouterPush } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results generation (draft resume)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockRouterPush.mockClear();
  });

  it("calls /api/resume even when baselineVersionId is missing in the assessment payload", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    overrideSearchParams({ assessmentId: "analysis-current" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (method === "POST" && url.endsWith("/api/resume")) {
        return jsonResponse({ ok: true });
      }
      if (method === "POST" && url.endsWith("/api/cover-letters")) {
        return jsonResponse({ ok: true });
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
        return jsonResponse({
          assessmentId: "analysis-current",
          jobId: "job-1",
          baselineId: "base-1",
          // baselineVersionId intentionally missing to reproduce the original no-op click bug.
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
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
        return jsonResponse({
          assessmentId: "analysis-current",
          jobId: "job-1",
          baselineId: "base-1",
          // baselineVersionId intentionally missing.
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
      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([
          {
            assessmentId: "analysis-current",
            score: 84,
            strengths: ["Incident management"],
            supportingSignals: ["Incident management"],
          },
        ]);
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/history")) {
        return jsonResponse({
          recentAnalyses: [],
          alignmentPattern: { strongestAlignmentRoles: [], totalAnalyses: 0, averageScore: 0 },
          badges: [],
          generatedAt: new Date().toISOString(),
        });
      }
      if (url.includes("/api/resume/readiness")) {
        return jsonResponse({ status: "ready", blocked: false, reasons: [] });
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return jsonResponse({ status: "ready", blocked: false, reasons: [] });
      }
      if (url.includes("/api/studio/artifacts")) {
        return jsonResponse({
          resume: { status: "missing" },
          coverLetter: { status: "missing" },
        });
      }

      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    const cta = await screen.findByTestId("results-hero-primary-cta");

    fireEvent.click(cta);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/resume",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const coverCalls = fetchMock.mock.calls.filter(([input, init]) => {
      const url = String(input);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      return method === "POST" && url.endsWith("/api/cover-letters");
    });
    expect(coverCalls.length).toBe(0);
  });
});

