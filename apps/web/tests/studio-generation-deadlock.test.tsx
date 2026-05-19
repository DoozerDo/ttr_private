import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "./setup";

const requestGuard = vi.hoisted(() => ({ forceStale: false }));

vi.mock("@/lib/workflowRequestGuard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workflowRequestGuard")>(
    "@/lib/workflowRequestGuard",
  );
  const real = actual.isWorkflowRequestStale;
  return {
    ...actual,
    isWorkflowRequestStale: (...args: Parameters<typeof real>) =>
      requestGuard.forceStale ? true : real(...args),
  };
});

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

vi.mock("@/lib/generationProductReadiness", () => ({
  buildGenerationProductReadiness: vi.fn(() => ({
    generation_readiness: {
      canGenerate: true,
      canExport: true,
      reasons: [],
      verificationIssues: [],
      blocked: false,
    },
    state: "ALLOWED",
    confidence: "HIGH",
    needsVerification: false,
    tier: "generation_export_allowed",
    canOpenStudio: true,
    generationMode: "verified",
  })),
}));

vi.mock("@/lib/studioTrustGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studioTrustGate")>("@/lib/studioTrustGate");
  return {
    ...actual,
    evaluateStudioTrustGate: vi.fn(() => ({
      allowed: true,
      reason: null,
    })),
  };
});

vi.mock("@/lib/documentGenerationGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/documentGenerationGate")>(
    "@/lib/documentGenerationGate",
  );
  return {
    ...actual,
    isGenerateNowEligible: vi.fn(() => false),
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

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
    blob: () => Promise.resolve(new Blob([text], { type: "application/json" })),
  };
}

async function dismissGenerationReadyShellIfPresent() {
  await waitFor(() => {
    const hasShell = Boolean(screen.queryByTestId("studio-generation-ready-shell"));
    const hasAuthority = Boolean(screen.queryByTestId("studio-workflow-authority"));
    // Studio can briefly render either surface first depending on async hydration.
    expect(hasShell || hasAuthority).toBe(true);
  });

  const shell = screen.queryByTestId("studio-generation-ready-shell");
  if (!shell) return;

  fireEvent.click(screen.getByTestId("studio-generation-ready-secondary"));
  await waitFor(() => expect(screen.queryByTestId("studio-generation-ready-shell")).toBeNull());
}

async function startResumeGenerationDraft() {
  await dismissGenerationReadyShellIfPresent();

  const resumeButtons = await screen.findAllByRole("button", { name: /resume/i });
  const generateResume =
    resumeButtons.find((button) => button.textContent?.toLowerCase().includes("generate")) ?? resumeButtons[0];
  fireEvent.click(generateResume);
}

beforeEach(() => {
  requestGuard.forceStale = false;
  overrideSearchParams({ analysisId: "analysis-1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Studio generation deadlock regression", () => {
  it("does not stay stuck in Generating when a stale/blocked response clears the active ref", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    let resolveResume:
      | ((value: ReturnType<typeof createResponse>) => void)
      | null = null;

    setFetchImplementation(
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/analytics/event")) return Promise.resolve(createResponse({}));
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              scoring_v2: { score: 88 },
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(createResponse({ error: "unavailable" }, false, 500));
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          return new Promise((resolve) => {
            resolveResume = resolve as (value: ReturnType<typeof createResponse>) => void;
          });
        }
        if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
          return Promise.resolve(createResponse({ error: { code: "noop" } }, false, 422));
        }
        return Promise.resolve(createResponse({}));
      }) as unknown as typeof fetch,
    );

    renderStudio();
    await startResumeGenerationDraft();

    expect(await screen.findByText("Generating resume")).toBeInTheDocument();

    requestGuard.forceStale = true;
    resolveResume?.(
      createResponse({
        status: "success",
        code: "draft_generated",
        exportReady: true,
        generationStatus: "success",
        preview: { resume: { heading: { name: "Alex Candidate", contactLine: "alex@example.com" } } },
      }),
    );

    await waitFor(() => expect(screen.queryByText("Generating resume")).toBeNull());
  });

  it("times out generation requests and surfaces a generation_timeout failure", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    let resumePostStarted = false;
    setFetchImplementation(
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/analytics/event")) return Promise.resolve(createResponse({}));
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              scoring_v2: { score: 88 },
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(createResponse({ error: "unavailable" }, false, 500));
        }
        if (url.endsWith("/api/resume") && init?.method === "POST") {
          resumePostStarted = true;
          // Simulate the abort timeout path without waiting 2 minutes.
          return Promise.reject(new DOMException("Aborted", "AbortError"));
        }
        return Promise.resolve(createResponse({}));
      }) as unknown as typeof fetch,
    );

    renderStudio();
    await startResumeGenerationDraft();

    await waitFor(() => expect(resumePostStarted).toBe(true));
    expect(await screen.findByText(/generation did not complete/i)).toBeInTheDocument();
    expect(screen.getAllByText(/timed out/i).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText("Generating resume")).toBeNull());
  });

  it("surfaces backend resume artifact failures inside the Resume card (no silent success)", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    setFetchImplementation(
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/analytics/event")) return Promise.resolve(createResponse({}));
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              scoring_v2: { score: 88 },
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "failed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "failed",
                inputsHash: "inputs-1",
                responseBody: null,
                content: null,
                failureCode: "resume_v2_invalid",
                failureMessage:
                  "Resume V2 produced an invalid normalized resume model... No valid experience entries were produced.",
                startedAt: null,
                completedAt: null,
                failedAt: null,
                metadata: {},
              },
              coverLetter: null,
              resumeResult: {
                artifactType: "resume",
                generationState: "generation_failed",
                qualityStatus: "failed",
                preview: null,
                correctionReasons: [
                  {
                    code: "resume_v2_invalid",
                    message:
                      "Resume V2 produced an invalid normalized resume model... No valid experience entries were produced.",
                    severity: "error",
                  },
                ],
                exportReady: false,
                exports: { docx: false, pdf: false },
                actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
              },
              coverLetterResult: null,
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }) as unknown as typeof fetch,
    );

    renderStudio();

    // Current Studio contract surfaces backend artifact failures via the workflow authority shell.
    const authority = await screen.findByTestId("studio-workflow-authority");
    expect(authority).toHaveAttribute("data-workflow-state", "generation_failed");
    expect(screen.getByText(/document generation failed/i)).toBeInTheDocument();
  });

  it("does not start generation before baselineVersionId is available", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      // baselineVersionId intentionally missing
    });

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analytics/event")) return Promise.resolve(createResponse({}));
      if (url.includes("/api/baselines/base-1/versions")) {
        return new Promise(() => {});
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 88 },
            jobId: "job-1",
            baselineId: "base-1",
            // baselineVersionId intentionally missing
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(createResponse({ error: "unavailable" }, false, 500));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(createResponse({}));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    renderStudio();

    // Customer-facing contract: when Studio can't safely identify the baseline version yet,
    // it must surface an actionable blocker instead of dispatching generation.
    expect(await screen.findByTestId("studio-invalid-state-fallback")).toBeInTheDocument();
    expect(screen.getByText(/Run Analyze again/i)).toBeInTheDocument();
    expect(screen.queryByTestId("studio-generate-resume-button")).toBeNull();

    await waitFor(() => {
      const resumePosts = fetchMock.mock.calls.filter(([input, init]) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        return url.endsWith("/api/resume") && init?.method === "POST";
      });
      expect(resumePosts.length).toBe(0);
    });
    expect(screen.queryByText("Generating resume")).toBeNull();
  });
});
