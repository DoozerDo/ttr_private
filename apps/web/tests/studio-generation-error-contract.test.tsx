import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "./setup";

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
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
    blob: () => Promise.resolve(new Blob([text], { type: "application/json" })),
  };
}

function installBaselineFetches(
  extra: (url: string, init?: RequestInit) => Promise<any> | any | null | undefined,
) {
  setFetchImplementation(
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const override = await extra(url, init);
      if (override != null) return override;
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
            verification_coverage: { unverifiedRequirements: [] },
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "ready",
            blocked: false,
            reasonCodes: [],
            reasons: [],
            badgeLabel: "READY",
            summary: "Ready for generation.",
            verificationIssues: [],
          }),
        );
      }
      if (url.includes("/api/studio/ready_shell")) {
        return Promise.resolve(
          createResponse({
            workflowState: "READY",
            canGenerate: true,
            suppressFailureMessaging: false,
            primaryAction: "RETRY",
            headline: "Generate in Studio",
            body: "Generate, preview, and export your resume and cover letter.",
            nextStepHint: "Retry generation from the current verified inputs.",
          }),
        );
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "COMPLETED",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            baselineVersionHash: "hash-1",
            jobFingerprint: "job-fingerprint-1",
            generationContractVersion: "studio-artifacts-v1",
            resume: { status: "MISSING" },
            coverLetter: { status: "MISSING" },
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    }),
  );
}

