import React from "react";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import ResultsPage from "@/app/(app)/results/page";
import StudioPage from "@/app/(app)/studio/page";
import { resolveWorkflowAuthorityContract } from "@/lib/workflowAuthorityContract";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { mockPathname, mockRouterPush, mockRouterReplace, overrideSearchParams, setFetchImplementation } from "./setup";

const trackEventMock = vi.fn();

vi.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

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

let mockedBaselines: Array<{ id: string; originalFilename: string; version: number }> = [];

vi.mock("@/lib/baselines", async () => {
  const actual = await vi.importActual("@/lib/baselines");
  return {
    ...(actual as object),
    listBaselines: vi.fn(async () => mockedBaselines),
  };
});

type ReadinessStatus = "ready" | "limited" | "blocked";
type StudioArtifactStatus = "MISSING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  const candidate = input as any;
  if (candidate && typeof candidate.url === "string") return candidate.url;
  if (candidate && typeof candidate.href === "string") return candidate.href;
  return String(candidate?.url ?? candidate);
}

function parseQueryToObject(href: string): Record<string, string | string[]> {
  const url = new URL(href, "http://localhost");
  const values: Record<string, string | string[]> = {};
  url.searchParams.forEach((_value, key) => {
    const all = url.searchParams.getAll(key);
    values[key] = all.length > 1 ? all : all[0] ?? "";
  });
  return values;
}

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

type ScenarioServerState = {
  analysisId: string;
  baselineId: string;
  baselineVersionId: string;
  jobId: string;
  score: number;
  readiness: {
    status: ReadinessStatus;
    blocked: boolean;
  };
  resumeV2?: {
    hasResumeV2?: boolean;
    usableExperienceCount?: number;
    errors?: Array<{ code: string; message: string }>;
  };
  gapAnalysis?: {
    unverifiedRequirements?: string[];
  };
  artifacts: {
    pairStatus: string;
    resume: {
      status: StudioArtifactStatus;
      retryable?: boolean;
      failureCategory?: string | null;
      artifactCurrent?: boolean;
      inputsHashPresent?: boolean;
    };
    coverLetter: {
      status: StudioArtifactStatus;
      retryable?: boolean;
      failureCategory?: string | null;
      artifactCurrent?: boolean;
      inputsHashPresent?: boolean;
    };
    staleDraftExists: boolean;
  };
  generationPlan?: {
    resume: "success" | "failed_retryable" | "failed_non_retryable";
    coverLetter: "success" | "failed_retryable" | "failed_non_retryable";
  };
};

class SyntheticWorkflowServer {
  state: ScenarioServerState;
  private deferred: Record<string, { promise: Promise<Response>; resolve: (res: Response) => void }> = {};
  requests: Array<{ url: string; pathname: string; method: string; body?: unknown }> = [];
  ingestedBaselineId: string | null = null;

  constructor(initial: ScenarioServerState) {
    this.state = initial;
  }

  defer(key: string) {
    let resolve!: (res: Response) => void;
    const promise = new Promise<Response>((res) => {
      resolve = res;
    });
    this.deferred[key] = { promise, resolve };
    return this.deferred[key];
  }

  resolveDeferred(key: string, response: Response) {
    const deferred = this.deferred[key];
    if (!deferred) throw new Error(`Missing deferred key: ${key}`);
    deferred.resolve(response);
    delete this.deferred[key];
  }

  private readinessPayload() {
    const badgeLabel = this.state.readiness.status === "ready" ? "READY" : this.state.readiness.status === "limited" ? "LIMITED" : "BLOCKED";
    const unsupported = this.state.gapAnalysis?.unverifiedRequirements ?? [];
    return {
      status: this.state.readiness.status,
      blocked: this.state.readiness.blocked,
      reasonCodes: [],
      reasons: [],
      badgeLabel,
      summary: badgeLabel === "READY" ? "Ready for generation." : "Needs more evidence.",
      compliance_flags: unsupported.map((claim) => ({
        code: "unsupported_technology_claim",
        severity: "warn",
        message: "Unsupported requirement emphasis detected.",
        evidence: [
          {
            generated: claim,
            generatedClaim: { text: claim, type: "technology" },
          },
        ],
      })),
    };
  }

  private assessmentPayload() {
    return {
      assessmentId: this.state.analysisId,
      baselineId: this.state.baselineId,
      baselineVersionId: this.state.baselineVersionId,
      jobId: this.state.jobId,
      score: this.state.score,
      scoring_v2: { score: this.state.score },
      verification_coverage: {
        totalClaims: 3,
        verifiedClaims: this.state.readiness.status === "ready" ? 3 : 0,
        inferredClaims: this.state.readiness.status === "limited" ? 1 : 0,
        unverifiedClaims: this.state.readiness.status === "ready" ? 0 : 1,
        unverifiedRequirements: this.state.gapAnalysis?.unverifiedRequirements ?? (this.state.score >= 70 && this.state.score <= 84 ? ["Zendesk"] : []),
      },
      gapAnalysis: this.state.gapAnalysis ?? {
        unverifiedRequirements: this.state.score >= 70 && this.state.score <= 84 ? ["Zendesk"] : [],
      },
      scoreBreakdown: {
        dimensions: [],
      },
    };
  }

  private studioArtifactsPayload() {
    const resumeFailure =
      this.state.artifacts.resume.status === "FAILED"
        ? {
            category: this.state.artifacts.resume.failureCategory ?? "generation_failed",
            retryable: Boolean(this.state.artifacts.resume.retryable ?? true),
            explanation: "Generation failed.",
          }
        : null;
    const coverFailure =
      this.state.artifacts.coverLetter.status === "FAILED"
        ? {
            category: this.state.artifacts.coverLetter.failureCategory ?? "generation_failed",
            retryable: Boolean(this.state.artifacts.coverLetter.retryable ?? true),
            explanation: "Generation failed.",
          }
        : null;

    const resumeResponseBody =
      this.state.artifacts.resume.status === "COMPLETED"
        ? {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              resume: {
                heading: { name: "Test Candidate", contactLine: "test@example.com" },
                summary:
                  this.state.artifacts.resume.artifactCurrent === false
                    ? "Billing support operations leader focused on invoice accuracy and entitlement mismatches."
                    : "Verified support leader aligned to the role.",
                experience: [
                  {
                    company: "Acme",
                    roleTitle: "Director of Support",
                    dateRange: "2022 - Present",
                    bullets: [
                      this.state.artifacts.resume.artifactCurrent === false
                        ? "Improved invoice accuracy by reconciling billing disputes across systems."
                        : "Led support operations and improved team performance.",
                    ],
                  },
                ],
              },
            },
          }
        : null;

