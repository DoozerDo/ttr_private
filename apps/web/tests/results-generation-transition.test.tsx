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

describe("results generation transition", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockRouterPush.mockClear();
  });

  it(
    "transitions into generating state immediately after clicking Generate Documents and then offers Studio",
    async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    overrideSearchParams({ assessmentId: "analysis-current" });

    let artifactsCallCount = 0;
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
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
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
      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([
          {
            assessmentId: "analysis-current",
            score: 92,
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
        artifactsCallCount += 1;
        if (artifactsCallCount < 2) {
          return jsonResponse({
            resume: { status: "missing" },
            coverLetter: { status: "missing" },
          });
        }
        return jsonResponse({
          resume: { status: "completed" },
          coverLetter: { status: "completed" },
        });
      }
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    const cta = await screen.findByTestId("results-hero-primary-cta");
    expect(cta).toHaveTextContent("Generate Documents");

    fireEvent.click(cta);

    expect(screen.getAllByText("Generating your documents...").length).toBeGreaterThan(0);
    expect(screen.getByTestId("results-hero-primary-cta")).toHaveTextContent("Generating...");
    expect(screen.queryByText("Strong match. Ready for document generation.")).toBeNull();

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalled();
    });

    await waitFor(
      () => {
        expect(screen.getAllByText("Your documents are ready").length).toBeGreaterThan(0);
      },
      { timeout: 6000 },
    );
    expect(screen.getByTestId("results-hero-primary-cta")).toHaveTextContent("Open in Studio");
    expect(screen.queryByText("Strong match. Ready for document generation.")).toBeNull();
    },
    15_000,
  );

  it("suppresses ready messaging when artifacts indicate a partial/failed lifecycle state", async () => {
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
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
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
      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([
          {
            assessmentId: "analysis-current",
            score: 92,
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
          resume: { status: "completed" },
          coverLetter: { status: "failed" },
        });
      }
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Generation needs attention").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Strong match. Ready for document generation.")).toBeNull();
  });
});