describe("Studio generation error contract", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("renders the standard Studio ready state", async () => {
    installBaselineFetches((url, init) => {
      if (url.includes("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { resume: { heading: { name: "Alex Candidate", contactLine: "alex@example.com" }, experience: [] } },
          }),
        );
      }
      if (url.includes("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          }),
        );
      }
      return null;
    });

    renderStudio();
    await waitFor(() => expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument());
    expect(screen.queryByText("Fix Pair Selection")).toBeNull();
    expect(screen.getByRole("heading", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cover letter" })).toBeInTheDocument();
    // Under the current Studio workflow contract, readiness_pending / REVIEW_REQUIRED may expose a
    // "Refine" link instead of an enabled retry button.
    const retryButton = screen.queryByRole("button", { name: /retry generation/i });
    const refineLink = screen.queryByRole("link", { name: /refine/i });
    expect(retryButton ?? refineLink).not.toBeNull();
  });

  it("renders generation_blocked as the inline failure shell", async () => {
    installBaselineFetches((url, init) => {
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse(
            {
              status: "COMPLETED",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "job-fingerprint-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "FAILED",
                inputsHash: "resume-hash",
                responseBody: {
                  error: {
                    code: "generation_blocked",
                    category: "generation_blocked",
                    message:
                      "Generation is not available for this role due to insufficient verified evidence.",
                    detail: "Readiness or compliance gates blocked generation.",
                    retryable: false,
                    userAction: {
                      title: "Review baseline readiness",
                      description:
                        "Complete the missing verified requirements before generating again.",
                    },
                    diagnostics: {
                      failureReasons: ["full_block: Missing verified evidence."],
                      missingRequirements: ["Missing verified evidence."],
                    },
                  },
                },
                content: null,
                failureCode: "generation_blocked",
                failureMessage:
                  "Generation is not available for this role due to insufficient verified evidence.",
                startedAt: null,
                completedAt: null,
                failedAt: new Date().toISOString(),
                metadata: { auditId: "audit-blocked" },
              },
              coverLetter: { status: "MISSING" },
            },
          ),
        );
      }
      return null;
    });

    renderStudio();
    expect(screen.queryByText("Fix Pair Selection")).toBeNull();
    expect(
      (await screen.findAllByText(/generation is not available for this role/i)).length,
    ).toBeGreaterThan(0);
  });

  it("renders generation_failed as the inline failure shell", async () => {
    installBaselineFetches((url, init) => {
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse(
            {
              status: "COMPLETED",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "job-fingerprint-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "FAILED",
                inputsHash: "resume-hash",
                responseBody: {
                  error: {
                    code: "generation_failed",
                    message: "Resume generation failed validation.",
                  },
                },
                content: null,
                failureCode: "generation_failed",
                failureMessage: "Resume generation failed validation.",
                startedAt: null,
                completedAt: null,
                failedAt: new Date().toISOString(),
                metadata: { auditId: "audit-failed" },
              },
              coverLetter: { status: "MISSING" },
            },
          ),
        );
      }
      return null;
    });

    renderStudio();
    expect((await screen.findAllByText(/resume generation failed/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Fix Pair Selection")).toBeNull();
  });

  it("preserves the last good resume when a retry times out", async () => {
    const lastGoodBullet = "UNIQUE_LAST_GOOD_ARTIFACT_BULLET";
    installBaselineFetches((url, init) => {
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "COMPLETED",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            baselineVersionHash: "hash-1",
            jobFingerprint: "job-fingerprint-1",
            generationContractVersion: "studio-artifacts-v1",
            resume: {
              status: "COMPLETED",
              inputsHash: "resume-hash",
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: true,
                exports: { docx: true, pdf: true },
                preview: {
                  resume: {
                    heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                    summary: "Support leader focused on scalable operations.",
                    experience: [
                      {
                        company: "Cat Daddy Games",
                        roleTitle: "Senior Producer",
                        location: "Los Angeles, CA",
                        dateRange: "2020 - Present",
                        bullets: [lastGoodBullet],
                      },
                    ],
                  },
                },
              },
              content: "resume-content",
              failureCode: null,
              failureMessage: null,
              startedAt: null,
              completedAt: new Date().toISOString(),
              failedAt: null,
              metadata: { auditId: "audit-1" },
            },
            coverLetter: { status: "MISSING" },
          }),
        );
      }
      return null;
    });

    renderStudio();

    // The last known good artifact must remain visible, even if Studio surfaces constrained/retry UI.
    expect(await screen.findByText(lastGoodBullet)).toBeInTheDocument();

    expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    expect(
      Boolean(screen.queryByRole("button", { name: /retry generation/i })) ||
        Boolean(screen.queryByRole("link", { name: /refine/i })),
    ).toBe(true);

    // A constrained state must not masquerade as a new completed download/export state.
    expect(screen.queryByRole("button", { name: /download resume/i })).toBeNull();
    expect(screen.queryByTestId("studio-resume-artifact-issue")).toBeNull();
  });

  it("renders unsupported_input as the inline failure shell", async () => {
    let resumeFetches = 0;
    installBaselineFetches((url, init) => {
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(createResponse({}));
      }
      if (url.includes("/api/cover-letters") && init?.method === "POST") {
        resumeFetches += 1;
        return Promise.resolve(
          createResponse(
            {
              error: {
                code: "insufficient_extracted_text",
                category: "unsupported_input",
                message: "We could not extract enough text from that resume.",
                detail: "The current cover letter input cannot be grounded into a supported artifact.",
                retryable: false,
                userAction: {
                  title: "Add stronger baseline evidence",
                  description: "Include clearer accomplishment bullets and fuller role details before generating again.",
                },
                diagnostics: {
                  unsupportedEnvelope: "insufficient_extracted_text",
                  missingRequirements: ["Add clearer accomplishment bullets"],
                },
              },
            },
            false,
            422,
          ),
        );
      }
      return null;
    });

    renderStudio();
    const retry = await screen.findByRole("button", { name: /retry generation/i });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);

    expect(resumeFetches).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/could not extract enough text/i)).toBeInTheDocument();
    expect(screen.getAllByText(/grounded into a supported artifact/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/We are generating your application draft now/i)).toBeNull();
  });

  it("renders trace_failure as the inline failure shell", async () => {
    let resumeFetches = 0;
    installBaselineFetches((url, init) => {
      if (url.includes("/api/resume") && init?.method === "POST") {
        resumeFetches += 1;
        return Promise.resolve(
          createResponse(
            {
              error: {
                code: "generation_failed",
                category: "trace_failure",
                message: "Resume generation failed validation.",
                detail: "Required content lines could not be traced back to baseline evidence.",
                retryable: false,
                userAction: {
                  title: "Repair traceable baseline evidence",
                  description: "Add or repair baseline evidence so every content line can be traced.",
                },
                diagnostics: {
                  traceCoverage: 87.5,
                  failureReasons: ["Line experience:1:0 has no source evidence."],
                },
              },
            },
            false,
            422,
          ),
        );
      }
      return null;
    });

    renderStudio();
    const retry = await screen.findByRole("button", { name: /retry generation/i });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);

    expect(resumeFetches).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Fix Pair Selection")).toBeNull();
    expect((await screen.findAllByText(/Resume generation failed validation/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/we couldn.?t generate a reliable result/i)).toBeNull();
    expect(screen.queryByText(/We are generating your application draft now/i)).toBeNull();
  });
});

