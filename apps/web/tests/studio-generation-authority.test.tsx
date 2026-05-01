import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { ResumePreview } from "@/app/(app)/studio/ResumePreview";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import {
  clearRecentIntentSignals,
  recordArtifactUsedIntent,
  recordArtifactRefineIntent,
  recordOpportunityCommitIntent,
} from "@/src/lib/recentIntent";
import { mockRouterPush, mockRouterReplace, overrideSearchParams, setFetchImplementation } from "./setup";

const trackEventMock = vi.fn();
const resolveStudioNextMoveMock = vi.hoisted(() => vi.fn());
const getCanonicalNextActionMock = vi.hoisted(() => vi.fn());
const buildGenerationProductReadinessMock = vi.hoisted(() => vi.fn());
const evaluateStudioTrustGateMock = vi.hoisted(() => vi.fn());
var actualGetCanonicalNextAction: typeof import("@/lib/nextAction").getCanonicalNextAction | null = null;
var actualBuildGenerationProductReadiness:
  | typeof import("@/lib/generationProductReadiness").buildGenerationProductReadiness
  | null = null;
var actualEvaluateStudioTrustGate: typeof import("@/lib/studioTrustGate").evaluateStudioTrustGate | null = null;
vi.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));
vi.mock("@/lib/nextAction", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nextAction")>("@/lib/nextAction");
  actualGetCanonicalNextAction = actual.getCanonicalNextAction;
  getCanonicalNextActionMock.mockImplementation(actual.getCanonicalNextAction);
  return {
    ...actual,
    getCanonicalNextAction: getCanonicalNextActionMock,
  };
});
vi.mock("@/src/lib/studio/nextMove", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/studio/nextMove")>(
    "@/src/lib/studio/nextMove",
  );
  resolveStudioNextMoveMock.mockImplementation(actual.resolveStudioNextMove);
  return {
    ...actual,
    resolveStudioNextMove: resolveStudioNextMoveMock,
  };
});
vi.mock("@/lib/generationProductReadiness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/generationProductReadiness")>(
    "@/lib/generationProductReadiness",
  );
  actualBuildGenerationProductReadiness = actual.buildGenerationProductReadiness;
  buildGenerationProductReadinessMock.mockImplementation(actual.buildGenerationProductReadiness);
  return {
    ...actual,
    buildGenerationProductReadiness: buildGenerationProductReadinessMock,
  };
});
vi.mock("@/lib/studioTrustGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studioTrustGate")>(
    "@/lib/studioTrustGate",
  );
  actualEvaluateStudioTrustGate = actual.evaluateStudioTrustGate;
  evaluateStudioTrustGateMock.mockImplementation(actual.evaluateStudioTrustGate);
  return {
    ...actual,
    evaluateStudioTrustGate: evaluateStudioTrustGateMock,
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

describe("Studio artifact quality gating (soft)", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    clearRecentIntentSignals();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    if (actualGetCanonicalNextAction) {
      getCanonicalNextActionMock.mockImplementation(actualGetCanonicalNextAction);
    }
    if (actualBuildGenerationProductReadiness) {
      buildGenerationProductReadinessMock.mockImplementation(actualBuildGenerationProductReadiness);
    }
    if (actualEvaluateStudioTrustGate) {
      evaluateStudioTrustGateMock.mockImplementation(actualEvaluateStudioTrustGate);
    }
  });

  it("renders resume draft but blocks export when resume quality fails", async () => {
    setupFetchWithQualityFailures();
    renderStudio();

    await waitFor(() => {
      expect(screen.queryByTestId("studio-resume-missing")).toBeNull();
      expect(screen.getByTestId("studio-resume-quality-warning")).toBeInTheDocument();
    });

    const resumeSection = screen.getByRole("heading", { name: "Resume" }).closest("section");
    expect(resumeSection).toBeTruthy();
    const resumeSource = within(resumeSection as HTMLElement).getByTestId("studio-resume-generation-source");
    expect(resumeSource.textContent ?? "").toMatch(/reason:\s*stale_legacy/i);
    expect(within(resumeSection as HTMLElement).queryByText(/Your resume is ready/i)).toBeNull();
    expect(within(resumeSection as HTMLElement).getAllByText("Resume needs correction before export.").length).toBeGreaterThan(0);
    // Expand the entry so bullets are rendered.
    const resumeExperienceHeader = within(resumeSection as HTMLElement).getByText(/Designed and built a full-stack production platform/i);
    const resumeExperienceHeaderButton = resumeExperienceHeader.closest("button");
    expect(resumeExperienceHeaderButton).toBeTruthy();
    fireEvent.click(resumeExperienceHeader);
    const accomplishmentNodes = await within(resumeSection as HTMLElement).findAllByText(
      /Designed and built a full-stack production platform/i,
    );
    expect(accomplishmentNodes.length).toBeGreaterThanOrEqual(1);
    expect(within(resumeSection as HTMLElement).queryByText("Download DOCX")).toBeNull();
    expect(within(resumeSection as HTMLElement).queryByText("Download PDF")).toBeNull();

    const qualityWarning = within(resumeSection as HTMLElement).getByTestId("studio-resume-quality-warning");
    expect(within(qualityWarning).getByText("Contains an incomplete trailing fragment.")).toBeInTheDocument();
    expect(within(qualityWarning).getByText("Contains a malformed experience company header.")).toBeInTheDocument();
    expect(within(qualityWarning).getByText("Contains a malformed experience role title header.")).toBeInTheDocument();
  });

  it("renders cover letter preview but blocks export when cover letter quality fails", async () => {
    setupFetchWithQualityFailures();
    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-cover-quality-warning")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("Cover letter generated successfully")).toBeNull();
    });

    const coverSection = screen.getByRole("heading", { name: "Cover letter" }).closest("section");
    expect(coverSection).toBeTruthy();
    expect(within(coverSection as HTMLElement).queryByTestId("studio-cover-missing")).toBeNull();
    expect(within(coverSection as HTMLElement).queryByText("Cover letter generated successfully")).toBeNull();
    expect(within(coverSection as HTMLElement).queryByText(/generated successfully/i)).toBeNull();
    expect(within(coverSection as HTMLElement).getAllByText("Cover letter needs correction before export.").length).toBeGreaterThan(0);
    expect(within(coverSection as HTMLElement).queryByText("Download DOCX")).toBeNull();
    expect(within(coverSection as HTMLElement).queryByText("Download PDF")).toBeNull();
  });

  it("renders generation source diagnostics blocks visibly in the card headers", async () => {
    setupFetchWithQualityFailures();
    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-resume-generation-source")).toBeInTheDocument();
      expect(screen.getByTestId("studio-cover-generation-source")).toBeInTheDocument();
    });
  });

  it("includes baselineVersionId and jobId in missing-artifact generate payloads", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];

    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const method = (init?.method ?? "GET").toUpperCase();
        const body = typeof init?.body === "string" ? init.body : undefined;
        calls.push({ url, method, body });

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              // Score < 80 keeps the manual generate CTAs visible in the current Studio contract.
              scoring_v2: { score: 79 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "missing",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: null,
              coverLetter: null,
            }),
          );
        }
        if (method === "POST" && url.includes("/api/resume/generate")) {
          return Promise.resolve(createResponse({ status: "ok" }));
        }
        if (method === "POST" && url.includes("/api/cover-letters/generate")) {
          return Promise.resolve(createResponse({ status: "ok" }));
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: "generate" });

    await screen.findByTestId("studio-instant-draft-hero");

    const generateResumeButton = await screen.findByTestId("studio-generate-resume-button");
    await waitFor(() => expect(generateResumeButton).not.toBeDisabled());
    fireEvent.click(generateResumeButton);
    await waitFor(() => {
      const resumeCall = calls.find((c) => c.method === "POST" && c.url.includes("/api/resume/generate"));
      expect(resumeCall?.body).toContain("\"jobId\":\"job-1\"");
      expect(resumeCall?.body).toContain("\"baselineVersionId\":\"base-version-1\"");
    });

    const generateCoverButton = await screen.findByTestId("studio-generate-cover-button");
    await waitFor(() => expect(generateCoverButton).not.toBeDisabled());
    fireEvent.click(generateCoverButton);
    await waitFor(() => {
      const coverCall = calls.find((c) => c.method === "POST" && c.url.includes("/api/cover-letters/generate"));
      expect(coverCall?.body).toContain("\"jobId\":\"job-1\"");
      expect(coverCall?.body).toContain("\"baselineVersionId\":\"base-version-1\"");
    });
  });

  it("clicking Generate resume refreshes artifacts and renders a resume preview", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    let resumeGenerated = false;

    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const method = (init?.method ?? "GET").toUpperCase();
        calls.push({ url, method });

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              scoring_v2: { score: 72 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          if (!resumeGenerated) {
            return Promise.resolve(
              createResponse({
                status: "missing",
                baselineId: "base-1",
                jobId: "job-1",
                baselineVersionId: "base-version-1",
                baselineVersionHash: "hash-1",
                jobFingerprint: "fp-1",
                generationContractVersion: "studio-artifacts-v1",
                resume: null,
                coverLetter: null,
              }),
            );
          }
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "completed",
                inputsHash: "ih-1",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: true, pdf: true },
                  preview: {
                    resume: {
                      heading: { name: "Test Candidate", contactLine: "test@example.com" },
                      summary: "Verified support leader aligned to the role.",
                      experience: [{ company: "Acme", roleTitle: "Director of Support", bullets: ["Delivered results."] }],
                    },
                  },
                },
                content: null,
                failureCode: null,
                failureMessage: null,
              },
              coverLetter: null,
            }),
          );
        }
        if (method === "POST" && url.includes("/api/resume/generate")) {
          resumeGenerated = true;
          return Promise.resolve(createResponse({ status: "ok" }));
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: null });

    await screen.findByTestId("studio-resume-missing");
    const resumeButton = await screen.findByTestId("studio-generate-resume-button");
    fireEvent.click(resumeButton);

    await screen.findByTestId("studio-resume-ready-panel");
    expect(calls.filter((c) => c.url.includes("/api/studio/artifacts")).length).toBeGreaterThanOrEqual(2);
  });

  it("renders resume preview when artifacts include core content but preview.resume is missing", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    let resumeGenerated = false;

    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const method = (init?.method ?? "GET").toUpperCase();
        calls.push({ url, method });

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              scoring_v2: { score: 72 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          if (!resumeGenerated) {
            return Promise.resolve(
              createResponse({
                status: "missing",
                baselineId: "base-1",
                jobId: "job-1",
                baselineVersionId: "base-version-1",
                baselineVersionHash: "hash-1",
                jobFingerprint: "fp-1",
                generationContractVersion: "studio-artifacts-v1",
                resume: null,
                coverLetter: null,
              }),
            );
          }
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "completed",
                inputsHash: "ih-1",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: true, pdf: true },
                  templateVersion: undefined,
                  content: "Resume Body: Generated content without preview model.",
                  sections: [{ text: "Resume Body: Generated content without preview model." }],
                },
                content: "Resume Body: Generated content without preview model.",
                failureCode: null,
                failureMessage: null,
              },
              coverLetter: null,
            }),
          );
        }
        if (method === "POST" && url.includes("/api/resume/generate")) {
          resumeGenerated = true;
          return Promise.resolve(createResponse({ status: "ok" }));
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: null });

    await screen.findByTestId("studio-resume-missing");
    const resumeButton = await screen.findByTestId("studio-generate-resume-button");
    fireEvent.click(resumeButton);

    await screen.findByTestId("studio-resume-correction-panel");
    expect(screen.queryByTestId("studio-resume-missing")).toBeNull();
    expect(screen.getByText(/Template unknown/i)).toBeInTheDocument();
    expect(calls.filter((c) => c.url.includes("/api/studio/artifacts")).length).toBeGreaterThanOrEqual(2);
  });

  it("renders resume preview when persisted artifact has record.content but responseBody has no preview/content model fields", async () => {
    let resumeGenerated = false;

    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const method = (init?.method ?? "GET").toUpperCase();

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              scoring_v2: { score: 72 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          if (!resumeGenerated) {
            return Promise.resolve(
              createResponse({
                status: "missing",
                baselineId: "base-1",
                jobId: "job-1",
                baselineVersionId: "base-version-1",
                baselineVersionHash: "hash-1",
                jobFingerprint: "fp-1",
                generationContractVersion: "studio-artifacts-v1",
                resume: null,
                coverLetter: null,
              }),
            );
          }
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "completed",
                inputsHash: "ih-1",
                // Response body exists but does not include legacy structured preview fields or content.
                responseBody: { status: "success", generationStatus: "success", exports: { docx: false, pdf: false } },
                // Renderable text exists only in the persisted record content column.
                content: "Resume Body: content stored in record only.",
                failureCode: null,
                failureMessage: null,
              },
              coverLetter: null,
            }),
          );
        }
        if (method === "POST" && url.includes("/api/resume/generate")) {
          resumeGenerated = true;
          return Promise.resolve(createResponse({ status: "ok" }));
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: null });

    await screen.findByTestId("studio-resume-missing");
    fireEvent.click(await screen.findByTestId("studio-generate-resume-button"));

    await screen.findByTestId("studio-resume-correction-panel");
    expect(screen.queryByTestId("studio-resume-missing")).toBeNull();
    // Preview must render from persisted content without requiring resumeModel/preview.resume.
    expect(screen.getByText(/Resume Body: content stored in record only/i)).toBeInTheDocument();
  });

  it("hydrates render state from studio/artifacts after generate (resume + cover)", async () => {
    let generated = false;

    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const method = (init?.method ?? "GET").toUpperCase();

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              scoring_v2: { score: 72 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          if (!generated) {
            return Promise.resolve(
              createResponse({
                status: "missing",
                baselineId: "base-1",
                jobId: "job-1",
                baselineVersionId: "base-version-1",
                baselineVersionHash: "hash-1",
                jobFingerprint: "fp-1",
                generationContractVersion: "studio-artifacts-v1",
                resume: null,
                coverLetter: null,
              }),
            );
          }
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "completed",
                inputsHash: "ih-1",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: true, pdf: true },
                  preview: {
                    resume: {
                      heading: { name: "Test Candidate", contactLine: "test@example.com" },
                      summary: "Hydrated resume summary.",
                      experience: [{ company: "Acme", roleTitle: "Director", bullets: ["Did work."] }],
                    },
                  },
                },
              },
              coverLetter: {
                status: "completed",
                inputsHash: "ih-2",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: true, pdf: true },
                  preview: { coverLetter: { paragraphs: ["Dear Hiring Team,", "Hydrated cover letter."] } },
                },
              },
            }),
          );
        }
        if (method === "POST" && (url.includes("/api/resume/generate") || url.includes("/api/cover-letters/generate"))) {
          generated = true;
          return Promise.resolve(createResponse({ status: "ok" }));
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: null });

    await screen.findByTestId("studio-resume-missing");
    const resumeButton = await screen.findByTestId("studio-generate-resume-button");
    fireEvent.click(resumeButton);

    await waitFor(() => {
      expect(screen.queryByTestId("studio-resume-missing")).toBeNull();
      expect(screen.queryByTestId("studio-cover-missing")).toBeNull();
    });
    expect(
      screen.queryByTestId("studio-resume-ready-panel") ?? screen.queryByTestId("studio-resume-correction-panel"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("studio-cover-ready-panel") ?? screen.queryByTestId("studio-cover-correction-panel"),
    ).toBeTruthy();
  });

  it("renders cover letter preview when persisted artifact has record.content but responseBody has no preview/content model fields", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              scoring_v2: { score: 72 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: null,
              coverLetter: {
                status: "completed",
                inputsHash: "ih-2",
                responseBody: { status: "success", generationStatus: "success", exports: { docx: false, pdf: false } },
                content: "Cover Letter Body: content stored in record only.",
                failureCode: null,
                failureMessage: null,
              },
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: null });

    await waitFor(() => {
      expect(
        screen.queryByTestId("studio-cover-correction-panel") ?? screen.queryByTestId("studio-cover-ready-panel"),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId("studio-cover-missing")).toBeNull();
    expect(screen.getAllByText(/Cover Letter Body: content stored in record only/i).length).toBeGreaterThan(0);
  });

  it("renders resume + cover previews even when readiness is blocked", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const method = (init?.method ?? "GET").toUpperCase();

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              scoring_v2: { score: 88 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(
            createResponse({
              status: "limited",
              blocked: true,
              reasonCodes: ["personalization_limitation"],
              reasons: [{ code: "personalization_limitation", message: "Blocked for this test." }],
              compliance_flags: [],
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "completed",
                inputsHash: "ih-1",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: false, pdf: false },
                  preview: {
                    resume: {
                      heading: { name: "Test Candidate", contactLine: "test@example.com" },
                      summary: "Resume exists and must render even when blocked.",
                      experience: [{ company: "Acme", roleTitle: "Director", bullets: ["Did work."] }],
                    },
                  },
                },
                content: null,
                failureCode: null,
                failureMessage: null,
              },
              coverLetter: {
                status: "completed",
                inputsHash: "ih-2",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: false, pdf: false },
                  preview: { coverLetter: { paragraphs: ["Dear Hiring Team,", "Cover exists even when blocked."] } },
                },
                content: null,
                failureCode: null,
                failureMessage: null,
              },
            }),
          );
        }

        if (method === "POST" && (url.includes("/api/resume/generate") || url.includes("/api/cover-letters/generate"))) {
          return Promise.resolve(createResponse({ status: "ok" }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: null });

    await waitFor(() => {
      expect(
        screen.queryByTestId("studio-resume-ready-panel") ?? screen.queryByTestId("studio-resume-correction-panel"),
      ).toBeTruthy();
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId("studio-cover-ready-panel") ?? screen.queryByTestId("studio-cover-correction-panel"),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/generation is blocked/i)).toBeNull();
    expect(screen.queryByText(/complete your profile/i)).toBeNull();
  });

  it("keeps previews visible when analysis fetch fails but artifacts exist", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const method = (init?.method ?? "GET").toUpperCase();

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(createResponse({ error: "fetch failed" }, false, 500));
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "limited", blocked: false, reasons: [], compliance_flags: [] }));
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "completed",
                inputsHash: "ih-1",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: false, pdf: false },
                  preview: {
                    resume: {
                      heading: { name: "Test Candidate" },
                      summary: "Artifact renders even if analysis fails.",
                      experience: [{ company: "Acme", roleTitle: "Director", bullets: ["Did work."] }],
                    },
                  },
                },
                content: null,
                failureCode: null,
                failureMessage: null,
              },
              coverLetter: {
                status: "completed",
                inputsHash: "ih-2",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: false, pdf: false },
                  preview: { coverLetter: { paragraphs: ["Dear Hiring Team,", "Still visible."] } },
                },
                content: null,
                failureCode: null,
                failureMessage: null,
              },
            }),
          );
        }

        if (method === "POST" && (url.includes("/api/resume/generate") || url.includes("/api/cover-letters/generate"))) {
          return Promise.resolve(createResponse({ status: "ok" }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: null });

    await waitFor(() => {
      expect(
        screen.queryByTestId("studio-resume-ready-panel") ?? screen.queryByTestId("studio-resume-correction-panel"),
      ).toBeTruthy();
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId("studio-cover-ready-panel") ?? screen.queryByTestId("studio-cover-correction-panel"),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/Role analysis unavailable/i)).toBeNull();
  });

  it("clicking Generate cover letter refreshes artifacts and renders a cover letter preview", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    let coverGenerated = false;

    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const method = (init?.method ?? "GET").toUpperCase();
        calls.push({ url, method });

        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              scoring_v2: { score: 72 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          if (!coverGenerated) {
            return Promise.resolve(
              createResponse({
                status: "missing",
                baselineId: "base-1",
                jobId: "job-1",
                baselineVersionId: "base-version-1",
                baselineVersionHash: "hash-1",
                jobFingerprint: "fp-1",
                generationContractVersion: "studio-artifacts-v1",
                resume: null,
                coverLetter: null,
              }),
            );
          }
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: null,
              coverLetter: {
                status: "completed",
                inputsHash: "ih-2",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: true, pdf: true },
                  preview: { coverLetter: { paragraphs: ["Dear Hiring Team,", "Sincerely,", "Test Candidate"] } },
                },
                content: null,
                failureCode: null,
                failureMessage: null,
              },
            }),
          );
        }
        if (method === "POST" && url.includes("/api/cover-letters/generate")) {
          coverGenerated = true;
          return Promise.resolve(createResponse({ status: "ok" }));
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: null });

    await screen.findByTestId("studio-cover-missing");
    const coverButton = await screen.findByTestId("studio-generate-cover-button");
    fireEvent.click(coverButton);

    await screen.findByTestId("studio-cover-ready-panel");
    expect(calls.filter((c) => c.url.includes("/api/studio/artifacts")).length).toBeGreaterThanOrEqual(2);
  });

  it("ResumePreview trusts sanitized API fields and does not render malformed role titles from overrides", () => {
    const payload = {
      heading: { name: "Test Candidate", contactLine: "test@example.com" },
      summary: "Low quality resume preview.",
      experience: [
        {
          company: "Experience entry needs correction",
          roleTitle: "",
          bullets: ["Designed and built a full-stack production platform."],
        },
      ],
    };

    render(
      <ResumePreview
        payload={payload}
        isEditing={false}
      />,
    );

    expect(screen.queryByText(/Technical Architect & Full/i)).toBeNull();
    expect(screen.getByText("Experience entry needs correction")).toBeInTheDocument();
  });

  // The generated_unusable lane is covered by API+UI contract tests; avoid mocking the orchestrator
  // here because it affects many unrelated authority tests.
});

