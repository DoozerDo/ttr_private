import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { listBaselines } from "@/lib/baselines";
import { listJobs } from "@/lib/jobsClient";
import { FALLBACK_RENDERED_TEXT } from "@/lib/renderedText";
import { EntitlementsProvider } from "@/src/lib/entitlements";
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
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
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

function resolveStudioGenerationFallback(input: RequestInfo) {
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
            totalClaims: 2,
            verifiedClaims: 2,
            inferredClaims: 0,
            unverifiedClaims: 0,
          },
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
    if (url.includes("/api/resume/export")) {
      return Promise.resolve(createExportResponse("Director-of-Support-resume.docx"));
    }
    if (url.includes("/api/cover-letters/export")) {
      return Promise.resolve(createExportResponse("Director-of-Support-cover-letter.docx"));
    }
    if (url.includes("/api/applications/pair")) {
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
    if (url.includes("/api/analytics/event")) {
      return Promise.resolve(createResponse({ ok: true }));
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
  return fetchMock;
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

  it("hydrates completed artifacts from the backend and makes them usable immediately", async () => {
    const fetchMock = installCompletedArtifactFetches();

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-instant-resume-panel")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Your application is ready").length).toBeGreaterThan(0);
    expect(screen.getByText("2 applications completed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to this role" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Resume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Resume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Cover Letter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Cover Letter" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Download Resume" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Resume" }));
    fireEvent.click(screen.getByRole("button", { name: "Download Cover Letter" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Cover Letter" }));

    await waitFor(() => {
      expect(screen.getByText("Resume copied")).toBeInTheDocument();
      expect(screen.getByText("Cover letter copied")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply to this role" }));

    await waitFor(() => {
      expect(screen.getByTestId("studio-application-complete-hero")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Analyze another role" })).toBeInTheDocument();
      expect(screen.getByText("3 applications completed")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Analyze another role" }));
    expect(mockRouterPush).toHaveBeenCalledWith("/target?baselineId=base-1&jobId=job-1");

    await waitFor(() => {
      const analyticsBodies = fetchMock.mock.calls
        .filter(([url, init]) => String(url).includes("/api/analytics/event") && init?.method === "POST")
        .map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")));
      expect(analyticsBodies.map((body) => body.eventName)).toEqual(
        expect.arrayContaining([
          "studio_resume_downloaded",
          "studio_cover_letter_downloaded",
          "studio_resume_copied",
          "studio_cover_letter_copied",
          "studio_application_ready_viewed",
          "studio_apply_clicked",
          "studio_application_completed_viewed",
          "studio_next_role_clicked",
          "application_progress_viewed",
          "application_created_or_upserted",
          "application_status_updated",
        ]),
      );
    });
  });

  it("hydrates an already applied application and keeps the momentum state on refresh", async () => {
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
            company: "Acme",
            title: "Director of Support",
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 2,
              inferredClaims: 0,
              unverifiedClaims: 0,
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
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

    await waitFor(() => {
      expect(screen.getByTestId("studio-application-complete-hero")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Analyze another role" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply to this role" })).toBeNull();
    expect(screen.getByText("3 applications completed")).toBeInTheDocument();
  });

  it("shows the current ready generation state for an explicit baselineId", async () => {
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
            company: "Acme",
            title: "Director of Support",
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 2,
              inferredClaims: 0,
              unverifiedClaims: 0,
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getAllByText("Your application is ready").length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole("link", { name: "Start Fit Review" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download Resume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Cover Letter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to this role" })).toBeInTheDocument();
    expect(screen.getByText(/Using resume/i)).toHaveTextContent("Using resume Leadership Resume");
    expect(screen.queryByText("Role analysis required")).toBeNull();
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
            assessmentId: "analysis-1",
            scoring_v2: { score: 80 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
            summary: "{{broken analysis summary}}",
            supportingSignals: ["{{broken signal}}"],
            baselineEvidence: ["{{broken evidence}}"],
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 2,
              inferredClaims: 0,
              unverifiedClaims: 0,
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
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

  it("shows the unlock entry panel when arriving from a successful generation unlock", async () => {
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
            assessmentId: "analysis-1",
            scoring_v2: { score: 84 },
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
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-unlock-entry-panel")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText("Your application is ready").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Your application is ready").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Your verified evidence supports this role. Your materials are now grounded and ready."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GENERATE RESUME" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GENERATE COVER LETTER" })).toBeInTheDocument();
    expect(screen.queryByTestId("studio-evidence-blocked-panel")).toBeNull();
  });

  it("shows the strong artifact banner when the plan is high confidence", async () => {
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
            assessmentId: "analysis-1",
            scoring_v2: { score: 84 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            company: "Acme",
            title: "Director of Support",
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

    await waitFor(() => {
      expect(screen.getAllByText("Your application is ready").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByTestId("studio-artifact-quality-panel")[0]).toHaveTextContent("Strong Output");
    expect(screen.getAllByTestId("studio-artifact-quality-panel")[0]).toHaveTextContent(
      "Built from verified experience",
    );
    expect(screen.getAllByTestId("studio-artifact-quality-panel")[0]).toHaveTextContent("Confidence: High");
    expect(screen.getAllByText("Improve this output").length).toBeGreaterThan(0);
  });

  it("shows verified-evidence messaging for the first generation after unlock only", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      fromUnlock: "true",
    });

    let resolveFirstResumeGeneration: ((value: ReturnType<typeof createResponse>) => void) | null =
      null;
    let resolveSecondResumeGeneration: ((value: ReturnType<typeof createResponse>) => void) | null =
      null;
    let resumeGenerationRequestCount = 0;

    const firstResumeGeneration = new Promise<ReturnType<typeof createResponse>>((resolve) => {
      resolveFirstResumeGeneration = resolve;
    });
    const secondResumeGeneration = new Promise<ReturnType<typeof createResponse>>((resolve) => {
      resolveSecondResumeGeneration = resolve;
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
            company: "Acme",
            title: "Director of Support",
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 2,
              inferredClaims: 0,
              unverifiedClaims: 0,
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        resumeGenerationRequestCount += 1;
        return resumeGenerationRequestCount === 1 ? firstResumeGeneration : secondResumeGeneration;
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getAllByText("Generating your documents...").length).toBeGreaterThan(0);
    });

    await act(async () => {
      resolveFirstResumeGeneration?.(
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
    });

    expect((await screen.findAllByTestId("resume-preview", {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByTestId("studio-unlock-generation-confirmation")).toHaveTextContent(
        "Generated from verified evidence aligned to this role.",
      );
    });

    const generateResumeButton = await screen.findByRole("button", { name: "Generate Resume" });
    await waitFor(() => expect(generateResumeButton).toBeEnabled());

    fireEvent.click(generateResumeButton);

    await waitFor(() => {
      expect(screen.getAllByText("Generating...")).toHaveLength(2);
    });
    expect(screen.queryByText("Generating from your verified evidence...")).toBeNull();

    await act(async () => {
      resolveSecondResumeGeneration?.(
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
    });

    await waitFor(() => {
      expect(screen.queryByTestId("studio-unlock-generation-confirmation")).toBeNull();
    });
  });

  it("does not show verified-evidence generation messaging without fromUnlock", async () => {
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
            company: "Acme",
            title: "Director of Support",
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 2,
              inferredClaims: 0,
              unverifiedClaims: 0,
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
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
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    const generateResumeButton = await screen.findByRole("button", { name: "Generate Resume" });
    await waitFor(() => expect(generateResumeButton).toBeEnabled());
    fireEvent.click(generateResumeButton);

    await waitFor(() => {
      expect(screen.getAllByTestId("resume-preview").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Generating from your verified evidence...")).toBeNull();
    expect(screen.queryByTestId("studio-unlock-generation-confirmation")).toBeNull();
  });

  it("fails cleanly when no baselineId is provided", async () => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "",
      baselineVersionId: "base-version-1",
    });
    setFetchImplementation(async () => createResponse({}));

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Select an active resume to continue.")).toBeInTheDocument();
    });
  });

  it("fails cleanly when the requested analysis is invalid", async () => {
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
      expect(screen.getByText("Role analysis unavailable")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Unable to load role analysis. Please return to Results and reopen the document generator."),
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
    setFetchImplementation(async () => createResponse({}));

    renderStudio();

    await waitFor(() => {
      expect(
        screen.getByText("This resume is archived or unavailable. Select an active resume to continue."),
      ).toBeInTheDocument();
    });
  });

  it("keeps trust-summary text out of resume export payloads", async () => {
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
            company: "Acme",
            title: "Director of Support",
            verification_coverage: {
              totalClaims: 2,
              verifiedClaims: 2,
              inferredClaims: 0,
              unverifiedClaims: 0,
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
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
      if (url.includes("/api/resume/export") && init?.method === "POST") {
        return Promise.resolve(createExportResponse("resume Leadership Resume.docx"));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Generate Resume" })[0]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: "Generate Resume" })[0]);

    await waitFor(() => {
      expect(screen.getAllByTestId("resume-preview").length).toBeGreaterThan(0);
    });

    const exportButton = screen.getByRole("button", { name: "Download DOCX" });
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
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 65 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Generation blocked" })).toBeInTheDocument();
    });
    expect(screen.getByTestId("studio-decision-panel")).toHaveTextContent("Limited output: not ready yet.");
    expect(screen.getAllByTestId("studio-artifact-quality-panel")[0]).toHaveTextContent("Output needs work");
    expect(screen.getByRole("link", { name: "Start Fit Review" })).toHaveAttribute(
      "href",
      "/resolve-gaps?jobId=job-1&baselineId=base-1",
    );
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
            assessmentId: "analysis-1",
            scoring_v2: { score: 95 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
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

    await waitFor(() => {
      expect(screen.getByTestId("studio-instant-draft-hero")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("studio-artifact-quality-panel")[0]).toHaveTextContent("Usable Output");
    expect(screen.getAllByTestId("studio-artifact-quality-panel")[0]).toHaveTextContent(
      "Some claims are unverified. Strengthen for best results.",
    );
    expect(screen.getAllByTestId("studio-artifact-quality-panel")[0]).toHaveTextContent("Confidence: Medium");
    expect(screen.getAllByText("Improve this output").length).toBeGreaterThan(0);
  });

  it("generates a resume and exposes downloads after success", async () => {
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
          }),
        );
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
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
      return resolveStudioGenerationFallback(input);
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findAllByTestId("resume-preview", {}, { timeout: 5000 });
    expect(screen.getByTestId("studio-resume-trust-summary")).toHaveTextContent(
      "Generated from verified evidence",
    );
    expect(screen.getByTestId("studio-resume-trust-summary")).toHaveTextContent(
      "Verified baseline used. Aligned to this role. Unsupported claims remain blocked.",
    );
    expect(screen.getAllByText("Preview of tailored resume").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alex Candidate").length).toBeGreaterThan(0);
    expect(screen.getByText("Download: DOCX | PDF")).toBeInTheDocument();
  });

});
