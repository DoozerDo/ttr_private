import { render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import ResultsPage from "@/app/(app)/results/page";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(input: {
  score: number;
  scorePresentationMode?: "normal" | "caution" | "fix_first";
  likelyUnderestimatedFit?: boolean;
  scoreConfidence?: "high" | "medium" | "low";
  scoreConfidenceReasons?: string[];
  scoreSanityFlags?: string[];
  strengths?: string[];
  unverifiedRequirements?: string[];
  criticalGaps?: Array<{
    gapId: string;
    title: string;
    description: string;
    severityScore: number;
    requirementEvidence: string;
    baselineEvidence: string | null;
    reasoning: string;
  }>;
  readinessStatus?: "ready" | "blocked";
  readinessBlocked?: boolean;
}) {
  const {
    score,
    scorePresentationMode = "normal",
    likelyUnderestimatedFit = false,
    scoreConfidence = "high",
    scoreConfidenceReasons = [],
    scoreSanityFlags = [],
    strengths = ["Incident management", "SLA ownership"],
    unverifiedRequirements = [],
    criticalGaps = [],
    readinessStatus = "ready",
    readinessBlocked = false,
  } = input;

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
      return jsonResponse({
        assessmentId: "analysis-current",
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        score,
        scorePresentationMode,
        likelyUnderestimatedFit,
        scoreConfidence,
        scoreConfidenceReasons,
        scoreSanityFlags,
        strengths,
        supportingSignals: strengths,
        baselineEvidence: strengths,
        criticalGaps,
        verification_coverage: {
          totalClaims: strengths.length + unverifiedRequirements.length,
          verifiedClaims: strengths.length,
          inferredClaims: 0,
          unverifiedClaims: unverifiedRequirements.length,
          verifiedRequirements: strengths,
          unverifiedRequirements,
        },
      });
    }
    if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
      return jsonResponse({
        assessmentId: "analysis-current",
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        score,
        scorePresentationMode,
        likelyUnderestimatedFit,
        scoreConfidence,
        scoreConfidenceReasons,
        scoreSanityFlags,
        strengths,
        supportingSignals: strengths,
        baselineEvidence: strengths,
        criticalGaps,
        verification_coverage: {
          totalClaims: strengths.length + unverifiedRequirements.length,
          verifiedClaims: strengths.length,
          inferredClaims: 0,
          unverifiedClaims: unverifiedRequirements.length,
          verifiedRequirements: strengths,
          unverifiedRequirements,
        },
      });
    }
    if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
      return jsonResponse([
        {
          assessmentId: "analysis-current",
          score,
          strengths,
          scorePresentationMode,
          likelyUnderestimatedFit,
          scoreConfidence,
          scoreConfidenceReasons,
          scoreSanityFlags,
          supportingSignals: strengths,
          baselineEvidence: strengths,
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
      return jsonResponse({
        status: readinessStatus,
        blocked: readinessBlocked,
        reasons:
          readinessBlocked || readinessStatus === "blocked"
            ? [{ code: "missing_verified_evidence", message: "Verified evidence is required." }]
            : [],
      });
    }
    if (url.includes("/api/cover-letters/readiness")) {
      return jsonResponse({
        status: readinessStatus,
        blocked: readinessBlocked,
        reasons:
          readinessBlocked || readinessStatus === "blocked"
            ? [{ code: "missing_verified_evidence", message: "Verified evidence is required." }]
            : [],
      });
    }
    if (url.includes("/api/opportunities") && init?.method === "POST") {
      return jsonResponse({ id: "opp-1" });
    }
    return jsonResponse({});
  });
}

