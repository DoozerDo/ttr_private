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

function installFetch(input: {
  score: number;
  baselineVersionId?: string | null;
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
  artifacts?: { resume?: "missing" | "in_progress" | "completed" | "failed"; coverLetter?: "missing" | "in_progress" | "completed" | "failed" } | null;
}) {
  const {
    score,
    baselineVersionId = "base-version-1",
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
    artifacts = null,
  } = input;

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/baselines")) {
      return jsonResponse([{ id: "base-1", status: "ACTIVE", isActive: true }]);
    }
    if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
      return jsonResponse({
        assessmentId: "analysis-current",
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId,
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
        baselineVersionId,
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
      return jsonResponse(
        baselineVersionId ? [{ id: baselineVersionId, versionNumber: 1 }] : [],
      );
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
    if (url.includes("/api/resume/generate") && init?.method === "POST") {
      return jsonResponse({
        status: "success",
        preview: {
          resume: { summary: "Generated summary", experience: [] },
        },
        exports: { docx: true, pdf: true },
      });
    }
    if (url.includes("/api/cover-letters/generate") && init?.method === "POST") {
      return jsonResponse({
        status: "success",
        preview: {
          coverLetter: { paragraphs: ["Hello there.", "Thanks for considering me."] },
        },
        exports: { docx: true, pdf: true },
      });
    }
    if (url.includes("/api/studio/artifacts")) {
      return jsonResponse({
        resume: artifacts?.resume ? { status: artifacts.resume } : null,
        coverLetter: artifacts?.coverLetter ? { status: artifacts.coverLetter } : null,
      });
    }
    if (url.includes("/api/opportunities") && init?.method === "POST") {
      return jsonResponse({ id: "opp-1" });
    }
    return jsonResponse({});
  });
}

describe("results gating", () => {
  it("treats score over 70 as generation-unlocked even when readiness is blocked", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });
    const fetchMock = installFetch({
      score: 72,
      unverifiedRequirements: ["Salesforce", "Workflow ownership"],
      readinessStatus: "blocked",
      readinessBlocked: true,
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-hero-primary-cta")).toBeInTheDocument();
    });
  });

  it("does not require a promoted baseline version to show generation CTA for 70+ scores", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });
    const fetchMock = installFetch({
      score: 72,
      baselineVersionId: null,
      unverifiedRequirements: ["Salesforce", "Workflow ownership"],
      readinessStatus: "blocked",
      readinessBlocked: true,
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-hero-primary-cta")).toBeInTheDocument();
    });
  });

  it("shows qualified strong fit as generation ready even when verification remains weak", async () => {
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
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const href = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(href.startsWith("/studio")).toBe(true);
    expect(href).toContain("jobId=job-1");
    expect(href).toContain("baselineId=base-1");

    // Results UI should not render for score >= 80.
    expect(screen.queryByTestId("results-hero-primary-cta")).toBeNull();
  });

  it("blocks results when deep-linked baselineId does not match the server current baseline", async () => {
    overrideSearchParams({
      assessmentId: "analysis-current",
      jobId: "job-1",
      baselineId: "base-other",
      baselineVersionId: "base-version-1",
    });

    setFetchImplementation(
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/baselines")) {
          return jsonResponse([
            { id: "base-1", status: "ACTIVE", isActive: true },
            { id: "base-other", status: "ACTIVE", isActive: false },
          ]);
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-current")) {
          return jsonResponse({ assessmentId: "analysis-current", jobId: "job-1", baselineId: "base-other" });
        }
        if (url.includes("/api/analysis/job/job-1/baseline/base-other/latest")) {
          return jsonResponse({ assessmentId: "analysis-current", jobId: "job-1", baselineId: "base-other" });
        }
        return jsonResponse({});
      }),
    );

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Baseline selection needs review/i)).toBeInTheDocument();
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  // Primary workflow UI assertions live in pair-workflow-state.test.ts and the CTA label tests above.

  it("does not hard-block over-70 results into a competitive blocked evidence state", async () => {
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
      ],
      readinessStatus: "blocked",
      readinessBlocked: true,
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-hero-primary-cta")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("results-blocked-evidence-panel")).toBeNull();
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
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const href = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(href.startsWith("/studio")).toBe(true);
    expect(href).toContain("jobId=job-1");
    expect(href).toContain("baselineId=base-1");
    expect(href).toContain("analysisId=assessment-good");

    expect(screen.queryByTestId("results-hero-primary-cta")).toBeNull();
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
      expect(screen.queryByRole("link", { name: "Start Fit Review" })).toBeNull();
    });
    expect(screen.queryByRole("button", { name: "Generate Documents" })).toBeNull();
  });

  it("keeps score at 70 gated from document generation", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });
    const fetchMock = installFetch({
      score: 70,
      readinessStatus: "ready",
      readinessBlocked: false,
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Generate Documents" })).toBeNull();
    });
  });

  it("does not duplicate generation POSTs for the same pair on re-render", async () => {
    overrideSearchParams({ assessmentId: "analysis-current" });
    const fetchMock = installFetch({
      score: 78,
      readinessStatus: "blocked",
      readinessBlocked: true,
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    const { rerender } = render(<ResultsPage />);

    await waitFor(() => {
      // Wait until Results has rendered its decision CTA surface (copy varies by authority state).
      expect(screen.getByTestId("results-hero-primary-cta")).toBeInTheDocument();
    });

    rerender(<ResultsPage />);
    rerender(<ResultsPage />);

    // Let any effects settle.
    await waitFor(() => {
      const calls = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.map((args) => String(args[0]));
      const resumePosts = calls.filter((url) => url.includes("/api/resume/generate")).length;
      const coverPosts = calls.filter((url) => url.includes("/api/cover-letters/generate")).length;
      expect(resumePosts).toBeLessThanOrEqual(1);
      expect(coverPosts).toBeLessThanOrEqual(1);
    });
  });
});
