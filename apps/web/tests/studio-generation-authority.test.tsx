import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { fireEvent } from "@testing-library/react";
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
    expect(
      within(resumeSection as HTMLElement).getAllByText(/failed quality checks/i).length,
    ).toBeGreaterThan(0);
    expect(within(resumeSection as HTMLElement).queryByText("Download DOCX")).toBeNull();
    expect(within(resumeSection as HTMLElement).queryByText("Download PDF")).toBeNull();
  });

  it("renders cover letter preview but blocks export when cover letter quality fails", async () => {
    setupFetchWithQualityFailures();
    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-cover-quality-warning")).toBeInTheDocument();
    });

    const coverSection = screen.getByRole("heading", { name: "Cover letter" }).closest("section");
    expect(coverSection).toBeTruthy();
    expect(
      within(coverSection as HTMLElement).getAllByText(/failed quality checks/i).length,
    ).toBeGreaterThan(0);
    expect(within(coverSection as HTMLElement).queryByText("Download DOCX")).toBeNull();
    expect(within(coverSection as HTMLElement).queryByText("Download PDF")).toBeNull();
  });
});

describe("Studio manual regenerate after retry cap", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    clearRecentIntentSignals();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
  });

  it("clicking Regenerate requests both artifact generation paths (resume + cover)", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    // Ensure a Storage-like localStorage is available for retry-count persistence.
    if (typeof (globalThis as unknown as { localStorage?: unknown }).localStorage !== "object" ||
      typeof (globalThis as unknown as { localStorage?: Storage }).localStorage?.getItem !== "function" ||
      typeof (globalThis as unknown as { localStorage?: Storage }).localStorage?.setItem !== "function") {
      const store = new Map<string, string>();
      (globalThis as unknown as { localStorage: Storage }).localStorage = {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => {
          store.set(key, String(value));
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
          return store.size;
        },
      } as unknown as Storage;
    }

    // Ensure readiness gates allow manual regeneration to proceed (bypassReadinessGate still expects
    // the broader Studio contract to be in a generate-capable state for some guard paths).
    getCanonicalNextActionMock.mockReturnValue({
      type: "studio",
      label: "Open Resume & Cover Letter Studio",
      route: "/studio",
      reason: "test override",
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

    const resumeResponseWithQualityFailures = () =>
      createResponse({
        status: "success",
        generationStatus: "success",
        exports: { docx: true, pdf: true },
        preview: {
          resume: {
            heading: { name: "Test Candidate", contactLine: "test@example.com" },
            summary: "Designed and built the",
            experience: [{ company: "Acme", roleTitle: "Director of Support", bullets: ["Did work."] }],
            education: [{ degree: "BA", institution: "State University", location: "Remote" }],
            competencies: ["Customer strategy"],
          },
        },
      });

    const coverResponseWithQualityFailures = () =>
      createResponse({
        status: "success",
        generationStatus: "success",
        exportReady: true,
        exports: { docx: true, pdf: true },
        preview: {
          coverLetter: {
            paragraphs: ["The strongest fit comes from the operating context I have already handled.", "Second paragraph."],
          },
        },
      });

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

        if (method === "POST" && url.endsWith("/api/resume")) {
          return Promise.resolve(resumeResponseWithQualityFailures());
        }
        if (method === "POST" && url.endsWith("/api/cover-letters")) {
          return Promise.resolve(coverResponseWithQualityFailures());
        }
        if (method === "GET" && url.includes("/api/resume")) {
          return Promise.resolve(resumeResponseWithQualityFailures());
        }
        if (method === "GET" && url.includes("/api/cover-letters")) {
          return Promise.resolve(coverResponseWithQualityFailures());
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();

    // With generated-but-unusable artifacts and quality failures, the manual Regenerate button should appear.
    await screen.findByTestId("studio-regenerate-after-retry-cap");
    await screen.findByTestId("studio-regenerate-after-retry-cap-cover");

    await waitFor(() => {
      expect(screen.getByTestId("studio-regenerate-after-retry-cap")).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId("studio-regenerate-after-retry-cap"));
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        "[studio][manual_regenerate_clicked]",
        expect.anything(),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "[studio][manual_regenerate_start]",
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/resume"))).toBe(true);
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/api/cover-letters"))).toBe(true);
    });

    await waitFor(() => {
      expect(infoSpy).toHaveBeenCalledWith("[studio][manual_regenerate_resume_requested]", expect.anything());
      expect(infoSpy).toHaveBeenCalledWith("[studio][manual_regenerate_cover_requested]", expect.anything());
      expect(infoSpy).toHaveBeenCalledWith("[studio][manual_regenerate_result]", expect.anything());
    });

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});

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

    const readyShell = await screen.findByTestId("studio-generation-ready-shell");
    // READY contract: generation auto-starts; only secondary CTA is rendered.
    expect(within(readyShell).queryByTestId("studio-generation-ready-primary")).toBeNull();
    expect(within(readyShell).getByTestId("studio-generation-ready-secondary")).toHaveTextContent("Open workspace");

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

    const readyShell = await screen.findByTestId("studio-generation-ready-shell");
    // READY contract: generation auto-starts; only secondary CTA is rendered.
    expect(within(readyShell).queryByTestId("studio-generation-ready-primary")).toBeNull();

    expect(screen.queryByText("Resume not generated yet")).toBeNull();
    expect(screen.queryByText("Cover letter not generated yet")).toBeNull();

    await waitFor(() => {
      expect(within(screen.getByTestId("studio-workflow-authority")).getByTestId("workflow-authority-headline")).toHaveTextContent(
        /Generating your documents/i,
      );
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

  it("renders resume when response is wrapped under payload.preview.resume (late hydration must recompute)", async () => {
    let resolveResume: ((value: ReturnType<typeof createResponse>) => void) | null = null;
    const deferredResume = new Promise<ReturnType<typeof createResponse>>((resolve) => {
      resolveResume = resolve;
    });

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
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        if (url.includes("/api/resume/export") || url.includes("/api/cover-letters/export")) {
          return Promise.resolve(createResponse(new Blob(["export"], { type: "application/pdf" })));
        }
        if (url.includes("/api/resume")) return deferredResume;
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

    renderStudio({ intent: "generate" });

    const readyShell = await screen.findByTestId("studio-generation-ready-shell");
    // READY contract: generation auto-starts; only secondary CTA is rendered.
    expect(within(readyShell).queryByTestId("studio-generation-ready-primary")).toBeNull();

    await screen.findByTestId("studio-primary-cta-complete-resume");
    expect(screen.queryByText("Resume not generated yet")).toBeNull();

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

    // Resume preview should render once the wrapped payload is normalized; no CTA clicks required.
    await screen.findByTestId("studio-resume-ready-panel");
    expect(screen.queryByText("Resume not generated yet")).toBeNull();
  });

  it("renders resume when response is wrapped under payload.resume (contract must normalize)", async () => {
    let resolveResume: ((value: ReturnType<typeof createResponse>) => void) | null = null;
    const deferredResume = new Promise<ReturnType<typeof createResponse>>((resolve) => {
      resolveResume = resolve;
    });

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
        if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
          return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
        }
        if (url.includes("/api/resume/export") || url.includes("/api/cover-letters/export")) {
          return Promise.resolve(createResponse(new Blob(["export"], { type: "application/pdf" })));
        }
        if (url.includes("/api/resume")) return deferredResume;
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

    renderStudio({ intent: "generate" });

    const readyShell = await screen.findByTestId("studio-generation-ready-shell");
    // READY contract: generation auto-starts; only secondary CTA is rendered.
    expect(within(readyShell).queryByTestId("studio-generation-ready-primary")).toBeNull();

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

    // Resume should land in a ready state once generation succeeds.
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

    await screen.findByTestId("studio-generation-ready-shell");
    expect(screen.queryByText("Resume not generated yet")).toBeNull();

    const attempted = trackEventMock.mock.calls.filter((call) => call[0] === "resume_generation_attempted");
    expect(attempted).toHaveLength(0);
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

    const readyShell = await screen.findByTestId("studio-generation-ready-shell");
    // READY contract: generation auto-starts; only secondary CTA is rendered.
    expect(within(readyShell).queryByTestId("studio-generation-ready-primary")).toBeNull();

    // When cover generation fails but resume succeeds, we should still reflect resume-ready state (no total failure).
    await screen.findByTestId("studio-primary-cta-complete-cover");

    const authority = screen.getByTestId("studio-workflow-authority");
    expect(within(authority).getByTestId("workflow-authority-headline")).toBeInTheDocument();
    expect(screen.queryByText(/generation did not complete/i)).toBeNull();
    expect(screen.queryByText(/resume generation did not complete/i)).toBeNull();
    expect(screen.queryByText(/cover letter generation did not complete/i)).toBeNull();
    expect(screen.queryByText(/previous attempt could not be completed/i)).toBeNull();
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

    // Score >= 80 auto-generates; no manual "Generate" CTAs on entry.
    expect(screen.queryByRole("button", { name: /generate resume/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /generate cover letter/i })).toBeNull();

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

  it.skip("suppresses 0 / 0 coverage and shows honest fallback", async () => {
    getCanonicalNextActionMock.mockReturnValue({
      type: "studio",
      label: "Open Resume & Cover Letter Studio",
      route: "/studio",
      reason: "score >= 70 and readiness limited",
    });
    buildGenerationProductReadinessMock.mockReturnValue({
      generation_readiness: {
        canGenerate: true,
        canExport: true,
        reasonsBlocked: [],
      },
      state: "ALLOWED",
      confidence: "MEDIUM",
      needsVerification: true,
      tier: "generation_export_allowed",
      canOpenStudio: true,
      generationMode: "draft",
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
      authority: "LIMITED",
      reasons: [],
      verificationIssues: [],
    });
    setupFetch("limited", 88, 0);
    renderStudio();

    await screen.findByRole("heading", { name: /your application is ready/i });
    expect(screen.getByTestId("studio-decision-panel")).toHaveTextContent(/output/i);
    expect(screen.queryByText(/Verified claims:\s*0\s*\/\s*0/i)).toBeNull();
    expect(screen.queryByText(/Verification Coverage:/i)).toBeNull();
  });

  it.skip("renders the completion panel after a valid success response", async () => {
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
        if (url.includes("/api/resume/export")) {
          return Promise.resolve(
            createResponse(new Blob(["resume-export"], { type: "application/pdf" })),
          );
        }
        if (url.includes("/api/cover-letters/export")) {
          return Promise.resolve(createResponse(new Blob(["cover-export"], { type: "application/pdf" })));
        }
        return Promise.resolve(createResponse({}));
      }),
    );

    renderStudio();

    const readyShell = await screen.findByTestId("studio-generation-ready-shell");
    // READY contract: generation auto-starts; only secondary CTA is rendered.
    expect(within(readyShell).queryByTestId("studio-generation-ready-primary")).toBeNull();

    const completionPanel = await screen.findByTestId("studio-resume-ready-panel");
    expect(completionPanel).toHaveTextContent("Your resume is ready. Download or refine below.");
    const handoffPanel = screen.getAllByTestId("studio-opportunities-handoff")[0];
    expect(handoffPanel).toHaveTextContent("Save this role to Opportunities");
    expect(handoffPanel).toHaveTextContent("Save to Opportunities");
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
    expect(screen.queryByRole("button", { name: /generate resume/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /generate cover letter/i })).toBeNull();
    expect(screen.queryByText("Generation blocked")).toBeNull();
  });

  it.skip("reframes completion when the artifact was used and the role was committed", async () => {
    recordArtifactUsedIntent();
    recordOpportunityCommitIntent();
    setupResumeSuccessFetch();
    renderStudio();

    const readyShell = await screen.findByTestId("studio-generation-ready-shell");
    const primary = within(readyShell).queryByTestId("studio-generation-ready-primary");
    if (primary) {
      fireEvent.click(primary);
    } else {
      fireEvent.click(within(readyShell).getByTestId("studio-generation-ready-secondary"));
    }

    await screen.findAllByTestId("studio-opportunities-handoff");
    expect(screen.getAllByTestId("studio-opportunities-handoff").length).toBeGreaterThan(0);
  });

  it.skip("nudges toward saving when the artifact was used but the role is not yet committed", async () => {
    recordArtifactUsedIntent();
    setupResumeSuccessFetch();
    renderStudio();

    const generateResume = await screen.findByRole("button", { name: /generate resume/i });
    fireEvent.click(generateResume);

    const completionPanel = await screen.findByTestId("studio-resume-ready-panel");
    expect(completionPanel).toHaveTextContent("Your resume is ready. Download or refine below.");
  });

  it("shows targeted strengthening guidance for refine intent", async () => {
    recordArtifactRefineIntent();
    setupFetch("limited", 79);
    renderStudio();

    const guidance = await screen.findByTestId("studio-strengthening-guidance");
    expect(guidance).toHaveTextContent("Fastest ways to strengthen this");
    expect(guidance).toHaveTextContent(/Clarify|Strengthen|Add measurable outcomes|Add incident management/i);
  });

  it.skip("tracks commitment intent when saving the role to Opportunities", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: /add to opportunities/i }));

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
