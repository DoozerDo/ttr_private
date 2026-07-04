import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

// Studio is a client component that depends on Next's navigation hooks.
vi.mock("next/navigation", () => {
  const searchParams = new URLSearchParams();
  searchParams.set("baselineId", "base-80");
  searchParams.set("baselineVersionId", "base-version-1");
  searchParams.set("jobId", "job-80");
  searchParams.set("analysisId", "analysis-80");
  searchParams.set("assessmentId", "analysis-80");
  searchParams.set("debugAuthority", "1");
  return {
    usePathname: () => "/studio",
    useSearchParams: () => searchParams,
    useRouter: () => ({
      replace: vi.fn(),
      push: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

// Avoid analytics/network side-effects.
vi.mock("@/src/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/src/lib/entitlements", () => ({ useEntitlements: () => ({ isPro: true }) }));

// Jobs are used for job title/company in cover letter quality; keep deterministic.
vi.mock("@/lib/jobsClient", () => ({
  listJobs: async () => [{ id: "job-80", title: "Local scoring validation role", company: "TargetThisRole" }],
}));

// Studio reads assessment; return score>=80 deterministically.
vi.mock("@/lib/assessmentSource", () => ({
  fetchLatestAssessmentForBaseline: async () => ({
    assessmentId: "analysis-80",
    baselineId: "base-80",
    baselineVersionId: "base-version-1",
    score: 88,
    createdAt: "2026-05-27T00:00:00.000Z",
    complianceFlags: [],
    scoringReliability: "ok",
  }),
}));

// Helper: minimal response wrapper matching fetch() contract.
function jsonResponse(payload: unknown, init?: { status?: number }) {
  const status = init?.status ?? 200;
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type PersistedArtifacts = {
  resume: { responseBody: unknown } | null;
  coverLetter: { responseBody: unknown } | null;
  resumeResult?: unknown;
  coverLetterResult?: unknown;
  generationContractVersion?: string | null;
};

describe("Beta loop: Studio score>=80 generates + persists + reload renders", () => {
  const persisted: PersistedArtifacts = {
    resume: null,
    coverLetter: null,
    generationContractVersion: "pipeline-test",
  };

  let resumePosts = 0;
  let coverPosts = 0;

  const baselineUsableReadinessPayload = {
    status: "ready",
    blocked: false,
    compliance_flags: [],
    reasons: [],
    canGenerateResume: true,
    diagnostics: { readinessSource: "resume_v2_authority", usableExperienceCount: 3 },
  };

  const renderableResume = {
    ok: true,
    status: "success",
    generationStatus: "success",
    exportReady: true,
    blocked: false,
    baselineId: "base-80",
    baselineVersionId: "base-version-1",
    jobId: "job-80",
    sections: [],
    compliance_flags: [],
    compliance_blocked: false,
    audit_id: "audit-resume-80",
    auditId: "audit-resume-80",
    baseline_version_hash: "hash-80",
    quality: "optimized",
    traceMap: {},
    debugTrace: { passed: true, failures: [], traceCoverage: 100, unusedEvidence: [], selectedEvidence: [] },
    exports: { docx: true, pdf: true },
    preview: {
      resume: {
        summary: "Support Operations leader.",
        experience: [{ company: "Acme", roleTitle: "Ops Lead", dateRange: "2022-2026", bullets: ["Did thing."] }],
        skillsAndTools: { tools: ["Zendesk"] },
      },
    },
    trackerEntryId: null,
    trackerStatus: null,
    opportunityId: null,
    claimRiskSummary: null,
    gapAnalysis: null,
    gapGuidance: null,
    display: { title: "Resume generated", description: "Verified baseline evidence was assembled into a draft.", reasons: [] },
    safeDisplay: { title: "Resume generated", description: "Verified baseline evidence was assembled into a draft.", reasons: [] },
    internal: {},
  };

  const renderableCover = {
    ok: true,
    status: "success",
    generationStatus: "success",
    exportReady: true,
    baselineId: "base-80",
    baselineVersionId: "base-version-1",
    jobId: "job-80",
    content: "Hello.\n\nI am a fit.\n\nThanks.",
    generatorType: "template",
    generatorVersion: "test",
    closingTemplateKey: "default",
    generationInputsHash: "hash-80",
    preview: { coverLetter: { paragraphs: ["Hello.", "I am a fit.", "Thanks."] } },
    compliance_flags: [],
    audit_id: "audit-cover-80",
    auditId: "audit-cover-80",
    baseline_version_hash: "hash-80",
    exports: { docx: true, pdf: true },
    display: { title: "Cover letter generated successfully", description: "Your cover letter draft is ready for preview and export.", reasons: [] },
    safeDisplay: { title: "Cover letter generated successfully", description: "Your cover letter draft is ready for preview and export.", reasons: [] },
    traceMap: {},
    debugTrace: { passed: true, failures: [], traceCoverage: 100, unusedEvidence: [], selectedEvidence: [] },
    evidenceDetailsMap: {},
    internal: {},
  };

  beforeEach(() => {
    resumePosts = 0;
    coverPosts = 0;
    persisted.resume = null;
    persisted.coverLetter = null;

    // JSDOM localStorage is the only state allowed to survive "reload" in this test.
    window.localStorage?.clear?.();

    // Mock fetch at the boundary the Studio UI uses.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : String((input as any)?.url ?? input);
        const method = String(init?.method ?? "GET").toUpperCase();

        // Studio hydration: persisted artifact authority (must drive reload rendering).
        if (url.startsWith("/api/studio/artifacts")) {
          return jsonResponse({
            resume: persisted.resume,
            coverLetter: persisted.coverLetter,
            resumeResult: persisted.resume ? (persisted.resume.responseBody as any) : null,
            coverLetterResult: persisted.coverLetter ? (persisted.coverLetter.responseBody as any) : null,
            generationContractVersion: persisted.generationContractVersion,
          });
        }

        // Readiness endpoints: baseline usable verified baseline exists (for generation gating).
        if (url === "/api/resume/readiness" && method === "POST") return jsonResponse(baselineUsableReadinessPayload);
        if (url === "/api/cover-letters/readiness" && method === "POST") return jsonResponse(baselineUsableReadinessPayload);

        // Generation: must succeed exactly once each and must persist artifacts (Studio reload reads them back).
        if ((url === "/api/resume" || url === "/api/resume/generate") && method === "POST") {
          resumePosts += 1;
          // Persist into the same store returned by /api/studio/artifacts.
          persisted.resume = { responseBody: renderableResume };
          return jsonResponse(renderableResume);
        }
        if ((url === "/api/cover-letters" || url === "/api/cover-letters/generate") && method === "POST") {
          coverPosts += 1;
          persisted.coverLetter = { responseBody: renderableCover };
          return jsonResponse(renderableCover);
        }

        // Studio pulls baselines for identity; minimal happy-path response.
        if (url.includes("/api/baselines/") && url.includes("/blocks")) {
          return jsonResponse({
            baseline_version_id: "base-version-1",
            baseline_version_hash: "hash-80",
            blocks: [
              { id: "block-1", section_type: "EXPERIENCE", title: "Professional Experience", content: "Acme | Ops Lead", include_tag: "always", order_index: 1 },
            ],
          });
        }
        if (url.startsWith("/api/baselines")) return jsonResponse([{ id: "base-80", status: "ACTIVE" }]);
        if (url.startsWith("/api/jobs")) return jsonResponse([{ id: "job-80", title: "Local scoring validation role", company: "TargetThisRole" }]);

        // Fit assessments list route used by assessmentSource in non-mocked paths; keep safe.
        if (url.startsWith("/api/analysis/fit-assessments")) {
          return jsonResponse({
            assessmentId: "analysis-80",
            id: "analysis-80",
            baselineId: "base-80",
            baselineVersionId: "base-version-1",
            overallScore: 88,
            score: 88,
            scoring_v2: { score: 88 },
            scoringV2: { score: 88 },
            createdAt: "2026-05-27T00:00:00.000Z",
          });
        }

        // Anything else: fail fast so the regression catches new hidden dependencies.
        return new Response(`Unhandled fetch: ${method} ${url}`, { status: 500 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("proves the beta loop contract without external API availability", async () => {
    // Import lazily so mocks apply.
    const StudioPage = (await import("@/app/(app)/studio/page")).default;
    render(<StudioPage />);

    // shell_auto should start without user clicks once the READY contract is hydrated.
    await waitFor(() => {
      expect(resumePosts).toBe(1);
      expect(coverPosts).toBe(1);
    });

    // 2/3) Persisted artifacts render in Studio after generation.
    await expect(screen.findByTestId("studio-resume-ready-panel")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-cover-ready-panel")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-materials-completeness")).resolves.toBeTruthy();

    // Must not show repair/retry/blocked/missing artifact states.
    expect(screen.queryByText(/repair your baseline/i)).toBeNull();
    expect(screen.queryByText(/retry generation/i)).toBeNull();
    expect(screen.queryByText(/generation is blocked/i)).toBeNull();
    expect(screen.queryByTestId("studio-resume-missing")).toBeNull();
    expect(screen.queryByTestId("studio-cover-missing")).toBeNull();

    // "Reload": re-mount Studio (no stale component state). Rendering must come from persisted artifacts.
    cleanup();
    render(<StudioPage />);

    // Reload renders both generated artifacts; no contradictory prompts.
    await expect(screen.findByTestId("studio-resume-ready-panel")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-cover-ready-panel")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-materials-completeness")).resolves.toBeTruthy();
    expect(screen.queryByText(/repair your baseline/i)).toBeNull();
    expect(screen.queryByText(/retry generation/i)).toBeNull();
    expect(screen.queryByText(/generation is blocked/i)).toBeNull();
    expect(screen.queryByTestId("studio-resume-missing")).toBeNull();
    expect(screen.queryByTestId("studio-cover-missing")).toBeNull();

    // Reload must not re-trigger generation.
    expect(resumePosts).toBe(1);
    expect(coverPosts).toBe(1);
  }, 120_000);

  it("shell_auto regenerates once when persisted artifacts are failed/unusable", async () => {
    window.localStorage?.setItem?.(
      "ttr:studio:auto-generate:retry-count:autoGen:v1:base-version-1:job-80:analysis-80",
      "1",
    );
    persisted.resume = {
      responseBody: {
        status: "failed",
        generationStatus: "error",
        exportReady: false,
        resumeResult: {
          artifactType: "resume",
          generationState: "generated_unusable",
          qualityStatus: "failed",
          exportReady: false,
          preview: {
            summary: "Stale failed resume.",
            experience: [],
            skillsAndTools: { tools: [] },
          },
        },
      },
    };
    persisted.coverLetter = {
      responseBody: {
        status: "failed",
        generationStatus: "error",
        exportReady: false,
        coverLetterResult: {
          artifactType: "cover_letter",
          generationState: "generated_unusable",
          qualityStatus: "failed",
          exportReady: false,
          preview: { paragraphs: [] },
        },
      },
    };

    const StudioPage = (await import("@/app/(app)/studio/page")).default;
    render(<StudioPage />);

    await waitFor(() => {
      expect(resumePosts).toBe(1);
      expect(coverPosts).toBe(1);
    }, { timeout: 120_000 });

    await expect(screen.findByTestId("studio-resume-ready-panel")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-cover-ready-panel")).resolves.toBeTruthy();
    expect(screen.queryByText(/Resume draft needs edits/i)).toBeNull();
    expect(screen.queryByText(/Cover letter unavailable/i)).toBeNull();

    cleanup();
    render(<StudioPage />);

    await expect(screen.findByTestId("studio-resume-ready-panel")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-cover-ready-panel")).resolves.toBeTruthy();
    expect(resumePosts).toBe(1);
    expect(coverPosts).toBe(1);
  }, 120_000);

  it("score 83 + usable baseline completes generate + persist + reload loop", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String((input as any)?.url ?? input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url.startsWith("/api/studio/artifacts")) {
        return jsonResponse({
          resume: persisted.resume,
          coverLetter: persisted.coverLetter,
          resumeResult: persisted.resume ? (persisted.resume.responseBody as any) : null,
          coverLetterResult: persisted.coverLetter ? (persisted.coverLetter.responseBody as any) : null,
          generationContractVersion: persisted.generationContractVersion,
        });
      }
      if (url === "/api/resume/readiness" && method === "POST") return jsonResponse(baselineUsableReadinessPayload);
      if (url === "/api/cover-letters/readiness" && method === "POST") return jsonResponse(baselineUsableReadinessPayload);
      if (url === "/api/resume/generate" && method === "POST") {
        resumePosts += 1;
        persisted.resume = { responseBody: renderableResume };
        return jsonResponse(renderableResume);
      }
      if (url === "/api/cover-letters/generate" && method === "POST") {
        coverPosts += 1;
        persisted.coverLetter = { responseBody: renderableCover };
        return jsonResponse(renderableCover);
      }
      if (url.startsWith("/api/baselines")) return jsonResponse([{ id: "base-80", status: "ACTIVE" }]);
      if (url.startsWith("/api/jobs")) return jsonResponse([{ id: "job-80", title: "Local scoring validation role", company: "TargetThisRole" }]);
      if (url.startsWith("/api/analysis/fit-assessments")) {
        return jsonResponse({ assessments: [{ id: "analysis-83", baselineId: "base-80", overallScore: 83, createdAt: "2026-05-27T00:00:00.000Z" }] });
      }
      return new Response(`Unhandled fetch: ${method} ${url}`, { status: 500 });
    });

    const StudioPage = (await import("@/app/(app)/studio/page")).default;
    render(<StudioPage />);

    const resumeGenerateButton = await screen.findByTestId("studio-generate-resume-button");
    fireEvent.click(resumeGenerateButton);
    const coverGenerateButton = await screen.findByTestId("studio-generate-cover-button");
    fireEvent.click(coverGenerateButton);

    await waitFor(() => expect(resumePosts).toBe(1));
    await waitFor(() => expect(coverPosts).toBe(1));

    await expect(screen.findByTestId("studio-materials-completeness")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-resume-ready-panel")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-cover-ready-panel")).resolves.toBeTruthy();
    expect(screen.queryByText(/baseline repair required/i)).toBeNull();

    cleanup();
    render(<StudioPage />);
    await expect(screen.findByTestId("studio-materials-completeness")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-resume-ready-panel")).resolves.toBeTruthy();
    await expect(screen.findByTestId("studio-cover-ready-panel")).resolves.toBeTruthy();
    expect(resumePosts).toBe(1);
    expect(coverPosts).toBe(1);
  }, 120_000);

  it("does not show mixed authority when score is present but readiness fails with 400", async () => {
    // Override assessment score to 83 (the reported production contradiction) while forcing readiness to 400.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String((input as any)?.url ?? input);
      const method = String(init?.method ?? "GET").toUpperCase();
      if (url.startsWith("/api/studio/artifacts")) {
        // Simulate persisted assessmentScore existing in the artifacts hydration payload (stale source).
        return jsonResponse({ resume: null, coverLetter: null, assessmentScore: 83, generationContractVersion: "pipeline-test" });
      }
      if (url === "/api/resume/readiness" && method === "POST") return new Response("bad request", { status: 400 });
      if (url === "/api/cover-letters/readiness" && method === "POST") return new Response("bad request", { status: 400 });
      if (url.startsWith("/api/baselines")) return jsonResponse([{ id: "base-80", status: "ACTIVE" }]);
      if (url.startsWith("/api/jobs")) return jsonResponse([{ id: "job-80", title: "Local scoring validation role", company: "TargetThisRole" }]);
      if (url.startsWith("/api/analysis/fit-assessments")) {
        return jsonResponse({ assessments: [{ id: "analysis-83", baselineId: "base-80", overallScore: 83, createdAt: "2026-05-27T00:00:00.000Z" }] });
      }
      return new Response(`Unhandled fetch: ${method} ${url}`, { status: 500 });
    });

    const StudioPage = (await import("@/app/(app)/studio/page")).default;
    render(<StudioPage />);

    // Coherent single lane: when readiness fails, we must not present READY/CURRENT messaging driven by a stale score.
    // Score should be treated as unavailable when analysis/readiness errors are present.
    await expect(screen.findByTestId("studio-ready-secondary-summary")).resolves.toBeTruthy();
    expect(screen.getByTestId("studio-ready-secondary-summary")).toHaveTextContent(/Fit score unavailable/i);
    expect(screen.getByTestId("studio-ready-secondary-summary")).toHaveTextContent(/Blocked/i);
    expect(screen.queryByText(/\(83\)/)).toBeNull();

    // Must not show the "Ready" lane while also showing baseline repair required messaging.
    expect(screen.queryByText(/Baseline repair required/i)).toBeNull();

    // Must not show generation CTAs when blocked by readiness errors.
    expect(screen.queryByTestId("studio-generate-resume-button")).toBeNull();
    expect(screen.queryByTestId("studio-generate-cover-button")).toBeNull();

    // No retries/repair mixed prompts.
    expect(screen.queryByText(/retry generation/i)).toBeNull();
    expect(screen.queryByText(/generation is blocked/i)).toBeNull();

    // Touch user to avoid unused var (keeps pattern consistent with other test).
    await user.keyboard("{Escape}");
  }, 60_000);

  it("score 83 + truly unusable baseline shows one repair-required lane (no CURRENT, no generation CTAs)", async () => {
    const user = userEvent.setup();

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const analysisRunBodies: any[] = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String((input as any)?.url ?? input);
      const method = String(init?.method ?? "GET").toUpperCase();
      if (url.startsWith("/api/studio/artifacts")) {
        return jsonResponse({ resume: null, coverLetter: null, assessmentScore: 83, generationContractVersion: "pipeline-test" });
      }
      if (url === "/api/analysis/run" && method === "POST") {
        const raw = typeof init?.body === "string" ? init?.body : "";
        const parsed = raw ? JSON.parse(raw) : null;
        analysisRunBodies.push(parsed);
        return jsonResponse({ assessmentId: "analysis-83", baselineId: "base-80", score: 83 });
      }
      if (url === "/api/resume/readiness" && method === "POST") {
        return jsonResponse({
          status: "blocked",
          blocked: true,
          compliance_flags: [],
          reasonCodes: ["baseline_resume_v2_missing"],
          reasons: [{ code: "baseline_resume_v2_missing", message: "Baseline ResumeV2 is missing. Repair your baseline before generating." }],
        });
      }
      if (url === "/api/cover-letters/readiness" && method === "POST") {
        return jsonResponse({
          status: "blocked",
          blocked: true,
          compliance_flags: [],
          reasonCodes: ["baseline_resume_v2_missing"],
          reasons: [{ code: "baseline_resume_v2_missing", message: "Baseline ResumeV2 is missing. Repair your baseline before generating." }],
        });
      }
      if (url.startsWith("/api/baselines")) return jsonResponse([{ id: "base-80", status: "ACTIVE" }]);
      if (url.startsWith("/api/jobs")) return jsonResponse([{ id: "job-80", title: "Local scoring validation role", company: "TargetThisRole" }]);
      if (url.startsWith("/api/analysis/fit-assessments")) {
        return jsonResponse({ assessments: [{ id: "analysis-83", baselineId: "base-80", overallScore: 83, createdAt: "2026-05-27T00:00:00.000Z" }] });
      }
      return new Response(`Unhandled fetch: ${method} ${url}`, { status: 500 });
    });

    const StudioPage = (await import("@/app/(app)/studio/page")).default;
    render(<StudioPage />);

    const authority = await screen.findByTestId("studio-workflow-authority");
    expect(authority.getAttribute("data-workflow-state")).toBe("hard_blocked");
    expect(authority.getAttribute("data-workflow-trust-tone")).toBe("blocked");
    // Must not be READY when blocked.
    const debug = await screen.findByTestId("studio-debug-authority");
    expect(debug.textContent ?? "").not.toMatch(/\"authorityWorkflowState\"\\s*:\\s*\"READY\"/);

    expect(screen.queryByTestId("studio-generate-resume-button")).toBeNull();
    expect(screen.queryByTestId("studio-generate-cover-button")).toBeNull();
    expect(screen.queryByText(/baseline repair required/i)).toBeTruthy();
    const reprocess = await screen.findByTestId("studio-resume-reprocess-baseline");
    expect(reprocess).toBeTruthy();
    await user.click(reprocess);

    await waitFor(() => expect(analysisRunBodies.length).toBeGreaterThan(0));
    const last = analysisRunBodies[analysisRunBodies.length - 1];
    expect(last).toEqual(expect.objectContaining({ baselineId: "base-80", jobId: "job-80" }));

    await user.keyboard("{Escape}");
  }, 60_000);

  it("renders debug authority payload when debugAuthority=1 even while readiness is blocked", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String((input as any)?.url ?? input);
      const method = String(init?.method ?? "GET").toUpperCase();
      if (url.startsWith("/api/studio/artifacts")) {
        return jsonResponse({ resume: null, coverLetter: null, assessmentScore: 83, generationContractVersion: "pipeline-test" });
      }
      if (url === "/api/resume/readiness" && method === "POST") return new Response("bad request", { status: 400 });
      if (url === "/api/cover-letters/readiness" && method === "POST") return new Response("bad request", { status: 400 });
      if (url.startsWith("/api/baselines")) return jsonResponse([{ id: "base-80", status: "ACTIVE" }]);
      if (url.startsWith("/api/jobs")) return jsonResponse([{ id: "job-80", title: "Local scoring validation role", company: "TargetThisRole" }]);
      if (url.startsWith("/api/analysis/fit-assessments")) {
        return jsonResponse({ assessments: [{ id: "analysis-83", baselineId: "base-80", overallScore: 83, createdAt: "2026-05-27T00:00:00.000Z" }] });
      }
      return new Response(`Unhandled fetch: ${method} ${url}`, { status: 500 });
    });

    const StudioPage = (await import("@/app/(app)/studio/page")).default;
    render(<StudioPage />);

    const debug = await screen.findByTestId("studio-debug-authority");
    expect(debug.textContent ?? "").toMatch(/\"debugAuthority\"\\s*:\\s*\"enabled\"/);
  }, 60_000);
});
