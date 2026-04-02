import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import {
  clearRecentIntentSignals,
  recordArtifactUsedIntent,
  recordArtifactRefineIntent,
  recordOpportunityCommitIntent,
} from "@/src/lib/recentIntent";
import { mockRouterPush, overrideSearchParams, setFetchImplementation } from "./setup";

const trackEventMock = vi.fn();
const resolveStudioNextMoveMock = vi.hoisted(() => vi.fn());
const getCanonicalNextActionMock = vi.hoisted(() => vi.fn());
const buildGenerationProductReadinessMock = vi.hoisted(() => vi.fn());
const evaluateStudioTrustGateMock = vi.hoisted(() => vi.fn());
vi.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));
vi.mock("@/lib/nextAction", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nextAction")>("@/lib/nextAction");
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
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
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
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
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
      if (url.includes("/api/resume") || url.includes("/api/cover-letters")) {
        return Promise.resolve(createResponse({ status: "success" }));
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
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
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
    trackEventMock.mockClear();
    resolveStudioNextMoveMock.mockClear();
    getCanonicalNextActionMock.mockClear();
    buildGenerationProductReadinessMock.mockClear();
    evaluateStudioTrustGateMock.mockClear();
  });

  it("READY shows the live decision branch and honest fallback", async () => {
    setupFetch("ready");
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation is usable.")).toBeInTheDocument();
    });
    const readiness = screen.getByTestId("studio-generation-readiness");
    const decisionPanel = screen.getByTestId("studio-decision-panel");
    expect(readiness).toHaveTextContent(/^Usable/);
    expect(decisionPanel).toHaveTextContent("Acceptable output: usable now, stronger with refinement.");
    expect(decisionPanel).toHaveTextContent(
      "Built directly from verified baseline evidence and aligned to key role requirements.",
    );
    expect(decisionPanel).toHaveTextContent("Why this is still worth using");
    expect(decisionPanel).toHaveTextContent("If you want to sharpen it");
    expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Generate Cover Letter" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Improve baseline" })).toBeInTheDocument();
    expect(screen.getAllByText(/fit score unavailable/i).length).toBeGreaterThan(0);
  });

  it("LIMITED shows limited status and constrained CTA label without Studio Ready copy", async () => {
    setupFetch("limited");
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation is usable.")).toBeInTheDocument();
    });
    const decisionPanel = screen.getByTestId("studio-decision-panel");
    expect(screen.getByTestId("studio-generation-readiness")).toHaveTextContent(/^Usable/);
    expect(screen.queryByText("Ready to generate")).toBeNull();
    expect(decisionPanel).toHaveTextContent("Acceptable output: usable now, stronger with refinement.");
    expect(decisionPanel).toHaveTextContent("Why this is still worth using");
    expect(decisionPanel).toHaveTextContent("If you want to sharpen it");
    expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Generate Cover Letter" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Improve baseline" })).toBeInTheDocument();
  });

  it("BLOCKED shows blocked status and remediation CTA", async () => {
    setupFetch("blocked");
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation blocked")).toBeInTheDocument();
    });
    expect(screen.getByTestId("studio-generation-readiness")).toHaveTextContent(/^Blocked/);
    expect(screen.getByTestId("studio-decision-panel")).toHaveTextContent("Limited output");
    expect(screen.queryByRole("button", { name: "Generate Resume" })).toBeNull();
    expect(screen.getByRole("link", { name: "Start Fit Review" })).toBeInTheDocument();
  });

  it("blocked generation action does not proceed and routes to remediation", async () => {
    setupFetch("blocked", 68);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation blocked")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Generate Resume" })).toBeNull();
    expect(screen.getByTestId("studio-generation-readiness")).toHaveTextContent(/^Blocked/);
    expect(screen.getByRole("link", { name: "Start Fit Review" })).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("suppresses 0 / 0 coverage and shows honest fallback", async () => {
    setupFetch("limited", 88, 0);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation is usable.")).toBeInTheDocument();
    });
    expect(screen.getByTestId("studio-decision-panel")).toHaveTextContent("Acceptable output");
    expect(screen.queryByText(/Verified claims:\s*0\s*\/\s*0/i)).toBeNull();
    expect(screen.queryByText(/Verification Coverage:/i)).toBeNull();
  });

  it("renders the completion panel after a valid success response", async () => {
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
      tier: "generation_export_allowed",
      canOpenStudio: true,
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
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
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
        if (url.includes("/api/resume/export")) {
          return Promise.resolve(
            createResponse(new Blob(["resume-export"], { type: "application/pdf" })),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();

    const generateResume = await screen.findByRole("button", { name: "Generate Resume" });
    fireEvent.click(generateResume);

    const completionPanel = await screen.findByTestId("resume-completion-panel");
    expect(completionPanel).toHaveTextContent("Completed");
    expect(completionPanel).toHaveTextContent("Your export is ready");
    expect(completionPanel).toHaveTextContent(
      "The export matches the draft reviewed in Studio.",
    );
    const handoffPanel = screen.getByTestId("studio-opportunities-handoff");
    expect(handoffPanel).toHaveTextContent("Save this role to Opportunities");
    expect(handoffPanel).toHaveTextContent("Save to Opportunities");
    expect(handoffPanel).toHaveTextContent("Refine baseline later");
    fireEvent.click(screen.getByRole("button", { name: "Download DOCX" }));
    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith(
        "artifact_used_intent",
        expect.objectContaining({
          source: "studio",
          artifactType: "resume",
          action: "export",
          format: "docx",
        }),
      );
    });
    expect(screen.queryByRole("button", { name: "Generate Resume" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Generate Cover Letter" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Generation blocked")).toBeNull();
  });

  it("reframes completion when the artifact was used and the role was committed", async () => {
    recordArtifactUsedIntent();
    recordOpportunityCommitIntent();
    setupResumeSuccessFetch();
    renderStudio();

    const generateResume = await screen.findByRole("button", { name: "Generate Resume" });
    fireEvent.click(generateResume);

    const completionPanel = await screen.findByTestId("resume-completion-panel");
    expect(completionPanel).toHaveTextContent("Your export is ready and tracked");
    expect(completionPanel).toHaveTextContent("Keep momentum in Opportunities");
    expect(screen.getByTestId("studio-opportunities-handoff")).toBeInTheDocument();
  });

  it("nudges toward saving when the artifact was used but the role is not yet committed", async () => {
    recordArtifactUsedIntent();
    setupResumeSuccessFetch();
    renderStudio();

    const generateResume = await screen.findByRole("button", { name: "Generate Resume" });
    fireEvent.click(generateResume);

    const completionPanel = await screen.findByTestId("resume-completion-panel");
    expect(completionPanel).toHaveTextContent("Your export is ready");
    expect(completionPanel).toHaveTextContent("Save this role to Opportunities to keep momentum");
  });

  it("shows targeted strengthening guidance for refine intent", async () => {
    recordArtifactRefineIntent();
    setupFetch("limited");
    renderStudio();

    const guidance = await screen.findByTestId("studio-strengthening-guidance");
    expect(guidance).toHaveTextContent("Fastest ways to strengthen this");
    expect(guidance).toHaveTextContent(/Clarify|Strengthen|Add measurable outcomes|Add incident management/i);
    expect(guidance).toHaveTextContent("Run Fit Review to capture supported evidence.");
  });

  it("tracks commitment intent when saving the role to Opportunities", async () => {
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
      tier: "generation_export_allowed",
      canOpenStudio: true,
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
              jobId: "job-1",
              baselineId: "base-1",
              baselineVersionId: "base-version-1",
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
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();

    fireEvent.click(await screen.findByRole("button", { name: "Generate Resume" }));
    await screen.findByTestId("resume-completion-panel");
    fireEvent.click(screen.getByRole("link", { name: "Save to Opportunities" }));

    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith(
        "opportunity_commit_intent",
        expect.objectContaining({
          source: "studio",
          action: "save",
        }),
      );
    });
  });
});
