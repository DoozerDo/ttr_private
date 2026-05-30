import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

import { AppShell } from "@/src/components/layout/AppShell";
import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { mockPathname, mockRouterPush, mockSearchParams } from "@/tests/setup";
import { setFetchImplementation } from "@/tests/setup";

let storedAnalysisOverride:
  | {
      savedAt: string;
      analysis: unknown;
      baselineId: string;
      jobId?: string;
      baselineVersionId?: string;
      jobSource: { type: "unknown" };
      fitScore: number | null;
    }
  | null = null;

vi.mock("@/app/(app)/lib/session", async () => {
  const actual = await vi.importActual<typeof import("@/app/(app)/lib/session")>("@/app/(app)/lib/session");
  return {
    ...actual,
    readLastAnalysis: () =>
      storedAnalysisOverride ?? {
        savedAt: "2026-04-18T00:00:00.000Z",
        analysis: { score: null },
        baselineId: "base-active",
        jobSource: { type: "unknown" },
        fitScore: null,
      },
  };
});

vi.mock("@/src/components/layout/TopNavAccountArea", () => ({
  TopNavAccountArea: () => null,
}));

vi.mock("@/src/components/layout/BetaGuideNudge", () => ({
  BetaGuideNudge: () => null,
}));

vi.mock("@/src/components/support/ReportBugProvider", () => ({
  ReportBugProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ReportBugTrigger: () => null,
}));

vi.mock("@/src/lib/baseline-sync", () => ({
  subscribeBaselineUpdated: () => () => {},
}));

