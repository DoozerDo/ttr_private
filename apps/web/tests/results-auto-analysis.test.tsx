import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ResultsPage from "@/app/(app)/results/page";
import {
  mockRouterReplace,
  overrideSearchParams,
  setFetchImplementation,
} from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("results auto analysis loading", () => {
  it("fails cleanly when no baselineId is provided", async () => {
    overrideSearchParams({ jobId: "job-1" });
    setFetchImplementation(vi.fn(async () => jsonResponse({}, 200)) as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("No compatibility analysis yet")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "ANALYZE A ROLE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ANALYZE A ROLE" })).toBeDisabled();
  });

  it("fails with a dedicated recovery state when the analysisId is invalid", async () => {
    overrideSearchParams({
      assessmentId: "missing-assessment",
      analysisId: "missing-assessment",
      jobId: "job-1",
      baselineId: "base-1",
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/missing-assessment")) {
        return jsonResponse({ message: "not found" }, 404);
      }
      return jsonResponse({}, 200);
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-analysis-recovery")).toBeInTheDocument();
    });
    expect(screen.getByText("Assessment not found.")).toBeInTheDocument();
    expect(screen.queryByText("No compatibility analysis yet")).toBeNull();
    expect(screen.getByTestId("results-analysis-recovery")).toHaveTextContent("ANALYZE A ROLE");
    expect(screen.getByTestId("results-analysis-recovery").querySelector('a')).toHaveAttribute(
      "href",
      "/analyze?jobId=job-1&baselineId=base-1",
    );
  });

  it("creates analysis on missing latest and navigates with explicit assessmentId", async () => {
    overrideSearchParams({ jobId: "job-1", baselineId: "base-1" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/job/job-1/baseline/base-1/latest")) {
        return jsonResponse({ message: "not found" }, 404);
      }
      if (url.includes("/api/analysis/run")) {
        return jsonResponse({ assessmentId: "assessment-new-1" }, 200);
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/analysis/run",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ jobId: "job-1", baselineId: "base-1" }),
        }),
      );
    });

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/results?assessmentId=assessment-new-1&analysisId=assessment-new-1",
      );
    });
  });

  it("fails cleanly when hydrated analysis is missing a baselineId", async () => {
    overrideSearchParams({ assessmentId: "assessment-bad" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/assessment-bad")) {
        return jsonResponse({ assessmentId: "assessment-bad", jobId: "job-1" }, 200);
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-analysis-recovery")).toBeInTheDocument();
    });
    expect(screen.getByText("This result is no longer linked to an active resume.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "ANALYZE A ROLE" })[0]).toHaveAttribute(
      "href",
      "/analyze",
    );
  });

  it("hydrates populated results when the canonical analysisId is present", async () => {
    overrideSearchParams({ analysisId: "assessment-good" });

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
      expect(screen.getAllByText("Strong match. Generation is ready.").length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId("results-hero-primary-cta").closest("section")).toHaveTextContent(
      "Confidence: Medium",
    );
    expect(screen.queryByTestId("results-generation-unlocked-panel")).toBeNull();
    expect(screen.getAllByText("Strong match. Generation is ready.").length).toBeGreaterThan(0);
    expect(screen.queryByText("This role may not be a fit.")).toBeNull();
    expect(screen.queryByText("No compatibility analysis yet")).toBeNull();
    expect(screen.queryByText("Start Fit Review")).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId("results-hero-primary-cta")).toHaveAttribute(
        "href",
        "/studio?jobId=job-1&analysisId=assessment-good&baselineId=base-1&baselineVersionId=base-version-1",
      );
    });
  });

  it("uses missing verification language when generation readiness is blocked", async () => {
    overrideSearchParams({ analysisId: "assessment-blocked", justUnlocked: "true" });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/assessment-blocked")) {
        return jsonResponse({
          assessmentId: "assessment-blocked",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          jobId: "job-1",
          score: 70,
          strengths: ["Strong leadership"],
          verification_coverage: {
            totalClaims: 3,
            verifiedClaims: 0,
            inferredClaims: 0,
            unverifiedClaims: 3,
            verifiedRequirements: [],
            unverifiedRequirements: ["Salesforce", "team leadership"],
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
          status: "blocked",
          blocked: true,
          reasonCodes: ["full_block"],
          reasons: [
            {
              code: "full_block",
              message: "Missing verified evidence is blocking Studio.",
            },
          ],
          badgeLabel: "BLOCKED",
          summary: "Missing verified evidence is blocking Studio.",
          verificationIssues: ["Salesforce"],
        });
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Competitive fit\. Not ready to generate yet\./).length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId("results-blocked-evidence-panel")).toBeInTheDocument();
    expect(screen.getByTestId("results-score-verdict-card")).toBeInTheDocument();
    expect(screen.queryByTestId("results-generation-unlocked-panel")).toBeNull();
    expect(
      screen.getByTestId("results-blocked-evidence-panel").compareDocumentPosition(
        screen.getByTestId("results-score-verdict-card"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText(/Competitive fit\. Not ready to generate yet\./).length).toBeGreaterThan(0);
    expect(screen.queryByText("No material gaps were identified in this run.")).toBeNull();
    expect(screen.getAllByTestId("results-hero-primary-cta")[0]).toHaveTextContent(
      "Start Fit Review",
    );
    expect(screen.getAllByTestId("results-hero-primary-cta")[0]).toHaveAttribute(
      "href",
      "/fit-review?jobId=job-1&analysisId=assessment-blocked&assessmentId=assessment-blocked&baselineId=base-1&baselineVersionId=base-version-1",
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("shows generation unlocked state when a blocked analysis returns unblocked", async () => {
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
      expect(screen.getByTestId("results-hero-primary-cta").closest("section")).toHaveTextContent(
        "Confidence: High",
      );
    });
    expect(screen.queryByTestId("results-generation-unlocked-panel")).toBeNull();
    expect(screen.getByTestId("results-hero-primary-cta")).toHaveTextContent("Open Studio");
    expect(screen.getByRole("link", { name: "Open Studio" })).toBeInTheDocument();
  });

  it("keeps fit messaging when score is low but generation is not blocked", async () => {
    overrideSearchParams({ analysisId: "assessment-low" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/assessment-low")) {
        return jsonResponse({
          assessmentId: "assessment-low",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          jobId: "job-1",
          score: 62,
          strengths: ["Strong leadership"],
          verification_coverage: {
            totalClaims: 3,
            verifiedClaims: 3,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: ["Leadership", "Operations"],
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

    await screen.findByText("Strengthen your fit before generating.");
    expect(screen.getByTestId("results-hero-primary-cta")).not.toHaveTextContent("Open Studio");
    expect(screen.getByTestId("results-hero-primary-cta")).toHaveTextContent("Start Fit Review");
  });

  it("uses existing latest assessment without creating duplicate analysis", async () => {
    overrideSearchParams({
      assessmentId: "assessment-existing-1",
      analysisId: "assessment-existing-1",
      jobId: "job-2",
      baselineId: "base-2",
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/assessment-existing-1")) {
        return jsonResponse({
          assessmentId: "assessment-existing-1",
          baselineId: "base-2",
          baselineVersionId: "base-version-2",
          jobId: "job-2",
          score: 78,
          strengths: ["Strong leadership", "Operational rigor"],
          verification_coverage: {
            totalClaims: 2,
            verifiedClaims: 2,
            inferredClaims: 0,
            unverifiedClaims: 0,
            verifiedRequirements: ["Leadership", "Operations"],
            unverifiedRequirements: [],
          },
        }, 200);
      }
      if (url.includes("/api/analysis/run")) {
        return jsonResponse({ assessmentId: "should-not-run" }, 200);
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Fit verdict:\s*Competitive match/i).length).toBeGreaterThan(0);
    });

    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/analysis/run")),
    ).toBe(false);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