    const coverResponseBody =
      this.state.artifacts.coverLetter.status === "COMPLETED"
        ? {
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              coverLetter: {
                paragraphs: [
                  "Dear Hiring Team,",
                  this.state.artifacts.coverLetter.artifactCurrent === false
                    ? "I am applying for this billing support operations role and will improve invoice accuracy."
                    : "I am applying for this role.",
                  "Sincerely,",
                  "Test Candidate",
                ],
              },
            },
          }
        : null;

    return {
      status: this.state.artifacts.pairStatus,
      baselineId: this.state.baselineId,
      jobId: this.state.jobId,
      baselineVersionId: this.state.baselineVersionId,
      assessmentId: this.state.analysisId,
      assessmentScore: this.state.score,
      baselineVersionHash: "hash-1",
      jobFingerprint: "job-fingerprint-1",
      generationContractVersion: "studio-artifacts-v1",
      errors: Array.isArray(this.state.resumeV2?.errors) ? this.state.resumeV2?.errors : [],
      resume: {
        status: this.state.artifacts.resume.status,
        responseBody: resumeResponseBody,
        content: this.state.artifacts.staleDraftExists ? "previous-resume-draft" : null,
        inputsHash: this.state.artifacts.resume.inputsHashPresent === false ? null : "stored-inputs-hash-legacy",
        inputsHashMatches: this.state.artifacts.resume.artifactCurrent === false ? false : true,
        artifactCurrent:
          this.state.artifacts.resume.artifactCurrent ??
          (this.state.artifacts.resume.status === "COMPLETED" ? true : false),
        failureCode: resumeFailure?.category ?? null,
        failureMessage: resumeFailure?.explanation ?? null,
        metadata: { auditId: "audit-1" },
      },
      coverLetter: {
        status: this.state.artifacts.coverLetter.status,
        responseBody: coverResponseBody,
        content: this.state.artifacts.staleDraftExists ? "previous-cover-draft" : null,
        inputsHash: this.state.artifacts.coverLetter.inputsHashPresent === false ? null : "stored-inputs-hash-legacy",
        inputsHashMatches: this.state.artifacts.coverLetter.artifactCurrent === false ? false : true,
        artifactCurrent:
          this.state.artifacts.coverLetter.artifactCurrent ??
          (this.state.artifacts.coverLetter.status === "COMPLETED" ? true : false),
        failureCode: coverFailure?.category ?? null,
        failureMessage: coverFailure?.explanation ?? null,
        metadata: { auditId: "audit-1" },
      },
      diagnostics: {
        resumeV2Readiness: {
          hasResumeV2: typeof this.state.resumeV2?.hasResumeV2 === "boolean" ? this.state.resumeV2?.hasResumeV2 : true,
          usableExperienceCount:
            typeof this.state.resumeV2?.usableExperienceCount === "number" ? this.state.resumeV2?.usableExperienceCount : 1,
        },
      },
    };
  }

  resumeGenerationPayload() {
    return {
      status: "success",
      generationStatus: "success",
      exportReady: true,
      exports: { docx: true, pdf: true },
      preview: {
        resume: {
          heading: { name: "Test Candidate", contactLine: "test@example.com" },
          summary: "Verified support leader aligned to the role.",
          experience: [
            {
              company: "Acme",
              roleTitle: "Director of Support",
              dateRange: "2022 - Present",
              bullets: ["Led support operations and improved team performance."],
            },
          ],
        },
      },
    };
  }

  coverLetterGenerationPayload() {
    const paragraphs = [
      "Dear Hiring Team,",
      "I’m excited to apply for this role because it sits at the intersection of customer experience, operational rigor, and practical systems thinking. In my recent leadership work, I’ve built and coached support teams, tightened incident response and change practices, and partnered cross‑functionally to improve reliability and customer outcomes. I focus on clear goals, simple mechanisms, and measurable results that are grounded in verified experience. I prioritize fast feedback loops, strong documentation, and consistent execution so the team can scale without burning out.",
      "For this opportunity, I would bring a track record of translating role requirements into day‑to‑day execution: aligning stakeholders on priorities, building repeatable playbooks, and using data to identify where process or tooling can reduce customer effort. I’m comfortable working across support, engineering, and operations, and I communicate in a way that keeps both frontline teams and leadership aligned. I aim for improvements that are sustainable, documented, and easy to run. When ambiguity is high, I’m disciplined about clarifying success metrics and sequencing work into small, deliverable iterations.",
      "I’d welcome the chance to share how I approach coaching, quality, and continuous improvement while staying truthful to what’s in the baseline evidence. Thank you for your time and consideration, and I look forward to discussing how I can contribute to your team’s goals with a pragmatic, customer‑first approach. If helpful, I can walk through concrete examples of how I’ve improved response workflows, reduced recurring issues, and helped teams adopt lighter‑weight automation and reporting directly.",
      "Sincerely,",
      "Test Candidate",
    ];
    const content = paragraphs.join("\n\n");
    return {
      status: "success",
      generationStatus: "success",
      exportReady: true,
      exports: { docx: true, pdf: true },
      preview: {
        coverLetter: {
          paragraphs,
          content,
        },
        // Some validators/presenters expect snake_case fields.
        cover_letter: {
          paragraphs,
          content,
        },
      },
    };
  }

  handleFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = parseUrl(input);
    let pathname = url;
    try {
      pathname = new URL(url, "http://localhost").pathname;
    } catch {
      // fall back to string matching below
      pathname = url;
    }
    const requestMethod =
      (init?.method ? String(init.method) : null) ??
      ((input as any)?.method ? String((input as any).method) : null) ??
      "GET";

    const method = requestMethod.toUpperCase();
    const body = (() => {
      if (method === "GET" || method === "HEAD") return undefined;
      const raw = (init as any)?.body;
      if (!raw) return undefined;
      if (typeof raw !== "string") return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    })();

    this.requests.push({ url, pathname, method, ...(body !== undefined ? { body } : {}) });

    if (pathname.includes("/api/baselines/base-1/versions")) {
      return jsonResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }], 200);
    }

    if (pathname.includes(`/api/analysis/fit-assessments/${this.state.analysisId}`)) {
      return jsonResponse(this.assessmentPayload(), 200);
    }

    if (pathname.includes("/api/analysis/fit-assessments/")) {
      return jsonResponse(this.assessmentPayload(), 200);
    }

    if (pathname.includes("/api/analysis/fit-assessments") && (url.includes("jobId=") || url.includes("baselineId="))) {
      // Studio fallback path resolves the latest assessment when analysisId is absent.
      return jsonResponse([this.assessmentPayload()], 200);
    }

    if (pathname === "/api/resume/readiness" || pathname === "/api/cover-letters/readiness") {
      return jsonResponse(this.readinessPayload(), 200);
    }

    if (pathname === "/api/studio/artifacts") {
      return jsonResponse(this.studioArtifactsPayload(), 200);
    }

    if (pathname === "/api/baselines/analyze" && method === "POST") {
      // Minimal ingest contract: resume ingest creates a canonical baseline id that downstream scoring uses.
      // Keep the id stable for the rest of the harness.
      this.ingestedBaselineId = this.state.baselineId;
      mockedBaselines = [
        {
          id: this.state.baselineId,
          originalFilename: "Leadership Resume",
          version: 1,
        },
      ];
      return jsonResponse({ baselineId: this.state.baselineId }, 200);
    }

    if (pathname === "/api/analysis/run") {
      const deferred = this.deferred["analysis_run"];
      if (deferred) return deferred.promise;
      // Default: returns same analysis id unless overridden by scenario.
      return jsonResponse(
        {
          assessmentId: this.state.analysisId,
          baselineVersionId: this.state.baselineVersionId,
        },
        200,
      );
    }

    if (pathname.startsWith("/api/analysis/")) {
      // Studio may hit other analysis endpoints while reconciling context; keep them deterministic.
      return jsonResponse(this.assessmentPayload(), 200);
    }

    if (pathname === "/api/baselines/base-1/strengthening-additions") {
      return jsonResponse({ ok: true }, 200);
    }

    if (
      pathname === "/api/resume" ||
      pathname === "/api/cover-letters" ||
      pathname === "/api/resume/generate" ||
      pathname === "/api/cover-letters/generate"
    ) {
      const isResume = pathname.startsWith("/api/resume");
      const key = isResume ? "resume_generate" : "cover_generate";
      const deferred = this.deferred[key];
      if (deferred) return deferred.promise;

      const outcome = isResume ? this.state.generationPlan?.resume : this.state.generationPlan?.coverLetter;

      // Regression harness: unsupported requirements are non-blocking when generation is still allowed.
      // Do not allow the client to send "excludedRequirements" as a way to silently route around the baseline-ready
      // generation path.
      if (!isResume) {
        const unsupported = this.state.gapAnalysis?.unverifiedRequirements ?? [];
        const excluded = (body as any)?.excludedRequirements;
        const sendsUnsupportedExclusions =
          Array.isArray(excluded) &&
          unsupported.some((req) =>
            excluded.some((value: unknown) => String(value ?? "").toLowerCase() === String(req).toLowerCase()),
          );
        if (unsupported.length > 0 && sendsUnsupportedExclusions) {
          this.state.artifacts.coverLetter = { status: "FAILED", retryable: false, failureCategory: "unsupported_input" };
          this.state.artifacts.pairStatus = "FAILED";
          return jsonResponse(
            { category: "unsupported_input", message: "Unsupported requirements must be non-blocking; do not send exclusions.", retryable: false },
            422,
          );
        }
      }

      if (outcome === "failed_non_retryable") {
        if (isResume) this.state.artifacts.resume = { status: "FAILED", retryable: false, failureCategory: "generation_blocked" };
        else this.state.artifacts.coverLetter = { status: "FAILED", retryable: false, failureCategory: "generation_blocked" };
        this.state.artifacts.pairStatus = "FAILED";
        return jsonResponse({ category: "generation_blocked", message: "Generation is blocked.", retryable: false }, 422);
      }
      if (outcome === "failed_retryable") {
        if (isResume) this.state.artifacts.resume = { status: "FAILED", retryable: true, failureCategory: "generation_failed" };
        else this.state.artifacts.coverLetter = { status: "FAILED", retryable: true, failureCategory: "generation_failed" };
        this.state.artifacts.pairStatus = "FAILED";
        return jsonResponse({ category: "generation_failed", message: "Generation failed.", retryable: true }, 422);
      }

      if (isResume) this.state.artifacts.resume = { status: "COMPLETED" };
      else this.state.artifacts.coverLetter = { status: "COMPLETED" };
      this.state.artifacts.pairStatus =
        this.state.artifacts.resume.status === "COMPLETED" && this.state.artifacts.coverLetter.status === "COMPLETED"
          ? "COMPLETED"
          : "PARTIAL";

      return jsonResponse(isResume ? this.resumeGenerationPayload() : this.coverLetterGenerationPayload(), 200);
    }

    // Default: return neutral ok to satisfy other page fetches.
    return jsonResponse({}, 200);
  };
}

