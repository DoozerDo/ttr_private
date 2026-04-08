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
        "Own support operations strategy.",
        "Partner with product and engineering.",
        "Improve workflow quality and service delivery.",
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
  const actual = await vi.importActual<typeof import("@/lib/baselines")>("@/lib/baselines");
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

describe("critique recompute after refinement", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("updates the critique after the suggested refinement is applied", async () => {
    let resumeGenerationCount = 0;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/baselines/base-1") && !url.includes("/versions")) {
        return Promise.resolve(
          createResponse({
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
          }),
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
            company: "Acme",
            title: "Director of Support",
            summary: "Strong fit for support operations leadership.",
            strengths: ["Support operations rigor", "Cross-functional leadership"],
            gaps: [],
            recommendedActions: [],
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        resumeGenerationCount += 1;
        return Promise.resolve(
          createResponse({
            status: "success",
            generationStatus: "success",
            exportReady: true,
            exports: { docx: true, pdf: true },
            preview: {
              resume: {
                heading: { name: "Test Candidate", contactLine: "test@example.com" },
                summary:
                  resumeGenerationCount >= 2
                    ? "Customer Operations and Support Strategy leader who scales support systems, improves service workflows, and partners across product and engineering."
                    : "Results-driven leader with a proven track record of delivering results across teams in fast-paced environments.",
                experience: [
                  {
                    company: "Acme",
                    roleTitle: "Director of Support",
                    bullets:
                      resumeGenerationCount >= 2
                        ? [
                            "Led support operations programs and reduced response time by 24%.",
                            "Designed workflow automation that improved SLA adherence and removed duplicate work.",
                          ]
                        : [
                            "Led support initiatives and delivered results across teams.",
                            "Worked across teams to improve outcomes and drive results.",
                          ],
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
                paragraphs: [
                  "Dear Hiring Team,",
                  "I am excited to apply and believe my background includes leading teams and delivering results.",
                  "My resume shows that I have experience in support, operations, and leadership across teams.",
                  "Sincerely,",
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
    const generateCoverButton = await screen.findByTestId("studio-cover-generate-button");

    await waitFor(() => expect(generateResumeButton).toBeEnabled());
    await waitFor(() => expect(generateCoverButton).toBeEnabled());

    fireEvent.click(generateResumeButton);
    await waitFor(() => {
      expect(screen.getByTestId("studio-critique-panel")).toBeInTheDocument();
    });

    fireEvent.click(generateCoverButton);

    await waitFor(() => {
      expect(screen.getByTestId("critique-issue-summary_generic")).toBeInTheDocument();
    });

    expect(screen.getByTestId("studio-critique-panel")).toHaveTextContent("Tighten the summary");

    fireEvent.click(screen.getByTestId("critique-best-next-action"));

    await waitFor(() => {
      const resumeCalls = fetchMock.mock.calls.filter(
        ([url, requestInit]) =>
          typeof url === "string" && url.endsWith("/api/resume") && requestInit?.method === "POST",
      );
      expect(resumeCalls).toHaveLength(2);
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          "Customer Operations and Support Strategy leader who scales support systems, improves service workflows, and partners across product and engineering.",
        ),
      ).toBeInTheDocument();
    });
  });
});
