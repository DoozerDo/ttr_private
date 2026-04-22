import { vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import ResultsPage from "@/app/(app)/results/page";
import { overrideSearchParams, setFetchImplementation, mockRouterPush } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results auto-generation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockRouterPush.mockClear();
  });

  it("does not auto-trigger generation on Results at score 78 (generation is initiated elsewhere)", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });

    let artifactsCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
        return jsonResponse({
          assessmentId: "analysis-current",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 78,
          strengths: ["Incident management"],
          verification_coverage: {
            totalClaims: 2,
            verifiedClaims: 2,
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
          score: 78,
          strengths: ["Incident management"],
          verification_coverage: {
            totalClaims: 2,
            verifiedClaims: 2,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: ["Incident management"],
            unverifiedRequirements: [],
          },
        });
      }

      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([{ assessmentId: "analysis-current", score: 78, strengths: ["Incident management"] }]);
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

      if (method === "POST" && url.endsWith("/api/resume")) {
        return jsonResponse({
          status: "success",
          exportReady: true,
          code: "ok",
          preview: {
            resume: {
              heading: { name: "Test Candidate", contactLine: "test@example.com" },
              summary: "Summary line.",
              competencies: ["Incident management", "SLA ownership"],
              experience: [
                {
                  company: "Acme",
                  roleTitle: "Support Lead",
                  location: "Remote",
                  dateRange: "2022 - 2026",
                  bullets: ["Owned incident response", "Led support operations"],
                },
              ],
              education: [{ degree: "B.S.", institution: "State University", location: "CA" }],
            },
          },
        });
      }

      if (method === "POST" && url.endsWith("/api/cover-letters")) {
        return jsonResponse({
          status: "success",
          exportReady: true,
          code: "ok",
          preview: {
            coverLetter: {
              paragraphs: ["Dear Hiring Team,", "I am excited to apply.", "Sincerely,", "Test Candidate"],
            },
          },
        });
      }

      if (url.includes("/api/studio/artifacts")) {
        artifactsCalls += 1;
        if (artifactsCalls < 2) return jsonResponse([]);
        return jsonResponse([
          { type: "resume", status: "completed" },
          { type: "cover_letter", status: "completed" },
        ]);
      }

      return jsonResponse({});
    });
    setFetchImplementation(fetchMock);

    render(<ResultsPage />);

    await screen.findByText(/Generation readiness:/i);
    await waitFor(() => {
      const resumePosts = fetchMock.mock.calls.filter(
        ([url, init]) => String(url).endsWith("/api/resume") && init?.method === "POST",
      );
      const coverPosts = fetchMock.mock.calls.filter(
        ([url, init]) => String(url).endsWith("/api/cover-letters") && init?.method === "POST",
      );
      expect(resumePosts).toHaveLength(0);
      expect(coverPosts).toHaveLength(0);
    });
  });

  it("does not trigger generation below the 70 floor (score 69)", async () => {
    overrideSearchParams({ assessmentId: "analysis-low" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/analysis/fit-assessments/analysis-low")) {
        return jsonResponse({
          assessmentId: "analysis-low",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 69,
          strengths: [],
          verification_coverage: {
            totalClaims: 0,
            verifiedClaims: 0,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: [],
            unverifiedRequirements: [],
          },
        });
      }

      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
        return jsonResponse({
          assessmentId: "analysis-low",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          score: 69,
          strengths: [],
          verification_coverage: {
            totalClaims: 0,
            verifiedClaims: 0,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: [],
            unverifiedRequirements: [],
          },
        });
      }

      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([{ assessmentId: "analysis-low", score: 69, strengths: [] }]);
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
        return jsonResponse([]);
      }

      if (method === "POST" && (url.endsWith("/api/resume") || url.endsWith("/api/cover-letters"))) {
        throw new Error(`Unexpected generation call: ${url}`);
      }

      return jsonResponse({});
    });
    setFetchImplementation(fetchMock);

    render(<ResultsPage />);
    await screen.findByText(/Generation readiness:/i);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).endsWith("/api/resume") && init?.method === "POST",
        ),
      ).toBe(false);
    });
  });
});