describe("results gating", () => {
  it("opens a first-run draft instead of hard-blocking when evidence is incomplete", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });
    const fetchMock = installFetch({
      score: 72,
      unverifiedRequirements: ["Salesforce", "Workflow ownership"],
      readinessStatus: "blocked",
      readinessBlocked: true,
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    expect(screen.queryByRole("link", { name: "Open Studio" })).toBeNull();
  });

  it("blocks generation for strong fit when verification remains weak", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });
    const fetchMock = installFetch({
      score: 82,
      unverifiedRequirements: ["Salesforce", "Workflow ownership"],
      readinessStatus: "blocked",
      readinessBlocked: true,
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Start Fit Review" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Open Studio" })).toBeNull();
    expect(screen.queryByTestId("results-blocked-evidence-panel")).toBeNull();
    expect(screen.queryByText("How to improve your fit")).toBeNull();
    expect(screen.queryByText("Apply moment")).toBeNull();
  });

  it("shows a competitive blocked state with concrete readiness drivers", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });
    const fetchMock = installFetch({
      score: 74,
      unverifiedRequirements: ["Leadership scope", "Incident ownership", "Measured outcomes"],
      criticalGaps: [
        {
          gapId: "gap-1",
          title: "Leadership scope",
          description: "Clarify team size and ownership.",
          severityScore: 0.9,
          requirementEvidence: "Clarify team size, ownership span, or operational scope.",
          baselineEvidence: null,
          reasoning: "Leadership scope needs stronger grounding.",
        },
        {
          gapId: "gap-2",
          title: "Incident ownership",
          description: "Clarify escalation and triage ownership.",
          severityScore: 0.8,
          requirementEvidence: "Clarify your role in escalation, triage, restoration, or problem management.",
          baselineEvidence: null,
          reasoning: "Incident ownership needs stronger grounding.",
        },
        {
          gapId: "gap-3",
          title: "Measured outcomes",
          description: "Add metrics or concrete results.",
          severityScore: 0.7,
          requirementEvidence: "Add metrics or concrete results tied to the work.",
          baselineEvidence: null,
          reasoning: "Measured outcomes need stronger grounding.",
        },
      ],
      readinessStatus: "blocked",
      readinessBlocked: true,
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Competitive fit. One step left.")).toBeInTheDocument();
    });
    const blockedPanel = screen.getByTestId("results-blocked-evidence-panel");
    expect(
      within(blockedPanel).getByText(
        "You are aligned with this role. Before Studio can generate, we need to strengthen a few profile details so the output stays accurate and defensible.",
      ),
    ).toBeInTheDocument();
    expect(within(blockedPanel).getByText("Leadership scope")).toBeInTheDocument();
    expect(within(blockedPanel).getByText("Clarify team size, ownership span, or operational scope.")).toBeInTheDocument();
    expect(within(blockedPanel).getByText("Incident ownership")).toBeInTheDocument();
    expect(
      within(blockedPanel).getByText("Clarify your role in escalation, triage, restoration, or problem management."),
    ).toBeInTheDocument();
    expect(within(blockedPanel).getByText("Measured outcomes")).toBeInTheDocument();
    expect(within(blockedPanel).getByText("Add metrics or concrete results tied to the work.")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "You are aligned with this role. Before Studio can generate, we need to strengthen a few profile details so the output stays accurate and defensible.",
      ).length,
    ).toBe(1);
    expect(screen.getAllByRole("link", { name: "View top drivers" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Start Fit Review" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/verified evidence|key claims/i)).toBeNull();
  });

  it("routes ready results to Studio and suppresses recovery guidance when evidence is verified", async () => {
    overrideSearchParams({ analysisId: "assessment-good", justUnlocked: "true" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/assessment-good")) {
        return jsonResponse({
          assessmentId: "assessment-good",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          jobId: "job-1",
          score: 84,
          strengths: ["Strong leadership", "Operational rigor"],
          supportingSignals: ["Strong leadership", "Operational rigor"],
          baselineEvidence: ["Leadership", "Operations", "Systems"],
          verification_coverage: {
            totalClaims: 3,
            verifiedClaims: 3,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: ["Leadership", "Operations", "Systems"],
            unverifiedRequirements: [],
          },
        });
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([]);
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return jsonResponse({
          status: "ready",
          blocked: false,
          reasonCodes: [],
          reasons: [],
          badgeLabel: "READY",
          summary: "Ready for generation.",
          verificationIssues: [],
        });
      }
      return jsonResponse({}, 200);
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Open Studio" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Open Studio" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start Fit Review" })).toBeNull();
    expect(screen.queryByText("How to improve your fit")).toBeNull();
    expect(screen.queryByText("Apply moment")).toBeNull();
  });

  it("leads with fix-first guidance when score confidence is low", async () => {
    overrideSearchParams({ analysisId: "analysis-low-confidence", jobId: "job-1", baselineId: "base-1" });
    const fetchMock = installFetch({
      score: 54,
      scorePresentationMode: "fix_first",
      likelyUnderestimatedFit: true,
      scoreConfidence: "low",
      scoreConfidenceReasons: [
        "Relevant adjacent infrastructure or tooling evidence is present, but the score looks constrained by literal overlap or phrasing.",
      ],
      scoreSanityFlags: ["adjacency_low_score", "overlap_cap_drag"],
      strengths: ["Linux infrastructure", "BGP routing"],
      unverifiedRequirements: [],
      readinessStatus: "ready",
      readinessBlocked: false,
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Start Fit Review" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Open Studio" })).toBeNull();
  });
});
