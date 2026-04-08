import { render, screen, waitFor } from "@testing-library/react";
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

function installStrongFitFetches(options?: { readinessStatus?: "ready" | "limited"; resumeOk?: boolean; coverOk?: boolean }) {
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
          scoring_v2: { score: 84 },
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
    return resolveAutoGenerationSuccess(input);
  });
  setFetchImplementation(fetchMock);
  return fetchMock;
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
      expect(screen.getByTestId("resume-preview")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/resume"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/cover-letters"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("still auto-generates when verification confidence is limited", async () => {
    const fetchMock = installStrongFitFetches({ readinessStatus: "limited" });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("resume-preview")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/resume"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/cover-letters"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an explicit error if auto-generation fails", async () => {
    installStrongFitFetches({ readinessStatus: "ready", resumeOk: false, coverOk: false });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Document generation needs attention")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/generation failed/i).length).toBeGreaterThan(0);
  });
});