// Manual retry behavior is covered by API path tests; web authority tests focus on visible CTAs and rendering rules.

function renderStudio(
  searchParams: Partial<{
    analysisId: string | null;
    jobId: string | null;
    baselineId: string | null;
    baselineVersionId: string | null;
    intent: string | null;
  }> = {},
) {
  // StudioPage reads identity from `useSearchParams()`; set stable IDs per render to prevent
  // cross-test leakage from `resetSearchParams()` and make overrides explicit at call sites.
  const resolvedParams = {
    analysisId: "analysis-1",
    jobId: "job-1",
    baselineId: "base-1",
    baselineVersionId: "base-version-1",
    ...searchParams,
  } as const;

  overrideSearchParams(resolvedParams);
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
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  const response = {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
  return {
    ...response,
    clone: () => ({ ...response }),
  };
}

function setupFetch(readinessStatus: "ready" | "limited" | "blocked", score = 94, totalClaims = 3) {
  setFetchImplementation(
    vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
            scoring_v2: { score },
            verification_coverage: {
              totalClaims,
              verifiedClaims: readinessStatus === "ready" ? totalClaims : 0,
              inferredClaims: readinessStatus === "limited" ? 1 : 0,
              unverifiedClaims: readinessStatus === "ready" ? 0 : 1,
              unverifiedRequirements: readinessStatus === "ready" ? [] : ["Salesforce"],
            },
          }),
        );
      }
      if (url.includes("/api/studio/artifacts")) {
        if (typeof score === "number" && score < 80) {
          return Promise.resolve(
            createResponse({
              status: "missing",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              resume: null,
              coverLetter: null,
            }),
          );
        }
        return Promise.resolve(
          createResponse({
            status: "completed",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            generationContractVersion: "studio-artifacts-v1",
            resume: {
              status: "completed",
              responseBody: {
                status: "success",
                generationStatus: "success",
                exports: { docx: true, pdf: true },
                preview: {
                  resume: {
                    heading: { name: "Test Candidate", contactLine: "test@example.com" },
                    summary: "Verified support leader aligned to the role.",
                    experience: [
                      {
                        company: "Acme",
                        roleTitle: "Director of Support",
                        bullets: ["Led support operations and improved team performance."],
                      },
                    ],
                    education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                    competencies: ["Customer strategy", "Operational leadership"],
                  },
                },
              },
            },
            coverLetter: {
              status: "completed",
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: true,
                exports: { docx: true, pdf: true },
                preview: {
                  coverLetter: {
                    paragraphs: [
                      "Dear Hiring Team,",
                      "I am applying for this role.",
                      "I have led support operations programs.",
                      "Sincerely,",
                      "Test Candidate",
                    ],
                  },
                },
              },
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: readinessStatus,
            reasons:
              readinessStatus === "ready"
                ? []
                : [
                    {
                      code: readinessStatus === "blocked" ? "full_block" : "personalization_limitation",
                      message: "Needs verification support.",
                    },
                  ],
            compliance_flags:
              readinessStatus === "blocked"
                ? [{ code: "fictional_technology", severity: "block", message: "Unsupported claim Salesforce." }]
                : [],
          }),
        );
      }
      if (url.includes("/api/resume")) {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exports: { docx: true, pdf: true },
            preview: {
              resume: {
                heading: { name: "Test Candidate", contactLine: "test@example.com" },
                summary: "Verified support leader aligned to the role.",
                experience: [
                  {
                    company: "Acme",
                    roleTitle: "Director of Support",
                    bullets: ["Led support operations and improved team performance."],
                  },
                ],
                education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                competencies: ["Customer strategy", "Operational leadership"],
              },
            },
          }),
        );
      }
      if (url.includes("/api/cover-letters")) {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              coverLetter: {
                paragraphs: [
                  "Dear Hiring Team,",
                  "I am applying for this role.",
                  "I have led support operations programs.",
                  "Sincerely,",
                  "Test Candidate",
                ],
              },
            },
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    }),
  );
}

