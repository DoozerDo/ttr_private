import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage, { resolveStudioAutoGenerationNeed } from "@/app/(app)/studio/page";
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

function expectCanonicalGeneratedArtifactArea() {
  const primaryArtifacts = screen.getByTestId("studio-primary-artifacts");
  const area = within(primaryArtifacts);

  const resumePanel = area.queryByTestId("studio-resume-ready-panel") ?? area.queryByTestId("studio-resume-correction-panel");
  const coverPanel = area.queryByTestId("studio-cover-ready-panel") ?? area.queryByTestId("studio-cover-correction-panel");
  expect(resumePanel).not.toBeNull();
  expect(coverPanel).not.toBeNull();
  expect(area.getByTestId("studio-resume-export")).toBeInTheDocument();
  expect(
    area.queryByTestId("studio-cover-letter-preview-body") ??
      area.queryByTestId("studio-low-quality-cover-preview-main"),
  ).not.toBeNull();
  expect(area.getByTestId("studio-materials-completeness")).toHaveTextContent(
    "Complete set: Resume + cover letter",
  );

  [
    "studio-resume-missing",
    "studio-resume-generating",
    "studio-resume-auto-repairing",
    "studio-resume-artifact-issue",
    "studio-resume-generated-unusable",
    "studio-resume-preview-unavailable",
    "studio-resume-quality-warning",
    "studio-cover-missing",
    "studio-cover-generating",
    "studio-cover-artifact-issue",
    "studio-cover-generated-unusable",
    "studio-cover-tier-gate",
    "studio-cover-preview-unavailable",
    "studio-cover-quality-warning",
  ].forEach((testId) => {
    expect(area.queryByTestId(testId)).toBeNull();
  });

  [
    "studio-invalid-state-fallback",
    "studio-guidance-details",
    "studio-evidence-blocked-panel",
    "studio-generation-state-banner",
    "studio-generation-state-ready",
    "studio-generation-state-blocked",
    "studio-blocked-primary-action",
    "studio-artifact-truth",
  ].forEach((testId) => {
    expect(screen.queryByTestId(testId)).toBeNull();
  });

  [
    /Resume not generated yet/i,
    /Cover letter not generated yet/i,
    /Generation unavailable/i,
    /Repairing resume/i,
    /Repairing cover letter/i,
  ].forEach((pattern) => {
    expect(area.queryByText(pattern)).toBeNull();
  });
}
function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const response = {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
    blob: () => Promise.resolve(new Blob([text], { type: "application/json" })),
  } as const;

  return {
    ...response,
    clone: () => createResponse(body, ok, status),
  };
}

function resolveAutoGenerationSuccess(input: RequestInfo) {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.endsWith("/api/resume")) {
    return Promise.resolve(
      // Resume responses may be wrapped in an outcome envelope; Studio must still render them.
      createResponse({
        status: "success",
        generationStatus: "success",
        payload: {
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
                  bullets: ["Led support operations programs."],
                },
              ],
              education: [{ degree: "BA", institution: "State University", location: "Remote" }],
              competencies: ["Customer strategy", "Operational leadership"],
            },
          },
        },
      }),
    );
  }
  if (url.endsWith("/api/cover-letters")) {
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
              "I'm excited to apply for this role because it sits at the intersection of customer advocacy, operational rigor, and cross-functional leadership. In my recent work, I've owned end-to-end support programs: defining the operating rhythm, partnering with Product and Engineering to reduce root causes, and building clear reporting so leaders can make decisions quickly. I'm comfortable translating messy signals into a plan, and I care about shipping changes that customers can feel.",
              "What I bring to your team is a bias toward measurable outcomes and repeatable systems. I've built workflows that improve time-to-resolution while protecting quality, implemented escalation policies that reduce noise, and created playbooks that help new teammates ramp fast. I also partner closely with stakeholders-Sales, Success, and Product-to ensure support feedback is integrated into roadmap decisions and incident reviews. The goal is always the same: fewer surprises, better customer experiences, and a team that can scale.",
              "I approach writing as a craft as well as a system. That means distilling the role's priorities into clear themes, choosing evidence that directly supports those themes, and keeping the narrative coherent from opening to close. If hired, you can expect a leader who communicates crisply, documents decisions, and sets expectations early so projects don't stall. I'm equally comfortable in high-urgency incidents and in slower, analytical work like building reporting, designing processes, and coaching teammates.",
              "I'd love to bring this approach to your organization and tailor the resume and cover letter to the role's priorities. Thank you for your time and consideration, and I look forward to the opportunity to discuss how I can contribute to a high-trust, high-velocity support operation.",
              "Sincerely,",
              "Alex Candidate",
            ],
          },
        },
      }),
    );
  }
  return Promise.resolve(createResponse({}));
}

function installStrongFitFetches(options?: {
  score?: number;
  analysisRunScore?: number;
  readinessStatus?: "ready" | "limited" | "blocked";
  resumeOk?: boolean;
  coverOk?: boolean;
  studioArtifactsPayload?: any;
}) {
  const score = options?.score ?? 84;
  const analysisRunScore = options?.analysisRunScore ?? score;
  const readinessStatus = options?.readinessStatus ?? "ready";
  const resumeOk = options?.resumeOk ?? true;
  const coverOk = options?.coverOk ?? true;
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/api/baselines/current")) {
      return Promise.resolve(
        createResponse({
          id: "base-1",
          currentVersionId: "base-version-1",
          baselineVersionId: "base-version-1",
          status: "ACTIVE",
        }),
      );
    }
    if (url.includes("/api/baselines/base-1") && !url.includes("/versions")) {
      return Promise.resolve(
        createResponse({
          id: "base-1",
          currentVersionId: "base-version-1",
          baselineVersionId: "base-version-1",
          status: "ACTIVE",
        }),
      );
    }
    if (url.includes("/api/baselines/base-1/versions")) {
      return Promise.resolve(
        createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
      );
    }
    if (url.includes("/api/analysis/fit-assessments")) {
      const assessment = {
        assessmentId: "analysis-1",
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        company: "Acme Corp",
        title: "Customer Operations Manager",
        score,
        scoring_v2: { score },
        scoringV2: { score },
        verification_coverage: {
          totalClaims: 3,
          verifiedClaims: readinessStatus === "ready" ? 3 : 1,
          inferredClaims: readinessStatus === "limited" ? 2 : 0,
          unverifiedClaims: readinessStatus === "limited" ? 1 : 0,
          unverifiedRequirements: readinessStatus === "limited" ? ["Salesforce"] : [],
        },
      };

      // Studio may request a list or a single fit assessment resource depending on route.
      return Promise.resolve(createResponse(url.includes("/api/analysis/fit-assessments/") ? assessment : [assessment]));
    }
    if (url.endsWith("/api/analysis/run") && init?.method === "POST") {
      const analysisRun = {
        assessmentId: "analysis-1",
        id: "analysis-1",
        jobId: "job-1",
        baselineId: "base-1",
        score: analysisRunScore,
        overallScore: analysisRunScore,
        fitScore: analysisRunScore,
        verdict: analysisRunScore >= 80 ? "Apply" : "Review",
        status: "ok",
        strengths: [
          "Led support and development teams of 50+ across North America, EMEA, and APAC while managing a $33M P&L.",
          "Owned global incident and escalation management supporting Fortune 500 customers.",
        ],
        gaps: analysisRunScore >= 80 ? [] : ["People leadership: experience"],
        criticalGaps: analysisRunScore >= 80 ? [] : [{ title: "People leadership: experience" }],
        recommendedActions: analysisRunScore >= 80 ? [] : ["Use stronger people leadership evidence."],
        scoring_v2: { score: analysisRunScore },
        scoringV2: { score: analysisRunScore },
        latestAssessmentSummary: {
          latestFitScore: analysisRunScore,
          latestAssessmentId: "analysis-1",
          hasCompletedAssessment: true,
          latestAssessmentCreatedAt: new Date().toISOString(),
        },
      };

      return Promise.resolve(createResponse(analysisRun));
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
                    code: "personalization_limitation",
                    message: "Some evidence is still lighter than others.",
                  },
                ],
          blocked: readinessStatus === "blocked",
          compliance_flags: [],
        }),
      );
    }
    if (url.includes("/api/studio/artifacts")) {
      if (options?.studioArtifactsPayload) {
        return Promise.resolve(createResponse(options.studioArtifactsPayload));
      }
      // Default to failing the backend hydration call so tests can exercise local-storage hydration.
      return Promise.resolve(createResponse({ message: "not found" }, false, 404));
    }
    if (url.endsWith("/api/resume/generate") && init?.method === "POST") {
      return Promise.resolve(createResponse({}));
    }
    if (url.endsWith("/api/resume") && init?.method === "POST") {
      return resumeOk
        ? resolveAutoGenerationSuccess(input)
        : Promise.resolve(createResponse({ message: "Resume generation failed." }, false, 500));
    }
    if (url.endsWith("/api/cover-letters/generate") && init?.method === "POST") {
      return Promise.resolve(createResponse({}));
    }
    if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
      return coverOk
        ? resolveAutoGenerationSuccess(input)
        : Promise.resolve(createResponse({ message: "Cover letter generation failed." }, false, 500));
    }
    if (url.includes("/api/opportunities") && init?.method === "POST") {
      return Promise.resolve(
        createResponse({
          id: "opp-1",
          status: "SAVED",
          updatedAt: new Date().toISOString(),
          jobId: "job-1",
          baselineId: "base-1",
        }),
      );
    }
    return resolveAutoGenerationSuccess(input);
  });
  setFetchImplementation(fetchMock);
  return fetchMock;
}

function countPostCalls(fetchMock: ReturnType<typeof vi.fn>, suffix: string) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const pathname = (() => {
      try {
        return new URL(url, "http://localhost").pathname;
      } catch {
        return url;
      }
    })();
    return pathname.endsWith(suffix) && (init as RequestInit | undefined)?.method === "POST";
  }).length;
}

