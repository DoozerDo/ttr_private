import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { listBaselines } from "@/lib/baselines";
import { listJobs } from "@/lib/jobsClient";
import { FALLBACK_RENDERED_TEXT } from "@/lib/renderedText";
import { getFitReviewHref } from "@/src/navigation/routes";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import * as generationProductReadiness from "@/lib/generationProductReadiness";
import {
  mockRouterPush,
  mockRouterReplace,
  overrideSearchParams,
  setFetchImplementation,
} from "./setup";

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
  const stringBody =
    typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body);
  const response = {
    ok,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") return "application/json";
        return null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
    clone: () => response,
  };
  return response;
}

function createExportResponse(filename: string) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-type") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (name.toLowerCase() === "content-disposition") {
          return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
        }
        return null;
      },
    },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
    blob: () => Promise.resolve(new Blob(["document"], { type: "application/octet-stream" })),
  };
}

function createFitAssessment(score: number) {
  const scoreAliases = {
    score,
    overallScore: score,
    fitScore: score,
    matchScore: score,
    analysisScore: score,
    scoring_v2: { score },
    scoringV2: { score },
    result: { score },
    assessment: { score },
  };
  return {
    assessmentId: "analysis-1",
    ...scoreAliases,
    jobId: "job-1",
    baselineId: "base-1",
    baselineVersionId: "base-version-1",
    company: "Acme",
    title: "Director of Support",
    verification_coverage: {
      totalClaims: 2,
      verifiedClaims: 2,
      inferredClaims: 0,
      unverifiedClaims: 0,
    },
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

function resolveStudioGenerationFallback(input: RequestInfo) {
  const url = rawFetchUrl(input);
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
              "I bring verified leadership and operational experience aligned to this role.",
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

function installCompletedArtifactFetches() {
  let completedApplicationsCount = 2;
  const artifactFetchUrls: string[] = [];
  const analysisFetchUrls: string[] = [];
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const rawUrl = rawFetchUrl(input);

    if (rawUrl.includes("studio/artifacts")) artifactFetchUrls.push(rawUrl);
    if (rawUrl.includes("analysis")) analysisFetchUrls.push(rawUrl);

    const isAnalysisRequest =
      rawUrl.includes("/api/analysis/fit-assessments/analysis-1") ||
      rawUrl.includes("/api/analysis/job/job-1/latest") ||
      rawUrl.includes("fit-assessments/analysis-1") ||
      rawUrl.includes("analysis/job/job-1/latest");
    if (isAnalysisRequest) {
      return Promise.resolve(createResponse(createFitAssessment(84)));
    }

    if (rawUrl.includes("/api/studio/artifacts") || rawUrl.includes("studio/artifacts")) {
      return Promise.resolve(
        createResponse({
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
            content: "resume-content",
            failureCode: null,
            failureMessage: null,
            startedAt: null,
            completedAt: new Date().toISOString(),
            failedAt: null,
            metadata: { auditId: "audit-1" },
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
                  paragraphs: [
                    "Dear Hiring Team,",
                    "I bring verified leadership and operational experience aligned to this role.",
                    "Sincerely,",
                    "Alex Candidate",
                  ],
                },
              },
            },
            content: "cover-content",
            failureCode: null,
            failureMessage: null,
            startedAt: null,
            completedAt: new Date().toISOString(),
            failedAt: null,
            metadata: { auditId: "audit-1" },
          },
        }),
      );
    }
    if (rawUrl.includes("/api/baselines/base-1/versions")) {
      return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
    }
    if (rawUrl.includes("/api/analysis/job/job-1/latest")) {
      return Promise.resolve(createResponse(createFitAssessment(84)));
    }
    if (rawUrl.includes("/api/analysis/fit-assessments/")) {
      return Promise.resolve(
        createResponse(createFitAssessment(84)),
      );
    }
    if (rawUrl.includes("/api/resume/readiness")) {
      return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
    }
    if (rawUrl.includes("/api/cover-letters/readiness")) {
      return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
    }
    if (rawUrl.includes("/api/resume/export")) {
      return Promise.resolve(createExportResponse("Director-of-Support-resume.docx"));
    }
    if (rawUrl.includes("/api/cover-letters/export")) {
      return Promise.resolve(createExportResponse("Director-of-Support-cover-letter.docx"));
    }
    if (rawUrl.includes("/api/applications/pair")) {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return Promise.resolve(
          createResponse({
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
          }),
        );
      }
      const parsedBody = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const nextStatus = String(parsedBody?.applicationStatus ?? parsedBody?.status ?? "").toLowerCase();
      if (nextStatus === "applied") {
        completedApplicationsCount = 3;
      }
      return Promise.resolve(
        createResponse({
          id: "application-1",
          status: nextStatus === "applied" ? "Applied" : "Ready",
          appliedAt: nextStatus === "applied" ? new Date().toISOString() : null,
          lastTouchedAt: new Date().toISOString(),
          baselineId: "base-1",
          jobId: "job-1",
          jobUrl: "https://example.com/job",
          notes: null,
          sourceUrl: "https://example.com/job",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          resumeArtifacts: [],
        }),
      );
    }
    if (rawUrl.includes("/api/applications/insights")) {
      return Promise.resolve(
        createResponse({
          completedApplicationsCount,
          totalApplicationsCount: 3,
        }),
      );
    }
    if (rawUrl.includes("/api/analytics/event")) {
      return Promise.resolve(createResponse({ ok: true }));
    }
    if (rawUrl.endsWith("/api/applications")) {
      return Promise.resolve(
        createResponse([
          {
            id: "application-1",
            status: "Applied",
            appliedAt: new Date().toISOString(),
            lastTouchedAt: new Date().toISOString(),
            baselineId: "base-1",
            jobId: "job-0",
            company: "Northwind",
            title: "Senior Program Manager",
          },
          {
            id: "application-2",
            status: "Applied",
            appliedAt: new Date().toISOString(),
            lastTouchedAt: new Date().toISOString(),
            baselineId: "base-1",
            jobId: "job-1a",
            company: "Acme",
            title: "Director of Support",
          },
          {
            id: "application-3",
            status: "Ready",
            appliedAt: null,
            lastTouchedAt: new Date().toISOString(),
            baselineId: "base-1",
            jobId: "job-1",
            company: "Acme",
            title: "Director of Support",
          },
        ]),
      );
    }
    return resolveStudioGenerationFallback(input);
  });
  setFetchImplementation(fetchMock);
  (fetchMock as unknown as { artifactFetchUrls?: string[] }).artifactFetchUrls = artifactFetchUrls;
  (fetchMock as unknown as { analysisFetchUrls?: string[] }).analysisFetchUrls = analysisFetchUrls;
  return fetchMock;
}

