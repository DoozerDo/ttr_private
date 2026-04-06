import { render, screen, waitFor } from "@testing-library/react";
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
  strengths?: string[];
  unverifiedRequirements?: string[];
  readinessStatus?: "ready" | "blocked";
  readinessBlocked?: boolean;
}) {
  const {
    score,
    strengths = ["Incident management", "SLA ownership"],
    unverifiedRequirements = [],
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
        strengths,
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
  it("keeps blocked score-and-readiness contradictions collapsed into one dominant fit-review path", async () => {
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
      expect(screen.getByText("You need verified evidence to proceed.")).toBeInTheDocument();
    });
    expect(screen.queryByText("No material gaps were identified in this run.")).toBeNull();
    expect(screen.getByText("Recover the missing evidence")).toBeInTheDocument();
    expect(screen.getByText("Use Fit Review to close the gap")).toBeInTheDocument();
    expect(screen.queryByText(/you can win this role|you are ready to generate materials/i)).toBeNull();
    expect(screen.queryByRole("link", { name: "OPEN STUDIO" })).toBeNull();
    expect(screen.getAllByTestId("results-hero-primary-cta")).toHaveLength(1);
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
      expect(screen.getByRole("link", { name: "OPEN STUDIO" })).toBeInTheDocument();
    });
    expect(screen.queryByText("Recover the missing evidence")).toBeNull();
    expect(screen.queryByText("Use Fit Review to close the gap")).toBeNull();
    expect(screen.getByText("No material gaps were identified in this run.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start Fit Review" })).toBeNull();
  });
});
