import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      rawDescription:
        "Lead support operations, workflow design, and cross-functional coordination for a SaaS platform.",
      normalizedRequirements: [
        "Own process and workflow improvements.",
        "Partner with product and engineering.",
      ],
      normalizedResponsibilities: [
        "Lead support operations programs.",
        "Coordinate service delivery across teams.",
      ],
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

vi.mock("@/lib/generationProductReadiness", () => ({
  buildGenerationProductReadiness: vi.fn(() => ({
    generation_readiness: {
      canGenerate: true,
      canExport: true,
      reasons: [],
      verificationIssues: [],
      blocked: false,
    },
    state: "ALLOWED",
    confidence: "HIGH",
    needsVerification: false,
    tier: "generation_export_allowed",
    canOpenStudio: true,
    generationMode: "verified",
  })),
}));

vi.mock("@/lib/studioTrustGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studioTrustGate")>("@/lib/studioTrustGate");
  return {
    ...actual,
    evaluateStudioTrustGate: vi.fn(() => ({
      allowed: true,
      reason: null,
    })),
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
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") return "application/json";
        return null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
    blob: () => Promise.resolve(new Blob([text], { type: "application/json" })),
  };
}

function rawFetchUrl(input: RequestInfo): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input instanceof Request
        ? input.url
        : typeof input === "object" && input && "url" in input
          ? String((input as { url?: unknown }).url ?? "")
          : String(input ?? "");
}

function summarizePayload(payload: unknown): unknown {
  if (payload == null) return payload;
  if (typeof payload === "string") return payload.length > 200 ? `${payload.slice(0, 200)}…` : payload;
  if (typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return { type: "array", length: payload.length };
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record).slice(0, 20);
  const summary: Record<string, unknown> = { keys };
  if ("status" in record) summary.status = record.status;
  if ("error" in record) summary.error = record.error;
  if ("workflowState" in record) summary.workflowState = record.workflowState;
  if ("scoring_v2" in record) summary.scoring_v2 = record.scoring_v2;
  if ("baselineId" in record) summary.baselineId = record.baselineId;
  if ("jobId" in record) summary.jobId = record.jobId;
  return summary;
}

function shortBodyFingerprint(body: unknown): string | null {
  if (body == null) return null;
  const text =
    typeof body === "string"
      ? body
      : typeof body === "object"
        ? "[non-string-body]"
        : String(body);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    hash |= 0;
  }
  return `h=${(hash >>> 0).toString(16)} len=${text.length}`;
}