describe("AppShell unlock path navigation", () => {
  it("E2E: /studio + score 83 + baseline repair required never shows Studio CURRENT and never shows generate/retry/export (single authority)", async () => {
    storedAnalysisOverride = {
      savedAt: "2026-04-18T00:00:00.000Z",
      baselineId: "base-1",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      jobSource: { type: "unknown" },
      fitScore: 83,
      analysis: {
        assessmentId: "analysis-1",
        scoring_v2: {
          score: 83,
          // Production leak repro: stepper reads stored analysis readiness; this may be missing structural reason codes.
          generation_readiness: { status: "ready", reasonCodes: [] },
        },
      },
    };
    mockPathname.mockReturnValue("/studio");

    // StudioPage reads ids from useSearchParams(); provide stable ids to match production deep-linking.
    mockSearchParams.mockReturnValue({
      get: (key?: string) => {
        if (!key) return null;
        if (key === "baselineId") return "base-1";
        if (key === "jobId") return "job-1";
        if (key === "analysisId") return "analysis-1";
        if (key === "assessmentId") return "analysis-1";
        return null;
      },
      getAll: () => [],
      toString: () => "baselineId=base-1&jobId=job-1&analysisId=analysis-1",
    });

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/baselines") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-1", isActive: true }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/jobs") && method === "GET") {
        return { ok: true, status: 200, json: async () => [], text: async () => "[]" } as Response;
      }
      if (url.includes("/api/baselines/base-1/versions") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/analysis/fit-assessments") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            assessmentId: "analysis-1",
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
            scoring_v2: { score: 83 },
            score: 83,
          }),
          text: async () => "{}",
        } as Response;
      }
      if (url.includes("/api/studio/artifacts") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            score: 83,
            scoring_v2: {
              score: 83,
              generation_readiness: { status: "blocked", blocked: true, reasonCodes: ["baseline_resume_v2_missing"] },
            },
            errors: [{ code: "baseline_resume_v2_missing" }],
            diagnostics: { resumeV2Readiness: { hasResumeV2: false, usableExperienceCount: 0 } },
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing", generating: false, failure: null },
            resume: { status: "missing", confidence: "LOW", failure: null },
            coverLetter: { status: "missing", confidence: "LOW", failure: null },
          }),
          text: async () => "{}",
        } as Response;
      }
      if (url.includes("/api/support/auto-error") && method === "POST") {
        return { ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response;
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    // Vitest's DOM environment may not provide a writable localStorage; provide a minimal one for this regression.
    const localStore = new Map<string, string>();
    (window as any).localStorage = {
      getItem: (key: string) => (localStore.has(key) ? localStore.get(key)! : null),
      setItem: (key: string, value: string) => {
        localStore.set(key, String(value));
      },
      removeItem: (key: string) => {
        localStore.delete(key);
      },
      clear: () => {
        localStore.clear();
      },
      key: (index: number) => Array.from(localStore.keys())[index] ?? null,
      get length() {
        return localStore.size;
      },
    };

    // Canonical Studio artifact surface (persisted snapshot) contains the structural baseline blocker.
    const blockedSnapshot = JSON.stringify({
      version: 2,
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      scoring_v2: { generation_readiness: { status: "blocked", reasonCodes: ["baseline_resume_v2_missing"] } },
      errors: [{ code: "baseline_resume_v2_missing" }],
    });
    window.localStorage.setItem("ttr:studio-artifacts:v2:job-1:base-1:analysis-1", blockedSnapshot);
    window.localStorage.setItem("ttr:studio-artifacts:v2:job-1:base-1:_", blockedSnapshot);

    render(
      <AppShell userEmail="test@example.com">
        <EntitlementsProvider
          entitlements={{
            tier: "PRO",
            source: "test",
            reasons: [],
            entitlements: null,
          }}
        >
          <StudioPage />
        </EntitlementsProvider>
      </AppShell>,
    );

    // Studio page must render the canonical baseline repair guidance surface.
    await screen.findByTestId("studio-baseline-blocked-recovery");
    expect(
      screen.getByText("Your baseline needs to be reprocessed before documents can be generated."),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("studio-resume-reprocess-baseline")).toBeInTheDocument();

    // Stepper: Studio must not be CURRENT under baseline repair required.
    const studioCard = await screen.findByTestId("unlock-path-studio");
    expect(studioCard.getAttribute("data-state")).not.toBe("CURRENT");
    expect(within(studioCard).queryByText("CURRENT")).toBeNull();
    // Studio card must not imply generation intent while structurally blocked.
    expect(within(studioCard).queryByText(/Generate resume and cover letter/i)).toBeNull();
    expect(within(studioCard).queryByText(/Studio unlocks when score/i)).toBeNull();

    // No actionable generation actions may render.
    expect(screen.queryByRole("button", { name: /Generate Documents/i })).toBeNull();
    expect(screen.queryByText(/Retry generation/i)).toBeNull();
    expect(screen.queryByTestId("studio-generate-resume-button")).toBeNull();
    expect(screen.queryByTestId("studio-generate-cover-button")).toBeNull();
    expect(screen.queryByTestId("studio-generation-ready-primary")).toBeNull();
    expect(screen.queryByTestId("studio-generation-ready-secondary")).toBeNull();
    expect(screen.queryByText(/strong enough to generate documents/i)).toBeNull();
    expect(screen.queryByText(/generate documents for this role/i)).toBeNull();
    expect(screen.queryByText(/Download DOCX/i)).toBeNull();
    expect(screen.queryByText(/Download PDF/i)).toBeNull();
    expect(screen.queryByText(/^Export/i)).toBeNull();
  });

  it("E2E: /studio + score 83 + readiness ready generates resume + cover and renders canonical Studio artifact content (no repair, no retry)", async () => {
    storedAnalysisOverride = {
      savedAt: "2026-04-18T00:00:00.000Z",
      baselineId: "base-1",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      jobSource: { type: "unknown" },
      fitScore: 83,
      analysis: {
        scoring_v2: {
          score: 83,
          generation_readiness: { status: "ready", reasonCodes: [] },
        },
      },
    };
    mockPathname.mockReturnValue("/studio");

    mockSearchParams.mockReturnValue({
      get: (key?: string) => {
        if (!key) return null;
        if (key === "baselineId") return "base-1";
        if (key === "jobId") return "job-1";
        if (key === "analysisId") return "analysis-1";
        if (key === "assessmentId") return "analysis-1";
        return null;
      },
      getAll: () => [],
      toString: () => "baselineId=base-1&jobId=job-1&analysisId=analysis-1",
    });

    let resumeGenerated = false;
    let coverGenerated = false;
    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/baselines") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-1", isActive: true }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/jobs") && method === "GET") {
        return { ok: true, status: 200, json: async () => [], text: async () => "[]" } as Response;
      }
      if (url.includes("/api/baselines/base-1/versions") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/analysis/fit-assessments") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            assessmentId: "analysis-1",
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
            scoring_v2: { score: 83 },
            score: 83,
          }),
          text: async () => "{}",
        } as Response;
      }
      if (url.includes("/api/studio/artifacts") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            score: 83,
            scoring_v2: {
              score: 83,
              generation_readiness: { status: "ready", blocked: false, reasonCodes: [] },
            },
            errors: [],
            diagnostics: { resumeV2Readiness: { hasResumeV2: true, usableExperienceCount: 1 } },
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            artifact: {
              hasResume: resumeGenerated,
              hasCoverLetter: coverGenerated,
              pairStatus: "missing",
              generating: false,
              failure: null,
            },
            resume: resumeGenerated
              ? {
                  status: "COMPLETED",
                  confidence: "HIGH",
                  failure: null,
                  responseBody: {
                    status: "success",
                    generationStatus: "success",
                    exportReady: false,
                    exports: { docx: false, pdf: false },
                    preview: {
                      resume: {
                        heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                        summary: "Fresh resume summary reflecting current ruleset.",
                        experience: [],
                        education: [],
                        competencies: [],
                      },
                    },
                  },
                }
              : { status: "missing", confidence: "LOW", failure: null },
            coverLetter: coverGenerated
              ? {
                  status: "COMPLETED",
                  confidence: "HIGH",
                  failure: null,
                  responseBody: {
                    status: "success",
                    generationStatus: "success",
                    exportReady: false,
                    exports: { docx: false, pdf: false },
                    preview: {
                      coverLetter: {
                        paragraphs: [
                          "Dear Hiring Team,",
                          "Fresh cover letter paragraph reflecting current ruleset.",
                          "Sincerely,",
                          "Alex Candidate",
                        ],
                      },
                    },
                  },
                }
              : { status: "missing", confidence: "LOW", failure: null },
          }),
          text: async () => "{}",
        } as Response;
      }
      // Studio may POST either to `/api/resume` or `/api/resume/generate` depending on lane.
      if (
        method === "POST" &&
        (url.includes("/api/resume/generate") || (url.endsWith("/api/resume") && url.includes("/api/resume")))
      ) {
        resumeGenerated = true;
        return new Response(
          JSON.stringify({
            status: "success",
            generationStatus: "success",
            exportReady: false,
            exports: { docx: false, pdf: false },
            preview: {
              resume: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                summary: "Fresh resume summary reflecting current ruleset.",
                experience: [],
                education: [],
                competencies: [],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "POST" && url.includes("/api/cover-letters/generate")) {
        coverGenerated = true;
        return new Response(
          JSON.stringify({
            status: "success",
            generationStatus: "success",
            exportReady: false,
            exports: { docx: false, pdf: false },
            preview: {
              coverLetter: {
                paragraphs: [
                  "Dear Hiring Team,",
                  "Fresh cover letter paragraph reflecting current ruleset.",
                  "Sincerely,",
                  "Alex Candidate",
                ],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/support/auto-error") && method === "POST") {
        return { ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response;
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    render(
      <AppShell userEmail="test@example.com">
        <EntitlementsProvider
          entitlements={{
            tier: "PRO",
            source: "test",
            reasons: [],
            entitlements: null,
          }}
        >
          <StudioPage />
        </EntitlementsProvider>
      </AppShell>,
    );

    // Stepper: Studio is CURRENT on the ready + score>=80 happy path.
    const studioCard = await screen.findByTestId("unlock-path-studio");
    expect(studioCard.getAttribute("data-state")).toBe("CURRENT");
    expect(within(studioCard).getByText("CURRENT")).toBeInTheDocument();

    // Happy path surfaces generation CTAs, not baseline recovery.
    expect(screen.queryByTestId("studio-baseline-blocked-recovery")).toBeNull();
    expect(screen.queryByTestId("studio-resume-reprocess-baseline")).toBeNull();
    expect(
      screen.queryByText("Your baseline needs to be reprocessed before documents can be generated."),
    ).toBeNull();

    // Only valid generation actions render (no retry, no export in the missing-artifact state).
    const generateResume = await screen.findByTestId("studio-generate-resume-button");
    expect(generateResume).toBeInTheDocument();
    expect(screen.queryByText(/Retry generation/i)).toBeNull();
    expect(screen.queryByText(/Download DOCX/i)).toBeNull();
    expect(screen.queryByText(/Download PDF/i)).toBeNull();
    expect(screen.queryByText(/^Export/i)).toBeNull();

    // Trigger generation then verify canonical artifact content renders.
    fireEvent.click(generateResume);
    await waitFor(() => {
      expect(screen.queryByText(/Retry generation/i)).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    const resumePreviews = await screen.findAllByTestId("resume-preview");
    expect(resumePreviews[0]).toHaveTextContent("Fresh resume summary reflecting current ruleset.");

    // Trigger cover letter generation then verify canonical artifact content renders.
    const generateCover = await screen.findByTestId("studio-generate-cover-button");
    expect(generateCover).toBeInTheDocument();
    expect(
      screen.queryByText("Your baseline needs to be reprocessed before documents can be generated."),
    ).toBeNull();
    expect(screen.queryByText(/Retry generation/i)).toBeNull();

    fireEvent.click(generateCover);
    await waitFor(() => {
      expect(screen.queryByText(/Retry generation/i)).toBeNull();
    });

    const coverPreview = await screen.findByTestId("studio-cover-letter-preview-body");
    expect(coverPreview).toHaveTextContent("Fresh cover letter paragraph reflecting current ruleset.");
  });

  it("E2E: /studio reload + score 83 + readiness ready + existing resume+cover artifacts shows generated materials only (no repair, no retry, no regenerate)", async () => {
    storedAnalysisOverride = {
      savedAt: "2026-04-18T00:00:00.000Z",
      baselineId: "base-1",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      jobSource: { type: "unknown" },
      fitScore: 83,
      analysis: {
        scoring_v2: {
          score: 83,
          generation_readiness: { status: "ready", reasonCodes: [] },
        },
      },
    };
    mockPathname.mockReturnValue("/studio");

    mockSearchParams.mockReturnValue({
      get: (key?: string) => {
        if (!key) return null;
        if (key === "baselineId") return "base-1";
        if (key === "jobId") return "job-1";
        if (key === "analysisId") return "analysis-1";
        if (key === "assessmentId") return "analysis-1";
        return null;
      },
      getAll: () => [],
      toString: () => "baselineId=base-1&jobId=job-1&analysisId=analysis-1",
    });

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/baselines") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-1", isActive: true }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/jobs") && method === "GET") {
        return { ok: true, status: 200, json: async () => [], text: async () => "[]" } as Response;
      }
      if (url.includes("/api/baselines/base-1/versions") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/analysis/fit-assessments") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            assessmentId: "analysis-1",
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
            scoring_v2: { score: 83 },
            score: 83,
          }),
          text: async () => "{}",
        } as Response;
      }
      if (url.includes("/api/studio/artifacts") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            score: 83,
            scoring_v2: {
              score: 83,
              generation_readiness: { status: "ready", blocked: false, reasonCodes: [] },
            },
            errors: [],
            diagnostics: { resumeV2Readiness: { hasResumeV2: true, usableExperienceCount: 1 } },
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            artifact: { hasResume: true, hasCoverLetter: true, pairStatus: "paired", generating: false, failure: null },
            resume: {
              status: "COMPLETED",
              confidence: "HIGH",
              failure: null,
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: false,
                exports: { docx: false, pdf: false },
                preview: {
                  resume: {
                    heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                    summary: "Fresh resume summary reflecting current ruleset.",
                    experience: [],
                    education: [],
                    competencies: [],
                  },
                },
              },
            },
            coverLetter: {
              status: "COMPLETED",
              confidence: "HIGH",
              failure: null,
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: false,
                exports: { docx: false, pdf: false },
                preview: {
                  coverLetter: {
                    paragraphs: [
                      "Dear Hiring Team,",
                      "Fresh cover letter paragraph reflecting current ruleset.",
                      "Sincerely,",
                      "Alex Candidate",
                    ],
                  },
                },
              },
            },
          }),
          text: async () => "{}",
        } as Response;
      }
      if (url.includes("/api/support/auto-error") && method === "POST") {
        return { ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response;
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    render(
      <AppShell userEmail="test@example.com">
        <EntitlementsProvider
          entitlements={{
            tier: "PRO",
            source: "test",
            reasons: [],
            entitlements: null,
          }}
        >
          <StudioPage />
        </EntitlementsProvider>
      </AppShell>,
    );

    const studioCard = await screen.findByTestId("unlock-path-studio");
    expect(studioCard.getAttribute("data-state")).toBe("CURRENT");
    expect(within(studioCard).getByText("CURRENT")).toBeInTheDocument();

    expect(screen.queryByTestId("studio-baseline-blocked-recovery")).toBeNull();
    expect(screen.queryByTestId("studio-resume-reprocess-baseline")).toBeNull();
    expect(
      screen.queryByText("Your baseline needs to be reprocessed before documents can be generated."),
    ).toBeNull();

    // Generated materials remain dominant.
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    const resumePreviews = await screen.findAllByTestId("resume-preview");
    expect(resumePreviews[0]).toHaveTextContent("Fresh resume summary reflecting current ruleset.");

    const coverPreview = await screen.findByTestId("studio-cover-letter-preview-body");
    expect(coverPreview).toHaveTextContent("Fresh cover letter paragraph reflecting current ruleset.");

    // No generation/retry/recovery CTAs.
    expect(screen.queryByTestId("studio-generate-resume-button")).toBeNull();
    expect(screen.queryByTestId("studio-generate-cover-button")).toBeNull();
    expect(screen.queryByText(/Retry generation/i)).toBeNull();
  });

  it("E2E: /studio reload + completed exports shows Export and downloads (no repair, no retry, no regenerate)", async () => {
    storedAnalysisOverride = {
      savedAt: "2026-04-18T00:00:00.000Z",
      baselineId: "base-1",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      jobSource: { type: "unknown" },
      fitScore: 83,
      analysis: {
        scoring_v2: {
          score: 83,
          generation_readiness: { status: "ready", reasonCodes: [] },
        },
      },
    };
    mockPathname.mockReturnValue("/studio");

    mockSearchParams.mockReturnValue({
      get: (key?: string) => {
        if (!key) return null;
        if (key === "baselineId") return "base-1";
        if (key === "jobId") return "job-1";
        if (key === "analysisId") return "analysis-1";
        if (key === "assessmentId") return "analysis-1";
        return null;
      },
      getAll: () => [],
      toString: () => "baselineId=base-1&jobId=job-1&analysisId=analysis-1",
    });

    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/baselines") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-1", isActive: true }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/jobs") && method === "GET") {
        return { ok: true, status: 200, json: async () => [], text: async () => "[]" } as Response;
      }
      if (url.includes("/api/baselines/base-1/versions") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/analysis/fit-assessments") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            assessmentId: "analysis-1",
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
            scoring_v2: { score: 83 },
            score: 83,
          }),
          text: async () => "{}",
        } as Response;
      }
      if (url.includes("/api/studio/artifacts") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            score: 83,
            scoring_v2: {
              score: 83,
              generation_readiness: { status: "ready", blocked: false, reasonCodes: [] },
            },
            errors: [],
            diagnostics: { resumeV2Readiness: { hasResumeV2: true, usableExperienceCount: 1 } },
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            jobId: "job-1",
            artifact: { hasResume: true, hasCoverLetter: true, pairStatus: "paired", generating: false, failure: null },
            resume: {
              status: "COMPLETED",
              confidence: "HIGH",
              failure: null,
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: true,
                exports: { docx: true, pdf: true },
                preview: {
                  resume: {
                    heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                    summary: "Fresh resume summary reflecting current ruleset.",
                    experience: [],
                    education: [],
                    competencies: [],
                  },
                },
              },
            },
            coverLetter: {
              status: "COMPLETED",
              confidence: "HIGH",
              failure: null,
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: true,
                exports: { docx: true, pdf: true },
                preview: {
                  coverLetter: {
                    paragraphs: [
                      "Dear Hiring Team,",
                      "Fresh cover letter paragraph reflecting current ruleset.",
                      "Sincerely,",
                      "Alex Candidate",
                    ],
                  },
                },
              },
            },
          }),
          text: async () => "{}",
        } as Response;
      }
      if (url.includes("/api/support/auto-error") && method === "POST") {
        return { ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response;
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    render(
      <AppShell userEmail="test@example.com">
        <EntitlementsProvider
          entitlements={{
            tier: "PRO",
            source: "test",
            reasons: [],
            entitlements: null,
          }}
        >
          <StudioPage />
        </EntitlementsProvider>
      </AppShell>,
    );

    const studioCard = await screen.findByTestId("unlock-path-studio");
    expect(studioCard.getAttribute("data-state")).toBe("CURRENT");
    expect(within(studioCard).getByText("CURRENT")).toBeInTheDocument();

    expect(screen.queryByTestId("studio-baseline-blocked-recovery")).toBeNull();
    expect(screen.queryByTestId("studio-resume-reprocess-baseline")).toBeNull();
    expect(
      screen.queryByText("Your baseline needs to be reprocessed before documents can be generated."),
    ).toBeNull();

    const resumePreviews = await screen.findAllByTestId("resume-preview");
    expect(resumePreviews[0]).toHaveTextContent("Fresh resume summary reflecting current ruleset.");
    const coverPreview = await screen.findByTestId("studio-cover-letter-preview-body");
    expect(coverPreview).toHaveTextContent("Fresh cover letter paragraph reflecting current ruleset.");

    // Completed-state actions: export is available and downloads are offered.
    const exportAction =
      screen.queryByText(/Export \(DOCX \/ PDF\)/i) ??
      screen.queryByText(/^Export/i) ??
      screen.queryByText(/Download Resume/i) ??
      screen.queryByText(/Download Cover Letter/i);
    expect(exportAction).not.toBeNull();

    // No generation/retry/recovery CTAs.
    expect(screen.queryByTestId("studio-generate-resume-button")).toBeNull();
    expect(screen.queryByTestId("studio-generate-cover-button")).toBeNull();
    expect(screen.queryByText(/Retry generation/i)).toBeNull();
  });

  it("never renders Studio CURRENT when baseline repair is required at score 83 (dominant baseline blocker)", async () => {
    storedAnalysisOverride = {
      savedAt: "2026-04-18T00:00:00.000Z",
      baselineId: "base-active",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      jobSource: { type: "unknown" },
      fitScore: 83,
      analysis: {
        scoring_v2: {
          score: 83,
          generation_readiness: { status: "blocked", reasonCodes: ["baseline_resume_v2_missing"] },
        },
      },
    };
    mockPathname.mockReturnValue("/studio");

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/baselines")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-active", isActive: true }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/jobs")) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
          text: async () => "[]",
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <AppShell userEmail="test@example.com">
        <div>Child</div>
      </AppShell>,
    );

    const studioCard = await screen.findByTestId("unlock-path-studio");
    expect(studioCard.getAttribute("data-state")).not.toBe("CURRENT");
    expect(within(studioCard).queryByText("CURRENT")).toBeNull();

    const baselineCard = screen.getByTestId("unlock-path-baseline");
    expect(baselineCard.getAttribute("data-state")).toBe("CURRENT");

    // AppShell must not surface a generation CTA when baseline repair dominates.
    expect(screen.queryByRole("button", { name: /Generate Documents/i })).toBeNull();
  });

  it("renders Studio CURRENT when score 83 and baseline is usable", async () => {
    storedAnalysisOverride = {
      savedAt: "2026-04-18T00:00:00.000Z",
      baselineId: "base-active",
      jobId: "job-1",
      baselineVersionId: "base-version-1",
      jobSource: { type: "unknown" },
      fitScore: 83,
      analysis: {
        scoring_v2: {
          score: 83,
          generation_readiness: { status: "ready", reasonCodes: [] },
        },
      },
    };
    mockPathname.mockReturnValue("/studio");

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/baselines")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-active", isActive: true }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/jobs")) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
          text: async () => "[]",
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <AppShell userEmail="test@example.com">
        <div>Child</div>
      </AppShell>,
    );

    const studioCard = await screen.findByTestId("unlock-path-studio");
    expect(studioCard.getAttribute("data-state")).toBe("CURRENT");
    expect(within(studioCard).getByText("CURRENT")).toBeInTheDocument();
  });

  it("routes Target rail click to /target with the active baseline when on /baseline", async () => {
    storedAnalysisOverride = null;
    mockPathname.mockReturnValue("/baseline");

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/baselines")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-active", isActive: true }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/jobs")) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
          text: async () => "[]",
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <AppShell userEmail="test@example.com">
        <div>Child</div>
      </AppShell>,
    );

    const rail = await screen.findByTestId("unlock-path-bar");
    const nav = within(rail).getByRole("navigation", { name: "Unlock Path" });
    const targetButton = within(nav).getByRole("button", { name: /Target/i });
    fireEvent.click(targetButton);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/target?baselineId=base-active");
    });
  });
});
