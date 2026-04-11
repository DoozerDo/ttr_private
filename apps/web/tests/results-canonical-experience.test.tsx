import { act, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import ResultsPage from "@/app/(app)/results/page";
import { FALLBACK_RENDERED_TEXT } from "@/lib/renderedText";
import {
  clearRecentIntentSignals,
  recordArtifactRefineIntent,
  recordArtifactUsedIntent,
  recordOpportunityCommitIntent,
} from "@/src/lib/recentIntent";
import { mockRouterReplace, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

const trackEventMock = vi.fn();
vi.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(score: number) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
      const isStrong = score >= 80;
      return jsonResponse({
        assessmentId: "analysis-current",
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        score,
        strengths: ["Incident management", "SLA ownership"],
        gaps: isStrong ? [] : ["Leadership signal is muted", "Industry context feels misaligned"],
        criticalGaps: isStrong
          ? []
          : [
              {
                gapId: "gap-1",
                title: "Leadership scope",
                description: "Need stronger leadership evidence.",
                severityScore: 0.9,
                requirementEvidence: "Own and lead support strategy across a global org.",
                baselineEvidence: "Led support operations across regions.",
                reasoning: "High priority leadership gap.",
              },
            ],
        summary: "Structured role analysis summary.",
        score_breakdown: {
          total_score: score,
          dimensions: [
            { key: "role_scope_and_seniority", label: "Leadership scope", score: 22, weight: 25 },
            { key: "support_operations_and_process_rigor", label: "Operational rigor", score: 18, weight: 25 },
            { key: "tooling_and_platform_experience", label: "Tooling fit", score: 16, weight: 25 },
          ],
        },
        verification_coverage: {
          totalClaims: 3,
          verifiedClaims: isStrong ? 3 : 2,
          inferredClaims: isStrong ? 0 : 1,
          unverifiedClaims: 0,
          verifiedRequirements: ["Leadership", "Operations"],
          unverifiedRequirements: isStrong ? [] : ["Global support strategy"],
          supportedRequirements: ["Leadership", "Operations"],
        },
      });
    }
    if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
      return jsonResponse([
        {
          assessmentId: "analysis-current",
          score,
          strengths: ["Incident management", "SLA ownership"],
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
    if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
      return jsonResponse({ status: "ready", blocked: false, reasonCodes: [], reasons: [], badgeLabel: "READY", summary: "Ready.", verificationIssues: [] });
    }
    if (url.includes("/api/opportunities") && init?.method === "POST") {
      return jsonResponse({ id: "opp-1" });
    }
    return jsonResponse({});
  });
}

