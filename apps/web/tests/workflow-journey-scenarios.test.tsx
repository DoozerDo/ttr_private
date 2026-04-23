import React from "react";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import ResultsPage from "@/app/(app)/results/page";
import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { mockRouterPush, mockRouterReplace, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

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
  gapAnalysis?: {
    unverifiedRequirements?: string[];
  };
  artifacts: {
    pairStatus: string;
    resume: { status: StudioArtifactStatus; retryable?: boolean; failureCategory?: string | null };
    coverLetter: { status: StudioArtifactStatus; retryable?: boolean; failureCategory?: string | null };
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
  requests: Array<{ url: string; pathname: string; method: string }> = [];

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
    return {
      status: this.state.readiness.status,
      blocked: this.state.readiness.blocked,
      reasonCodes: [],
      reasons: [],
      badgeLabel,
      summary: badgeLabel === "READY" ? "Ready for generation." : "Needs more evidence.",
      verificationIssues: [],
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
                  "I am applying for this role.",
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
      baselineVersionHash: "hash-1",
      jobFingerprint: "job-fingerprint-1",
      generationContractVersion: "studio-artifacts-v1",
      resume: {
        status: this.state.artifacts.resume.status,
        responseBody: resumeResponseBody,
        content: this.state.artifacts.staleDraftExists ? "previous-resume-draft" : null,
        failureCode: resumeFailure?.category ?? null,
        failureMessage: resumeFailure?.explanation ?? null,
        metadata: { auditId: "audit-1" },
      },
      coverLetter: {
        status: this.state.artifacts.coverLetter.status,
        responseBody: coverResponseBody,
        content: this.state.artifacts.staleDraftExists ? "previous-cover-draft" : null,
        failureCode: coverFailure?.category ?? null,
        failureMessage: coverFailure?.explanation ?? null,
        metadata: { auditId: "audit-1" },
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
    return {
      status: "success",
      generationStatus: "success",
      exportReady: true,
      exports: { docx: true, pdf: true },
      preview: {
        coverLetter: {
          paragraphs: ["Dear Hiring Team,", "I am applying for this role.", "Sincerely,", "Test Candidate"],
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
    this.requests.push({ url, pathname, method: requestMethod.toUpperCase() });

    if (pathname.includes("/api/baselines/base-1/versions")) {
      return jsonResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }], 200);
    }

    if (pathname.includes(`/api/analysis/fit-assessments/${this.state.analysisId}`)) {
      return jsonResponse(this.assessmentPayload(), 200);
    }

    if (pathname.includes("/api/analysis/fit-assessments") && url.includes("jobId=")) {
      return jsonResponse([], 200);
    }

    if (pathname === "/api/resume/readiness" || pathname === "/api/cover-letters/readiness") {
      return jsonResponse(this.readinessPayload(), 200);
    }

    if (pathname === "/api/studio/artifacts") {
      return jsonResponse(this.studioArtifactsPayload(), 200);
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

    if (pathname === "/api/baselines/base-1/strengthening-additions") {
      return jsonResponse({ ok: true }, 200);
    }

    if (pathname === "/api/resume" || pathname === "/api/cover-letters") {
      const isResume = pathname === "/api/resume";
      const key = isResume ? "resume_generate" : "cover_generate";
      const deferred = this.deferred[key];
      if (deferred) return deferred.promise;

      const outcome = isResume ? this.state.generationPlan?.resume : this.state.generationPlan?.coverLetter;
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
  const activeCount = [Boolean(unlock), Boolean(postUnlockShell), Boolean(generationReadyShell), Boolean(hero)].filter(Boolean).length;
  expect(activeCount).toBe(1);
}

beforeEach(() => {
  trackEventMock.mockClear();
});

describe("workflow journey scenarios (synthetic)", () => {
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
      expect(screen.getByTestId("studio-generation-ready-shell")).toBeInTheDocument();
    });
    expectSinglePrimaryStudioAuthority();
    expectAuthorityPanel("studio-generation-ready-shell", "generation_ready", "ready");

    // Hold generation so we can assert activity + in-progress state.
    server.defer("resume_generate");
    server.defer("cover_generate");

    fireEvent.click(screen.getByTestId("studio-generation-ready-primary"));

    await waitFor(() => {
      expect(screen.getByTestId("workflow-activity-banner")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("workflow-activity-banner")).getByText("Generating your documents...")).toBeInTheDocument();

    // Resolve both generation calls.
    server.resolveDeferred("resume_generate", jsonResponse(server.resumeGenerationPayload(), 200));
    server.resolveDeferred("cover_generate", jsonResponse(server.coverLetterGenerationPayload(), 200));

    await waitFor(() => {
      expect(screen.getByTestId("studio-workflow-authority")).toBeInTheDocument();
    });
    expectAuthorityPanel("studio-workflow-authority", "documents_ready", "complete");
    expect(screen.getByTestId("studio-primary-cta-apply")).toBeInTheDocument();
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

    fireEvent.click(screen.getByTestId("results-hero-primary-cta"));
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalled();
    });
    const href = String(mockRouterPush.mock.calls.at(-1)?.[0] ?? "");
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
    expectAuthorityPanel("studio-workflow-authority", "documents_ready", "complete");
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

    await waitFor(() => {
      expect(screen.getByTestId("studio-ready-materials-copy")).toBeInTheDocument();
    });
    expect(screen.getByTestId("studio-ready-materials-copy")).toHaveTextContent("Your resume is ready.");
    expect(screen.queryByText("Your tailored documents are ready.")).toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId("studio-artifact-truth")).toBeInTheDocument();
    });
    expectAuthorityPanel("studio-artifact-truth", "partial_documents");
    expect(screen.getByTestId("studio-artifact-primary-cta")).toBeInTheDocument();
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
    overrideSearchParams({ analysisId: "analysis-1" });
    mount(<ResultsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("results-artifact-truth")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("results-documents-teaser-section")).toBeNull();

    // Studio should render artifact-truth panel with stale suppression state.
    server.state.score = 90;
    overrideSearchParams({ analysisId: "analysis-1", jobId: "job-1", baselineId: "base-1", baselineVersionId: "base-version-1" });
    mountStudio();
    await waitFor(() => {
      expect(screen.getByTestId("studio-artifact-truth")).toBeInTheDocument();
    });
    expectAuthorityPanel("studio-artifact-truth", "generation_in_progress");
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
      generationReady: { dismissed: true, phase: "ready" },
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