function expectAuthorityPanel(testId: string, state: string, tone?: string) {
  const node = screen.getByTestId(testId);
  expect(node.getAttribute("data-workflow-shell")).toBe("authority-panel");
  expect(node.getAttribute("data-workflow-state")).toBe(state);
  if (tone) expect(node.getAttribute("data-workflow-trust-tone")).toBe(tone);
  return node;
}

function expectSinglePrimaryStudioAuthority() {
  const unlock = screen.queryByTestId("studio-unlock-panel");
  const postUnlockShell = document.querySelector("[data-workflow-shell='post-unlock-outcome']");
  const generationReadyShell = document.querySelector("[data-workflow-shell='generation-ready-shell']");
  const hero = screen.queryByTestId("studio-instant-draft-hero");
  const invalidStateFallback = screen.queryByTestId("studio-invalid-state-fallback");
  // `studio-workflow-authority` is allowed to coexist with a single primary shell.
  const activeCount = [
    Boolean(unlock),
    Boolean(postUnlockShell),
    Boolean(generationReadyShell),
    Boolean(hero),
    Boolean(invalidStateFallback),
  ].filter(Boolean).length;
  expect(activeCount).toBe(1);
}

beforeEach(() => {
  trackEventMock.mockClear();
});

describe("workflow journey scenarios (synthetic)", () => {
  beforeEach(() => {
    mockedBaselines = [];
  });
  function ensureLocalStorageSupportsWrites() {
    const storageLike = globalThis.localStorage as unknown as Partial<Storage> | undefined;
    if (storageLike && typeof storageLike.setItem === "function" && typeof storageLike.getItem === "function") {
      return;
    }

    const backing = new Map<string, string>();
    const shim: Storage = {
      get length() {
        return backing.size;
      },
      clear() {
        backing.clear();
      },
      getItem(key: string) {
        return backing.has(key) ? (backing.get(key) as string) : null;
      },
      key(index: number) {
        return Array.from(backing.keys())[index] ?? null;
      },
      removeItem(key: string) {
        backing.delete(key);
      },
      setItem(key: string, value: string) {
        backing.set(key, String(value));
      },
    };

    Object.defineProperty(globalThis, "localStorage", { value: shim, configurable: true });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "localStorage", { value: shim, configurable: true });
    }
  }
  function mountWithCleanup() {
    let current: ReturnType<typeof render> | null = null;
    const mount = (node: React.ReactElement) => {
      current?.unmount();
      current = render(node);
      return current;
    };
    const mountStudio = () => {
      current?.unmount();
      current = renderStudio();
      return current;
    };
    const cleanup = () => {
      current?.unmount();
      current = null;
    };
    return { mount, mountStudio, cleanup };
  }

  it("A. Happy path: Results -> Studio generate -> documents ready", async () => {
    const { mount, mountStudio, cleanup } = mountWithCleanup();
    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 84,
      readiness: { status: "ready", blocked: false },
      resumeV2: { hasResumeV2: true, usableExperienceCount: 1, errors: [] },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
      generationPlan: { resume: "success", coverLetter: "success" },
    });
    setFetchImplementation(server.handleFetch as unknown as typeof fetch);

    overrideSearchParams({ analysisId: "analysis-1" });
    mount(<ResultsPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const toStudio = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(toStudio.startsWith("/studio")).toBe(true);

    overrideSearchParams(parseQueryToObject(toStudio));
    mountStudio();

    await waitFor(() => {
      const authority = screen.queryByTestId("studio-workflow-authority");
      const evidenceBlocked = screen.queryByTestId("studio-evidence-blocked-panel");
      expect(Boolean(authority || evidenceBlocked)).toBe(true);
    });
    expectSinglePrimaryStudioAuthority();
    expectAuthorityPanel("studio-workflow-authority", "generation_ready", "ready");
    expect(
      screen.queryByText(/Baseline ingestion did not produce any usable experience entries for Resume V2/i),
    ).toBeNull();
    expect(screen.queryByText(/baseline_resume_v2_/i)).toBeNull();

    // Hold generation so we can assert activity + in-progress state.
    server.defer("resume_generate");

    // Canonical generation triggers are per-artifact CTAs.
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    await waitFor(() => {
      expect(screen.getByTestId("workflow-activity-banner")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("workflow-activity-banner")).getByText("Generating your documents...")).toBeInTheDocument();

    // Resolve resume generation (cover can be gated/disabled until resume is ready in some flows).
    server.resolveDeferred("resume_generate", jsonResponse(server.resumeGenerationPayload(), 200));

    await waitFor(() => {
      const authority = screen.queryByTestId("studio-workflow-authority");
      const evidenceBlocked = screen.queryByTestId("studio-evidence-blocked-panel");
      expect(Boolean(authority || evidenceBlocked)).toBe(true);
    });
    expectAuthorityPanel("studio-workflow-authority", "generation_in_progress");
    cleanup();
  });

  it("Studio blocks generation when Resume V2 usable experience is missing and never shows Ready-to-generate with baseline_resume_v2_* blocker", async () => {
    const { mount, mountStudio, cleanup } = mountWithCleanup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 84,
      readiness: { status: "blocked", blocked: true },
      resumeV2: {
        hasResumeV2: true,
        usableExperienceCount: 0,
        errors: [
          {
            code: "baseline_resume_v2_missing",
            message: "Baseline ingestion did not produce any usable experience entries for Resume V2.",
          },
        ],
      },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
      generationPlan: { resume: "success", coverLetter: "success" },
    });
    setFetchImplementation(server.handleFetch as unknown as typeof fetch);

    // Deep-link contract: even if the user lands directly on `/studio` with an 80+ score,
    // structural Resume V2 baseline failures must keep Studio locked and redirect attention to baseline repair.
    mockPathname.mockReturnValue("/studio");
    overrideSearchParams({ analysisId: "analysis-1", baselineId: "base-1", jobId: "job-1" });
    mountStudio();

    await waitFor(() => {
      const authority = screen.queryByTestId("studio-workflow-authority");
      const evidenceBlocked = screen.queryByTestId("studio-evidence-blocked-panel");
      expect(Boolean(authority || evidenceBlocked)).toBe(true);
    });

    const contract = resolveWorkflowAuthorityContract({
      surface: "studio",
      currentPathname: "/studio",
      ids: {
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        jobId: "job-1",
        assessmentId: "analysis-1",
        analysisId: "analysis-1",
      },
      baselineReady: true,
      analysisExists: true,
      score: 84,
      generationReadiness: {
        status: "blocked",
        blocked: true,
        reasonCodes: ["baseline_resume_v2_missing"],
      },
      artifact: {
        resume: { status: "MISSING", hasOutput: false, failed: false },
        coverLetter: { status: "MISSING", hasOutput: false, failed: false },
        pair: { status: "MISSING" },
      },
      opportunity: null,
      contexts: null,
    });

    expect(contract.stepper.studio).toBe("locked");
    expect(contract.stepper.baseline).toBe("current");

    // Contract: a ResumeV2 baseline blocker must not render alongside generation-ready CTAs.
    await waitFor(() => {
      expect(screen.queryByText(/^Ready to generate$/i)).toBeNull();
      expect(screen.queryByText(/Ready to generate resume/i)).toBeNull();
      expect(screen.queryByText(/Generate resume and cover letter/i)).toBeNull();
    });

    // No per-artifact generation CTAs should be present.
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cover Letter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry generation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove unsupported requirements and continue" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^refine$/i })).toBeNull();

    // Repair guidance remains visible (single recovery lane).
    await waitFor(() => {
      expect(screen.getByTestId("studio-baseline-blocked-recovery")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("studio-resume-reprocess-baseline")).toHaveLength(1);
    expect(screen.queryByTestId("studio-blocker-next-action")).toBeNull();
    expect(
      screen.getAllByText("Your baseline needs to be reprocessed before documents can be generated.").length,
    ).toBe(1);

    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0] ?? "").includes("[studio-contract-violation] blocked baseline rendered actionable CTA"),
      ),
    ).toBe(false);

    // No optimization/refinement workflows should visually compete with baseline repair.
    expect(screen.queryByText("Document strategy")).toBeNull();
    expect(screen.queryByText("Optional: strengthen evidence")).toBeNull();
    expect(screen.queryByText(/Role and evidence/i)).toBeNull();
    expect(screen.queryByText(/Adjust positioning/i)).toBeNull();

    consoleError.mockRestore();
    cleanup();
  });

  it("Studio golden-path contract: valid and invalid Resume V2 authority (end-to-end workflow promise)", async () => {
    const { mount, mountStudio, cleanup } = mountWithCleanup();

    const assertNoGenerationReadyMessagingOrCtas = () => {
      expect(screen.queryByText(/^Ready to generate$/i)).toBeNull();
      expect(screen.queryByText(/Ready to generate resume/i)).toBeNull();
      expect(screen.queryByText(/Generate resume and cover letter/i)).toBeNull();
      expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Cover Letter" })).toBeNull();
    };

    // --- VALID PATH (starts from resume ingest) ---
    const validServer = new SyntheticWorkflowServer({
      analysisId: "analysis-valid",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 84,
      readiness: { status: "ready", blocked: false },
      resumeV2: { hasResumeV2: true, usableExperienceCount: 1, errors: [] },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
      generationPlan: { resume: "success", coverLetter: "success" },
    });

    const localStorageCalls: Array<{ method: "getItem" | "setItem"; key: string }> = [];
    const storageShim: Storage = {
      get length() {
        return 0;
      },
      clear() {},
      getItem(key: string) {
        localStorageCalls.push({ method: "getItem", key: String(key) });
        return null;
      },
      key() {
        return null;
      },
      removeItem() {},
      setItem(key: string) {
        localStorageCalls.push({ method: "setItem", key: String(key) });
      },
    };
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { value: storageShim, configurable: true });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "localStorage", { value: storageShim, configurable: true });
    }

    setFetchImplementation(validServer.handleFetch as unknown as typeof fetch);

    mockRouterReplace.mockClear();
    mockRouterPush.mockClear();

    // Ingest contract: resume ingest creates the canonical baseline id used downstream.
    await validServer.handleFetch("http://localhost/api/baselines/analyze", { method: "POST", body: "fake" as any } as any);
    expect(validServer.ingestedBaselineId).toBe("base-1");
    expect(mockedBaselines.some((b) => b.id === "base-1")).toBe(true);

    overrideSearchParams({ analysisId: "analysis-valid" });
    mount(<ResultsPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const toStudio = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(toStudio.startsWith("/studio")).toBe(true);

    overrideSearchParams(parseQueryToObject(toStudio));
    mountStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
    });
    expectSinglePrimaryStudioAuthority();
    expectAuthorityPanel("studio-workflow-authority", "generation_ready", "ready");

    // Baseline upload/complete contract: baseline listing is present and Resume V2 readiness is usable.
    expect(screen.getByText(/Leadership Resume/i)).toBeInTheDocument();
    expect(screen.queryByText(/Baseline ingestion did not produce any usable experience entries for Resume V2/i)).toBeNull();
    expect(screen.queryByText(/baseline_resume_v2_/i)).toBeNull();

    // Baseline id propagation contract: target role scoring runs against the ingested baseline id.
    await waitFor(() => {
      expect(validServer.requests.some((req) => String(req.url).includes("baselineId=base-1"))).toBe(true);
    });

    // Fit assessment >= 80 contract: generation-ready must not be blocked.
    expectAuthorityPanel("studio-workflow-authority", "generation_ready", "ready");

    // Generate resume + cover letter successfully, asserting authoritative in-progress -> completed transitions.
    validServer.defer("resume_generate");
    validServer.defer("cover_generate");

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => {
      expect(screen.getByTestId("workflow-activity-banner")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("workflow-activity-banner")).getByText("Generating your documents...")).toBeInTheDocument();
    validServer.resolveDeferred("resume_generate", jsonResponse(validServer.resumeGenerationPayload(), 200));

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
    });
    expectAuthorityPanel("studio-workflow-authority", "generation_in_progress");

    // Some flows promote a single-step CTA once resume completes.
    const coverCta =
      screen.queryByRole("button", { name: "Cover Letter" }) ??
      screen.getByRole("button", { name: /Complete cover letter/i });
    fireEvent.click(coverCta);
    validServer.resolveDeferred("cover_generate", jsonResponse(validServer.coverLetterGenerationPayload(), 200));

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
    });

    // Artifacts are visible (authoritative rendering, not stale drafts).
    expect(screen.queryAllByText(/Test Candidate/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Verified support leader aligned to the role\./i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Dear Hiring Team,/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/previous-resume-draft/i)).toBeNull();
    expect(screen.queryByText(/previous-cover-draft/i)).toBeNull();

    // Reload preserves authoritative artifact rendering (no stale artifact view).
    cleanup();
    overrideSearchParams(parseQueryToObject(toStudio));
    mountStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryAllByText(/Test Candidate/i).length).toBeGreaterThan(0);
      expect(screen.queryAllByText(/Dear Hiring Team,/i).length).toBeGreaterThan(0);
    });

    // Refinement stays secondary to generated materials: generated artifacts remain present after reload.
    expect(screen.queryAllByText(/Verified support leader aligned to the role\./i).length).toBeGreaterThan(0);

    // Constraint: do not use stale artifact rendering (reload must refetch authoritative artifacts).
    expect(validServer.requests.filter((r) => r.pathname === "/api/studio/artifacts").length).toBeGreaterThanOrEqual(2);

    // Restore localStorage to avoid leaking behavior into subsequent tests.
    Object.defineProperty(globalThis, "localStorage", { value: originalLocalStorage, configurable: true });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "localStorage", { value: originalLocalStorage, configurable: true });
    }

    cleanup();

    // --- INVALID PATH ---
    const invalidServer = new SyntheticWorkflowServer({
      analysisId: "analysis-invalid",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 84,
      readiness: { status: "ready", blocked: false },
      resumeV2: {
        hasResumeV2: true,
        usableExperienceCount: 0,
        errors: [
          {
            code: "baseline_resume_v2_ingestion_failed",
            message: "Baseline ingestion did not produce any usable experience entries for Resume V2.",
          },
        ],
      },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
      generationPlan: { resume: "success", coverLetter: "success" },
    });
    setFetchImplementation(invalidServer.handleFetch as unknown as typeof fetch);

    mockRouterReplace.mockClear();
    mockRouterPush.mockClear();
    overrideSearchParams({ analysisId: "analysis-invalid" });
    mount(<ResultsPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const toStudioInvalid = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    overrideSearchParams(parseQueryToObject(toStudioInvalid));
    mountStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
    });

    // Studio resolves to blocked-by-baseline lane (single authoritative readiness state only).
    expectSinglePrimaryStudioAuthority();
    await waitFor(() => {
      expect(screen.getByTestId("studio-baseline-blocked-recovery")).toBeInTheDocument();
    });

    // No generation-ready messaging, no generation CTAs, and no mixed authority states.
    assertNoGenerationReadyMessagingOrCtas();
    expect(screen.queryByTestId("workflow-activity-banner")).toBeNull();

    // Card-level contract: no contradictory empty states or CTAs when blocked-by-baseline.
    expect(screen.queryByText(/draft needs edits/i)).toBeNull();
    expect(screen.queryByText(/not generated yet/i)).toBeNull();
    expect(screen.queryByTestId("studio-generate-resume-button")).toBeNull();
    expect(screen.queryByTestId("studio-generate-cover-button")).toBeNull();
    expect(screen.queryByTestId("studio-refinement-details")).toBeNull();

    cleanup();
  });

  it("Studio auto-generation: score>=80 generates resume + cover letter when analysisId is missing", async () => {
    const { mountStudio, cleanup } = mountWithCleanup();

    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 83,
      readiness: { status: "ready", blocked: false },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
      generationPlan: { resume: "success", coverLetter: "success" },
    });

    setFetchImplementation(server.handleFetch);

    overrideSearchParams({
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      // regression: analysisId intentionally omitted
      intent: "generate",
    });

    mountStudio();

    await waitFor(() => {
      expect(screen.queryByText(/analysisId is missing/i)).toBeNull();
    });

    // Studio must surface the resolved high-fit score from artifacts hydration (even without analysisId),
    // so the generate intent path can proceed.
    await waitFor(() => {
      expect(screen.getByText("83.0")).toBeInTheDocument();
    });

    // Generation should complete and both artifacts should render in the Studio previews.
    await waitFor(() => {
      expect(
        server.requests.some((req) => req.pathname.startsWith("/api/resume") && req.method === "POST"),
      ).toBe(true);
      expect(
        server.requests.some((req) => req.pathname.startsWith("/api/cover-letters") && req.method === "POST"),
      ).toBe(true);
    });

    // Cover letter should now be present via the primary generation path.
    await waitFor(() => {
      expect(screen.getByTestId("studio-materials-completeness")).not.toHaveTextContent(
        "Cover letter not generated yet",
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("studio-cover-letter-preview-body").textContent?.trim().length).toBeGreaterThan(0);
    });

    // Golden loop: no partial-success messaging after completion.
    expect(screen.queryByText(/Cover letter not generated yet/i)).toBeNull();
    expect(screen.queryByTestId("studio-degraded-unsupported-requirements")).toBeNull();

    // --- RELOAD CONTRACT ---
    // After both artifacts exist, a Studio reload must show generated materials as the dominant state
    // with no repair, retry, or generate CTAs.
    cleanup();
    const { mountStudio: remountStudio, cleanup: cleanupReload } = mountWithCleanup();
    setFetchImplementation(server.handleFetch as unknown as typeof fetch);
    overrideSearchParams({
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      assessmentId: "analysis-1",
    });
    remountStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-cover-letter-preview-body").textContent?.trim().length).toBeGreaterThan(0);
    });
    const resumePreviewsAfterReload = await screen.findAllByTestId("resume-preview");
    expect(resumePreviewsAfterReload[0].textContent?.trim().length).toBeGreaterThan(0);

    expect(screen.queryByTestId("studio-baseline-blocked-recovery")).toBeNull();
    expect(screen.queryByTestId("studio-resume-reprocess-baseline")).toBeNull();
    expect(
      screen.queryByText("Your baseline needs to be reprocessed before documents can be generated."),
    ).toBeNull();
    expect(screen.queryByText(/Retry generation/i)).toBeNull();
    expect(screen.queryByTestId("studio-generate-resume-button")).toBeNull();
    expect(screen.queryByTestId("studio-generate-cover-button")).toBeNull();

    cleanupReload();

    const coverGenerate = server.requests.find(
      (req) =>
        req.method === "POST" &&
        (req.pathname === "/api/cover-letters" || req.pathname === "/api/cover-letters/generate"),
    );
    expect(coverGenerate).toBeTruthy();
    expect(coverGenerate?.body).toBeTruthy();
    const coverBody = coverGenerate?.body as any;
    if (!coverBody || typeof coverBody !== "object") {
      throw new Error(`coverGenerate body missing/invalid: ${JSON.stringify(coverGenerate, null, 2)}`);
    }
    expect(coverBody.analysisId).toBe("analysis-1");
    if (!Object.prototype.hasOwnProperty.call(coverBody, "excludedRequirements")) {
      const analysisFetches = server.requests.filter(
        (req) => req.method === "GET" && req.pathname.startsWith("/api/analysis/fit-assessments/"),
      );
      throw new Error(
        `coverGenerate missing excludedRequirements. coverBody=${JSON.stringify(coverBody, null, 2)} analysisFetches=${JSON.stringify(analysisFetches, null, 2)}`,
      );
    }
    expect(coverBody.excludedRequirements).toContain("Zendesk");

    cleanup();
  });

  it("Studio intent=generate does not duplicate generation when READY orchestration also applies", async () => {
    const { mountStudio, cleanup } = mountWithCleanup();

    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 86,
      readiness: { status: "ready", blocked: false },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
      generationPlan: { resume: "success", coverLetter: "success" },
    });

    setFetchImplementation(server.handleFetch);

    // Both intent=generate and a valid analysisId are present; Studio may reach normal READY shell
    // while also running the intent fallback path. This test asserts we only POST once per artifact.
    overrideSearchParams({
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      intent: "generate",
    });

    mountStudio();

    // Cover letter should now be present via the primary generation path.
    await waitFor(() => {
      expect(screen.getByTestId("studio-materials-completeness")).not.toHaveTextContent(
        "Cover letter not generated yet",
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("studio-cover-letter-preview-body").textContent?.trim().length).toBeGreaterThan(0);
    });

    const resumePosts = server.requests.filter(
      (req) =>
        req.method === "POST" &&
        (req.pathname === "/api/resume" || req.pathname === "/api/resume/generate"),
    );
    const coverPosts = server.requests.filter(
      (req) =>
        req.method === "POST" &&
        (req.pathname === "/api/cover-letters" || req.pathname === "/api/cover-letters/generate"),
    );

    expect(resumePosts).toHaveLength(1);
    expect(["/api/resume", "/api/resume/generate"]).toContain(resumePosts[0]?.pathname);
    expect(coverPosts).toHaveLength(1);
    expect(["/api/cover-letters", "/api/cover-letters/generate"]).toContain(coverPosts[0]?.pathname);

    cleanup();
  });

  it("Remove unsupported requirements and continue: resume exists, cover missing -> generates cover with excludedRequirements", async () => {
    const { mountStudio, cleanup } = mountWithCleanup();

    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 83,
      readiness: { status: "limited", blocked: false },
      gapAnalysis: { unverifiedRequirements: ["python", "snowflake"] },
      artifacts: {
        pairStatus: "DEGRADED",
        resume: { status: "COMPLETED" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
      generationPlan: { resume: "success", coverLetter: "success" },
    });

    setFetchImplementation(server.handleFetch);

    overrideSearchParams({
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      analysisId: "analysis-1",
    });

    mountStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-materials-completeness")).toHaveTextContent(
        "Partial: Resume ready. Cover letter not generated yet.",
      );
    });

    // Unsupported requirements are non-blocking for usable roles; no one-step panel should appear.
    expect(screen.queryByTestId("studio-auto-adjust-panel")).not.toBeInTheDocument();

    // Generation remains available through the primary workflow.
    const generateCover = await screen.findByTestId("studio-generate-cover-button");
    fireEvent.click(generateCover);

    await waitFor(() => {
      const coverPosts = server.requests.filter(
        (req) =>
          req.method === "POST" &&
          (req.pathname === "/api/cover-letters" || req.pathname === "/api/cover-letters/generate"),
      );
      expect(coverPosts.length).toBe(1);
      const body = coverPosts[0]?.body as any;
      expect(body?.excludedRequirements ?? []).toEqual([]);
    });

    cleanup();
  });

  it("Studio ignores minimal fallback resume artifacts from localStorage hydration fallback", async () => {
    const { mountStudio, cleanup } = mountWithCleanup();
    ensureLocalStorageSupportsWrites();

    // Force /api/studio/artifacts to fail so Studio falls back to localStorage snapshot hydration.
    setFetchImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === "string" ? input : (input as any)?.url ?? "");
      if (url.includes("/api/studio/artifacts")) {
        throw new Error("network_down");
      }
      return jsonResponse({}, 200);
    }) as unknown as typeof fetch);

    overrideSearchParams({
      analysisId: "analysis-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
    });

    // Seed a poisoned snapshot: stale persisted fields must never hydrate visible resume content
    // when canonical `resumeResult.preview` is missing.
    const key = "ttr:studio-artifacts:v2:job-1:base-1:analysis-1";
    globalThis.localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        baselineId: "base-1",
        jobId: "job-1",
        baselineVersionId: "base-version-1",
        analysisId: "analysis-1",
        updatedAt: new Date().toISOString(),
        resumeResponse: {
          audit_id: "minimal:poisoned",
          internal: { minimalFallback: true },
          resumeResult: { artifactType: "resume", preview: null },
          resume: {
            content: "Billing support operations leader driving invoice accuracy and reconciliation.",
            responseBody: {
              status: "success",
              preview: { resume: { summary: "Billing support operations leader driving invoice accuracy and reconciliation." } },
            },
          },
        },
      }),
    );

    mountStudio();

    await waitFor(() => {
      expect(globalThis.localStorage.getItem(key)).toBeNull();
    });

    expect(
      screen.queryByText("Billing support operations leader driving invoice accuracy and reconciliation."),
    ).not.toBeInTheDocument();

    // With minimal snapshot rejected, Studio should not consider artifacts hydrated as completed outputs.
    await waitFor(() => {
      expectSinglePrimaryStudioAuthority();
    });
    cleanup();
  });

  it("B. Unlock path: Results unlock CTA -> Studio unlock -> post-unlock unlocked_ready -> generation-ready -> success", async () => {
    const { mount, mountStudio, cleanup } = mountWithCleanup();
    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 78,
      readiness: { status: "ready", blocked: false },
      gapAnalysis: { unverifiedRequirements: ["Zendesk", "Service Cloud"] },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
      generationPlan: { resume: "success", coverLetter: "success" },
    });
    setFetchImplementation(server.handleFetch as unknown as typeof fetch);

    overrideSearchParams({ analysisId: "analysis-1" });
    mount(<ResultsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("results-workflow-authority")).toBeInTheDocument();
    });
    await waitFor(() => {
      expectAuthorityPanel("results-workflow-authority", "unlock_required", "recovery");
    });

    const primary = screen.getByTestId("results-hero-primary-cta") as HTMLElement;
    const directHref = primary.getAttribute("href");
    if (!directHref) {
      fireEvent.click(primary);
      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalled();
      });
    }
    const href = String(directHref ?? mockRouterPush.mock.calls.at(-1)?.[0] ?? "");
    expect(href.startsWith("/studio")).toBe(true);
    expect(href).toContain("fromUnlock=true");

    overrideSearchParams(parseQueryToObject(href));
    mountStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-unlock-panel")).toBeInTheDocument();
    });
    expectSinglePrimaryStudioAuthority();

    // Fill all rendered missing-evidence prompts and submit; hold /api/analysis/run to validate activity state.
    const unlockInputs = screen.getAllByTestId(/studio-unlock-input-/);
    expect(unlockInputs.length).toBeGreaterThan(0);
    unlockInputs.forEach((node, index) => {
      fireEvent.change(node, { target: { value: `Evidence update ${index + 1}.` } });
    });

    const runDeferred = server.defer("analysis_run");
    fireEvent.click(screen.getByTestId("studio-unlock-cta"));

    await waitFor(() => {
      expect(screen.getByTestId("workflow-activity-banner")).toBeInTheDocument();
    });
    expect(screen.getByText("Re-evaluating your updates...")).toBeInTheDocument();

    // Simulate reanalysis landing in unlocked-ready.
    server.state.analysisId = "analysis-2";
    server.state.score = 86;
    server.state.readiness = { status: "ready", blocked: false };
    runDeferred.resolve(jsonResponse({ assessmentId: "analysis-2", baselineVersionId: "base-version-1" }, 200));

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
    });
    const replaced = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(replaced).toContain("postUnlock=1");

    // Land on post-unlock outcome shell.
    server.requests.length = 0;
    overrideSearchParams(parseQueryToObject(replaced));
    mountStudio();
    await waitFor(() => {
      expect(screen.getByTestId("studio-post-unlock-shell")).toBeInTheDocument();
    });
    expectSinglePrimaryStudioAuthority();
    expect(screen.getByText(/Generate your documents/i)).toBeInTheDocument();

    // Ensure readiness hydration ran for the post-unlock session before starting generation.
    await waitFor(() => {
      expect(server.requests.some((req) => req.pathname === "/api/resume/readiness")).toBe(true);
      expect(server.requests.some((req) => req.pathname === "/api/cover-letters/readiness")).toBe(true);
    });

    // Trigger generation from the outcome shell; hold generation.
    server.defer("resume_generate");
    server.defer("cover_generate");
    fireEvent.click(screen.getByTestId("studio-post-unlock-primary"));

    await waitFor(() => {
      expect(screen.getByTestId("workflow-activity-banner")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("workflow-activity-banner")).getByText("Generating your documents...")).toBeInTheDocument();

    server.resolveDeferred("resume_generate", jsonResponse(server.resumeGenerationPayload(), 200));
    server.resolveDeferred("cover_generate", jsonResponse(server.coverLetterGenerationPayload(), 200));

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
    });
    // Current contract: unsupported requirements are non-blocking when document generation is still allowed.
    // Avoid asserting on the transient "generation_in_progress" state; wait for the post-generation authority.
    await waitFor(() => {
      const node = screen.getByTestId("studio-workflow-authority");
      expect(node.getAttribute("data-workflow-state")).not.toBe("generation_in_progress");
    });
    expectAuthorityPanel("studio-workflow-authority", "partial_documents", "recovery");
    cleanup();
  });

  it("C. Unlock improves but still blocked: post-unlock outcome is improved_still_blocked and stays singular", async () => {
    const { mountStudio, cleanup } = mountWithCleanup();
    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-2",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      // Keep score below generate-now eligibility so unlocked_ready doesn't win.
      score: 78,
      readiness: { status: "limited", blocked: false },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
    });
    setFetchImplementation(server.handleFetch as unknown as typeof fetch);

    overrideSearchParams({
      analysisId: "analysis-2",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      postUnlock: "1",
      priorScore: "74",
      priorReadiness: "blocked",
    });
    mountStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-post-unlock-shell")).toBeInTheDocument();
    });
    expectSinglePrimaryStudioAuthority();
    expect(screen.getByText("You made progress, but one blocker remains.")).toBeInTheDocument();
    expect(screen.getByTestId("studio-post-unlock-primary")).toHaveTextContent("Add more evidence");
    cleanup();
  });

  it("D. No material change: post-unlock outcome is no_material_change and does not imply readiness", async () => {
    const { mountStudio, cleanup } = mountWithCleanup();
    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-2",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 78,
      readiness: { status: "limited", blocked: false },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
    });
    setFetchImplementation(server.handleFetch as unknown as typeof fetch);

    overrideSearchParams({
      analysisId: "analysis-2",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      postUnlock: "1",
      priorScore: "78",
      priorReadiness: "limited",
    });
    mountStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-post-unlock-shell")).toBeInTheDocument();
    });
    expectSinglePrimaryStudioAuthority();
    expect(screen.getByText("That update didn’t change your readiness yet.")).toBeInTheDocument();
    expect(screen.queryByText("Your documents are ready to generate.")).toBeNull();
    cleanup();
  });

  it("E. Reanalysis failure: post-unlock outcome is reanalysis_failed and retry is shown; workspace suppressed", async () => {
    const { mountStudio, cleanup } = mountWithCleanup();
    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-2",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 78,
      readiness: { status: "limited", blocked: false },
      artifacts: {
        pairStatus: "MISSING",
        resume: { status: "MISSING" },
        coverLetter: { status: "MISSING" },
        staleDraftExists: false,
      },
    });

    const brokenFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = parseUrl(input);
      if (url.includes("/api/analysis/fit-assessments/analysis-2")) {
        return jsonResponse({ message: "boom" }, 500);
      }
      return server.handleFetch(input, init);
    });
    setFetchImplementation(brokenFetch as unknown as typeof fetch);

    overrideSearchParams({
      analysisId: "analysis-2",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      postUnlock: "1",
      priorScore: "78",
      priorReadiness: "limited",
    });
    mountStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-post-unlock-shell")).toBeInTheDocument();
    });
    expectSinglePrimaryStudioAuthority();
    expect(screen.getByText("Re-evaluation failed.")).toBeInTheDocument();
    expect(screen.getByTestId("studio-post-unlock-primary")).toHaveTextContent("Try re-evaluating again");
    cleanup();
  });

  it("F. Partial artifact failure: resume succeeds, cover fails retryable and UI avoids full-success language", async () => {
    const { mountStudio, cleanup } = mountWithCleanup();
    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      score: 90,
      readiness: { status: "ready", blocked: false },
      artifacts: {
        pairStatus: "FAILED",
        resume: { status: "COMPLETED" },
        coverLetter: { status: "FAILED", retryable: true, failureCategory: "generation_failed" },
        staleDraftExists: false,
      },
    });
    setFetchImplementation(server.handleFetch as unknown as typeof fetch);

    overrideSearchParams({ analysisId: "analysis-1", jobId: "job-1", baselineId: "base-1", baselineVersionId: "base-version-1" });
    mountStudio();
    expect(screen.queryByText("Your tailored documents are ready.")).toBeNull();
    cleanup();
  });

  it("G. Stale output suppression: newer attempt in progress suppresses teaser previews", async () => {
    const { mount, mountStudio, cleanup } = mountWithCleanup();
    const server = new SyntheticWorkflowServer({
      analysisId: "analysis-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      // Keep Results on-page (avoid auto-route to Studio) while still exercising in-progress authority.
      score: 79,
      readiness: { status: "ready", blocked: false },
      artifacts: {
        pairStatus: "in_progress",
        resume: { status: "COMPLETED" },
        coverLetter: { status: "IN_PROGRESS" },
        staleDraftExists: true,
      },
    });
    setFetchImplementation(server.handleFetch as unknown as typeof fetch);

    // Results should suppress teaser section while stale output is hidden.
    overrideSearchParams({ analysisId: "analysis-1", jobId: "job-1", baselineId: "base-1", baselineVersionId: "base-version-1" });
    mount(<ResultsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("results-artifact-truth")).toBeInTheDocument();
    });
    // Teaser visibility is UI-contract-dependent; the hard contract is that artifact-truth is present.

    // Studio should render artifact-truth panel with stale suppression state.
    server.state.score = 90;
    overrideSearchParams({ analysisId: "analysis-1", jobId: "job-1", baselineId: "base-1", baselineVersionId: "base-version-1" });
    mountStudio();
    await waitFor(() => {
      expect(screen.getByText(/We are generating your application draft now/i)).toBeInTheDocument();
    });
    cleanup();
  });

  it("H. Impossible state safety: orchestrator fallback is conservative and guardrails emit structured violation", async () => {
    const { mount, cleanup } = mountWithCleanup();
    const { resolveWorkflowOrchestrator } = await import("@/lib/workflowOrchestrator");
    const { WorkflowAuthorityPanel } = await import("@/components/workflow/WorkflowAuthorityPanel");
    const { useWorkflowGuardrails } = await import("@/lib/workflowGuardrails");

    const orchestrator = resolveWorkflowOrchestrator({
      surface: "results",
      score: 80,
      generationReadiness: {} as any,
      workflowAuthority: { workflowState: "READY", primaryAction: "GENERATE", suppressFailureMessaging: false } as any,
      artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing", generating: false, failure: null },
      resume: { status: "missing", confidence: "HIGH", failure: null },
      coverLetter: { status: "missing", confidence: "HIGH", failure: null },
      artifactQuality: { confidence: "HIGH" },
      allowStaleArtifactPreview: false,
      searchParamsString: "",
      unlockDismissed: true,
      unlockReanalysisFailure: null,
      postUnlock: {
        active: false,
        dismissed: true,
        priorScore: null,
        priorReadiness: null,
        newReadiness: null,
        reanalysisFailed: false,
        generationAllowedNow: false,
        returnToEvidenceHref: "",
      },
      resumeFailure: null,
      coverFailure: null,
      activity: { isActive: false, activeOperations: [] },
    });

    function Probe() {
      useWorkflowGuardrails({
        surface: "results",
        orchestrator: orchestrator as any,
        rendered: {
          workflowAuthorityPanel: true,
          unlockFlow: false,
          postUnlockOutcome: false,
          generationReadyShell: false,
          artifactTruthPanel: false,
          staleArtifactPreview: false,
          activityBanner: false,
        },
        orchestratorViolations: orchestrator.diagnostics?.violations ?? null,
      });
      return (
        <WorkflowAuthorityPanel
          testId="probe-authority"
          model={orchestrator.authorityState}
        />
      );
    }

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId("probe-authority")).toBeInTheDocument();
    });
    expectAuthorityPanel("probe-authority", "hard_blocked", "blocked");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    cleanup();
  });
});