function setupFetchWithQualityFailures() {
  setFetchImplementation(
    vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "completed",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            baselineVersionHash: "hash-1",
            jobFingerprint: "fp-1",
            generationContractVersion: "studio-artifacts-v1",
            resumeResult: {
              artifactType: "resume",
              generationState: "generated_needs_correction",
              qualityStatus: "needs_refinement",
              preview: {
                heading: { name: "Test Candidate", contactLine: "test@example.com" },
                summary: "Low quality resume preview with",
                experience: [
                  {
                    company:
                      "Designed and built a full-stack production platform for Conquest of Fates (cof.gg), a sci-fi trading card game",
                    roleTitle: "Technical Architect & Full",
                    bullets: [
                      "Led support operations and improved team performance with",
                      "Designed and built a full-stack production platform for Conquest of Fates (cof.gg), a sci-fi trading card game.",
                    ],
                  },
                ],
                education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                competencies: ["Customer strategy", "Operational leadership"],
              },
              correctionReasons: [
                { code: "incomplete_trailing_fragment", message: "incomplete_trailing_fragment", severity: "warning" },
                { code: "malformed_experience_header:company", message: "malformed_experience_header:company", severity: "warning" },
                { code: "malformed_experience_header:role_title", message: "malformed_experience_header:role_title", severity: "warning" },
              ],
              exportReady: false,
              exports: { docx: false, pdf: false },
              actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
            },
            coverLetterResult: {
              artifactType: "cover_letter",
              generationState: "generated_needs_correction",
              qualityStatus: "needs_refinement",
              preview: { paragraphs: ["Blocked phrase: operating context."] },
              correctionReasons: [{ code: "banned_phrase", message: "banned", severity: "warning" }],
              exportReady: false,
              exports: { docx: false, pdf: false },
              actions: { canEdit: false, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
            },
            resume: {
              status: "completed",
              inputsHash: "ih-1",
              responseBody: { status: "success", preview: { resume: { heading: { name: "Legacy" } } } },
              content: null,
              failureCode: null,
              failureMessage: null,
              startedAt: null,
              completedAt: null,
              failedAt: null,
              metadata: {},
            },
            coverLetter: {
              status: "completed",
              inputsHash: "ih-2",
              responseBody: { status: "success", preview: { coverLetter: { paragraphs: ["Blocked phrase: operating context."] } } },
              content: null,
              failureCode: null,
              failureMessage: null,
              startedAt: null,
              completedAt: null,
              failedAt: null,
              metadata: {},
            },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
            scoring_v2: { score: 94 },
            verification_coverage: {
              totalClaims: 3,
              verifiedClaims: 3,
              inferredClaims: 0,
              unverifiedClaims: 0,
              unverifiedRequirements: [],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/resume")) {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exports: { docx: true, pdf: true },
            preview: {
              resume: {
                heading: { name: "Test Candidate", contactLine: "test@example.com" },
                summary:
                  "Designed and built a full-stack production platform for Conquest of Fates (cof.gg), a sci-fi trading card game. The",
                experience: [
                  {
                    company: "Experience entry needs correction",
                    roleTitle: "",
                    bullets: [
                      "Led support operations and improved team performance.",
                      "Designed and built a full-stack production platform for Conquest of Fates (cof.gg), a sci-fi trading card game.",
                    ],
                  },
                ],
                education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                competencies: ["Customer strategy", "Operational leadership"],
              },
            },
          }),
        );
      }
      if (url.includes("/api/cover-letters")) {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              coverLetter: {
                paragraphs: [
                  "The strongest fit comes from the operating context I have already handled.",
                  "I am applying for this role.",
                  "Sincerely,",
                  "Test Candidate",
                ],
              },
            },
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    }),
  );
}

