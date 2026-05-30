import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

vi.mock("@/app/(app)/studio/BaselineBlockPolicyPanel", () => ({
  BaselineBlockPolicyPanel: () => null,
}));

vi.mock("@/lib/jobsClient", () => ({
  listJobs: vi.fn(async () => [
    {
      id: "job-1",
      company: "Acme",
      title: "Director of Support",
      archivedAt: null,
      isArchived: false,
    },
  ]),
}));

vi.mock("@/lib/baselines", async () => {
  const actual = await vi.importActual("@/lib/baselines");
  return {
    ...(actual as object),
    listBaselines: vi.fn(async () => [
      {
        id: "base-1",
        originalFilename: "Leadership Resume",
        version: 1,
      },
    ]),
  };
});

function renderStudio() {
  return render(
    <EntitlementsProvider
      entitlements={{
        id: "u-1",
        email: "test@example.com",
        subscriptionTier: "PRO",
        role: "user",
        entitlements: null,
      }}
    >
      <StudioPage />
    </EntitlementsProvider>,
  );
}

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500, textOverride?: string) {
  const stringBody =
    textOverride ?? (typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body));
  const response = {
    ok,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") return "application/json";
        return null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    clone: () => response,
  };
  return response;
}

describe("Studio pair readiness blocking", () => {
  it("A0. cover readiness blocked readiness_error does not render unsupported requirements remediation CTA", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
    });

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        const body = {
          assessmentId: "analysis-1",
          score: 82,
          overallScore: 82,
          scoring_v2: { score: 82 },
          scoringV2: { score: 82 },
          jobId: "job-1",
          companyName: "Acme",
          jobTitle: "Director of Support",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          verification_coverage: { unverifiedRequirements: ["Python", "Snowflake"] },
        };
        return Promise.resolve(createResponse(body, true, 200, JSON.stringify(body)));
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }

      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            blocked: true,
            compliance_flags: [],
            reasons: [
              {
                code: "readiness_error",
                message: "Readiness could not be determined due to an internal error.",
              },
            ],
          }),
        );
      }

      if (url.endsWith("/api/resume") || url.endsWith("/api/cover-letters")) {
        throw new Error(`Unexpected generation POST while blocked: ${url}`);
      }

      return Promise.resolve(createResponse({ error: "not_found" }, false, 404));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findByTestId("studio-generation-readiness");
    expect(screen.getByTestId("studio-readiness-message")).toHaveTextContent(
      "Readiness could not be determined due to an internal error.",
    );

    expect(screen.queryByTestId("studio-auto-adjust-panel")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Remove unsupported requirements and continue" }),
    ).toBeNull();
  });

  it("A. resume ready + cover readiness 422 unsupported_input resolves pair blocked and makes recovery primary", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
    });

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 76 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: ["Python", "Snowflake"] },
          }),
        );
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }

      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse(
            {
              status: "blocked",
              blocked: true,
              compliance_flags: [],
              reasons: [{ code: "unsupported_input", message: "Unsupported requirements." }],
              error: {
                code: "unsupported_input",
                category: "unsupported_input",
                message: "Unsupported requirements.",
                retryable: false,
                diagnostics: { missingRequirements: ["Python", "Snowflake"] },
              },
            },
            true,
            422,
          ),
        );
      }

      if (url.endsWith("/api/resume") || url.endsWith("/api/cover-letters")) {
        throw new Error(`Unexpected generation POST while blocked: ${url}`);
      }

      return Promise.resolve(createResponse({ error: "not_found" }, false, 404));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findByTestId("studio-generation-readiness");

    expect(screen.queryByTestId("studio-generation-ready-shell")).toBeNull();
    expect(screen.queryByTestId("studio-instant-draft-hero")).toBeNull();
    expect(screen.queryByText(/your documents are ready to generate/i)).toBeNull();
    expect(screen.queryByText(/preparing your documents/i)).toBeNull();
  });

  it("B. generating presentation collapses to blocked authority when cover readiness becomes blocked", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-2",
    });

    let resumeGenerationStarted = false;
    let coverGenerationStarted = false;

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-2",
            scoring_v2: { score: 82 },
            scoringV2: { score: 82 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-3")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-3",
            scoring_v2: { score: 76 },
            scoringV2: { score: 76 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-2",
            verification_coverage: { unverifiedRequirements: ["Python"] },
          }),
        );
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([
            { id: "base-version-1", fileHash: "hash-1", versionNumber: 1 },
            { id: "base-version-2", fileHash: "hash-2", versionNumber: 2 },
          ]),
        );
      }

      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      if (url.includes("/api/cover-letters/readiness")) {
        const analysisId = (() => {
          try {
            const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
            return String(body.analysisId ?? "");
          } catch {
            return "";
          }
        })();

        if (analysisId === "analysis-3") {
          return Promise.resolve(
            createResponse(
              {
                error: {
                  code: "unsupported_input",
                  category: "unsupported_input",
                  message: "Unsupported requirements.",
                  retryable: false,
                  diagnostics: { missingRequirements: ["Python"] },
                },
              },
              true,
              422,
            ),
          );
        }

        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "missing",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            resume: null,
            coverLetter: null,
          }),
        );
      }

      if (url.endsWith("/api/resume") && init?.method === "POST") {
        resumeGenerationStarted = true;
        return new Promise(() => {});
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        coverGenerationStarted = true;
        return new Promise(() => {});
      }

      return Promise.resolve(createResponse({ error: "not_found" }, false, 404));
    });
    setFetchImplementation(fetchMock);

    const view = renderStudio();

    await screen.findByTestId("studio-generation-readiness");

    // Depending on feature flags / latches, Studio may either show the generation-ready shell
    // or auto-start generation. Support both without weakening production invariants.
    const readyShell = screen.queryByTestId("studio-generation-ready-shell");
    if (readyShell) {
      fireEvent.click(screen.getByTestId("studio-generation-ready-primary"));
    } else {
      await waitFor(() => {
        expect(screen.getByTestId("workflow-authority-headline")).toHaveTextContent(/generating your documents/i);
      });
    }

    await waitFor(() => {
      expect(resumeGenerationStarted).toBe(true);
      expect(coverGenerationStarted).toBe(true);
    });

    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-2",
      analysisId: "analysis-3",
    });

    act(() => {
      view.rerender(
        <EntitlementsProvider
          entitlements={{
            id: "u-1",
            email: "test@example.com",
            subscriptionTier: "PRO",
            role: "user",
            entitlements: null,
          }}
        >
          <StudioPage />
        </EntitlementsProvider>,
      );
    });

    const remediationButtons = await screen.findAllByRole("button", { name: "Remove unsupported requirements and continue" });
    expect(remediationButtons.length).toBeGreaterThan(0);
    expect(screen.queryByTestId("studio-generation-ready-shell")).toBeNull();
  });

  it("F. score 83 + stale baseline_resume_v2_* artifact errors do not force baseline repair required when ResumeV2 readiness is usable", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-83-stale-resume-v2",
    });

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-83-stale-resume-v2")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-83-stale-resume-v2",
            scoring_v2: { score: 83 },
            scoringV2: { score: 83 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }

      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "completed",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            score: 83,
            scoring_v2: { score: 83, generation_readiness: { status: "ready", blocked: false, reasonCodes: [] } },
            // Stale: baseline_resume_v2_* error codes from a prior lane.
            errors: [{ code: "baseline_resume_v2_missing", message: "Stale ResumeV2 missing error." }],
            resume: { status: "missing", confidence: "LOW", failure: null, failureCode: "baseline_resume_v2_missing" },
            coverLetter: { status: "missing", confidence: "LOW", failure: null },
            artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing", generating: false, failure: null },
            // Current: readiness snapshot indicates usable baseline ResumeV2.
            diagnostics: { resumeV2Readiness: { hasResumeV2: true, usableExperienceCount: 2 } },
          }),
        );
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      return Promise.resolve(createResponse({ error: "not_found" }, false, 404));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findByTestId("studio-generation-readiness");

    expect(screen.queryByTestId("studio-baseline-blocked-recovery")).toBeNull();
    expect(
      screen.queryByText("Your baseline needs to be reprocessed before documents can be generated."),
    ).toBeNull();

    // Generation remains available (either generate buttons or a retry action depending on lane).
    await waitFor(() => {
      const hasAnyGenerationAction =
        Boolean(screen.queryByRole("button", { name: /generate resume/i })) ||
        Boolean(screen.queryByRole("button", { name: /generate cover letter/i })) ||
        Boolean(screen.queryByText(/retry generation/i));
      expect(hasAnyGenerationAction).toBe(true);
    });
  });

  it("G. score 83 + structurally unusable ResumeV2 readiness renders baseline repair required", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-83-structural-resume-v2",
    });

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-83-structural-resume-v2")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-83-structural-resume-v2",
            scoring_v2: { score: 83 },
            scoringV2: { score: 83 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }

      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "failed",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            score: 83,
            scoring_v2: {
              score: 83,
              generation_readiness: { status: "blocked", blocked: true, reasonCodes: ["baseline_resume_v2_missing"] },
            },
            errors: [{ code: "baseline_resume_v2_missing", message: "Current ResumeV2 missing." }],
            resume: { status: "FAILED", confidence: "LOW", failure: null, failureCode: "baseline_resume_v2_missing" },
            coverLetter: { status: "missing", confidence: "LOW", failure: null },
            artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing", generating: false, failure: null },
            diagnostics: { resumeV2Readiness: { hasResumeV2: false, usableExperienceCount: 0 } },
          }),
        );
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      return Promise.resolve(createResponse({ error: "not_found" }, false, 404));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findByTestId("studio-baseline-blocked-recovery");
    expect(
      screen.getAllByText("Your baseline needs to be reprocessed before documents can be generated.").length,
    ).toBeGreaterThan(0);
  });

  it("C. both artifacts non-blocking keeps generation-ready behavior", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-4",
    });

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-4")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-4",
            // Keep below auto "generate now" eligibility threshold so this test asserts the
            // generation-ready surface rather than triggering the auto-generation path.
            scoring_v2: { score: 79 },
            scoringV2: { score: 79 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }

      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "missing",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            resume: null,
            coverLetter: null,
          }),
        );
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      return Promise.resolve(createResponse({ error: "not_found" }, false, 404));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    // With a non-blocking pair but a sub-80 fit score, Studio should remain in the
    // "review required" authority lane (not the generation-ready shell).
    await screen.findByTestId("studio-workflow-authority");
    expect(screen.getByTestId("workflow-authority-headline")).toHaveTextContent("One focused update is required");
    expect(screen.getAllByRole("button", { name: "Generate Resume" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Generate Cover Letter" }).length).toBeGreaterThan(0);
  });

  it("D. pair blocked by insufficient_verified_evidence follows the same blocking precedence", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-5",
    });

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-5")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-5",
            scoring_v2: { score: 76 },
            jobId: "job-1",
            companyName: "Acme",
            jobTitle: "Director of Support",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: ["Leadership proof"] },
          }),
        );
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }

      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            blocked: true,
            compliance_flags: [],
            reasons: [
              {
                code: "insufficient_verified_evidence",
                message: "Not enough verified evidence.",
              },
            ],
          }),
        );
      }

      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findByTestId("studio-generation-readiness");
    expect(screen.queryByTestId("studio-generation-ready-shell")).toBeNull();
    expect(screen.queryByTestId("studio-instant-draft-hero")).toBeNull();
    const blockedSummary = await screen.findByTestId("studio-ready-secondary-summary");
    expect(screen.getByRole("heading", { name: "Generation is blocked" })).toBeInTheDocument();
    expect(blockedSummary).toHaveTextContent("Resolve blockers");
  });

	  it("E. cover succeeds + resume 422 failure captures diagnostics in orchestration debug without unsupported remediation CTA", async () => {
	    overrideSearchParams({
	      jobId: "job-1",
	      baselineId: "base-1",
	      baselineVersionId: "base-version-1",
	      analysisId: "analysis-6",
	    });

	    const resumeErrorBody = {
	      status: "error",
	      artifactType: "resume",
	      category: "generation_failed",
	      code: "resume_backend_failed",
	      errorCode: "resume_backend_failed",
	      message: "Resume pipeline failed.",
	    };

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/analysis/fit-assessments/analysis-6")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-6",
            scoring_v2: { score: 82 },
            scoringV2: { score: 82 },
            score: 82,
            jobId: "job-1",
            companyName: "Acme",
            jobTitle: "Director of Support",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: { unverifiedRequirements: ["Python"] },
          }),
        );
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }

      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "missing",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            baselineVersionHash: "hash-1",
            generationContractVersion: "studio-artifacts-v1",
            resume: null,
            coverLetter: null,
          }),
        );
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      if (method === "POST" && url === "/api/cover-letters") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exports: { docx: false, pdf: false },
            preview: { coverLetter: { paragraphs: ["Cover letter paragraph."] } },
          }),
        );
      }

	      if (method === "POST" && url === "/api/resume") {
	        return Promise.resolve(createResponse(resumeErrorBody, false, 422));
	      }

      return Promise.resolve(createResponse({ error: "not_found" }, false, 404));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findByTestId("studio-generation-readiness");

    fireEvent.click(await screen.findByTestId("studio-generate-cover-button"));
	    await screen.findByText(/cover letter paragraph/i);

	    fireEvent.click(await screen.findByRole("button", { name: /generate resume/i }));
	    const resumeIssue = await screen.findByTestId("studio-resume-artifact-issue");
	    expect(resumeIssue).toHaveTextContent("We hit an issue generating your resume.");

    expect(screen.queryByTestId("studio-auto-adjust-panel")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove unsupported requirements and continue" })).toBeNull();

	    const debug = await screen.findByTestId("studio-orchestration-debug");
	    expect(debug).toHaveTextContent("\"endpoint\": \"/api/resume\"");
	    expect(debug).toHaveTextContent("\"httpStatus\": 422");
	    expect(debug).toHaveTextContent("\"backendCode\": \"resume_backend_failed\"");
	    expect(debug).toHaveTextContent("\"backendMessage\": \"Resume pipeline failed.\"");
	  });
});
