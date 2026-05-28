import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Studio is a client component that depends on Next's navigation hooks.
vi.mock("next/navigation", () => {
  const searchParams = new URLSearchParams();
  searchParams.set("baselineId", "base-80");
  searchParams.set("baselineVersionId", "basev-1");
  searchParams.set("jobId", "job-80");
  searchParams.set("intent", "generate");
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
    score: 85,
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
    resumeResult: {
      artifactType: "resume",
      generationState: "generated_usable",
      qualityStatus: "pass",
      qualityGate: { status: "pass", reasons: [] },
      exportReady: true,
      exports: { docx: true, pdf: true },
      preview: {
        summary: "Support Operations leader.",
        experience: [{ company: "Acme", roleTitle: "Ops Lead", dateRange: "2022-2026", bullets: ["Did thing."] }],
        skillsAndTools: { tools: ["Zendesk"] },
      },
      correctionReasons: [],
      actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
    },
  };

  const renderableCover = {
    coverLetterResult: {
      artifactType: "cover_letter",
      generationState: "generated_usable",
      qualityStatus: "pass",
      qualityGate: { status: "pass", reasons: [] },
      exportReady: true,
      exports: { docx: true, pdf: true },
      preview: { paragraphs: ["Hello.", "I am a fit.", "Thanks."] },
      correctionReasons: [],
      actions: { canEdit: false, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
    },
  };

  beforeEach(() => {
    resumePosts = 0;
    coverPosts = 0;
    persisted.resume = null;
    persisted.coverLetter = null;

    // JSDOM localStorage is the only state allowed to survive "reload" in this test.
    window.localStorage.clear();

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
            resumeResult: persisted.resume ? (persisted.resume.responseBody as any)?.resumeResult ?? null : null,
            coverLetterResult: persisted.coverLetter ? (persisted.coverLetter.responseBody as any)?.coverLetterResult ?? null : null,
            generationContractVersion: persisted.generationContractVersion,
          });
        }

        // Readiness endpoints: baseline usable verified baseline exists (for generation gating).
        if (url === "/api/resume/readiness" && method === "POST") return jsonResponse(baselineUsableReadinessPayload);
        if (url === "/api/cover-letters/readiness" && method === "POST") return jsonResponse(baselineUsableReadinessPayload);

        // Generation: must succeed exactly once each and must persist artifacts (Studio reload reads them back).
        if (url === "/api/resume/generate" && method === "POST") {
          resumePosts += 1;
          // Persist into the same store returned by /api/studio/artifacts.
          persisted.resume = { responseBody: renderableResume };
          return jsonResponse(renderableResume);
        }
        if (url === "/api/cover-letters/generate" && method === "POST") {
          coverPosts += 1;
          persisted.coverLetter = { responseBody: renderableCover };
          return jsonResponse(renderableCover);
        }

        // Studio pulls baselines for identity; minimal happy-path response.
        if (url.startsWith("/api/baselines")) return jsonResponse([{ id: "base-80", status: "ACTIVE" }]);
        if (url.startsWith("/api/jobs")) return jsonResponse([{ id: "job-80", title: "Local scoring validation role", company: "TargetThisRole" }]);

        // Fit assessments list route used by assessmentSource in non-mocked paths; keep safe.
        if (url.startsWith("/api/analysis/fit-assessments")) {
          return jsonResponse({ assessments: [{ id: "analysis-80", baselineId: "base-80", overallScore: 85, createdAt: "2026-05-27T00:00:00.000Z" }] });
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
    const user = userEvent.setup();

    // Import lazily so mocks apply.
    const StudioPage = (await import("@/app/(app)/studio/page")).default;
    render(<StudioPage />);

    // 1) usable verified baseline exists (readiness endpoints resolved) and 2) score>=80 (mocked assessment).
    // 3) Generation controls are available: "not generated yet" shells must include generate CTAs.
    await waitFor(() => {
      expect(screen.queryByText(/generation unavailable/i)).toBeNull();
    });

    // Trigger resume generation.
    const resumeGenerateButton = await screen.findByTestId("studio-generate-resume-button");
    await user.click(resumeGenerateButton);

    // Trigger cover letter generation.
    const coverGenerateButton = await screen.findByTestId("studio-generate-cover-button");
    await user.click(coverGenerateButton);

    // 4/5) Exactly once each.
    await waitFor(() => expect(resumePosts).toBe(1));
    await waitFor(() => expect(coverPosts).toBe(1));

    // 6) Persisted artifacts render in Studio after generation.
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

    // 7) Reload renders both generated artifacts; 8/9/10/11) no contradictory prompts.
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

  it("does not show mixed authority when score is present but readiness fails with 400", async () => {
    const user = userEvent.setup();

    // Override assessment score to 83 (the reported production contradiction) while forcing readiness to 400.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String((input as any)?.url ?? input);
      const method = String(init?.method ?? "GET").toUpperCase();
      if (url.startsWith("/api/studio/artifacts")) {
        return jsonResponse({ resume: null, coverLetter: null, generationContractVersion: "pipeline-test" });
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
});