function setupFetchForManualRegenerateRefresh() {
  let artifactsFetchCount = 0;
  setFetchImplementation(
    vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/studio/artifacts")) {
        artifactsFetchCount += 1;
        const isAfterRegenerate = artifactsFetchCount >= 2;
        return Promise.resolve(
          createResponse({
            status: "completed",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            baselineVersionHash: "hash-1",
            jobFingerprint: "fp-1",
            generationContractVersion: "studio-artifacts-v1",
            resumeResult: {
              artifactType: "resume",
              generationState: isAfterRegenerate ? "generated_usable" : "generated_unusable",
              qualityStatus: isAfterRegenerate ? "pass" : "needs_refinement",
              preview: {
                heading: { name: "Test Candidate", contactLine: "test@example.com" },
                summary: isAfterRegenerate ? "Clean resume preview." : "Low quality resume preview.",
                experience: [
                  {
                    company: "Acme",
                    roleTitle: "Director of Support",
                    bullets: ["Led support operations and improved team performance."],
                  },
                ],
                education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                competencies: ["Customer strategy", "Operational leadership"],
              },
              correctionReasons: isAfterRegenerate
                ? []
                : [{ code: "incomplete_trailing_fragment", message: "incomplete_trailing_fragment", severity: "warning" }],
              exportReady: false,
              exports: { docx: false, pdf: false },
              actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
            },
            coverLetterResult: {
              artifactType: "cover_letter",
              generationState: isAfterRegenerate ? "generated_usable" : "generated_unusable",
              qualityStatus: isAfterRegenerate ? "pass" : "needs_refinement",
              preview: { paragraphs: ["Dear Hiring Team,", isAfterRegenerate ? "Clean cover." : "Blocked phrase: operating context."] },
              correctionReasons: isAfterRegenerate
                ? []
                : [{ code: "banned_phrase", message: "banned_phrase", severity: "warning" }],
              exportReady: false,
              exports: { docx: false, pdf: false },
              actions: { canEdit: false, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
            },
            resume: {
              status: "completed",
              inputsHash: "ih-1",
              responseBody: { status: "success", preview: { resume: { heading: { name: "Legacy" } } } },
              content: null,
              failureCode: null,
              failureMessage: null,
              startedAt: null,
              completedAt: null,
              failedAt: null,
              metadata: {},
            },
            coverLetter: {
              status: "completed",
              inputsHash: "ih-2",
              responseBody: { status: "success", preview: { coverLetter: { paragraphs: ["Legacy"] } } },
              content: null,
              failureCode: null,
              failureMessage: null,
              startedAt: null,
              completedAt: null,
              failedAt: null,
              metadata: {},
            },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
            scoring_v2: { score: 94 },
            verification_coverage: {
              totalClaims: 3,
              verifiedClaims: 3,
              inferredClaims: 0,
              unverifiedClaims: 0,
              unverifiedRequirements: [],
            },
          }),
        );
      }
      if (url.includes("/api/resume/generate")) {
        return Promise.resolve(createResponse({ status: "success" }, { status: 201 }));
      }
      if (url.includes("/api/cover-letters/generate")) {
        return Promise.resolve(createResponse({ status: "success" }, { status: 201 }));
      }
      return Promise.resolve(createResponse({}));
    }),
  );
}