function createDeferredResponse<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("results canonical experience", () => {
  beforeEach(() => {
    clearRecentIntentSignals();
    trackEventMock.mockClear();
  });

  it("renders the canonical section order and low-fit recovery path", async () => {
    overrideSearchParams({ assessmentId: "analysis-current", locked: "1" });
    setFetchImplementation(installFetch(68) as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Fit Verdict Reveal")).toBeInTheDocument();
    });

    expect(screen.getByText("You're not ready to apply yet.")).toBeInTheDocument();
    expect(screen.getByTestId("resolve-gaps-block")).toBeInTheDocument();
    expect(await screen.findByTestId("how-to-improve-your-fit")).toBeInTheDocument();
    expect(screen.getByText("How to improve your fit")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Start Fit Review" }).some(
        (link) =>
          link.getAttribute("href") ===
          "/fit-review?jobId=job-1&analysisId=analysis-current&assessmentId=analysis-current&baselineId=base-1&baselineVersionId=base-version-1",
      ),
    ).toBe(true);
    expect(screen.queryByText(/gauge|dial|meter|speedometer/i)).toBeNull();
    expect(screen.getAllByRole("link", { name: "Start Fit Review" })[0]).toHaveAttribute(
      "href",
      "/fit-review?jobId=job-1&analysisId=analysis-current&assessmentId=analysis-current&baselineId=base-1&baselineVersionId=base-version-1",
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      "results_improvement_module_viewed",
      expect.objectContaining({
        source: "results",
        intentState: "none",
        suggestionsShown: expect.any(Number),
      }),
    );
    expect(screen.queryByRole("link", { name: "Open Resume + Cover Letter Studio" })).toBeNull();
  });

  it("routes high-fit results to Studio and adds stronger competitive framing at 80+", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });
    setFetchImplementation(installFetch(84) as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/You're a strong match\. You can generate now\./i).length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText(/Confidence: High/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("You're not ready to apply yet.")).toBeNull();
    expect(screen.queryAllByText(/confidence/i).length).toBeGreaterThan(0);
  });

  it("sharpens Results guidance after a refine intent", async () => {
    recordArtifactRefineIntent();
    overrideSearchParams({ assessmentId: "analysis-current", locked: "1" });
    setFetchImplementation(installFetch(68) as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("You're not ready to apply yet.")).toBeInTheDocument();
    });

    expect(screen.getByText(/You signaled refinement, so Fit Review is the fastest path/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Start Fit Review" })[0]).toHaveAttribute(
      "href",
      "/fit-review?jobId=job-1&analysisId=analysis-current&assessmentId=analysis-current&baselineId=base-1&baselineVersionId=base-version-1",
    );
  });

  it("reinforces progress after the user has used the artifact and committed the role", async () => {
    recordArtifactUsedIntent();
    recordOpportunityCommitIntent();
    overrideSearchParams({ assessmentId: "analysis-current" });
    setFetchImplementation(installFetch(84) as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("You're a match. Go generate.")).toBeInTheDocument();
    });
    expect(screen.getByText("You're a match. Go generate.")).toBeInTheDocument();
  });

  it("surfaces Fit Review improvement guidance after a refine intent", async () => {
    recordArtifactRefineIntent();
    overrideSearchParams({ assessmentId: "analysis-current", locked: "1" });
    setFetchImplementation(installFetch(68) as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText(/You signaled refinement, so Fit Review is the fastest path/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText("Strengthen this example").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Add one concrete example from your real experience so Studio can use it more confidently."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Start Fit Review" })[0]).toHaveAttribute(
      "href",
      "/fit-review?jobId=job-1&analysisId=analysis-current&assessmentId=analysis-current&baselineId=base-1&baselineVersionId=base-version-1",
    );
    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith(
        "results_improvement_module_viewed",
        expect.objectContaining({
          source: "results",
          intentState: "refine_intent",
        }),
      );
    });
    const previousCalls = trackEventMock.mock.calls.length;
    screen.getByTestId("results-improvement-cta").click();
    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith(
        "results_improvement_cta_clicked",
        expect.objectContaining({
          source: "results",
          intentState: "refine_intent",
        }),
      );
    });
    expect(trackEventMock.mock.calls.length).toBeGreaterThan(previousCalls);
  });

  it("ignores a stale pair response when the user switches to a new baseline and job", async () => {
    const deferredA = createDeferredResponse<Response>();
    const deferredB = createDeferredResponse<Response>();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/job/job-a/baseline/base-a/latest")) {
        return deferredA.promise;
      }
      if (url.includes("/api/analysis/job/job-b/baseline/base-b/latest")) {
        return deferredB.promise;
      }
      if (url.includes("/api/analysis/history")) {
        return jsonResponse({
          recentAnalyses: [],
          alignmentPattern: { strongestAlignmentRoles: [], totalAnalyses: 0, averageScore: 0 },
          badges: [], generatedAt: new Date().toISOString(),
        });
      }
      if (url.includes("/api/baselines/base-a/versions") || url.includes("/api/baselines/base-b/versions")) {
        return jsonResponse([{ id: "base-version-1", versionNumber: 1 }]);
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
      return jsonResponse({});
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    overrideSearchParams({ baselineId: "base-a", jobId: "job-a" });

    const { rerender } = render(<ResultsPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/analysis/job/job-a/baseline/base-a/latest"),
        expect.any(Object),
      );
    });

    overrideSearchParams({ baselineId: "base-b", jobId: "job-b" });
    rerender(<ResultsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/analysis/job/job-b/baseline/base-b/latest"),
        expect.any(Object),
      );
    });

    await act(async () => {
      deferredB.resolve(
        jsonResponse({
          assessmentId: "analysis-b",
          jobId: "job-b",
          baselineId: "base-b",
          baselineVersionId: "base-version-1",
          score: 81,
          strengths: ["Leadership"],
          criticalGaps: [],
          gaps: [],
          summary: "Structured role analysis summary.",
          verification_coverage: {
            totalClaims: 3,
            verifiedClaims: 3,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: ["Leadership"],
            unverifiedRequirements: [],
            supportedRequirements: ["Leadership"],
          },
        }),
      );
    });

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining("assessmentId=analysis-b"));
    });

    const callsBeforeStaleResolution = mockRouterReplace.mock.calls.length;

    await act(async () => {
      deferredA.resolve(
        jsonResponse({
          assessmentId: "analysis-a",
          jobId: "job-a",
          baselineId: "base-a",
          baselineVersionId: "base-version-1",
          score: 78,
          strengths: ["Operations"],
          criticalGaps: [],
          gaps: [],
          summary: "Structured role analysis summary.",
          verification_coverage: {
            totalClaims: 3,
            verifiedClaims: 2,
            inferredClaims: 1,
            unverifiedClaims: 0,
            verifiedRequirements: ["Operations"],
            unverifiedRequirements: [],
            supportedRequirements: ["Operations"],
          },
        }),
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRouterReplace.mock.calls.length).toBe(callsBeforeStaleResolution);
    expect(mockRouterReplace.mock.calls.at(-1)?.[0]).toContain("analysis-b");
  });

  it("replaces malformed analysis text with a visible fallback instead of leaking tokens", async () => {
    overrideSearchParams({ assessmentId: "analysis-current", locked: "1" });
    setFetchImplementation(
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
          return jsonResponse({
            assessmentId: "analysis-current",
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            score: 74,
            strengths: ["{{bad}}", "2 + 2 = 4", "\u0000partial"],
            criticalGaps: [
              {
                gapId: "gap-1",
                title: "{{broken title}}",
                description: "2 + 2 = 4",
                severityScore: 0.9,
                requirementEvidence: "${missing}",
                baselineEvidence: "undefined",
                reasoning: "{{reasoning}}",
              },
            ],
            summary: "result {{broken}}",
            verification_coverage: {
              totalClaims: 1,
              verifiedClaims: 0,
              inferredClaims: 0,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Leadership scope"],
            },
          });
        }
        if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
          return jsonResponse([{ assessmentId: "analysis-current", score: 74 }]);
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
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return jsonResponse({ status: "blocked", blocked: true, reasons: [], badgeLabel: "BLOCKED", summary: "Blocked.", verificationIssues: [] });
        }
        if (url.includes("/api/opportunities") && input instanceof Request && input.method === "POST") {
          return jsonResponse({ id: "opp-1" });
        }
        return jsonResponse({});
      }) as unknown as typeof fetch,
    );

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Competitive fit. One step left.")).toBeInTheDocument();
    });
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes(FALLBACK_RENDERED_TEXT) ?? false)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/\{\{broken title\}\}|\$\{missing\}|undefined|2 \+ 2 = 4/i)).toBeNull();
  });
});
