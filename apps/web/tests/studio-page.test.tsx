import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { listBaselines } from "@/lib/baselines";
import { listJobs } from "@/lib/jobsClient";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { mockRouterReplace, overrideSearchParams, setFetchImplementation } from "./setup";

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

describe("Studio page UX", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
    mockRouterReplace.mockClear();
  });

  it("shows the current ready generation state for an explicit baselineId", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
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
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Ready to generate")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Generate Resume" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Generate Cover Letter" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Your application materials")).toBeInTheDocument();
    expect(screen.getByText(/Using resume/i)).toHaveTextContent("Using resume Leadership Resume");
    expect(screen.queryByText("Role analysis required")).toBeNull();
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
    expect(screen.queryByRole("button", { name: "Generate Resume" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate Cover Letter" })).toBeNull();
  });

  it("fails cleanly when the requested analysis is invalid", async () => {
    overrideSearchParams({
      analysisId: "analysis-missing",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
    const fetchMock = vi.fn((input: RequestInfo) => {
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
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Role analysis unavailable")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Unable to load role analysis. Please return to Results and reopen the document generator."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Resume" })).toBeNull();
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
    expect(screen.queryByText("Generate Resume")).toBeNull();
    expect(screen.queryByText("Generate Cover Letter")).toBeNull();
  });

  it("keeps the low-fit entry point bound to the selected baselineId", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
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
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation blocked")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Start Fit Review" })).toHaveAttribute(
      "href",
      "/resolve-gaps?jobId=job-1&baselineId=base-1",
    );
    expect(screen.queryByRole("button", { name: "Generate Resume" })).toBeNull();
  });

  it("shows the current auto-adjust guidance for unsupported requirements", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
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
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation blocked")).toBeInTheDocument();
    });
    expect(screen.getByText("Complete your profile before generating")).toBeInTheDocument();
    expect(screen.getByTestId("studio-auto-adjust-panel")).toBeInTheDocument();
    expect(screen.getByTestId("studio-one-step-unverified-list")).toHaveTextContent("- Salesforce Service Cloud administration");
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
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    const generateResumeButton = await screen.findByRole("button", { name: "Generate Resume" });
    await waitFor(() => expect(generateResumeButton).toBeEnabled());
    fireEvent.click(generateResumeButton);

    await waitFor(() => {
      expect(screen.getByTestId("resume-preview")).toBeInTheDocument();
    });
    expect(screen.getByText("Preview of tailored resume")).toBeInTheDocument();
    expect(screen.getByText("Alex Candidate")).toBeInTheDocument();
    expect(screen.getByText("Download: DOCX | PDF")).toBeInTheDocument();
  });
});