function setupResumeSuccessFetch() {
  setFetchImplementation(
    vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
            scoring_v2: { score: 94 },
            verification_coverage: {
              totalClaims: 3,
              verifiedClaims: 3,
              inferredClaims: 0,
              unverifiedClaims: 0,
              unverifiedRequirements: [],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "ready",
            reasons: [],
            compliance_flags: [],
          }),
        );
      }
      if (url.includes("/api/resume")) {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exports: { docx: true, pdf: true },
            preview: {
              resume: {
                heading: { name: "Test Candidate", contactLine: "test@example.com" },
                summary: "Verified support leader aligned to the role.",
                experience: [
                  {
                    company: "Acme",
                    roleTitle: "Director of Support",
                    bullets: ["Led support operations and improved team performance."],
                  },
                ],
                education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                competencies: ["Customer strategy", "Operational leadership"],
              },
            },
          }),
        );
      }
      if (url.includes("/api/cover-letters")) {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exports: { docx: true, pdf: true },
            preview: {
              coverLetter: {
                paragraphs: [
                  "Dear Hiring Team,",
                  "I bring verified leadership and operational experience aligned to this role.",
                  "Sincerely,",
                  "Test Candidate",
                ],
              },
            },
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    }),
  );
}

describe("Studio generation authority", () => {
  beforeEach(() => {
    clearRecentIntentSignals();
    try {
      const storage = window.localStorage;
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
      for (const key of keys) {
        if (key.startsWith("ttr:studio:auto-generate:")) storage.removeItem(key);
      }
    } catch {
      // ignore
    }
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:studio-export"),
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
    if (actualGetCanonicalNextAction) {
      getCanonicalNextActionMock.mockReset();
      getCanonicalNextActionMock.mockImplementation(actualGetCanonicalNextAction);
    }
    if (actualBuildGenerationProductReadiness) {
      buildGenerationProductReadinessMock.mockReset();
      buildGenerationProductReadinessMock.mockImplementation(actualBuildGenerationProductReadiness);
    }
    if (actualEvaluateStudioTrustGate) {
      evaluateStudioTrustGateMock.mockReset();
      evaluateStudioTrustGateMock.mockImplementation(actualEvaluateStudioTrustGate);
    }
    trackEventMock.mockClear();
    resolveStudioNextMoveMock.mockClear();
    mockRouterReplace.mockClear();
    mockRouterPush.mockClear();
  });

  it("READY shows the live decision branch and honest fallback", async () => {
    getCanonicalNextActionMock.mockReturnValue({
      type: "studio",
      label: "Open Resume & Cover Letter Studio",
      route: "/studio",
      reason: "score >= 70 and readiness ready",
    });
    buildGenerationProductReadinessMock.mockReturnValue({
      generation_readiness: {
        canGenerate: true,
        canExport: true,
        reasonsBlocked: [],
      },
      state: "ALLOWED",
      confidence: "HIGH",
      needsVerification: false,
      tier: "generation_export_allowed",
      canOpenStudio: true,
      generationMode: "verified",
    });
    evaluateStudioTrustGateMock.mockReturnValue({
      allowed: true,
      reason: null,
      generation_readiness: {
        canGenerate: true,
        canExport: true,
        reasonsBlocked: [],
      },
      blocked: false,
      authority: "READY",
      reasons: [],
      verificationIssues: [],
    });
    setupFetch("ready");
    renderStudio({ intent: "generate" });

    await screen.findByTestId("studio-generation-readiness");
    await screen.findByTestId("studio-workflow-authority");

    await screen.findByTestId("studio-resume-ready-panel");
    await screen.findByTestId("studio-cover-ready-panel");
    // Success-state polish: one obvious primary action (apply) and reduced mid-page noise.
    expect(await screen.findByTestId("studio-primary-cta-apply")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-decision-panel")).toBeNull();
    // Advanced improvement tooling is gated behind low confidence.
    expect(screen.queryByTestId("studio-refinement-details")).toBeNull();
    expect(screen.queryByRole("button", { name: /generate resume/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /generate cover letter/i })).toBeNull();
  });

  it("score >= 80 renders generating states (no not-generated empty states) while auto-generation is in flight", async () => {
    let resolveResume: ((value: ReturnType<typeof createResponse>) => void) | null = null;
    let resolveCover: ((value: ReturnType<typeof createResponse>) => void) | null = null;
    const deferredResume = new Promise<ReturnType<typeof createResponse>>((resolve) => {
      resolveResume = resolve;
    });
    const deferredCover = new Promise<ReturnType<typeof createResponse>>((resolve) => {
      resolveCover = resolve;
    });

    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              company: "Acme",
              title: "Director of Support",
              scoring_v2: { score: 92 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "completed",
                inputsHash: "ih-1",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: true, pdf: true },
                  preview: {
                    resume: {
                      heading: { name: "Test Candidate", contactLine: "test@example.com" },
                      summary: "Verified support leader aligned to the role.",
                      experience: [{ company: "Acme", roleTitle: "Director of Support", bullets: ["Delivered results."] }],
                      education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                      competencies: ["Customer strategy"],
                    },
                  },
                },
                content: null,
                failureCode: null,
                failureMessage: null,
                startedAt: null,
                completedAt: null,
                failedAt: null,
                metadata: {},
              },
              coverLetter: {
                status: "failed",
                inputsHash: "ih-2",
                responseBody: null,
                content: null,
                failureCode: "generation_failed",
                failureMessage: "Cover letter failed.",
                startedAt: null,
                completedAt: null,
                failedAt: null,
                metadata: {},
              },
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        if (url.includes("/api/resume/export") || url.includes("/api/cover-letters/export")) {
          return Promise.resolve(createResponse(new Blob(["export"], { type: "application/pdf" })));
        }
        if (url.includes("/api/resume")) {
          return deferredResume;
        }
        if (url.includes("/api/cover-letters")) {
          return deferredCover;
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: "generate" });

    await screen.findByTestId("studio-workflow-authority");

    expect(screen.queryByText("Resume not generated yet")).toBeNull();
    expect(screen.queryByText("Cover letter not generated yet")).toBeNull();

    await waitFor(() => {
      expect(within(screen.getByTestId("studio-workflow-authority")).getByTestId("workflow-authority-headline")).toBeInTheDocument();
    });

    resolveResume?.(
      createResponse({
        status: "success",
        generationStatus: "success",
        exports: { docx: true, pdf: true },
        preview: {
          resume: {
            heading: { name: "Test Candidate", contactLine: "test@example.com" },
            summary: "Verified support leader aligned to the role.",
            experience: [{ company: "Acme", roleTitle: "Director of Support", bullets: ["Delivered results."] }],
            education: [{ degree: "BA", institution: "State University", location: "Remote" }],
            competencies: ["Customer strategy"],
          },
        },
      }),
    );
    resolveCover?.(
      createResponse({
        status: "success",
        generationStatus: "success",
        exports: { docx: true, pdf: true },
        preview: {
          coverLetter: { paragraphs: ["Dear Hiring Team,", "Sincerely,", "Test Candidate"] },
        },
      }),
    );
  });

  // NOTE: Manual regenerate refresh behavior is validated via runtime instrumentation.

  it("renders resume when response is wrapped under payload.preview.resume (persisted artifacts are the only existence authority)", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              company: "Acme",
              title: "Director of Support",
              scoring_v2: { score: 92 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "completed",
                responseBody: {
                  payload: {
                    preview: {
                      resume: {
                        heading: { name: "Test Candidate", contactLine: "test@example.com" },
                        summary: "Verified support leader aligned to the role.",
                        experience: [{ company: "Acme", roleTitle: "Director of Support", bullets: ["Delivered results."] }],
                        education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                        competencies: ["Customer strategy"],
                      },
                    },
                  },
                },
              },
              coverLetter: {
                status: "completed",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: true, pdf: true },
                  preview: { coverLetter: { paragraphs: ["Dear Hiring Team,", "Sincerely,", "Test Candidate"] } },
                },
              },
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        if (url.includes("/api/resume/export") || url.includes("/api/cover-letters/export")) {
          return Promise.resolve(createResponse(new Blob(["export"], { type: "application/pdf" })));
        }
        if (url.includes("/api/resume") || url.includes("/api/cover-letters")) {
          return Promise.resolve(createResponse({ status: "success" }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: "generate" });

    await screen.findByTestId("studio-workflow-authority");
    await screen.findByTestId("studio-resume-ready-panel");
    expect(screen.queryByText("Resume not generated yet")).toBeNull();
  });

  it("renders resume when response is wrapped under payload.resume (persisted artifacts are the only existence authority)", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              company: "Acme",
              title: "Director of Support",
              scoring_v2: { score: 92 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "completed",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "completed",
                responseBody: {
                  payload: {
                    resume: {
                      heading: { name: "Test Candidate", contactLine: "test@example.com" },
                      summary: "Verified support leader aligned to the role.",
                      experience: [{ company: "Acme", roleTitle: "Director of Support", bullets: ["Delivered results."] }],
                      education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                      competencies: ["Customer strategy"],
                    },
                  },
                },
              },
              coverLetter: {
                status: "completed",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exports: { docx: true, pdf: true },
                  preview: { coverLetter: { paragraphs: ["Dear Hiring Team,", "Sincerely,", "Test Candidate"] } },
                },
              },
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        if (url.includes("/api/resume/export") || url.includes("/api/cover-letters/export")) {
          return Promise.resolve(createResponse(new Blob(["export"], { type: "application/pdf" })));
        }
        if (url.includes("/api/resume") || url.includes("/api/cover-letters")) {
          return Promise.resolve(createResponse({ status: "success" }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: "generate" });

    await screen.findByTestId("studio-workflow-authority");
    await screen.findByTestId("studio-resume-ready-panel");
    expect(screen.queryByText("Resume not generated yet")).toBeNull();
  });

  it("does not restart auto-generation when baselineVersionId is missing initially (artifacts already exist)", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: null,
              company: "Acme",
              title: "Director of Support",
              scoring_v2: { score: 92 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        if (url.includes("/api/resume/export") || url.includes("/api/cover-letters/export")) {
          return Promise.resolve(createResponse(new Blob(["export"], { type: "application/pdf" })));
        }
        if (url.includes("/api/resume")) {
          return Promise.resolve(
            createResponse({
              status: "success",
              generationStatus: "success",
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Test Candidate", contactLine: "test@example.com" },
                  summary: "Verified support leader aligned to the role.",
                  experience: [{ company: "Acme", roleTitle: "Director of Support", bullets: ["Delivered results."] }],
                  education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                  competencies: ["Customer strategy"],
                },
              },
            }),
          );
        }
        if (url.includes("/api/cover-letters")) {
          return Promise.resolve(
            createResponse({
              status: "success",
              generationStatus: "success",
              exports: { docx: true, pdf: true },
              preview: { coverLetter: { paragraphs: ["Dear Hiring Team,", "Sincerely,", "Test Candidate"] } },
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ baselineVersionId: null });

    await waitFor(() => {
      expect(screen.queryByTestId("studio-generation-ready-shell")).toBeNull();
    });

    const attempted = trackEventMock.mock.calls.filter((call) => call[0] === "resume_generation_attempted");
    expect(attempted).toHaveLength(0);
  });

  it("does not hydrate /api/studio/artifacts until baselineVersionId is available", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls: string[] = [];
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        calls.push(url);
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: null,
              scoring_v2: { score: 92 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ baselineVersionId: null });

    await waitFor(() => {
      expect(calls.some((c) => c.includes("/api/studio/artifacts"))).toBe(false);
    });

    const combinedLogs = [...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .map((call) => call.map((value) => String(value)).join(" "))
      .join("\n");
    expect(combinedLogs).not.toContain("Missing baselineVersionId; attempting to resolve from baseline versions");

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("hydrates /api/studio/artifacts once baselineVersionId is present", async () => {
    const calls: string[] = [];
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        calls.push(url);
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              scoring_v2: { score: 92 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/studio/artifacts")) {
          return Promise.resolve(
            createResponse({
              status: "missing",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "fp-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: null,
              coverLetter: null,
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ baselineVersionId: "base-version-1" });

    await waitFor(() => {
      expect(calls.some((c) => c.includes("/api/studio/artifacts"))).toBe(true);
    });
  });

  it("does not show lifecycle failure language once usable output exists (resume succeeds, cover fails)", async () => {
    buildGenerationProductReadinessMock.mockReturnValue({
      generation_readiness: {
        canGenerate: true,
        canExport: true,
        reasonsBlocked: [],
      },
      state: "ALLOWED",
      confidence: "HIGH",
      needsVerification: false,
      tier: "generation_export_allowed",
      canOpenStudio: true,
      generationMode: "verified",
    });
    evaluateStudioTrustGateMock.mockReturnValue({
      allowed: true,
      reason: null,
      generation_readiness: {
        canGenerate: true,
        canExport: true,
        reasonsBlocked: [],
      },
      blocked: false,
      authority: "READY",
      reasons: [],
      verificationIssues: [],
    });
    setFetchImplementation(
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/baselines/base-1/versions")) {
          return Promise.resolve(
            createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
          );
        }
        if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "analysis-1",
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
              company: "Acme",
              title: "Director of Support",
              scoring_v2: { score: 92 },
              verification_coverage: {
                totalClaims: 3,
                verifiedClaims: 3,
                inferredClaims: 0,
                unverifiedClaims: 0,
                unverifiedRequirements: [],
              },
            }),
          );
        }
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        if (url.includes("/api/resume") && init?.method === "POST") {
          return Promise.resolve(
            createResponse({
              status: "success",
              generationStatus: "success",
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Test Candidate", contactLine: "test@example.com" },
                  summary: "Verified support leader aligned to the role.",
                  experience: [{ company: "Acme", roleTitle: "Director of Support", bullets: ["Delivered results."] }],
                  education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                  competencies: ["Customer strategy"],
                },
              },
            }),
          );
        }
        if (url.includes("/api/cover-letters") && init?.method === "POST") {
          return Promise.resolve(createResponse({ message: "Cover letter failed." }, false, 500));
        }
        if (url.includes("/api/resume/export") || url.includes("/api/cover-letters/export")) {
          return Promise.resolve(createResponse(new Blob(["export"], { type: "application/pdf" })));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio({ intent: "generate" });

    // When cover generation fails but resume is available, Studio should avoid the total-failure lifecycle copy.
    await screen.findByTestId("studio-workflow-authority");
    await waitFor(() => {
      expect(screen.queryByText(/generation did not complete/i)).toBeNull();
      expect(screen.queryByText(/resume generation did not complete/i)).toBeNull();
      expect(screen.queryByText(/cover letter generation did not complete/i)).toBeNull();
      expect(screen.queryByText(/previous attempt could not be completed/i)).toBeNull();
    });
  });

  it("score < 80 preserves manual generation CTAs", async () => {
    setupFetch("ready", 79);
    renderStudio({ intent: "generate" });

    await screen.findByTestId("studio-instant-draft-hero");

    // Manual flow: generation remains a user action (vs. score >= 80 auto-generation).
    expect(screen.queryByTestId("studio-primary-cta-apply")).toBeNull();
    expect(screen.getAllByRole("button", { name: /generate resume/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /generate cover letter/i }).length).toBeGreaterThan(0);
  }); 

  it("BLOCKED shows blocked status and remediation CTA", async () => { 
    setupFetch("blocked", 75); 
    renderStudio(); 
 
    const blockedMessage = await screen.findByTestId("studio-blocked-message"); 
    expect(blockedMessage).toHaveTextContent(/can.?t generate/i); 
    expect(screen.getAllByRole("link", { name: /strengthen my experience/i }).length).toBeGreaterThan(0); 
  }); 
 
  it("score >= 80 does not block on readiness BLOCKED (generate-now contract)", async () => {
    setupFetch("blocked", 84);
    renderStudio({ intent: "generate" });

    await screen.findByTestId("studio-generation-readiness");
    await waitFor(() => {
      expect(screen.queryByTestId("studio-blocked-message")).toBeNull();
      expect(screen.queryByText(/needs another pass/i)).toBeNull();
      expect(screen.queryByTestId("studio-artifact-quality-panel")).toBeNull();
    });

    const readyShell = screen.queryByTestId("studio-generation-ready-shell");
    if (readyShell) {
      expect(within(readyShell).queryByTestId("studio-generation-ready-primary")).toBeNull();
      expect(within(readyShell).getByTestId("studio-generation-ready-secondary")).toBeInTheDocument();
    }

    // Score >= 80 may still show manual "Generate" CTAs while artifacts are missing.

    await waitFor(() => {
      expect(screen.queryByTestId("studio-generation-ready-shell") || screen.queryByTestId("studio-auto-adjust-panel")).not.toBeNull();
    });
  });

  it("blocked readiness renders remediation UI (no auto-redirect)", async () => {
    setupFetch("blocked", 75);
    renderStudio();

    await screen.findByTestId("studio-blocked-message");

    // Blocked states should not silently bounce users around; they should present remediation actions.
    expect(screen.getByTestId("studio-blocked-primary-action")).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/results/));
  });

  // Removed legacy skipped tests to avoid accumulating dead coverage in this suite.

  it("shows targeted strengthening guidance for refine intent", async () => {
    recordArtifactRefineIntent();
    setupFetch("limited", 79);
    renderStudio();

    const guidance = await screen.findByTestId("studio-strengthening-guidance");
    expect(guidance).toHaveTextContent("Fastest ways to strengthen this");
    expect(guidance).toHaveTextContent(/Clarify|Strengthen|Add measurable outcomes|Add incident management/i);
  });


});
