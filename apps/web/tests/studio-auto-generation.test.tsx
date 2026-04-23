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

function resolveAutoGenerationSuccess(input: RequestInfo) {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.endsWith("/api/resume")) {
    return Promise.resolve(
      createResponse({
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
  readinessStatus?: "ready" | "limited";
  resumeOk?: boolean;
  coverOk?: boolean;
}) {
  const score = options?.score ?? 84;
  const readinessStatus = options?.readinessStatus ?? "ready";
  const resumeOk = options?.resumeOk ?? true;
  const coverOk = options?.coverOk ?? true;
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
          scoring_v2: { score },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          verification_coverage: {
            totalClaims: 3,
            verifiedClaims: readinessStatus === "ready" ? 3 : 1,
            inferredClaims: readinessStatus === "limited" ? 2 : 0,
            unverifiedClaims: readinessStatus === "limited" ? 1 : 0,
            unverifiedRequirements: readinessStatus === "limited" ? ["Salesforce"] : [],
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
                    code: "personalization_limitation",
                    message: "Some evidence is still lighter than others.",
                  },
                ],
          compliance_flags: [],
        }),
      );
    }
    if (url.includes("/api/studio/artifacts")) {
      // Default to failing the backend hydration call so tests can exercise local-storage hydration.
      return Promise.resolve(createResponse({ message: "not found" }, false, 404));
    }
    if (url.endsWith("/api/resume") && init?.method === "POST") {
      return resumeOk
        ? resolveAutoGenerationSuccess(input)
        : Promise.resolve(createResponse({ message: "Resume generation failed." }, false, 500));
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
    return url.endsWith(suffix) && (init as RequestInit | undefined)?.method === "POST";
  }).length;
}

function readPostBodies(fetchMock: ReturnType<typeof vi.fn>, suffix: string): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([input, init]) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      return url.endsWith(suffix) && (init as RequestInit | undefined)?.method === "POST";
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
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("auto-generates resume and cover letter on Studio entry for strong fits", async () => {
    const fetchMock = installStrongFitFetches({ readinessStatus: "ready" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-resume-ready-panel")).toBeInTheDocument();
      expect(screen.getByTestId("studio-cover-ready-panel")).toBeInTheDocument();
    }, { timeout: 6000 });

    const resumeBodies = readPostBodies(fetchMock, "/api/resume");
    const coverBodies = readPostBodies(fetchMock, "/api/cover-letters");

    // Single-flight contract: only one non-strict launch per artifact. A strict trust-validation retry is allowed.
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
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/opportunities"),
      expect.objectContaining({ method: "POST" }),
    );
  }, 15000);

  it("still auto-generates when verification confidence is limited", async () => {
    const fetchMock = installStrongFitFetches({ readinessStatus: "limited" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-resume-ready-panel")).toBeInTheDocument();
      expect(screen.getByTestId("studio-cover-ready-panel")).toBeInTheDocument();
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

  it("does not auto-generate below the generate-now floor (score 71)", async () => {
    const fetchMock = installStrongFitFetches({ score: 71, readinessStatus: "limited" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume Draft" })).toBeInTheDocument();
    }, { timeout: 6000 });

    // No implicit POSTs until the user clicks generate in non-generate-now lanes.
    expect(countPostCalls(fetchMock, "/api/resume")).toBe(0);
    expect(countPostCalls(fetchMock, "/api/cover-letters")).toBe(0);
  });

  it("does not auto-generate at exactly 70 (generation is user-triggered below 80)", async () => {
    const fetchMock = installStrongFitFetches({ score: 70, readinessStatus: "limited" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate Resume Draft" })).toBeInTheDocument();
    }, { timeout: 6000 });

    expect(countPostCalls(fetchMock, "/api/resume")).toBe(0);
    expect(countPostCalls(fetchMock, "/api/cover-letters")).toBe(0);
  });

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
      expect(countPostCalls(fetchMock, "/api/resume")).toBe(resumePostsBefore + 1);
      expect(countPostCalls(fetchMock, "/api/cover-letters")).toBe(coverPostsBefore + 1);
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

    const storageKey = "ttr:studio-artifacts:job-1:base-1";
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
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

    const fetchMock = installStrongFitFetches({ readinessStatus: "ready" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-resume-ready-panel")).toBeInTheDocument();
      expect(screen.getByTestId("studio-cover-ready-panel")).toBeInTheDocument();
    }, { timeout: 6000 });
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
    });

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
      expect(countPostCalls(fetchMock, "/api/resume")).toBe(1);
    });

    first.unmount();
    const second = renderStudio();

    await waitFor(() => {
      expect(countPostCalls(fetchMock, "/api/resume")).toBe(1);
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

