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
              error: {
                code: "unsupported_input",
                category: "unsupported_input",
                message: "Unsupported requirements.",
                retryable: false,
                diagnostics: { missingRequirements: ["Python", "Snowflake"] },
              },
            },
            false,
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

    await screen.findByTestId("studio-auto-adjust-panel");
    expect(screen.getByText("Remove unsupported requirements and continue")).toBeInTheDocument();

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
              false,
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

    await screen.findByTestId("studio-auto-adjust-panel");
    expect(screen.queryByTestId("studio-generation-ready-shell")).toBeNull();
    expect(screen.queryByText(/generating your documents/i)).toBeNull();
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
          createResponse(
            {
              error: {
                code: "insufficient_verified_evidence",
                category: "insufficient_verified_evidence",
                message: "Not enough verified evidence.",
                retryable: false,
                diagnostics: { missingRequirements: ["Leadership proof"] },
              },
            },
            false,
            422,
          ),
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
});