describe("undo behavior", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("reverts to the prior version cleanly", async () => {
    const fetchLedger: Array<{
      url: string;
      method: string;
      body: string | null;
      branch: string;
      responseKind: string;
    }> = [];

    function recordFetch(entry: {
      url: string;
      method: string;
      body: string | null;
      branch: string;
      responsePayload: unknown;
    }) {
      const payload = entry.responsePayload;
      const responseKind =
        payload == null ? "null" : Array.isArray(payload) ? `array(${payload.length})` : typeof payload;
      fetchLedger.push({
        url: entry.url,
        method: entry.method,
        body: entry.body,
        branch: entry.branch,
        responseKind,
      });
    }

    const originalConsoleInfo = console.info.bind(console);
    const originalConsoleWarn = console.warn.bind(console);
    const originalConsoleDebug = console.debug.bind(console);
    const originalConsoleError = console.error.bind(console);
    const originalConsoleLog = console.log.bind(console);
    // Stash so we can print compact diagnostics even while console methods are spied/suppressed.
    (console as unknown as { __undoBehaviorOriginalInfo?: typeof originalConsoleInfo }).__undoBehaviorOriginalInfo =
      originalConsoleInfo;
    // Prevent Studio debug/info logs from truncating test output; keep only the final ledger.
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    function dumpFetchLedger(tag: string) {
      originalConsoleInfo(`[undo-behavior][fetch-ledger] ${tag}`);
      const rows = fetchLedger.filter((row) => !row.url.startsWith("/api/analytics/event"));
      for (const row of rows) originalConsoleInfo("[undo-behavior][fetch-ledger-row]", row);
    }
    let hasGenerated = false;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = rawFetchUrl(input);
      const method =
        init?.method ?? (input instanceof Request && typeof input.method === "string" ? input.method : "GET");
      const rawBody = init?.body ?? (input instanceof Request ? "[request-body-not-captured]" : null);
      const body = shortBodyFingerprint(rawBody);
      let matchedBranch = "fallthrough_empty";
      let responsePayload: unknown = {};

      if (url.includes("/api/baselines/base-1/versions")) {
        matchedBranch = "baselines_versions";
        responsePayload = [{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }];
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.includes("/api/users/me")) {
        matchedBranch = "users_me";
        responsePayload = {
          id: "u-1",
          email: "test@example.com",
          subscriptionTier: "PRO",
          role: "user",
        };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.includes("/api/applications/insights")) {
        matchedBranch = "applications_insights";
        responsePayload = {
          completedApplicationsCount: 0,
          totalApplicationsCount: 0,
          recentActivity: [],
        };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url === "/api/applications") {
        matchedBranch = "applications_list";
        responsePayload = [
          {
            id: "application-1",
            status: "Ready",
            appliedAt: null,
            lastTouchedAt: new Date().toISOString(),
            baselineId: "base-1",
            jobId: "job-1",
            company: "Acme",
            title: "Director of Support",
          },
        ];
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.startsWith("/api/applications/pair")) {
        matchedBranch = "applications_pair";
        responsePayload = {
          id: "application-1",
          status: "Ready",
          appliedAt: null,
          lastTouchedAt: new Date().toISOString(),
          baselineId: "base-1",
          jobId: "job-1",
          jobUrl: "https://example.com/job",
          notes: null,
          sourceUrl: "https://example.com/job",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          resumeArtifacts: [],
        };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.startsWith("/api/opportunities")) {
        matchedBranch = "opportunities";
        responsePayload = [];
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.includes("/api/baselines/base-1") && !url.includes("/versions")) {
        matchedBranch = "baselines_base";
        responsePayload = {
          id: "base-1",
          originalFilename: "Leadership Resume",
          version: 1,
          sections: [
            {
              id: "section-1",
              title: "Support Operations",
              sectionType: "EXPERIENCE",
              content:
                "Led support operations programs, improved workflows, and partnered with engineering on service delivery.",
            },
          ],
        };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        matchedBranch = "analysis_fit_assessment";
        responsePayload = {
          assessmentId: "analysis-1",
          score: 84,
          overallScore: 84,
          fitScore: 84,
          matchScore: 84,
          analysisScore: 84,
          scoring_v2: { score: 84 },
          scoringV2: { score: 84 },
          result: { score: 84 },
          assessment: { score: 84 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
          summary: "Strong fit for support operations leadership.",
          strengths: ["Support operations rigor", "Cross-functional leadership"],
          gaps: [],
          recommendedActions: [],
          verification_coverage: {
            totalClaims: 2,
            verifiedClaims: 2,
            inferredClaims: 0,
            unverifiedClaims: 0,
          },
        };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.includes("/api/analysis/job/job-1/latest")) {
        matchedBranch = "analysis_job_latest";
        responsePayload = {
          assessmentId: "analysis-1",
          score: 84,
          overallScore: 84,
          fitScore: 84,
          matchScore: 84,
          analysisScore: 84,
          scoring_v2: { score: 84 },
          scoringV2: { score: 84 },
          result: { score: 84 },
          assessment: { score: 84 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          company: "Acme",
          title: "Director of Support",
          summary: "Strong fit for support operations leadership.",
          strengths: ["Support operations rigor", "Cross-functional leadership"],
          gaps: [],
          recommendedActions: [],
          verification_coverage: {
            totalClaims: 2,
            verifiedClaims: 2,
            inferredClaims: 0,
            unverifiedClaims: 0,
          },
        };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.includes("/api/resume/readiness")) {
        matchedBranch = "resume_readiness";
        responsePayload = { status: "ready", reasons: [], compliance_flags: [] };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        matchedBranch = "cover_readiness";
        responsePayload = { status: "ready", reasons: [], compliance_flags: [] };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.includes("/api/studio/artifacts")) {
        matchedBranch = "studio_artifacts";
        responsePayload = hasGenerated
          ? {
              status: "COMPLETED",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "job-fingerprint-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: {
                status: "COMPLETED",
                inputsHash: "resume-hash",
                responseBody: {
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
                          bullets: ["Led support operations and improved team performance."],
                        },
                      ],
                    },
                  },
                },
                content: null,
                failureCode: null,
                failureMessage: null,
                startedAt: null,
                completedAt: new Date().toISOString(),
                failedAt: null,
                metadata: null,
              },
              coverLetter: {
                status: "COMPLETED",
                inputsHash: "cover-hash",
                responseBody: {
                  status: "success",
                  generationStatus: "success",
                  exportReady: true,
                  exports: { docx: true, pdf: true },
                  preview: {
                    coverLetter: {
                      heading: { name: "Test Candidate", contactLine: "test@example.com" },
                      body: "Verified cover letter aligned to the role.",
                    },
                  },
                },
                content: null,
                failureCode: null,
                failureMessage: null,
                startedAt: null,
                completedAt: new Date().toISOString(),
                failedAt: null,
                metadata: null,
              },
            }
          : {
              status: "MISSING",
              baselineId: "base-1",
              jobId: "job-1",
              baselineVersionId: "base-version-1",
              baselineVersionHash: "hash-1",
              jobFingerprint: "job-fingerprint-1",
              generationContractVersion: "studio-artifacts-v1",
              resume: null,
              coverLetter: null,
            };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        matchedBranch = "resume_post";
        hasGenerated = true;
        const callCount = fetchMock.mock.calls.filter(
          ([calledUrl, calledInit]) =>
            rawFetchUrl(calledUrl as RequestInfo).endsWith("/api/resume") && calledInit?.method === "POST",
        ).length;
        responsePayload = {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            resume: {
              heading: { name: "Test Candidate", contactLine: "test@example.com" },
              summary:
                callCount >= 1
                  ? "Refined support leader aligned to the role."
                  : "Verified support leader aligned to the role.",
              experience: [
                {
                  company: "Acme",
                  roleTitle: "Director of Support",
                  bullets: ["Led support operations and improved team performance."],
                },
              ],
            },
          },
        };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        matchedBranch = "cover_letters_post";
        hasGenerated = true;
        responsePayload = {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            coverLetter: {
              heading: { name: "Test Candidate", contactLine: "test@example.com" },
              body: "Verified cover letter aligned to the role.",
            },
          },
        };
        recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
        return Promise.resolve(createResponse(responsePayload));
      }
      recordFetch({ url, method, body, branch: matchedBranch, responsePayload });
      return Promise.resolve(createResponse(responsePayload));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    try {
      const authorityPanel = await screen.findByTestId("studio-workflow-authority");
      await waitFor(() => {
        expect(authorityPanel.getAttribute("data-workflow-state")).toBe("generation_ready");
      });

      const resumeButton = await screen.findByRole("button", { name: "Resume" });
      await waitFor(() => expect(resumeButton).toBeEnabled());
      fireEvent.click(resumeButton);

      await waitFor(() => {
        const resumeCalls = fetchMock.mock.calls.filter(
          ([calledUrl, calledInit]) =>
            rawFetchUrl(calledUrl as RequestInfo).endsWith("/api/resume") && calledInit?.method === "POST",
        );
        expect(resumeCalls.length).toBeGreaterThan(0);
      }, { timeout: 12000 });

      const refineLink = await screen.findByRole("link", { name: "Refine" });
      fireEvent.click(refineLink);

      await waitFor(() => {
        expect(screen.getByTestId("studio-refinement-panel")).toBeInTheDocument();
      }, { timeout: 12000 });

      const tightenSummaryOption = await screen.findByTestId("refinement-option-tighten-summary");
      await waitFor(() => expect(tightenSummaryOption).toBeEnabled());

      fireEvent.click(tightenSummaryOption);

      // Current Studio contract: selecting a refinement applies it immediately and triggers
      // regeneration for the relevant target(s).
      await waitFor(() => {
        const resumeCalls = fetchMock.mock.calls.filter(
          ([url, init]) => typeof url === "string" && url.endsWith("/api/resume") && init?.method === "POST",
        );
        expect(resumeCalls).toHaveLength(2);
      });
    } catch (err) {
      dumpFetchLedger("failure");
      throw err;
    } finally {
      dumpFetchLedger("end");
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      debugSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy.mockRestore();
      console.info = originalConsoleInfo;
      console.warn = originalConsoleWarn;
      console.debug = originalConsoleDebug;
      console.error = originalConsoleError;
      console.log = originalConsoleLog;
    }

    const undoButton = await screen.findByRole("button", { name: "Undo last refinement" });
    await waitFor(() => expect(undoButton).toBeEnabled());
    fireEvent.click(undoButton);

    await waitFor(() => {
      const resumeCalls = fetchMock.mock.calls.filter(
        ([url, init]) => typeof url === "string" && url.endsWith("/api/resume") && init?.method === "POST",
      );
      expect(resumeCalls).toHaveLength(3);
    });

    const resumeCalls = fetchMock.mock.calls.filter(
      ([url, init]) => typeof url === "string" && url.endsWith("/api/resume") && init?.method === "POST",
    );
    const initialBody = JSON.parse((resumeCalls[0]?.[1]?.body as string) ?? "{}");
    const refinedBody = JSON.parse((resumeCalls[1]?.[1]?.body as string) ?? "{}");
    const revertedBody = JSON.parse((resumeCalls[2]?.[1]?.body as string) ?? "{}");
    expect(refinedBody.documentStrategyPlan.summaryStrategy).not.toEqual(
      initialBody.documentStrategyPlan.summaryStrategy,
    );
    expect(revertedBody.documentStrategyPlan.summaryStrategy).toEqual(
      initialBody.documentStrategyPlan.summaryStrategy,
    );
  }, 20000);
});
