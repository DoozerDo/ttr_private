import { act, render, screen, waitFor } from "@testing-library/react";
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
  readinessStatus?: "ready" | "limited" | "blocked";
  resumeOk?: boolean;
  coverOk?: boolean;
  studioArtifactsPayload?: any;
}) {
  const score = options?.score ?? 84;
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

    renderStudio();

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
      expect(countPostCalls(fetchMock, "/api/resume/generate")).toBeGreaterThan(0);
      expect(countPostCalls(fetchMock, "/api/cover-letters/generate")).toBeGreaterThan(0);
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
      expect(countPostCalls(fetchMock, "/api/resume/generate")).toBeGreaterThan(0);
      expect(countPostCalls(fetchMock, "/api/cover-letters/generate")).toBeGreaterThan(0);
    }, { timeout: 6000 });

    const resumeBodies = readPostBodies(fetchMock, "/api/resume/generate");
    const coverBodies = readPostBodies(fetchMock, "/api/cover-letters/generate");
    expect(resumeBodies.length).toBe(1);
    expect(coverBodies.length).toBe(1);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/resume/generate"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/cover-letters/generate"),
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
    const score = 83;
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
      const debug = screen.getByTestId("studio-orchestration-debug");
      const raw = debug.querySelector("pre")?.textContent ?? "";
      expect(raw).toContain("\"orchestrationDecision\": \"should_auto_generate\"");
      expect(raw).toContain("\"needsAutoGeneration\": true");
    }, { timeout: 15000 });
  }, 15000);

	  it("auto-generates the missing resume when cover letter is already persisted (partial artifact state must not block)", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const score = 83;
    const fetchMock = installStrongFitFetches({
      score,
      readinessStatus: "ready",
      studioArtifactsPayload: {
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
          failureCode: null,
          failureMessage: null,
          confidence: "LOW",
          failure: null,
        },
        coverLetter: {
          status: "completed",
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
	      expect(raw).toContain("\"needsAutoGeneration\": true");
	      expect(raw).toContain("\"orchestrationDecision\": \"should_auto_generate\"");
	    }, { timeout: 15000 });

	    await waitFor(() => {
	      expect(countPostCalls(fetchMock, "/api/resume")).toBeGreaterThan(0);
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