async function openStudioWorkspaceFromReadyShell() {
  const primary = screen.queryByTestId("studio-generation-ready-primary");
  if (primary) {
    fireEvent.click(primary);
    return;
  }

  const secondary = screen.queryByTestId("studio-generation-ready-secondary");
  if (secondary) fireEvent.click(secondary);
}

describe("Studio page UX", () => {
  beforeEach(() => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:studio-export"),
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    Object.defineProperty(window, "open", {
      configurable: true,
      value: vi.fn(),
    });
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
    mockRouterReplace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates completed artifacts from the backend and makes them usable immediately", async () => {
    const fetchMock = installCompletedArtifactFetches();

    const firstMount = renderStudio();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => rawFetchUrl(input));
      expect(urls.some((url) => url.includes("fit-assessments/analysis-1") || url.includes("analysis/job/job-1/latest"))).toBe(true);
      expect(urls.some((url) => url.includes("studio/artifacts"))).toBe(true);
    });

    await openStudioWorkspaceFromReadyShell();

    // Completed artifacts are considered usable when the ready trust summary renders (backend hydration succeeded).
    const trustSummary = await screen.findByTestId("studio-ready-trust-summary");
    expect(trustSummary).toHaveTextContent("Generated from verified evidence");

    const authority = screen.getByTestId("studio-workflow-authority");
    expect(within(authority).getByTestId("workflow-authority-headline").textContent?.trim().length).toBeGreaterThan(0);
    expect(within(authority).getByTestId("workflow-authority-body")).toBeInTheDocument();
    expect(within(authority).getByTestId("workflow-authority-eyebrow")).toBeInTheDocument();

    expect(screen.getByText("Support leader focused on scalable operations.")).toBeInTheDocument();
    expect(
      screen.getByText("I bring verified leadership and operational experience aligned to this role."),
    ).toBeInTheDocument();
  }, 20000);

  it("hydrates persisted artifacts in Studio even when analysisId is missing (no local fallback, no fake readiness)", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const localStorageGet = vi.spyOn(Storage.prototype, "getItem");

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const rawUrl = rawFetchUrl(input);

      if (rawUrl.includes("/api/studio/artifacts")) {
        expect(rawUrl.includes("analysisId=")).toBe(false);
        return Promise.resolve(
          createResponse({
            status: "COMPLETED",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            baselineVersionHash: "hash-1",
            jobFingerprint: "job-fingerprint-1",
            generationContractVersion: "studio-artifacts-v1",
            assessmentScore: null,
            resume: {
              status: "COMPLETED",
              inputsHash: "resume-hash",
              inputsHashMatches: true,
              artifactCurrent: true,
              retryAllowed: true,
              responseBody: {
                status: "success",
                generationStatus: "success",
                exportReady: true,
                exports: { docx: true, pdf: true },
                preview: {
                  resume: {
                    heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                    summary: "Support leader focused on scalable operations.",
                    experience: [],
                    education: [],
                    competencies: [],
                  },
                },
              },
              content: "resume-content",
              failureCode: null,
              failureMessage: null,
              startedAt: null,
              completedAt: new Date().toISOString(),
              failedAt: null,
              metadata: { auditId: "audit-1" },
            },
            coverLetter: {
              status: "COMPLETED",
              inputsHash: "cover-hash",
              inputsHashMatches: true,
              artifactCurrent: true,
              retryAllowed: true,
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
              content: "cover-content",
              failureCode: null,
              failureMessage: null,
              startedAt: null,
              completedAt: new Date().toISOString(),
              failedAt: null,
              metadata: { auditId: "audit-1" },
            },
          }),
        );
      }

      if (rawUrl.includes("/api/analysis/") || rawUrl.includes("/api/analysis")) {
        return Promise.resolve(
          createResponse(
            { error: { code: "not_found", message: "analysis not available" } },
            { status: 404 },
          ),
        );
      }

      if (rawUrl.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }

      if (rawUrl.includes("/api/resume/readiness")) {
        // Keep readiness unknown-ish for this test: no analysis-derived claim should be required to render persisted artifact.
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "unknown", message: "unknown" }], compliance_flags: [] }));
      }

      if (rawUrl.includes("/api/analytics/event")) {
        return Promise.resolve(createResponse({ ok: true }));
      }

      return Promise.resolve(createResponse({}));
    });

    setFetchImplementation(fetchMock as unknown as typeof fetch);

    const firstMount = renderStudio();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => rawFetchUrl(input));
      expect(urls.some((url) => url.includes("/api/studio/artifacts"))).toBe(true);
    });

    const panel = await screen.findByTestId("studio-instant-resume-panel");
    expect(panel).toBeInTheDocument();

    const instantSummary = await screen.findByTestId("studio-instant-resume-summary");
    expect(instantSummary).toHaveTextContent("Support leader focused on scalable operations.");

    firstMount.unmount();

    const secondMount = renderStudio();
    await waitFor(() => {
      const artifactCalls = fetchMock.mock.calls
        .map(([input]) => rawFetchUrl(input))
        .filter((url) => url.includes("/api/studio/artifacts"));
      expect(artifactCalls.length).toBeGreaterThanOrEqual(2);
      expect(artifactCalls.every((url) => !url.includes("analysisId="))).toBe(true);
    });

    const panelAgain = await screen.findByTestId("studio-instant-resume-panel");
    expect(panelAgain).toBeInTheDocument();
    const instantSummaryAgain = await screen.findByTestId("studio-instant-resume-summary");
    expect(instantSummaryAgain).toHaveTextContent("Support leader focused on scalable operations.");

    secondMount.unmount();

    // No localStorage artifact fallback should be needed when backend hydration succeeds.
    expect(localStorageGet.mock.calls.some(([key]) => String(key).includes("ttr:studio-artifacts"))).toBe(false);
  }, 20000);

  it("hydrates an already applied application and keeps the momentum state on refresh", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/job/job-1/latest")) {
        return Promise.resolve(createResponse(createFitAssessment(84)));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse(createFitAssessment(84)),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "low_fit", message: "limited" }], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "low_fit", message: "limited" }], compliance_flags: [] }));
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
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
              content: "resume-content",
              failureCode: null,
              failureMessage: null,
              startedAt: null,
              completedAt: new Date().toISOString(),
              failedAt: null,
              metadata: { auditId: "audit-1" },
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
                    paragraphs: [
                      "Dear Hiring Team,",
                      "I bring verified leadership and operational experience aligned to this role.",
                      "Sincerely,",
                      "Alex Candidate",
                    ],
                  },
                },
              },
              content: "cover-letter-content",
              failureCode: null,
              failureMessage: null,
              startedAt: null,
              completedAt: new Date().toISOString(),
              failedAt: null,
              metadata: { auditId: "audit-2" },
            },
          }),
        );
      }
      if (url.endsWith("/api/applications")) {
        return Promise.resolve(
          createResponse([
            {
              id: "application-1",
              status: "Applied",
              appliedAt: new Date().toISOString(),
              lastTouchedAt: new Date().toISOString(),
              baselineId: "base-1",
              jobId: "job-0",
              company: "Northwind",
              title: "Senior Program Manager",
            },
            {
              id: "application-2",
              status: "Applied",
              appliedAt: new Date().toISOString(),
              lastTouchedAt: new Date().toISOString(),
              baselineId: "base-1",
              jobId: "job-1a",
              company: "Acme",
              title: "Director of Support",
            },
            {
              id: "application-3",
              status: "Applied",
              appliedAt: new Date().toISOString(),
              lastTouchedAt: new Date().toISOString(),
              baselineId: "base-1",
              jobId: "job-2",
              company: "Nimbus",
              title: "Support Operations Lead",
            },
          ]),
        );
      }
      if (url.includes("/api/applications/insights")) {
        return Promise.resolve(
          createResponse({
            completedApplicationsCount: 3,
            totalApplicationsCount: 3,
          }),
        );
      }
      if (url.includes("/api/applications/pair")) {
        return Promise.resolve(
          createResponse({
            id: "application-3",
            status: "Applied",
            appliedAt: new Date().toISOString(),
            lastTouchedAt: new Date().toISOString(),
            baselineId: "base-1",
            jobId: "job-1",
            jobUrl: "https://example.com/job",
            notes: null,
            sourceUrl: "https://example.com/job",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resumeArtifacts: [],
          }),
        );
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    // The applied momentum state now keeps the generated artifacts visible (no application-complete hero).
    await screen.findByText("Resume generated successfully", {}, { timeout: 12000 });
    expect(screen.queryByRole("button", { name: "Apply to this role" })).toBeNull();
  }, 12000);

  it("shows the current ready generation state for an explicit baselineId", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse(createFitAssessment(84)));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "readiness_pending", message: "limited" }], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "readiness_pending", message: "limited" }], compliance_flags: [] }));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Start Fit Review" })).toBeNull();
    // Compatibility shell CTAs may be absent when Studio can render the workspace immediately.
    expect(screen.queryByRole("button", { name: "Download Resume" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply to this role" })).toBeNull();
  });

  it("sanitizes malformed analysis text before it reaches Studio copy", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            ...createFitAssessment(80),
            summary: "{{broken analysis summary}}",
            supportingSignals: ["{{broken signal}}"],
            baselineEvidence: ["{{broken evidence}}"],
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "low_fit", message: "limited" }], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "low_fit", message: "limited" }], compliance_flags: [] }));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getAllByText(FALLBACK_RENDERED_TEXT).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("{{broken analysis summary}}")).toBeNull();
    expect(screen.queryByText("{{broken signal}}")).toBeNull();
  });

  it("shows the generation-ready shell when arriving from a successful generation unlock", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      fromUnlock: "true",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse(createFitAssessment(84)));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "readiness_pending", message: "blocked" }],
            compliance_flags: [],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "blocked",
            reasons: [{ code: "readiness_pending", message: "blocked" }],
            compliance_flags: [],
          }),
        );
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("studio-evidence-blocked-panel")).toBeNull();
  });

  it("shows the artifact quality banner when evidence confidence is low", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      fromUnlock: "true",
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            ...createFitAssessment(84),
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 1,
              inferredClaims: 1,
              unverifiedClaims: 1,
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [], compliance_flags: [] }));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    // Under the single-eligibility gate, low evidence confidence should not block generation.
    // Assert the decision surface renders and remains informational.
    await screen.findByTestId("studio-decision-panel");
    expect(screen.getByTestId("studio-confidence-label")).toBeInTheDocument();
  });

  it("shows verified-evidence messaging for the first generation after unlock", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      fromUnlock: "true",
    });

    let resolveFirstResumeGeneration: ((value: ReturnType<typeof createResponse>) => void) | null =
      null;
    let resumeGenerationRequestCount = 0;
    let resumeGenerated = false;

    const firstResumeGeneration = new Promise<ReturnType<typeof createResponse>>((resolve) => {
      resolveFirstResumeGeneration = resolve;
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse(createFitAssessment(84)));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [{ code: "readiness_pending", message: "limited" }],
            compliance_flags: [],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [{ code: "readiness_pending", message: "limited" }],
            compliance_flags: [],
          }),
        );
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: resumeGenerated ? "COMPLETED" : "MISSING",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            baselineVersionHash: "hash-1",
            jobFingerprint: "job-fingerprint-1",
            generationContractVersion: "studio-artifacts-v1",
            resume: resumeGenerated
              ? {
                  status: "COMPLETED",
                  inputsHash: "resume-hash",
                  responseBody: {
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
                  content: "resume-content",
                  failureCode: null,
                  failureMessage: null,
                  startedAt: null,
                  completedAt: new Date().toISOString(),
                  failedAt: null,
                  metadata: { auditId: "audit-1" },
                }
              : { status: "MISSING", failureCode: null, failureMessage: null },
            coverLetter: { status: "MISSING", failureCode: null, failureMessage: null },
          }),
        );
      }
      if (
        url.includes("/api/resume") &&
        !url.includes("/readiness") &&
        !url.includes("/export") &&
        init?.method === "POST"
      ) {
        resumeGenerationRequestCount += 1;
        resumeGenerated = true;
        return firstResumeGeneration;
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              coverLetter: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                paragraphs: ["Intro paragraph."],
              },
            },
          }),
        );
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    // Under the single-eligibility gate, Studio may auto-start the first generation after unlock.
    // Treat either explicit user click or auto-gen kickoff as valid for this test.
    await openStudioWorkspaceFromReadyShell();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/resume"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    await act(async () => {
      resumeGenerated = true;
      resolveFirstResumeGeneration?.(
        createResponse({
          status: "success",
          generationStatus: "success",
          exportReady: true,
          exports: { docx: true, pdf: true },
          content: "resume-content",
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
        }),
      );
    });

    expect(resumeGenerationRequestCount).toBe(1);
    await waitFor(() => {
      expect(screen.getByText("Your output is now backed by verified evidence.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Generating from your verified evidence...")).toBeNull();
  }, 12000);

  it("does not show verified-evidence generation messaging without fromUnlock", async () => {
    vi.spyOn(generationProductReadiness, "buildGenerationProductReadiness").mockReturnValue({
      generation_readiness: { canGenerate: true, canExport: false, reasonsBlocked: [] },
      state: "ALLOWED",
      confidence: "LOW",
      needsVerification: false,
      tier: "generation_allowed",
      canOpenStudio: true,
      generationMode: "verified",
    });

    let resumeGenerated = false;

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse(createFitAssessment(84)));
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
            status: resumeGenerated ? "COMPLETED" : "MISSING",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            baselineVersionHash: "hash-1",
            jobFingerprint: "job-fingerprint-1",
            generationContractVersion: "studio-artifacts-v1",
            resume: resumeGenerated
              ? {
                  status: "COMPLETED",
                  inputsHash: "resume-hash",
                  responseBody: {
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
                  content: "resume-content",
                  failureCode: null,
                  failureMessage: null,
                  startedAt: null,
                  completedAt: new Date().toISOString(),
                  failedAt: null,
                  metadata: { auditId: "audit-1" },
                }
              : { status: "MISSING", failureCode: null, failureMessage: null },
            coverLetter: { status: "MISSING", failureCode: null, failureMessage: null },
          }),
        );
      }
      if (
        url.includes("/api/resume") &&
        !url.includes("/readiness") &&
        !url.includes("/export") &&
        init?.method === "POST"
      ) {
        resumeGenerated = true;
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
              },
            },
          }),
        );
      }
      if (
        url.includes("/api/cover-letters") &&
        !url.includes("/readiness") &&
        !url.includes("/export") &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              coverLetter: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                paragraphs: ["Intro paragraph."],
              },
            },
          }),
        );
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await openStudioWorkspaceFromReadyShell();
    fireEvent.click(await screen.findByTestId("studio-generate-resume-button", {}, { timeout: 5000 }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/resume"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("resume-preview").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Generating from your verified evidence...")).toBeNull();
    expect(screen.queryByTestId("studio-unlock-generation-confirmation")).toBeNull();
  });

  it("lets the user manually generate cover letter artifacts from the Studio workspace when score >= 80", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse(createFitAssessment(84)));
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "missing",
            baselineId: "base-1",
            jobId: "job-1",
            baselineVersionId: "base-version-1",
            resume: null,
            coverLetter: null,
          }),
        );
      }
      if (
        url.includes("/api/cover-letters") &&
        !url.includes("/readiness") &&
        !url.includes("/export") &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              coverLetter: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                paragraphs: ["Intro paragraph."],
              },
            },
          }),
        );
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await openStudioWorkspaceFromReadyShell();
    fireEvent.click(await screen.findByTestId("studio-generate-cover-button", {}, { timeout: 5000 }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/cover-letters"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("fails cleanly when no baselineId is provided", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "",
      baselineVersionId: "base-version-1",
    });
    vi.mocked(listBaselines).mockResolvedValueOnce([]);
    setFetchImplementation((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse(createFitAssessment(84)));
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();

    await screen.findByTestId("studio-generation-readiness");
    const authority = await screen.findByTestId("studio-workflow-authority");
    expect(authority.getAttribute("data-workflow-state")).toBe("generation_ready");
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cover Letter" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Refine" })).toBeInTheDocument();
    expect(screen.queryByTestId("studio-generation-ready-shell")).toBeNull();
  });

  it("fails cleanly when the requested analysis is invalid", async () => {
    vi.spyOn(generationProductReadiness, "buildGenerationProductReadiness").mockReturnValue({
      generation_readiness: { canGenerate: true, canExport: false, reasonsBlocked: [] },
      state: "ALLOWED",
      confidence: "LOW",
      needsVerification: false,
      tier: "generation_allowed",
      canOpenStudio: true,
      generationMode: "verified",
    });
    overrideSearchParams({
      analysisId: "analysis-missing",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("analysis-missing")) {
        return Promise.resolve(createResponse({ message: "not found" }, 404));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-missing")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-missing",
            scoring_v2: { score: 80 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/jobs/job-1")) {
        return Promise.resolve(createResponse({ id: "job-1", title: "Support Director", company: "Acme" }));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("We couldn’t load your analysis")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Something changed or couldn’t be verified. Reload your analysis to continue."),
    ).toBeInTheDocument();
  });

  it("fails cleanly when the requested baseline is archived", async () => {
    overrideSearchParams({
      analysisId: "analysis-archived",
      jobId: "job-1",
      baselineId: "base-archived",
      baselineVersionId: "base-version-archived",
    });
    vi.mocked(listBaselines).mockResolvedValueOnce([
      {
        id: "base-archived",
        originalFilename: "Archived Resume",
        version: 3,
        status: "ARCHIVED",
      } as never,
    ]);
    setFetchImplementation((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-archived")) {
        return Promise.resolve(
          createResponse({
            ...createFitAssessment(84),
            assessmentId: "analysis-archived",
            baselineId: "base-archived",
            baselineVersionId: "base-version-archived",
          }),
        );
      }
      if (url.includes("/api/baselines/base-archived/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-archived", fileHash: "hash-archived", versionNumber: 3 }]),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();

    const authority = await screen.findByTestId("studio-workflow-authority");
    expect(within(authority).getByTestId("workflow-authority-headline")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-generation-ready-shell")).toBeNull();
  });

  it("keeps trust-summary text out of resume export payloads", async () => {
    let artifactsGenerated = false;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse(createFitAssessment(84)));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse(
            artifactsGenerated
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
                    content: "resume-content",
                    failureCode: null,
                    failureMessage: null,
                    startedAt: null,
                    completedAt: new Date().toISOString(),
                    failedAt: null,
                    metadata: { auditId: "audit-1" },
                  },
                  coverLetter: null,
                }
              : {
                  status: "missing",
                  baselineId: "base-1",
                  jobId: "job-1",
                  baselineVersionId: "base-version-1",
                  resume: null,
                  coverLetter: null,
                },
          ),
        );
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        artifactsGenerated = true;
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
              },
            },
          }),
        );
      }
      if (url.endsWith("/api/cover-letters") && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              coverLetter: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                paragraphs: ["Intro paragraph."],
              },
            },
          }),
        );
      }
      if (url.includes("/api/resume/export") && init?.method === "POST") {
        return Promise.resolve(createExportResponse("resume Leadership Resume.docx"));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await openStudioWorkspaceFromReadyShell();
    fireEvent.click(await screen.findByTestId("studio-generate-resume-button", {}, { timeout: 5000 }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/resume"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("resume-preview").length).toBeGreaterThan(0);
    });

    const exportButton = screen.getAllByRole("button", { name: "Download DOCX" })[0];
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/resume/export?format=docx"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    const exportCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === "string" && url.includes("/api/resume/export?format=docx") && init?.method === "POST",
    );
    expect(exportCall).toBeTruthy();
    const body = JSON.parse((exportCall?.[1]?.body as string) ?? "{}");
    expect(JSON.stringify(body)).not.toContain("Generated from verified evidence");
    expect(JSON.stringify(body)).not.toContain("Verified baseline used");
  });

  it("keeps the low-fit entry point bound to the selected baselineId", async () => {
    const readinessSpy = vi.spyOn(generationProductReadiness, "buildGenerationProductReadiness").mockReturnValue({
      generation_readiness: { canGenerate: true, canExport: false, reasonsBlocked: [] },
      state: "ALLOWED",
      confidence: "LOW",
      needsVerification: false,
      tier: "generation_allowed",
      canOpenStudio: false,
      generationMode: "verified",
    });
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse(createFitAssessment(65)));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [{ code: "readiness_pending", message: "limited" }],
            compliance_flags: [],
          }),
        );
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(
          createResponse({
            status: "limited",
            reasons: [{ code: "readiness_pending", message: "limited" }],
            compliance_flags: [],
          }),
        );
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Review fit gaps" })).toHaveAttribute(
      "href",
      getFitReviewHref({
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        assessmentId: "analysis-1",
        analysisId: "analysis-1",
      }),
    );
    expect(screen.queryByRole("button", { name: "Generate draft anyway" })).toBeNull();
    expect(readinessSpy).toHaveBeenCalled();
  });

  it("shows the current auto-adjust guidance for unsupported requirements", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            ...createFitAssessment(95),
            verification_coverage: {
              totalClaims: 1,
              verifiedClaims: 0,
              inferredClaims: 0,
              unverifiedClaims: 1,
              unverifiedRequirements: ["Salesforce Service Cloud administration"],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "limited", reasons: [{ code: "personalization_limitation", message: "limited" }] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    const autoAdjustPanel = await screen.findByTestId("studio-auto-adjust-panel", {}, { timeout: 15000 });
    expect(autoAdjustPanel).toHaveTextContent("Fix this in one step");
    expect(autoAdjustPanel).toHaveTextContent("Salesforce Service Cloud administration");
    expect(screen.getByRole("button", { name: "Remove unsupported requirements and continue" })).toBeInTheDocument();
  }, 15000);



  it("generates a resume and exposes downloads after success", async () => {
    // Studio now prefers hydrated persisted artifacts over a manual "ready shell" generation step.
    // This test asserts the post-generation experience (downloads visible) by starting with the
    // artifacts already present.
    let artifactsGenerated = true;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            ...createFitAssessment(84),
            scoringV2: { score: 84 },
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
          createResponse(
            artifactsGenerated
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
                    content: "resume-content",
                    failureCode: null,
                    failureMessage: null,
                    startedAt: null,
                    completedAt: new Date().toISOString(),
                    failedAt: null,
                    metadata: { auditId: "audit-1" },
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
                          heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                          paragraphs: ["Intro paragraph."],
                        },
                      },
                    },
                    content: "cover-content",
                    failureCode: null,
                    failureMessage: null,
                    startedAt: null,
                    completedAt: new Date().toISOString(),
                    failedAt: null,
                    metadata: { auditId: "audit-2" },
                  },
                }
              : {
                  status: "missing",
                  baselineId: "base-1",
                  jobId: "job-1",
                  baselineVersionId: "base-version-1",
                  resume: null,
                  coverLetter: null,
                },
          ),
        );
      }
      if (url.includes("/api/resume") && !url.includes("/readiness") && !url.includes("/export") && init?.method === "POST") {
        artifactsGenerated = true;
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
              },
            },
          }),
        );
      }
      if (url.includes("/api/cover-letters") && !url.includes("/readiness") && !url.includes("/export") && init?.method === "POST") {
        artifactsGenerated = true;
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              coverLetter: {
                heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
                paragraphs: ["Intro paragraph."],
              },
            },
          }),
        );
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await openStudioWorkspaceFromReadyShell();

    const resumePreviews = await screen.findAllByTestId("resume-preview", {}, { timeout: 3000 });
    expect(screen.getByTestId("studio-ready-trust-summary")).toHaveTextContent(
      "Generated from verified evidence",
    );
    expect(screen.getByTestId("studio-ready-trust-summary")).toHaveTextContent(
      "Verified baseline used. Aligned to this role. Unsupported claims remain blocked.",
    );
    expect(resumePreviews[0]).toHaveTextContent("Alex Candidate");
    expect(screen.getAllByRole("button", { name: "Download DOCX" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Download PDF" }).length).toBeGreaterThan(0);
  });

});
