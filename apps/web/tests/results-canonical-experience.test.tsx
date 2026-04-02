import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import ResultsPage from "@/app/(app)/results/page";
import {
  clearRecentIntentSignals,
  recordArtifactRefineIntent,
  recordArtifactUsedIntent,
  recordOpportunityCommitIntent,
} from "@/src/lib/recentIntent";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

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

    expect(await screen.findByText("Career Gravity")).toBeInTheDocument();
    expect(screen.getByText("You're not ready to apply yet.")).toBeInTheDocument();
    expect(screen.getByText("Strategic Next Move")).toBeInTheDocument();
    expect(await screen.findByTestId("how-to-improve-your-fit")).toBeInTheDocument();
    expect(screen.getByText("How to improve your fit")).toBeInTheDocument();
    expect(
      screen.getByText(/Add measurable outcomes or impact|Clarify team size, ownership, or org scope|Add incident management or escalation examples/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/confidence/i)).toBeNull();
    expect(screen.queryByText(/gauge|dial|meter|speedometer/i)).toBeNull();
    expect(screen.getAllByRole("link", { name: "Start Fit Review" })[0]).toHaveAttribute(
      "href",
      "/resolve-gaps?jobId=job-1&baselineId=base-1",
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
      expect(screen.getByText(/you can win this role/i)).toBeInTheDocument();
    });

    expect(screen.getByText("You can win this role with focused tailoring.")).toBeInTheDocument();
    expect(screen.queryByText("You're not ready to apply yet.")).toBeNull();
    expect(screen.queryByText(/confidence/i)).toBeNull();
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
      "/resolve-gaps?jobId=job-1&baselineId=base-1",
    );
  });

  it("reinforces progress after the user has used the artifact and committed the role", async () => {
    recordArtifactUsedIntent();
    recordOpportunityCommitIntent();
    overrideSearchParams({ assessmentId: "analysis-current" });
    setFetchImplementation(installFetch(84) as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText(/You're actively pursuing this role/i)).toBeInTheDocument();
    });
    expect(screen.getByText("You're actively pursuing this role. Keep momentum in Opportunities.")).toBeInTheDocument();
  });

  it("surfaces Fit Review improvement guidance after a refine intent", async () => {
    recordArtifactRefineIntent();
    overrideSearchParams({ assessmentId: "analysis-current", locked: "1" });
    setFetchImplementation(installFetch(68) as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText(/You signaled refinement, so Fit Review is the fastest path/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/What to fix to unlock Studio|Use Fit Review to close the gap/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Start Fit Review" })[0]).toHaveAttribute(
      "href",
      "/resolve-gaps?jobId=job-1&baselineId=base-1",
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
});
