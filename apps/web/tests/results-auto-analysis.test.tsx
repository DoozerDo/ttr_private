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
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const href = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(href.startsWith("/results")).toBe(true);
    expect(href).toContain("assessmentId=assessment-new-1");
    expect(href).toContain("analysisId=assessment-new-1");
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

    // Score >= 80 should bypass Results and auto-route to Studio (preserving baseline + job context).
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const href = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(href.startsWith("/studio")).toBe(true);
    expect(href).toContain("jobId=job-1");
    expect(href).toContain("baselineId=base-1");
    expect(href).toContain("analysisId=assessment-good");

    // Results UI should not render in this lane.
    expect(screen.queryByTestId("results-hero-primary-cta")).toBeNull();
  });

  it("renders a canonical workflow authority panel when documents are ready (no presentation drift)", async () => {
    overrideSearchParams({ analysisId: "assessment-ready" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/assessment-ready")) {
        return jsonResponse({
          assessmentId: "assessment-ready",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          jobId: "job-1",
          score: 79,
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
      if (url.includes("/api/studio/artifacts")) {
        return jsonResponse({
          resume: { status: "COMPLETED" },
          coverLetter: { status: "COMPLETED" },
        });
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-workflow-authority")).toBeInTheDocument();
    });

    const authority = screen.getByTestId("results-workflow-authority");
    await waitFor(() => {
      expect(authority.querySelector("[data-testid='workflow-authority-headline']")?.textContent ?? "").toContain(
        "Your tailored documents are ready.",
      );
    });
    expect(authority.querySelector("[data-testid='workflow-authority-eyebrow']")).toBeTruthy();
    expect(authority.querySelector("[data-testid='results-hero-primary-cta']")?.textContent ?? "").toContain(
      "Apply to this role",
    );
  });

  it("renders generation_failed consistently when artifacts are failed and retryable", async () => {
    overrideSearchParams({ analysisId: "assessment-failed" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/assessment-failed")) {
        return jsonResponse({
          assessmentId: "assessment-failed",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          jobId: "job-1",
          score: 79,
          strengths: [],
          verification_coverage: { totalClaims: 0, verifiedClaims: 0, inferredClaims: 0, unverifiedClaims: 0 },
        });
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([]);
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return jsonResponse({ status: "ready", blocked: false, reasons: [], verificationIssues: [] });
      }
      if (url.includes("/api/studio/artifacts")) {
        return jsonResponse({
          resume: { status: "FAILED" },
          coverLetter: { status: "FAILED" },
        });
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-workflow-authority")).toBeInTheDocument();
    });

    const authority = screen.getByTestId("results-workflow-authority");
    await waitFor(() => {
      expect(authority.querySelector("[data-testid='workflow-authority-headline']")?.textContent ?? "").toContain(
        "Document generation failed.",
      );
    });
    expect(authority.querySelector("[data-testid='results-hero-primary-cta']")?.textContent ?? "").toContain(
      "Retry generation",
    );
  });

  it("renders generation_in_progress consistently when artifacts are generating", async () => {
    overrideSearchParams({ analysisId: "assessment-generating" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analysis/fit-assessments/assessment-generating")) {
        return jsonResponse({
          assessmentId: "assessment-generating",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          jobId: "job-1",
          score: 79,
          strengths: [],
          verification_coverage: { totalClaims: 0, verifiedClaims: 0, inferredClaims: 0, unverifiedClaims: 0 },
        });
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return jsonResponse([{ id: "base-version-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments?jobId=job-1")) {
        return jsonResponse([]);
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return jsonResponse({ status: "ready", blocked: false, reasons: [], verificationIssues: [] });
      }
      if (url.includes("/api/studio/artifacts")) {
        return jsonResponse({
          resume: { status: "IN_PROGRESS" },
          coverLetter: { status: "IN_PROGRESS" },
        });
      }
      return jsonResponse({}, 200);
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);
    render(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-workflow-authority")).toBeInTheDocument();
    });

    const authority = screen.getByTestId("results-workflow-authority");
    await waitFor(() => {
      expect(authority.querySelector("[data-testid='workflow-authority-headline']")?.textContent ?? "").toContain(
        "Generating your documents...",
      );
    });
    expect(authority.querySelector("[data-testid='results-hero-primary-cta']")?.textContent ?? "").toContain(
      "Generate documents",
    );
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

    await screen.findByTestId("results-generation-unlocked-panel");
    expect(screen.getByTestId("results-score-verdict-card")).toBeInTheDocument();
    expect(screen.getByTestId("results-generation-unlocked-panel")).toBeInTheDocument();
    expect(screen.getByTestId("results-generation-unlocked-panel")).toHaveTextContent(/generation unlocked/i);
    expect(screen.queryByText("No material gaps were identified in this run.")).toBeNull();
    expect(screen.getAllByTestId("results-hero-primary-cta")[0]).toHaveTextContent("Fix evidence gaps");
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

    // Score >= 80 should bypass Results and auto-route to Studio (preserving baseline + job context).
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const href = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(href.startsWith("/studio")).toBe(true);
    expect(href).toContain("jobId=job-1");
    expect(href).toContain("baselineId=base-1");
    expect(href).toContain("analysisId=assessment-good");

    // Results UI should not render in this lane.
    expect(screen.queryByTestId("results-hero-primary-cta")).toBeNull();
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

    await screen.findByText("Generation is blocked.");
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /generate/i })).toBeNull();
    // The exact remediation CTA varies; the key contract is that Results does not offer generation for low fit.
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