function readPostBodies(fetchMock: ReturnType<typeof vi.fn>, suffix: string): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([input, init]) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      const pathname = (() => {
        try {
          return new URL(url, "http://localhost").pathname;
        } catch {
          return url;
        }
      })();
      return pathname.endsWith(suffix) && (init as RequestInit | undefined)?.method === "POST";
    })
    .map(([, init]) => {
      const body = (init as RequestInit | undefined)?.body;
      if (typeof body !== "string") return {};
      try {
        return JSON.parse(body) as Record<string, unknown>;
      } catch {
        return {};
      }
    });
}

function readOrchestrationDebugSnapshot(): Record<string, any> {
  const debug = screen.getByTestId("studio-orchestration-debug");
  const raw = debug.querySelector("pre")?.textContent ?? "";
  expect(raw).toBeTruthy();
  return JSON.parse(raw) as Record<string, any>;
}

describe("Studio auto-generation", () => {
  beforeEach(() => {
    try {
      const storage = window.localStorage;
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
      for (const key of keys) {
        if (key.startsWith("ttr:studio:auto-generate:")) storage.removeItem(key);
      }
    } catch {
      // ignore
    }
    try {
      (window as any).__ttrStudioAutoGenerationLatchStore = new Map();
      (window as any).__ttrStudioGenerationScopeGuardStore = new Map();
    } catch {
      // ignore
    }
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("hydrates artifacts after resolving baselineVersionId from versions when initially missing", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }

      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 84 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: null,
            verification_coverage: { totalClaims: 1, verifiedClaims: 1, inferredClaims: 0, unverifiedClaims: 0, unverifiedRequirements: [] },
          }),
        );
      }

      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }

      if (url.includes("/api/studio/artifacts")) {
        const parsed = new URL(url, "http://localhost");
        expect(parsed.searchParams.get("baselineId")).toBe("base-1");
        expect(parsed.searchParams.get("jobId")).toBe("job-1");
        expect(parsed.searchParams.get("baselineVersionId")).toBe("base-version-1");
        expect(parsed.searchParams.get("analysisId")).toBe("analysis-1");

        return Promise.resolve(
          createResponse({
            resume: {
              status: "completed",
              // Simulate a backend that stores response bodies as JSON strings.
              responseBody: JSON.stringify({
                status: "success",
                generationStatus: "success",
                payload: {
                  status: "success",
                  generationStatus: "success",
                  exportReady: true,
                  exports: { docx: true, pdf: true },
                  preview: {
                    resume: {
                      heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                      summary: "Support leader focused on scalable operations.",
                      experience: [{ company: "Acme", roleTitle: "Manager", bullets: ["Led support operations."] }],
                    },
                  },
                },
              }),
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
                      "I bring verified leadership and operational experience aligned to this role.",
                      "Sincerely,",
                      "Alex Candidate",
                    ],
                  },
                },
              },
            },
          }),
        );
      }

      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return resolveAutoGenerationSuccess(input);
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return resolveAutoGenerationSuccess(input);
      }

      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    const rendered = renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    }, { timeout: 6000 });
  }, 15000);

  it("clears a stale failed latch after hydration when generation succeeds", async () => {
    overrideSearchParams({});

    const originalLocalStorage = window.localStorage;
    const memoryStorage = (() => {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          // Simulate a stale "failed" latch from a previous run surviving into the moment the
          // current generation is about to start.
          if (key.startsWith("ttr:studio:auto-generate:") && value === "started") {
            store.set(key, "failed");
            return;
          }
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
        _dump: () => store,
      } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear"> & { _dump: () => Map<string, string> };
    })();

    Object.defineProperty(window, "localStorage", {
      value: memoryStorage,
      configurable: true,
    });

    const fetchMock = installStrongFitFetches({ readinessStatus: "ready" });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const rendered = renderStudio();

    expect(countPostCalls(fetchMock, "/api/resume/generate")).toBe(0);
    expect(countPostCalls(fetchMock, "/api/cover-letters/generate")).toBe(0);

    await act(async () => {
      overrideSearchParams({
        analysisId: "analysis-1",
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
      });
      rendered.rerender(
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

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThan(0);
      expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThan(0);
    }, { timeout: 6000 });

    const lastSignature = memoryStorage.getItem("ttr:studio:auto-generate:last-signature");
    expect(lastSignature).toBeTruthy();
    if (lastSignature) {
      const signatureKey = `ttr:studio:auto-generate:${lastSignature}`;
      // The contract must clear the "failed" latch injected at `started` time and persist a final value.
      expect(["succeeded", "failed"]).toContain(memoryStorage.getItem(signatureKey));
      expect(memoryStorage.getItem(signatureKey)).not.toBe("started");
    }

    expect(consoleError).not.toHaveBeenCalledWith(
      "INVALID STATE: ready without generation or artifacts",
      expect.anything(),
    );
    consoleError.mockRestore();
    Object.defineProperty(window, "localStorage", { value: originalLocalStorage, configurable: true });
  }, 15000);

  it("auto-generates resume and cover letter on Studio entry for strong fits", async () => {
    const fetchMock = installStrongFitFetches({ readinessStatus: "ready" });

    renderStudio();

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThan(0);
      expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThan(0);
    }, { timeout: 6000 });

    const resumeBodies = readPostBodies(fetchMock, "/api/resume");
    const coverBodies = readPostBodies(fetchMock, "/api/cover-letters");
    expect(resumeBodies.length).toBeGreaterThanOrEqual(1);
    expect(coverBodies.length).toBeGreaterThanOrEqual(1);
    expect(
      resumeBodies.some((body) => body?.forceRegenerate === true && body?.regenerationSource === "shell_auto"),
    ).toBe(true);
    expect(
      coverBodies.some((body) => body?.forceRegenerate === true && body?.regenerationSource === "shell_auto"),
    ).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/resume"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/cover-letters"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/opportunities"),
      expect.objectContaining({ method: "POST" }),
    );
  }, 15000);

  it("clears a hydrated unsupported_input resume artifactFailure after a successful fresh generation even if artifacts re-hydration is stale", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const score = 84;
    let artifactsFetchCount = 0;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/current")) {
        return Promise.resolve(
          createResponse({
            id: "base-1",
            currentVersionId: "base-version-1",
            baselineVersionId: "base-version-1",
            status: "ACTIVE",
          }),
        );
      }
      if (url.includes("/api/baselines/base-1") && !url.includes("/versions")) {
        return Promise.resolve(
          createResponse({
            id: "base-1",
            currentVersionId: "base-version-1",
            baselineVersionId: "base-version-1",
            status: "ACTIVE",
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments")) {
        const assessment = {
          assessmentId: "analysis-1",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme Corp",
          title: "Customer Operations Manager",
          score,
          overallScore: score,
          overall_score: score,
          scoring_v2: { score },
          scoringV2: { score },
          verification_coverage: {
            totalClaims: 3,
            verifiedClaims: 3,
            inferredClaims: 0,
            unverifiedClaims: 0,
            unverifiedRequirements: [],
          },
        };
        return Promise.resolve(createResponse(url.includes("/api/analysis/fit-assessments/") ? assessment : [assessment]));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], blocked: false, compliance_flags: [] }));
      }
      if (url.includes("/api/studio/artifacts")) {
        artifactsFetchCount += 1;
        // First hydration (and the immediate post-generate refresh) both return the stale failed resume record.
        return Promise.resolve(
          createResponse({
            status: "failed",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            generationContractVersion: "studio-artifacts-v1",
            artifact: {
              hasResume: false,
              hasCoverLetter: true,
              pairStatus: "failed",
              generating: false,
              failure: { code: "generation_failed", message: "Resume failed; cover succeeded." },
            },
            resume: {
              status: "FAILED",
              responseBody: null,
              content: null,
              failureCode: "unsupported_input",
              failureMessage: "verified content was insufficient to build a valid resume structure",
              confidence: "LOW",
              failure: null,
            },
            coverLetter: {
              status: "COMPLETED",
              usableCurrent: true,
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: true,
                exports: { docx: true, pdf: true },
                preview: { coverLetter: { paragraphs: ["Hello"] } },
              },
              content: "Hello",
              confidence: "HIGH",
              failure: null,
            },
          }),
        );
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return resolveAutoGenerationSuccess(input);
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return resolveAutoGenerationSuccess(input);
      }
      if (url.includes("/api/opportunities") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            id: "opp-1",
            status: "SAVED",
            updatedAt: new Date().toISOString(),
            jobId: "job-1",
            baselineId: "base-1",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      // Hydration must run at least once.
      expect(artifactsFetchCount).toBeGreaterThan(0);
      // Failure UI should be present before retry.
      expect(screen.queryAllByRole("button", { name: /retry generation/i }).length).toBeGreaterThan(0);
    }, { timeout: 15000 });

    await act(async () => {
      screen.getAllByRole("button", { name: /retry generation/i })[0].click();
    });

    await waitFor(() => {
      const debug = screen.getByTestId("studio-orchestration-debug");
      const raw = debug.querySelector("pre")?.textContent ?? "";
      expect(raw).toContain("\"artifactFailure\": null");
      expect(raw).toContain("\"status\": \"success\"");
    }, { timeout: 15000 });
  }, 20000);

  it("does not allow persisted unsupported_input failure to override a usable resumeResponseWithResult during backend reconciliation", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const score = 84;
	    const fetchMock = installStrongFitFetches({
      score,
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "failed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        artifact: {
          hasResume: true,
          hasCoverLetter: true,
          pairStatus: "failed",
          generating: false,
          failure: { code: "generation_failed", message: "Backend recorded a failure earlier." },
        },
        // Persisted record indicates failure...
        resume: {
          status: "FAILED",
          responseBody: null,
          content: null,
          failureCode: "unsupported_input",
          failureMessage: "verified content was insufficient to build a valid resume structure",
          confidence: "LOW",
          failure: null,
        },
        // ...but canonical result contains a usable success + generated_needs_correction state.
        resumeResult: {
          generationState: "generated_needs_correction",
          qualityStatus: "pass",
          preview: {
            heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
            experience: [{ company: "Acme", roleTitle: "Manager", bullets: ["Did the work."] }],
          },
          display: { title: "Resume generated successfully" },
        },
        coverLetter: {
          status: "COMPLETED",
          usableCurrent: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
        coverLetterResult: {
          generationState: "generated",
          qualityStatus: "pass",
          preview: { paragraphs: ["Hello"] },
          display: { title: "Cover letter generated successfully" },
        },
      },
    });

    renderStudio();

    await waitFor(() => {
      const debug = screen.getByTestId("studio-orchestration-debug");
      const raw = debug.querySelector("pre")?.textContent ?? "";
      expect(raw).toContain("\"generationState\": \"generated_needs_correction\"");
      expect(raw).toContain("\"status\": \"success\"");
      expect(raw).toContain("\"artifactFailure\": null");
    }, { timeout: 15000 });

    // Sanity: hydration happened (no generation required for this test).
    expect(countPostCalls(fetchMock, "/api/resume")).toBe(0);
  }, 15000);

  it("does not let a persisted failed latch block auto-generation when the contract is READY", async () => {
    const originalLocalStorage = window.localStorage;
    const memoryStorage = (() => {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
        _dump: () => store,
      } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear"> & { _dump: () => Map<string, string> };
    })();

    Object.defineProperty(window, "localStorage", {
      value: memoryStorage,
      configurable: true,
    });

    // Hydrated signature (valid IDs) already has a failed latch from a previous attempt.
    const signature = "autoGen:v1:base-version-1:job-1:analysis-1";
    memoryStorage.setItem(`ttr:studio:auto-generate:${signature}`, "failed");
    memoryStorage.setItem("ttr:studio:auto-generate:last-signature", signature);

    const fetchMock = installStrongFitFetches({ readinessStatus: "ready" });

    renderStudio();

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThan(0);
      expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThan(0);
    }, { timeout: 6000 });

    Object.defineProperty(window, "localStorage", { value: originalLocalStorage, configurable: true });
  }, 15000);

  it("does not auto-generate when readiness is blocked (even if score >= 80)", async () => {
    const fetchMock = installStrongFitFetches({ readinessStatus: "blocked" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    }, { timeout: 6000 });

    expect(countPostCalls(fetchMock, "/api/resume")).toBe(0);
    expect(countPostCalls(fetchMock, "/api/cover-letters")).toBe(0);
  }, 15000);

  it("auto-generates when orchestration is eligible and the artifact pair is failed but no usable artifacts are persisted", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
    const score = 90;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/current")) {
        return Promise.resolve(
          createResponse({
            id: "base-1",
            currentVersionId: "base-version-1",
            baselineVersionId: "base-version-1",
            status: "ACTIVE",
          }),
        );
      }
      if (url.includes("/api/baselines/base-1") && !url.includes("/versions")) {
        return Promise.resolve(
          createResponse({
            id: "base-1",
            currentVersionId: "base-version-1",
            baselineVersionId: "base-version-1",
            status: "ACTIVE",
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments")) {
        const assessment = {
          assessmentId: "analysis-1",
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme Corp",
          title: "Customer Operations Manager",
          score,
          overallScore: score,
          overall_score: score,
          scoring_v2: { score },
          scoringV2: { score },
          verification_coverage: {
            totalClaims: 3,
            verifiedClaims: 3,
            inferredClaims: 0,
            unverifiedClaims: 0,
            unverifiedRequirements: [],
          },
        };
        return Promise.resolve(
          createResponse(url.includes("/api/analysis/fit-assessments/") ? assessment : [assessment]),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "ready",
            reasons: [],
            blocked: false,
            compliance_flags: [],
          }),
        );
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "failed",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            generationContractVersion: "studio-artifacts-v1",
            artifact: {
              hasResume: false,
              hasCoverLetter: false,
              pairStatus: "failed",
              generating: false,
              failure: { code: "generation_failed", message: "Failed pair." },
            },
            resume: {
              status: "FAILED",
              responseBody: null,
              content: null,
              failureCode: "generation_failed",
              failureMessage: "Resume failed.",
              confidence: "LOW",
              failure: null,
            },
            coverLetter: {
              status: "FAILED",
              responseBody: null,
              content: null,
              failureCode: "generation_failed",
              failureMessage: "Cover failed.",
              confidence: "LOW",
              failure: null,
            },
          }),
        );
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return resolveAutoGenerationSuccess(input);
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return resolveAutoGenerationSuccess(input);
      }
      if (url.includes("/api/opportunities") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            id: "opp-1",
            status: "SAVED",
            updatedAt: new Date().toISOString(),
            jobId: "job-1",
            baselineId: "base-1",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const snapshot = readOrchestrationDebugSnapshot();
      expect(snapshot.orchestrationDecision).toBe("should_auto_generate");
      expect(snapshot.needsAutoGeneration).toBe(true);
    }, { timeout: 15000 });

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThan(0);
      expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThan(0);
    }, { timeout: 15000 });

    expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThanOrEqual(1);
    expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThanOrEqual(1);

    const resumeBodies = readPostBodies(fetchMock, "/api/resume");
    const coverBodies = readPostBodies(fetchMock, "/api/cover-letters");
    expect(resumeBodies).toHaveLength(1);
    expect(coverBodies).toHaveLength(1);
    expect(resumeBodies[0]).toMatchObject({ forceRegenerate: true, regenerationSource: "shell_auto" });
    expect(coverBodies[0]).toMatchObject({ forceRegenerate: true, regenerationSource: "shell_auto" });

    renderStudio();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThanOrEqual(1);
    expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThanOrEqual(1);
  }, 15000);

	  it("auto-generates the partial artifact state when cover letter is already persisted", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const score = 83;
    let resumeWasPosted = false;
    const studioArtifactsPayloadMissingResume = {
      status: "missing",
      baselineId: "base-1",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      generationContractVersion: "studio-artifacts-v1",
      artifact: {
        hasResume: false,
        hasCoverLetter: true,
        pairStatus: "missing",
        generating: false,
        failure: null,
      },
      resume: {
        status: "missing",
        responseBody: null,
        content: null,
        usableCurrent: false,
        inputsHash: true,
        failureCode: null,
        failureMessage: null,
        confidence: "LOW",
        failure: null,
      },
      coverLetter: {
        status: "completed",
        usableCurrent: true,
        inputsHash: true,
        responseBody: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: { coverLetter: { paragraphs: ["Hello"] } },
        },
        content: "Hello",
        confidence: "HIGH",
        failure: null,
      },
    };
    const studioArtifactsPayloadCompletedPair = {
      ...studioArtifactsPayloadMissingResume,
      artifact: {
        ...studioArtifactsPayloadMissingResume.artifact,
        hasResume: true,
      },
      resume: {
        status: "completed",
        usableCurrent: true,
        inputsHash: true,
        responseBody: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: { resume: { heading: { name: "Alex Candidate" }, experience: [{ company: "Company", roleTitle: "Role", bullets: ["Did work."] }] } },
        },
        content: "Resume",
        confidence: "HIGH",
        failure: null,
      },
    };

    const fetchMock = installStrongFitFetches({
      score,
      readinessStatus: "ready",
      studioArtifactsPayload: studioArtifactsPayloadMissingResume,
    });
    const baseImpl = fetchMock.getMockImplementation();
    // After resume generation posts, Studio polls `/api/studio/artifacts` waiting for persistence.
    // Update the mock to return a completed resume on subsequent artifact fetches.
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        resumeWasPosted = true;
        return resolveAutoGenerationSuccess(input) as any;
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse(resumeWasPosted ? studioArtifactsPayloadCompletedPair : studioArtifactsPayloadMissingResume),
        ) as any;
      }
      return baseImpl ? (baseImpl as any)(input, init) : resolveAutoGenerationSuccess(input);
    });
	    setFetchImplementation(fetchMock as any);
	    renderStudio();

	    await waitFor(() => {
	      const debug = screen.getByTestId("studio-orchestration-debug");
	      const raw = debug.querySelector("pre")?.textContent ?? "";
	      expect(raw).toContain("\"needsAutoGeneration\": true");
	      expect(raw).toContain("\"orchestrationDecision\": \"should_auto_generate\"");
	    }, { timeout: 15000 });

	    await waitFor(() => {
	      // Auto-generation may call either the legacy Studio endpoint or the newer generator endpoint.
	      expect(
	        countPostCalls(fetchMock, "/api/resume/generate") + countPostCalls(fetchMock, "/api/resume"),
	      ).toBeGreaterThan(0);
	    }, { timeout: 15000 });
	  }, 15000);

  it("treats hydrated resume artifacts as persisted for readiness and orchestration", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "missing",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        assessmentScore: 84,
        generationContractVersion: "studio-artifacts-v1",
        resumeArtifactHydration: {
          resumeArtifactId: "resume-hydrated-1",
          resumeArtifactSource: "fresh_generation",
          resumeArtifactUpdatedAt: "2026-06-20T23:49:04.879Z",
        },
        resume: {
          status: "COMPLETED",
          artifactId: "resume-hydrated-1",
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            resumeResult: {
              status: "success",
              generationStatus: "success",
              generationState: "generated_usable",
              exportReady: true,
              qualityStatus: "pass",
              qualityGate: { status: "pass", reasons: [] },
              actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
              preview: null,
            },
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
                    bullets: [
                      {
                        text: "Led support operations programs.",
                        sourceEvidenceIds: ["evidence-1"],
                        source: { sourceEvidenceIds: ["evidence-1"] },
                      },
                    ],
                  },
                ],
                education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                competencies: ["Customer strategy", "Operational leadership"],
              },
            },
          },
          content: "Resume",
          usableCurrent: true,
          inputsHash: true,
          failureCode: null,
          failureMessage: null,
          confidence: "HIGH",
          failure: null,
        },
        resumeResult: {
          status: "success",
          generationStatus: "success",
          generationState: "generated_usable",
          exportReady: true,
          qualityStatus: "pass",
          qualityGate: { status: "pass", reasons: [] },
          actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
          preview: null,
        },
        coverLetter: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            coverLetterResult: {
              status: "success",
              generationStatus: "success",
              generationState: "generated_usable",
              exportReady: true,
              qualityStatus: "pass",
              qualityGate: { status: "pass", reasons: [] },
              actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
              preview: { paragraphs: ["Hello"] },
            },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const debug = screen.getByTestId("studio-orchestration-debug");
      const raw = debug.querySelector("pre")?.textContent ?? "";
      expect(raw).toContain("\"resumeArtifactId\": \"resume-hydrated-1\"");
      expect(raw).toContain("\"hasResumeArtifactPersisted\": true");
      expect(raw).toContain("\"hasCoverLetterArtifactPersisted\": true");
      expect(raw).toContain("\"hasAnyArtifactPersisted\": true");
      expect(raw).toContain("\"studioArtifactPairStatus\": \"completed\"");
      expect(raw).not.toContain("\"persisted_resume_artifact_missing\"");
      expect(raw).not.toContain("\"orchestrationDecision\": \"blocked\"");
    }, { timeout: 15000 });

    expectCanonicalGeneratedArtifactArea();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  }, 15000);

  it("treats missing resume and minimal resume artifacts as stale history and requires resume regeneration", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "completed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        assessmentScore: 84,
        generationContractVersion: "studio-artifacts-v1",
        resumeArtifactHydration: {
          resumeArtifactId: "resume-minimal-1",
          resumeArtifactSource: "fresh_generation",
          resumeArtifactUpdatedAt: "2026-06-20T23:49:04.879Z",
        },
        resumeResult: {
          artifactType: "resume",
          status: "success",
          generationStatus: "success",
          generationState: "generated_usable",
          qualityStatus: "pass",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Fresh generated resume should become persisted authority.",
              experience: [{ company: "Example", roleTitle: "Role", bullets: ["x"] }],
            },
          },
          actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: true },
        },
        resume: {
          status: "COMPLETED",
          artifactId: "resume-minimal-1",
          usableCurrent: false,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: false,
            exports: { docx: false, pdf: false },
            auditId: "minimal:1776648116795",
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                summary: "Fallback resume should not count as renderable.",
                experience: [{ company: "Example", roleTitle: "Role", bullets: ["x"] }],
              },
            },
            internal: {
              minimalFallback: true,
              resumeGenerationMode: "top_level_fail_safe_minimal",
              resumeFailSafeMinimalUsed: true,
            },
          },
          content: "Fallback resume should not count as renderable.",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: {
          status: "COMPLETED",
          artifactId: "cover-hydrated-1",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const snapshot = readOrchestrationDebugSnapshot();
      expect(snapshot.hasResumeArtifactPersisted).toBe(false);
      expect(snapshot.hasCoverLetterArtifactPersisted).toBe(true);
      expect(snapshot.needsAutoGeneration).toBe(true);
      expect(snapshot.qualifiedForStudioOrchestration).toBe(true);
      expect(snapshot.studioReadinessBlocksGeneration).toBe(false);
      expect(snapshot.blockerEvaluationTrace?.usedForNeedsAutoGeneration?.inputs?.missingResumeOutput).toBe(true);
      expect(snapshot.blockerEvaluationTrace?.usedForGenerateGuard?.result).toBe(true);
      expect(snapshot.blockerEvaluationTrace?.usedForAutoStartGuard?.result).toBe(true);
      expect(snapshot.orchestrationDecision).toBe("should_auto_generate");
      expect(snapshot.orchestrationDecision).not.toBe("blocked");
      expect(snapshot.orchestrationDecision).not.toBe("hydrate_existing_artifacts");
      expect(snapshot.studioArtifactPairStatus).toBe("missing");
    }, { timeout: 15000 });

    expect(screen.queryByText("Something went wrong")).toBeNull();
  }, 15000);

  it("treats a failed unusable resume artifact as missing output and auto-generates canonically", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "completed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        assessmentScore: 84,
        generationContractVersion: "studio-artifacts-v1",
        resume: {
          status: "FAILED",
          artifactId: "resume-failed-1",
          usableCurrent: false,
          inputsHash: true,
          responseBody: null,
          content: null,
          confidence: "LOW",
          failure: { code: "resume_v2_failed", message: "Resume generation failed." },
        },
        coverLetter: {
          status: "COMPLETED",
          artifactId: "cover-hydrated-1",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const snapshot = readOrchestrationDebugSnapshot();
      expect(snapshot.hasResumeArtifactPersisted).toBe(false);
      expect(snapshot.hasCoverLetterArtifactPersisted).toBe(true);
      expect(snapshot.hasAnyArtifactPersisted).toBe(true);
      expect(snapshot.needsAutoGeneration).toBe(true);
      expect(snapshot.blockerEvaluationTrace?.usedForNeedsAutoGeneration?.inputs?.missingResumeOutput).toBe(true);
      expect(snapshot.orchestrationDecision).toBe("should_auto_generate");
      expect(snapshot.orchestrationDecision).not.toBe("hydrate_existing_artifacts");
    }, { timeout: 15000 });
  }, 15000);

  it("treats a hydrated success resume as persisted even when a stale minimal audit id remains", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "completed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        assessmentScore: 84,
        generationContractVersion: "studio-artifacts-v1",
        resumeArtifactHydration: {
          resumeArtifactId: "resume-current-1",
          resumeArtifactSource: "fresh_generation",
          resumeArtifactUpdatedAt: "2026-06-20T23:49:04.879Z",
        },
        resumeResult: {
          artifactType: "resume",
          status: "success",
          generationStatus: "success",
          generationState: "generated_usable",
          qualityStatus: "pass",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Fresh generated resume should remain persisted authority.",
              experience: [{ company: "Example", roleTitle: "Role", bullets: ["x"] }],
            },
          },
          actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: true },
        },
        resume: {
          status: "COMPLETED",
          artifactId: "resume-current-1",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            auditId: "minimal:1782045224649",
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                summary: "Fresh generated resume should remain persisted authority.",
                experience: [{ company: "Example", roleTitle: "Role", bullets: ["x"] }],
              },
            },
          },
          content: "Fresh generated resume should remain persisted authority.",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: {
          status: "COMPLETED",
          artifactId: "cover-hydrated-1",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const snapshot = readOrchestrationDebugSnapshot();
      expect(snapshot.hasResumeArtifactPersisted).toBe(true);
      expect(snapshot.hasAnyArtifactPersisted).toBe(true);
      expect(snapshot.needsAutoGeneration).toBe(false);
      expect(snapshot.blockerEvaluationTrace?.usedForNeedsAutoGeneration?.inputs?.missingResumeOutput).toBe(false);
      expect(snapshot.orchestrationDecision).toBe("hydrate_existing_artifacts");
      expect(snapshot.orchestrationDecision).not.toBe("should_auto_generate");
      expect(snapshot.orchestrationDecision).not.toBe("blocked");
    }, { timeout: 15000 });

    expect(screen.queryByText("Something went wrong")).toBeNull();
  }, 15000);

  it("treats a hydrated successful artifact pair as completed even when backend records are failed", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
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
            scoring_v2: { score: 90 },
            verification_coverage: { totalClaims: 2, verifiedClaims: 2, inferredClaims: 0, unverifiedClaims: 0 },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "completed",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            assessmentScore: 90,
            generationContractVersion: "studio-artifacts-v1",
            resumeResult: {
              artifactType: "resume",
              status: "success",
              generationStatus: "success",
              generationState: "generated_usable",
              qualityStatus: "pass",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: {
                resume: {
                  heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                  summary: "Support leader focused on scalable operations.",
                  experience: [{ company: "Cat Daddy Games", roleTitle: "Senior Producer", bullets: ["Led support operations programs."] }],
                },
              },
            },
            coverLetterResult: {
              artifactType: "cover_letter",
              status: "success",
              generationStatus: "success",
              generationState: "generated_usable",
              qualityStatus: "pass",
              exportReady: true,
              exports: { docx: true, pdf: true },
              preview: { paragraphs: ["Dear Hiring Team at Acme,", "I’m writing to apply."] },
            },
            resume: {
              status: "FAILED",
              artifactId: "resume-current-1",
              usableCurrent: true,
              inputsHash: true,
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: true,
                exports: { docx: true, pdf: true },
                preview: {
                  resume: {
                    heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                    summary: "Support leader focused on scalable operations.",
                    experience: [{ company: "Cat Daddy Games", roleTitle: "Senior Producer", bullets: ["Led support operations programs."] }],
                  },
                },
              },
              content: "resume",
            },
            coverLetter: {
              status: "FAILED",
              artifactId: "cover-current-1",
              usableCurrent: true,
              inputsHash: true,
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: true,
                exports: { docx: true, pdf: true },
                preview: { coverLetter: { paragraphs: ["Dear Hiring Team at Acme,", "I’m writing to apply."] } },
              },
              content: "cover",
            },
          }),
        );
      }
      if (url.includes("/api/baselines/base-1")) {
        return Promise.resolve(createResponse({ id: "base-1", originalFilename: "Resume.pdf", sections: [] }));
      }
      if (url.includes("/api/baselines")) {
        return Promise.resolve(createResponse([{ id: "base-1", originalFilename: "Resume.pdf", status: "ACTIVE", isActive: true }]));
      }
      if (url.includes("/api/jobs")) {
        return Promise.resolve(createResponse([{ id: "job-1", company: "Acme", title: "Director of Support" }]));
      }
      if (url.includes("/api/analytics/event")) {
        return Promise.resolve(createResponse({ ok: true }));
      }
      if (init?.method === "POST") {
        return Promise.resolve(createResponse({ ok: true }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const snapshot = readOrchestrationDebugSnapshot();
      expect(snapshot.studioArtifactPairStatus).toBe("completed");
      expect(snapshot.hasResumeArtifactPersisted).toBe(true);
      expect(snapshot.hasCoverLetterArtifactPersisted).toBe(true);
      expect(snapshot.hasAnyArtifactPersisted).toBe(true);
      expect(snapshot.needsAutoGeneration).toBe(false);
      expect(snapshot.orchestrationDecision).toBe("hydrate_existing_artifacts");
      expect(snapshot.orchestrationDecision).not.toBe("should_auto_generate");
      expect(snapshot.orchestrationDecision).not.toBe("blocked");
    }, { timeout: 15000 });
  }, 15000);

  it("does not auto-generate when a completed persisted pair is already canonical even if one preview is temporarily missing", () => {
    expect(
      resolveStudioAutoGenerationNeed({
        hasResumeArtifactPersisted: true,
        hasCoverLetterArtifactPersisted: true,
        studioArtifactPairStatus: "completed",
        missingResumeOutput: false,
        missingCoverOutput: true,
        studioArtifactsHydrated: true,
        autoGenerationInFlight: false,
        resumeGenerating: false,
        coverGenerating: false,
      }),
    ).toBe(false);

    expect(
      resolveStudioAutoGenerationNeed({
        hasResumeArtifactPersisted: true,
        hasCoverLetterArtifactPersisted: false,
        studioArtifactPairStatus: "missing",
        missingResumeOutput: false,
        missingCoverOutput: true,
        studioArtifactsHydrated: true,
        autoGenerationInFlight: false,
        resumeGenerating: false,
        coverGenerating: false,
      }),
    ).toBe(true);
  });

  it("keeps the live auto-generation effect from reaching START_CALLED when a completed persisted pair hydrates after an initially unresolved render", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const logs: string[] = [];
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.map((value) => (typeof value === "string" ? value : String(value))).join(" "));
    });

    const artifactsDeferred = (() => {
      let resolve!: (value: unknown) => void;
      const promise = new Promise((res) => {
        resolve = res as (value: unknown) => void;
      });
      return { promise, resolve };
    })();
    let artifactsResolved = false;

    const completedArtifactsPayload = {
      status: "completed",
      baselineId: "base-1",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      assessmentScore: 84,
      generationContractVersion: "studio-artifacts-v1",
      resumeResult: {
        artifactType: "resume",
        status: "success",
        generationStatus: "success",
        generationState: "generated_usable",
        qualityStatus: "pass",
        qualityGate: { status: "pass", reasons: [] },
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
                bullets: ["Led support operations programs."],
              },
            ],
          },
        },
        actions: {
          canEdit: true,
          canRegenerate: true,
          canExport: true,
          canSaveToOpportunities: true,
        },
      },
      coverLetterResult: {
        artifactType: "cover_letter",
        status: "success",
        generationStatus: "success",
        generationState: "generated_usable",
        qualityStatus: "pass",
        qualityGate: { status: "pass", reasons: [] },
        exportReady: true,
        exports: { docx: true, pdf: true },
        preview: {
          coverLetter: {
            paragraphs: [
              "Dear Hiring Team,",
              "I bring verified leadership and operational experience aligned to this role.",
            ],
          },
        },
        actions: {
          canEdit: false,
          canRegenerate: true,
          canExport: true,
          canSaveToOpportunities: false,
        },
      },
      resume: {
        status: "completed",
        artifactId: "resume-current-1",
        usableCurrent: true,
        inputsHash: true,
        responseBody: {
          status: "success",
          generationStatus: "success",
          generationState: "generated_usable",
          exportReady: true,
          exports: { docx: true, pdf: true },
          qualityStatus: "pass",
          qualityGate: { status: "pass", reasons: [] },
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Support leader focused on scalable operations.",
              experience: [
                {
                  company: "Cat Daddy Games",
                  roleTitle: "Senior Producer",
                  bullets: ["Led support operations programs."],
                },
              ],
            },
          },
          resumeResult: {
            artifactType: "resume",
            status: "success",
            generationStatus: "success",
            generationState: "generated_usable",
            qualityStatus: "pass",
            qualityGate: { status: "pass", reasons: [] },
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                summary: "Support leader focused on scalable operations.",
                experience: [
                  {
                    company: "Cat Daddy Games",
                    roleTitle: "Senior Producer",
                    bullets: ["Led support operations programs."],
                  },
                ],
              },
            },
            correctionReasons: [],
            exportReady: true,
            exports: { docx: true, pdf: true },
            actions: {
              canEdit: true,
              canRegenerate: true,
              canExport: true,
              canSaveToOpportunities: true,
            },
          },
        },
        content: "Resume content",
        confidence: "HIGH",
        failure: null,
      },
      coverLetter: {
        status: "completed",
        artifactId: "cover-current-1",
        usableCurrent: true,
        inputsHash: true,
        responseBody: {
          status: "success",
          generationStatus: "success",
          generationState: "generated_usable",
          exportReady: true,
          exports: { docx: true, pdf: true },
          qualityStatus: "pass",
          qualityGate: { status: "pass", reasons: [] },
          preview: {
            coverLetter: {
              paragraphs: [
                "Dear Hiring Team,",
                "I bring verified leadership and operational experience aligned to this role.",
              ],
            },
          },
          coverLetterResult: {
            artifactType: "cover_letter",
            status: "success",
            generationStatus: "success",
            generationState: "generated_usable",
            qualityStatus: "pass",
            qualityGate: { status: "pass", reasons: [] },
            preview: {
              coverLetter: {
                paragraphs: [
                  "Dear Hiring Team,",
                  "I bring verified leadership and operational experience aligned to this role.",
                ],
              },
            },
            correctionReasons: [],
            exportReady: true,
            exports: { docx: true, pdf: true },
            actions: {
              canEdit: false,
              canRegenerate: true,
              canExport: true,
              canSaveToOpportunities: false,
            },
          },
        },
        content: "Cover letter content",
        confidence: "HIGH",
        failure: null,
      },
    };

    const delegate = installStrongFitFetches({
      readinessStatus: "ready",
    });
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 84 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
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
      if (url.includes("/api/studio/artifacts")) {
        return artifactsResolved
          ? Promise.resolve(createResponse(completedArtifactsPayload))
          : (artifactsDeferred.promise as Promise<unknown>);
      }
      if (url.endsWith("/api/resume/generate") && init?.method === "POST") {
        return resolveAutoGenerationSuccess(input);
      }
      if (url.endsWith("/api/cover-letters/generate") && init?.method === "POST") {
        return resolveAutoGenerationSuccess(input);
      }
      return delegate(input, init);
    });
    setFetchImplementation(fetchMock as any);

    try {
      renderStudio();
      expect(screen.queryByTestId("studio-orchestration-debug")).toBeNull();

      await act(async () => {
        artifactsResolved = true;
        artifactsDeferred.resolve(createResponse(completedArtifactsPayload));
        await Promise.resolve();
      });

      await waitFor(() => {
        const snapshot = readOrchestrationDebugSnapshot();
        expect(snapshot.hasResumeArtifactPersisted).toBe(true);
        expect(snapshot.hasCoverLetterArtifactPersisted).toBe(true);
        expect(snapshot.hasAnyArtifactPersisted).toBe(true);
        expect(snapshot.studioArtifactPairStatus).toBe("completed");
        expect(snapshot.needsAutoGeneration).toBe(false);
        expect(snapshot.autoGenerationTriggerGuards?.contractShouldStart).toBe(false);
        expect(snapshot.orchestrationDecision).toBe("hydrate_existing_artifacts");
      }, { timeout: 15000 });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(countPostCalls(fetchMock, "/api/resume/generate")).toBe(0);
      expect(countPostCalls(fetchMock, "/api/cover-letters/generate")).toBe(0);
      expect(logs.some((entry) => entry.includes("[STUDIO][AUTO_GEN][START_CALLED]"))).toBe(false);
      expect(logs.some((entry) => entry.includes("[STUDIO][AUTO_GEN][START_CALLED_INNER]"))).toBe(false);
      expect(logs.some((entry) => entry.includes("REQ POST https://targetthisrole.com/api/resume/generate"))).toBe(false);
      expect(logs.some((entry) => entry.includes("REQ POST https://targetthisrole.com/api/cover-letters/generate"))).toBe(false);
      expect(screen.getByRole("button", { name: /Download Resume/i })).toBeEnabled();
      expect(screen.getByRole("button", { name: /Download Cover Letter/i })).toBeEnabled();
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it("keeps a hydrated resume visible when a stale backend refresh arrives", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "completed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        assessmentScore: 84,
        generationContractVersion: "studio-artifacts-v1",
        resumeArtifactHydration: {
          resumeArtifactId: "resume-hydrated-1",
          resumeArtifactSource: "fresh_generation",
          resumeArtifactUpdatedAt: "2026-06-20T23:49:04.879Z",
        },
        resumeResult: {
          artifactType: "resume",
          generationState: "generated_needs_correction",
          qualityStatus: "failed",
          preview: null,
          correctionReasons: [],
          exportReady: false,
          exports: { docx: false, pdf: false },
          actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
        },
        resume: {
          status: "COMPLETED",
          artifactId: "resume-hydrated-1",
          usableCurrent: false,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Support leader focused on scalable operations.",
              experience: [
                {
                  company: "Cat Daddy Games",
                  roleTitle: "Senior Producer",
                  location: "Los Angeles, CA",
                  dateRange: "2020 - Present",
                  bullets: ["Led support operations programs."],
                },
              ],
              education: [{ degree: "BA", institution: "State University", location: "Remote" }],
              competencies: ["Customer strategy", "Operational leadership"],
            },
          },
          content: "Resume",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: {
          status: "COMPLETED",
          artifactId: "cover-hydrated-1",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const debug = screen.getByTestId("studio-orchestration-debug");
      const raw = debug.querySelector("pre")?.textContent ?? "";
      const snapshot = JSON.parse(raw) as Record<string, any>;
      expect(snapshot.resumeArtifactHydration?.resumeArtifactId).toBe("resume-hydrated-1");
      expect(snapshot.resumeState?.response).not.toBeNull();
      expect(snapshot.resumeState?.response?.preview?.resume).toBeDefined();
      expect(snapshot.resumeState?.response?.resumeResult?.preview?.resume).toBeDefined();
      expect(snapshot.resumeState?.response?.resumeResult?.preview).not.toBeNull();
      expect(raw).toContain("\"hasResumeArtifactPersisted\": true");
      expect(raw).toContain("\"hasAnyArtifactPersisted\": true");
      expect(raw).toContain("\"studioArtifactPairStatus\": \"completed\"");
      expect(raw).toContain("\"missingResumeOutput\": false");
      expect(raw).toContain("\"orchestrationDecision\": \"hydrate_existing_artifacts\"");
      expect(raw).toContain("\"resumeArtifactSource\": \"fresh_generation\"");
      expect(raw).not.toContain("\"missingResumeOutput\": true");
      expect(raw).not.toContain("\"orchestrationDecision\": \"should_auto_generate\"");
      expect(raw).not.toContain("\"needsAutoGeneration\": true");
      expect(screen.queryByText(/Resume not generated yet/i)).toBeNull();
      const currentResumePanels = [
        ...screen.queryAllByTestId("studio-resume-ready-panel"),
        ...screen.queryAllByTestId("studio-resume-correction-panel"),
      ];
      const currentCoverPanels = [
        ...screen.queryAllByTestId("studio-cover-ready-panel"),
        ...screen.queryAllByTestId("studio-cover-correction-panel"),
      ];
      expect(currentResumePanels).toHaveLength(1);
      expect(currentCoverPanels).toHaveLength(1);
      expect(screen.queryByTestId("studio-instant-resume-panel")).toBeNull();
      expect(screen.queryByTestId("studio-instant-cover-panel")).toBeNull();
      expect(screen.getByTestId("studio-cover-letter-preview-body")).toBeInTheDocument();
      expect(screen.queryByText("Something went wrong")).toBeNull();
    }, { timeout: 15000 });

    expectCanonicalGeneratedArtifactArea();
  }, 15000);

  it("promotes a fresh generated resume into persisted authority when the persisted snapshot is stale", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "missing",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        assessmentScore: 84,
        generationContractVersion: "studio-artifacts-v1",
        resumeArtifactHydration: {
          resumeArtifactId: "resume-minimal-stale-1",
          resumeArtifactSource: "fresh_generation",
          resumeArtifactUpdatedAt: "2026-06-20T23:49:04.879Z",
        },
        resumeResult: {
          artifactType: "resume",
          status: "success",
          generationStatus: "success",
          generationState: "generated_usable",
          qualityStatus: "pass",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Fresh generated resume should become persisted authority.",
              experience: [{ company: "Example", roleTitle: "Role", bullets: ["x"] }],
            },
          },
          actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: true },
        },
        resume: {
          status: "COMPLETED",
          artifactId: "resume-minimal-stale-1",
          usableCurrent: false,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: false,
            exports: { docx: false, pdf: false },
            auditId: "minimal:1776648116795",
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                summary: "Fallback resume should not count as renderable.",
                experience: [{ company: "Example", roleTitle: "Role", bullets: ["x"] }],
              },
            },
            internal: {
              minimalFallback: true,
              resumeGenerationMode: "top_level_fail_safe_minimal",
              resumeFailSafeMinimalUsed: true,
            },
          },
          content: "Fallback resume should not count as renderable.",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: {
          status: "COMPLETED",
          artifactId: "cover-hydrated-1",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const debug = screen.getByTestId("studio-orchestration-debug");
      const raw = debug.querySelector("pre")?.textContent ?? "";
      expect(raw).toContain("\"resumeArtifactSource\": \"fresh_generation\"");
      expect(raw).toContain("\"hasResumeArtifactPersisted\": true");
      expect(raw).toContain("\"hasAnyArtifactPersisted\": true");
      expect(raw).not.toContain("\"hasResumeArtifactPersisted\": false");
      expect(screen.queryByText("Something went wrong")).toBeNull();
    }, { timeout: 15000 });
  }, 15000);

  it("keeps a persisted generated resume visible when quality is failed and the response is stale", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      score: 71,
      readinessStatus: "limited",
      studioArtifactsPayload: {
        status: "completed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        assessmentScore: 71,
        generationContractVersion: "studio-artifacts-v1",
        resumeArtifactHydration: {
          resumeArtifactId: "resume-hydrated-failed-1",
          resumeArtifactSource: "fresh_generation",
          resumeArtifactUpdatedAt: "2026-06-20T23:49:04.879Z",
        },
        resume: {
          status: "COMPLETED",
          usableCurrent: false,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: false,
            exports: { docx: false, pdf: false },
            resumeResult: {
              status: "success",
              generationStatus: "success",
              generationState: "generated_needs_correction",
              exportReady: false,
              qualityStatus: "failed",
              qualityGate: { status: "warn", reasons: ["Review evidence before exporting."] },
              actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
              preview: null,
            },
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
                    bullets: [
                      {
                        text: "Led support operations programs.",
                        sourceEvidenceIds: ["evidence-1"],
                        source: { sourceEvidenceIds: ["evidence-1"] },
                      },
                    ],
                  },
                ],
                education: [{ degree: "BA", institution: "State University", location: "Remote" }],
                competencies: ["Customer strategy", "Operational leadership"],
              },
            },
          },
          content: "Resume",
          confidence: "LOW",
          failure: null,
        },
        coverLetter: {
          status: "COMPLETED",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      expect(screen.queryByText(/Resume not generated yet/i)).toBeNull();
      expect(screen.getByTestId("studio-resume-export")).toBeInTheDocument();
      expect(screen.getAllByText(/out of date due to recent generator improvements/i).length).toBeGreaterThan(0);
      const debug = screen.getByTestId("studio-orchestration-debug");
      const raw = debug.querySelector("pre")?.textContent ?? "";
      expect(raw).toContain("\"resumeResult\"");
      expect(raw).toContain("\"preview\": {");
      expect(raw).toContain("\"exportReady\": true");
      expect(raw).toContain("\"docx\": true");
      expect(raw).toContain("\"pdf\": true");
      expect(screen.getByTestId("studio-materials-completeness")).toHaveTextContent(
        "Complete set: Resume + cover letter",
      );
      expect(screen.getByTestId("studio-resume-correction-panel")).toBeInTheDocument();
      expect(screen.getByTestId("studio-ready-trust-summary")).toBeInTheDocument();
      expect(screen.getByTestId("studio-confidence-label")).toHaveTextContent(/low/i);
      expect(screen.queryByText("Something went wrong")).toBeNull();
    }, { timeout: 15000 });
  }, 15000);

  it("still auto-generates when verification confidence is limited", async () => {
    const fetchMock = installStrongFitFetches({ readinessStatus: "limited" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
      expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThan(0);
      expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThan(0);
    }, { timeout: 6000 });

    const resumeBodies = readPostBodies(fetchMock, "/api/resume");
    const coverBodies = readPostBodies(fetchMock, "/api/cover-letters");

    expect(resumeBodies.filter((body) => body.trustGateMode === "strict")).toHaveLength(
      resumeBodies.length === 2 ? 1 : 0,
    );
    expect(resumeBodies.filter((body) => body.trustGateMode !== "strict")).toHaveLength(1);
    expect(resumeBodies.length).toBeLessThanOrEqual(2);

    expect(coverBodies.filter((body) => body.trustGateMode === "strict")).toHaveLength(
      coverBodies.length === 2 ? 1 : 0,
    );
    expect(coverBodies.filter((body) => body.trustGateMode !== "strict")).toHaveLength(1);
    expect(coverBodies.length).toBeLessThanOrEqual(2);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/resume"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/cover-letters"),
      expect.objectContaining({ method: "POST" }),
    );
  }, 15000);

  it("does not let suppressAutoGeneration block auto-start when needsAutoGeneration is true and no artifacts exist", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const delegate = installStrongFitFetches({ readinessStatus: "ready" });
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/studio/artifacts")) {
        // Simulate a failed hydration response: suppression can be set true while hydrated stays false.
        return Promise.resolve(createResponse({ message: "hydration failed" }, false, 500));
      }
      return delegate(input, init);
    });

    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const debug = screen.getByTestId("studio-orchestration-debug");
      const raw = debug.querySelector("pre")?.textContent ?? "";
      expect(raw).toContain("\"orchestrationDecision\": \"should_auto_generate\"");
      expect(raw).toContain("\"needsAutoGeneration\": true");
      // The suppression gate must not block auto-start in this state.
      expect(raw).toContain("\"suppressAutoGeneration\": false");
    }, { timeout: 15000 });

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThan(0);
    }, { timeout: 15000 });
  }, 15000);

  it("ignores stale completed scope guards and still auto-starts resume generation", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const completedResumeScopeKey = "v1|resume|base-1|base-version-1|job-1|analysis-1";
    const completedCoverScopeKey = "v1|cover_letter|base-1|base-version-1|job-1|analysis-1";
    try {
      (window as any).__ttrStudioGenerationScopeGuardStore = new Map([
        [completedResumeScopeKey, { status: "completed", startedAt: Date.now() - 60_000 }],
        [completedCoverScopeKey, { status: "completed", startedAt: Date.now() - 60_000 }],
      ]);
    } catch {
      // ignore
    }

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "persisted_only_assessment_backed",
        assessmentScore: null,
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        artifact: {
          hasResume: true,
          hasCoverLetter: false,
          pairStatus: "failed",
          generating: false,
          failure: null,
        },
        resume: {
          status: "failed",
          usableCurrent: false,
          inputsHash: true,
          failureCode: "resume_v2_failed",
          failureMessage: "Internal Server Error Exception",
          responseBody: null,
          content: null,
          confidence: "LOW",
          failure: {
            code: "resume_v2_failed",
            message: "Internal Server Error Exception",
          },
        },
        coverLetter: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });
    setFetchImplementation(fetchMock as any);
    renderStudio();

    await waitFor(() => {
      const snapshot = readOrchestrationDebugSnapshot();
      expect(snapshot.needsAutoGeneration).toBe(true);
      expect(snapshot.orchestrationDecision).toBe("should_auto_generate");
      expect(snapshot.generationClaims?.generationScopeGuardKeys ?? []).not.toContain(completedResumeScopeKey);
      expect(snapshot.generationClaims?.generationScopeGuardKeys ?? []).not.toContain(completedCoverScopeKey);
    }, { timeout: 15000 });

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume/generate")).toBeGreaterThan(0);
    }, { timeout: 15000 });
  }, 15000);

  it("starts canonical generation when qualifiedForGeneration is true and persisted resume/cover artifacts are missing or failed", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
    const previousWebBuildMarker = process.env.NEXT_PUBLIC_GIT_SHA;
    process.env.NEXT_PUBLIC_GIT_SHA = "web-test-build-123";
    const staleResumeScopeKey = "v1|resume|base-1|base-version-1|job-1|analysis-1";
    const staleCoverScopeKey = "v1|cover_letter|base-1|base-version-1|job-1|analysis-1";
    try {
      (window as any).__ttrStudioGenerationScopeGuardStore = new Map([
        [staleResumeScopeKey, { status: "started", startedAt: Date.now() - 60_000 }],
        [staleCoverScopeKey, { status: "started", startedAt: Date.now() - 60_000 }],
      ]);
    } catch {
      // ignore
    }

    const failedArtifactsPayload = {
      status: "persisted_only_assessment_backed",
      assessmentScore: null,
      baselineId: "base-1",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      generationContractVersion: "studio-artifacts-v1",
      artifact: {
        hasResume: true,
        hasCoverLetter: false,
        pairStatus: "failed",
        generating: false,
        failure: null,
      },
      resume: {
        status: "failed",
        usableCurrent: false,
        inputsHash: true,
        failureCode: "resume_v2_failed",
        failureMessage: "Internal Server Error Exception",
        responseBody: null,
        content: null,
        confidence: "LOW",
        failure: {
          code: "resume_v2_failed",
          message: "Internal Server Error Exception",
        },
      },
      coverLetter: {
        status: "missing",
        usableCurrent: false,
        inputsHash: true,
        failureCode: null,
        failureMessage: null,
        responseBody: null,
        content: null,
        confidence: "LOW",
        failure: null,
      },
      diagnostics: {
        resumeV2Readiness: {
          hasResumeV2: true,
          usableExperienceCount: 4,
        },
      },
    };
    const completedArtifactsPayload = {
      status: "persisted_only_assessment_backed",
      assessmentScore: 88,
      baselineId: "base-1",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      generationContractVersion: "studio-artifacts-v1",
      artifact: {
        hasResume: true,
        hasCoverLetter: true,
        pairStatus: "completed",
        generating: false,
        failure: null,
      },
      resume: {
        status: "completed",
        usableCurrent: true,
        inputsHash: true,
        failureCode: null,
        failureMessage: null,
        responseBody: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
        },
        content: "Resume content",
        confidence: "HIGH",
        failure: null,
      },
      coverLetter: {
        status: "completed",
        usableCurrent: true,
        inputsHash: true,
        failureCode: null,
        failureMessage: null,
        responseBody: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
        },
        content: "Cover letter content",
        confidence: "HIGH",
        failure: null,
      },
      diagnostics: {
        resumeV2Readiness: {
          hasResumeV2: true,
          usableExperienceCount: 4,
        },
      },
    };

    let artifactsHydrated = false;
    const delegate = installStrongFitFetches({
      score: 71,
      analysisRunScore: 88,
      readinessStatus: "ready",
    });
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(createResponse(artifactsHydrated ? completedArtifactsPayload : failedArtifactsPayload));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        artifactsHydrated = true;
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        artifactsHydrated = true;
      }
      return delegate(input, init);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      const snapshot = readOrchestrationDebugSnapshot();
      expect(snapshot.qualifiedForGeneration).toBe(true);
      expect(snapshot.effectiveRequestedAnalysisId).toBeTruthy();
      expect(snapshot.autoGenerationTriggerGuards?.contractShouldStart).toBe(true);
      expect(snapshot.orchestrationDecision).toBe("should_auto_generate");
      expect(snapshot.orchestrationDecision).not.toBe("passive_empty_state");
      expect(snapshot.studioReadinessBlocksGeneration).toBe(false);
      expect(snapshot.webBuildMarker).toBe("web-test-build-123");
    }, { timeout: 15000 });

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThan(0);
      expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThan(0);
    }, { timeout: 15000 });

    expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThanOrEqual(1);
    expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThanOrEqual(1);

    const resumeBodies = readPostBodies(fetchMock, "/api/resume");
    const coverBodies = readPostBodies(fetchMock, "/api/cover-letters");
    expect(resumeBodies).toHaveLength(1);
    expect(coverBodies).toHaveLength(1);
    expect(resumeBodies[0]).toMatchObject({ forceRegenerate: true, regenerationSource: "shell_auto" });
    expect(coverBodies[0]).toMatchObject({ forceRegenerate: true, regenerationSource: "shell_auto" });

    await waitFor(() => {
      const snapshot = readOrchestrationDebugSnapshot();
      expect(snapshot.webBuildMarker).toBe("web-test-build-123");
    }, { timeout: 15000 });

    await waitFor(() => {
      expect(screen.getByText(/COMPATIBILITY:.*88/i)).toBeInTheDocument();
    }, { timeout: 15000 });
    if (previousWebBuildMarker === undefined) {
      delete process.env.NEXT_PUBLIC_GIT_SHA;
    } else {
      process.env.NEXT_PUBLIC_GIT_SHA = previousWebBuildMarker;
    }
  }, 15000);

  it("Scenario A: both previews renderable => no failure banner and no 'not generated yet' placeholders", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "completed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        resume: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            qualityGate: { status: "pass", reasons: [] },
            preview: { resume: { heading: { name: "Alex" }, experience: [{ company: "Co", roleTitle: "Role", bullets: ["Did work."] }] } },
          },
          content: "Resume",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            qualityGate: { status: "pass", reasons: [] },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.queryByText(/Resume not generated yet/i)).toBeNull();
      expect(screen.queryByText(/Cover letter not generated yet/i)).toBeNull();
      expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    }, { timeout: 15000 });
    // Auto-gen should not start when both previews exist.
    expect(countPostCalls(fetchMock, "/api/resume/generate") + countPostCalls(fetchMock, "/api/resume")).toBe(0);
  }, 15000);

  it("uses persisted artifacts as the canonical display state even when readiness and legacy pair flags are stale", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    installStrongFitFetches({
      readinessStatus: "ready",
      score: 92,
      studioArtifactsPayload: {
        status: "failed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        artifact: {
          hasResume: true,
          hasCoverLetter: true,
          pairStatus: "failed",
          generating: false,
          failure: { code: "generation_failed", message: "Failed." },
        },
        resume: {
          status: "completed",
          usableCurrent: true,
          inputsHash: false,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            qualityGate: { status: "pass", reasons: [] },
            preview: {
              resume: {
                heading: { name: "Alex" },
                summary:
                  "Support leader with experience improving customer operations, coaching teams, and turning ambiguous requests into consistent service.",
                experience: [
                  {
                    company: "Co",
                    roleTitle: "Role",
                    bullets: [
                      "Improved response quality by coaching frontline support on clearer triage and follow-through.",
                      "Partnered with product and operations to remove recurring customer friction across workflows.",
                    ],
                  },
                ],
              },
            },
            resumeResult: {
              artifactType: "resume",
              generationState: "generated_usable",
              qualityStatus: "pass",
              qualityGate: { status: "pass", reasons: [] },
              preview: {
                heading: { name: "Alex" },
                summary:
                  "Support leader with experience improving customer operations, coaching teams, and turning ambiguous requests into consistent service.",
                experience: [
                  {
                    company: "Co",
                    roleTitle: "Role",
                    bullets: [
                      "Improved response quality by coaching frontline support on clearer triage and follow-through.",
                      "Partnered with product and operations to remove recurring customer friction across workflows.",
                    ],
                  },
                ],
              },
              correctionReasons: [],
              exportReady: true,
              exports: { docx: true, pdf: true },
              actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
            },
          },
          content:
            "Support leader with experience improving customer operations, coaching teams, and turning ambiguous requests into consistent service.\n\nImproved response quality by coaching frontline support on clearer triage and follow-through.\n\nPartnered with product and operations to remove recurring customer friction across workflows.",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: {
          status: "completed",
          usableCurrent: true,
          inputsHash: false,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            qualityGate: { status: "pass", reasons: [] },
            preview: {
              coverLetter: {
                paragraphs: [
                  "Dear Acme hiring team, I am excited to apply for the Director of Support role and bring a track record of building dependable customer experiences at scale.",
                  "My background includes leading support operations, coaching teams through change, and building durable processes that improve response quality, escalation handling, and customer trust.",
                  "Across operations, product, and support leadership, I have focused on measurable outcomes, clear operating rhythms, and practical systems that help teams move quickly without losing quality.",
                  "I would welcome the chance to contribute that experience to Acme and help support the customers and teams around this role with clarity and consistency.",
                  "Thank you for your time and consideration.",
                ],
              },
            },
            coverLetterResult: {
              artifactType: "cover_letter",
              generationState: "generated_usable",
              qualityStatus: "pass",
              qualityGate: { status: "pass", reasons: [] },
              preview: {
                paragraphs: [
                  "Dear Acme hiring team, I am excited to apply for the Director of Support role and bring a track record of building dependable customer experiences at scale.",
                  "My background includes leading support operations, coaching teams through change, and building durable processes that improve response quality, escalation handling, and customer trust.",
                  "Across operations, product, and support leadership, I have focused on measurable outcomes, clear operating rhythms, and practical systems that help teams move quickly without losing quality.",
                  "I would welcome the chance to contribute that experience to Acme and help support the customers and teams around this role with clarity and consistency.",
                  "Thank you for your time and consideration.",
                ],
              },
              correctionReasons: [],
              exportReady: true,
              exports: { docx: true, pdf: true },
              actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
            },
          },
          content:
            "Dear Acme hiring team, I am excited to apply for the Director of Support role and bring a track record of building dependable customer experiences.\n\nMy background includes leading support operations, improving response quality, and helping teams deliver clear, compassionate service at scale.\n\nI would welcome the chance to contribute that experience to Acme and support the customers and teams around this role.\n\nThank you for your time and consideration.",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    renderStudio();

    await waitFor(() => {
      expectCanonicalGeneratedArtifactArea();
    }, { timeout: 15000 });
  }, 15000);

  it("suppresses the failure banner when both previews renderable even if pairStatus is failed", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "failed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        artifact: { hasResume: true, hasCoverLetter: true, pairStatus: "failed", generating: false, failure: { code: "generation_failed", message: "Failed." } },
        resume: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            qualityGate: { status: "pass", reasons: [] },
            preview: { resume: { heading: { name: "Alex" }, experience: [{ company: "Co", roleTitle: "Role", bullets: ["Did work."] }] } },
          },
          content: "Resume",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            qualityGate: { status: "pass", reasons: [] },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.queryByText(/Document generation needs attention/i)).toBeNull();
    }, { timeout: 15000 });
    expect(fetchMock).toBeTruthy();
  }, 15000);

  it("treats a stale/out-of-date resume artifact as present when its preview is renderable", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "completed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        artifact: { hasResume: true, hasCoverLetter: true, pairStatus: "completed", generating: false, failure: null },
        resume: {
          status: "completed",
          usableCurrent: false,
          inputsHash: false,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: false,
            qualityGate: { status: "pass", reasons: [] },
            preview: { resume: { heading: { name: "Alex" }, experience: [{ company: "Co", roleTitle: "Role", bullets: ["Did work."] }] } },
          },
          content: "Resume",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            qualityGate: { status: "pass", reasons: [] },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.queryByText(/Resume not generated yet/i)).toBeNull();
      expect(screen.queryByTestId("studio-resume-missing")).toBeNull();
    }, { timeout: 15000 });
  }, 15000);

  it("does not show blocked/unavailable messaging when both previews renderable even if readiness is blocked", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    installStrongFitFetches({
      readinessStatus: "blocked",
      studioArtifactsPayload: {
        status: "failed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        artifact: {
          hasResume: true,
          hasCoverLetter: true,
          pairStatus: "failed",
          generating: false,
          failure: { code: "generation_failed", message: "Failed." },
        },
        resume: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: false,
            qualityGate: { status: "pass", reasons: [] },
            preview: { resume: { heading: { name: "Alex" }, experience: [{ company: "Co", roleTitle: "Role", bullets: ["Did work."] }] } },
          },
          content: "Resume",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: false,
            qualityGate: { status: "pass", reasons: [] },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.queryByText(/Generation unavailable/i)).toBeNull();
      expect(screen.queryByTestId("studio-guidance-details")).toBeNull();
      expect(screen.queryByText("Why generation is blocked")).toBeNull();
      expect(screen.queryByTestId("studio-evidence-blocked-panel")).toBeNull();
      expect(screen.queryByText(/^Blocked$/i)).toBeNull();
      expect(screen.queryByText(/Resume blocked by compliance/i)).toBeNull();
      expect(screen.queryByText(/Cover letter blocked by compliance/i)).toBeNull();
      expect(screen.queryByText(/Resolve blockers/i)).toBeNull();
    }, { timeout: 15000 });
  }, 15000);

  // Note: we avoid simulating hard backend analysis/baseline outages here because canonicalDecision
  // intentionally fails on certain product-readiness vs analysis mismatches in test mode.

  it("Scenario B: cover preview exists, resume missing => shows resume missing and attempts resume", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "missing",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        resume: { status: "missing", responseBody: null, content: null, confidence: "LOW", failure: null },
        coverLetter: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            qualityGate: { status: "pass", reasons: [] },
            preview: { coverLetter: { paragraphs: ["Hello"] } },
          },
          content: "Hello",
          confidence: "HIGH",
          failure: null,
        },
      },
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.queryByText(/Cover letter not generated yet/i)).toBeNull();
    }, { timeout: 15000 });

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume/generate") + countPostCalls(fetchMock, "/api/resume")).toBeGreaterThan(0);
    }, { timeout: 15000 });
  }, 15000);

  it("Scenario C: resume preview exists, cover missing => shows cover missing and attempts cover", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "missing",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        resume: {
          status: "completed",
          usableCurrent: true,
          inputsHash: true,
          responseBody: {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            qualityGate: { status: "pass", reasons: [] },
            preview: { resume: { heading: { name: "Alex" }, experience: [{ company: "Co", roleTitle: "Role", bullets: ["Did work."] }] } },
          },
          content: "Resume",
          confidence: "HIGH",
          failure: null,
        },
        coverLetter: { status: "missing", responseBody: null, content: null, confidence: "LOW", failure: null },
      },
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.queryByText(/Resume not generated yet/i)).toBeNull();
    }, { timeout: 15000 });

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/cover-letters/generate") + countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThan(0);
    }, { timeout: 15000 });
  }, 15000);

  it("Scenario D: both previews missing and generation failed => shows failure banner", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const fetchMock = installStrongFitFetches({
      readinessStatus: "ready",
      studioArtifactsPayload: {
        status: "failed",
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        generationContractVersion: "studio-artifacts-v1",
        artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "failed", generating: false, failure: { code: "generation_failed", message: "Failed." } },
        resume: { status: "FAILED", responseBody: null, content: null, failureCode: "generation_failed", failureMessage: "Resume failed.", confidence: "LOW", failure: null },
        coverLetter: { status: "FAILED", responseBody: null, content: null, failureCode: "generation_failed", failureMessage: "Cover failed.", confidence: "LOW", failure: null },
      },
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /retry/i }).length).toBeGreaterThan(0);
    }, { timeout: 15000 });
    // Avoid unused lint warnings.
    expect(fetchMock).toBeTruthy();
  }, 15000);

  it("does not auto-generate below the generate-now floor (score 71)", async () => {
    const fetchMock = installStrongFitFetches({ score: 71, readinessStatus: "limited" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /resume/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: /cover letter/i }).length).toBeGreaterThan(0);
    }, { timeout: 6000 });

    // No implicit POSTs until the user clicks generate in non-generate-now lanes.
    expect(countPostCalls(fetchMock, "/api/resume")).toBe(0);
    expect(countPostCalls(fetchMock, "/api/cover-letters")).toBe(0);
  }, 15000);

  it("does not auto-generate at exactly 70 (generation is user-triggered below 80)", async () => {
    const fetchMock = installStrongFitFetches({ score: 70, readinessStatus: "limited" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /resume/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: /cover letter/i }).length).toBeGreaterThan(0);
    }, { timeout: 6000 });

    expect(countPostCalls(fetchMock, "/api/resume")).toBe(0);
    expect(countPostCalls(fetchMock, "/api/cover-letters")).toBe(0);
  }, 15000);

  it("shows an explicit error if auto-generation fails", async () => {
    const fetchMock = installStrongFitFetches({ readinessStatus: "ready", resumeOk: false, coverOk: false });

    renderStudio();

    await waitFor(() => {
      expect(screen.queryAllByRole("button", { name: /retry generation/i }).length).toBeGreaterThan(0);
    }, { timeout: 6000 });

    const resumePostsBefore = countPostCalls(fetchMock, "/api/resume");
    const coverPostsBefore = countPostCalls(fetchMock, "/api/cover-letters");

    await act(async () => {
      screen.getAllByRole("button", { name: /retry generation/i })[0].click();
    });

    await waitFor(() => {
      // Retry must not crash the Studio shell. Network retry behavior is covered elsewhere.
      expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThanOrEqual(resumePostsBefore);
      expect(countPostCalls(fetchMock, "/api/cover-letters")).toBeGreaterThanOrEqual(coverPostsBefore);
    });
  }, 15000);

  it("hydrates existing artifacts without auto-starting again", async () => {
    const memoryStorage = (() => {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear">;
    })();

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: memoryStorage,
    });

    const storageKey = "ttr:studio-artifacts:v2:job-1:base-1:analysis-1";
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 2,
        updatedAt: new Date().toISOString(),
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        jobId: "job-1",
        analysisId: "analysis-1",
        resumeResponse: {
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
                  bullets: ["Led support operations programs."],
                },
              ],
            },
          },
        },
        coverResponse: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            coverLetter: {
              paragraphs: [
                "Dear Hiring Team,",
                "I bring verified leadership and operational experience aligned to this role.",
                "Sincerely,",
                "Alex Candidate",
              ],
            },
          },
        },
      }),
    );

    // Keep the fixture below the auto-generation floor so the test can prove local hydration does
    // not erase the last good artifact while the lane is constrained.
    const fetchMock = installStrongFitFetches({ score: 71, readinessStatus: "limited" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
    }, { timeout: 6000 });

    expect(countPostCalls(fetchMock, "/api/resume")).toBe(0);
    expect(countPostCalls(fetchMock, "/api/cover-letters")).toBe(0);
  }, 15000);

  it("does not duplicate auto-generation on rerender", async () => {
    const fetchMock = installStrongFitFetches({ readinessStatus: "ready" });
    const view = renderStudio();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) => String(url).endsWith("/api/resume") && init?.method === "POST",
        ).length,
      ).toBeGreaterThan(0);
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) => String(url).endsWith("/api/cover-letters") && init?.method === "POST",
        ).length,
      ).toBeGreaterThan(0);
    }, { timeout: 6000 });

    const resumePostsBefore = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).endsWith("/api/resume") && init?.method === "POST",
    ).length;
    const coverPostsBefore = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).endsWith("/api/cover-letters") && init?.method === "POST",
    ).length;

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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const resumePostsAfter = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).endsWith("/api/resume") && init?.method === "POST",
    ).length;
    const coverPostsAfter = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).endsWith("/api/cover-letters") && init?.method === "POST",
    ).length;

    expect(resumePostsAfter).toBe(resumePostsBefore);
    expect(coverPostsAfter).toBe(coverPostsBefore);
    view.unmount();
  });

  it("does not duplicate resume generation across a remount while the request is in flight", async () => {
    const deferred = (() => {
      let resolve: ((value: unknown) => void) | null = null;
      const promise = new Promise((res) => {
        resolve = res as (value: unknown) => void;
      });
      return { promise, resolve: resolve! };
    })();

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
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
            scoring_v2: { score: 84 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            verification_coverage: {
              totalClaims: 1,
              verifiedClaims: 1,
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
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(createResponse({ message: "not found" }, false, 404));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return deferred.promise as Promise<unknown>;
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return resolveAutoGenerationSuccess(input);
      }
      if (url.includes("/api/opportunities") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            id: "opp-1",
            status: "SAVED",
            updatedAt: new Date().toISOString(),
            jobId: "job-1",
            baselineId: "base-1",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    const first = renderStudio();

    await waitFor(() => {
      // Resume launch should be single-flight; exact timing can vary based on concurrent cover requests.
      expect(countPostCalls(fetchMock, "/api/resume")).toBeLessThanOrEqual(1);
    });

    first.unmount();
    const second = renderStudio();

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume")).toBeLessThanOrEqual(1);
    });

    await act(async () => {
      deferred.resolve(
        createResponse({
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Support leader focused on scalable operations.",
              experience: [],
            },
          },
        }),
      );
    });

    second.unmount();
  });
});





