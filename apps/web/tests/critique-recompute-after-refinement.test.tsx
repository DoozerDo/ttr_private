import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
        status: "ACTIVE",
        isActive: true,
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
    let resumePersisted = false;
    let coverPersisted = false;
    let studioArtifactsFetchCount = 0;
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
            scoring_v2: { score: 75 },
            score: 75,
            overallScore: 75,
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
      if (url.includes("/api/studio/artifacts")) {
        studioArtifactsFetchCount += 1;
        const resume = resumePersisted
          ? {
              id: "artifact-resume-1",
              status: "COMPLETED",
              createdAt: "2026-05-18T00:00:00.000Z",
              baselineVersionHash: "hash-1",
              jobFingerprint: "jobfp-1",
              generationContractVersion: 1,
              inputsHash: resumeGenerationCount >= 2 ? "inputs-hash-resume-2" : "inputs-hash-resume-1",
              responseBody: {
                heading: { name: "Test Candidate", contactLine: "test@example.com" },
                summary:
                  resumeGenerationCount >= 2
                    ? "Service delivery and incident operations leader — Customer Operations and Support Strategy leader who rebuilt intake-to-resolution workflows, reduced response times by 24%, and partnered with Product + Engineering to cut repeat incident volume."
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
            }
          : null;

        const coverLetter = coverPersisted
          ? {
              id: "artifact-cover-1",
              status: "COMPLETED",
              createdAt: "2026-05-18T00:00:00.000Z",
              baselineVersionHash: "hash-1",
              jobFingerprint: "jobfp-1",
              generationContractVersion: 1,
              inputsHash: "inputs-hash-cover-1",
              responseBody: {
                paragraphs: [
                  "Dear Hiring Team,",
                  "I’m applying for the Director of Support role because the work sits at the intersection of customer experience, operational rigor, and cross‑functional execution. In my recent leadership roles I’ve owned support performance end‑to‑end, from intake and triage to escalation, post‑incident learning, and roadmap feedback. I’m comfortable translating noisy customer signals into clear priorities, and I’m equally comfortable building the operating system that keeps a team consistent: definitions, workflows, templates, QA, and coaching. That combination—systems thinking plus day‑to‑day judgment—is where I do my best work.",
                  "Across teams, I’ve partnered closely with Product and Engineering to reduce recurring issues and make service delivery predictable. I’ve led process redesigns that reduced response times and improved SLA adherence, while also elevating the quality of customer communication. I’m particularly focused on building feedback loops that are easy to maintain: structured tagging, lightweight reporting, and weekly review rhythms that produce specific actions. When something breaks, I’m calm and methodical; when the path is ambiguous, I set measurable goals and iterate quickly.",
                  "I’d welcome the chance to bring that approach to Acme—strengthening support operations, improving workflow quality, and ensuring customer pain is represented with clarity and urgency. Thank you for your time and consideration. Sincerely, Test Candidate",
                ],
              },
            }
          : null;

        return Promise.resolve(
          createResponse({
            resume,
            coverLetter,
            ...(resume ? { resumeResult: { actions: { canRegenerate: true } } } : {}),
            ...(coverLetter ? { coverLetterResult: { actions: { canRegenerate: true } } } : {}),
          }),
        );
      }
      if ((url.endsWith("/api/resume") || url.endsWith("/api/resume/generate")) && init?.method === "POST") {
        resumeGenerationCount += 1;
        resumePersisted = true;
        coverPersisted = true;
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
      if ((url.endsWith("/api/cover-letters") || url.endsWith("/api/cover-letters/generate")) && init?.method === "POST") {
        coverPersisted = true;
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
                  "I’m applying for the Director of Support role because the work sits at the intersection of customer experience, operational rigor, and cross‑functional execution. In my recent leadership roles I’ve owned support performance end‑to‑end, from intake and triage to escalation, post‑incident learning, and roadmap feedback. I’m comfortable translating noisy customer signals into clear priorities, and I’m equally comfortable building the operating system that keeps a team consistent: definitions, workflows, templates, QA, and coaching. That combination—systems thinking plus day‑to‑day judgment—is where I do my best work.",
                  "Across teams, I’ve partnered closely with Product and Engineering to reduce recurring issues and make service delivery predictable. I’ve led process redesigns that reduced response times and improved SLA adherence, while also elevating the quality of customer communication. I’m particularly focused on building feedback loops that are easy to maintain: structured tagging, lightweight reporting, and weekly review rhythms that produce specific actions. When something breaks, I’m calm and methodical; when the path is ambiguous, I set measurable goals and iterate quickly.",
                  "I’d welcome the chance to bring that approach to Acme—strengthening support operations, improving workflow quality, and ensuring customer pain is represented with clarity and urgency. Thank you for your time and consideration. Sincerely, Test Candidate",
                ],
              },
            },
          }),
        );
      }
      if (url.includes("/api/analytics/event")) {
        return Promise.resolve(createResponse({}, true, 204));
      }
      if (url.includes("/api/")) {
        throw new Error(`Unhandled fetch in test: ${url}`);
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    const hero = await screen.findByTestId("studio-instant-draft-hero");
    const generateResumeButton = await within(hero).findByRole("button", { name: "Generate Resume" });
    const generateCoverButton = await within(hero).findByRole("button", { name: "Generate Cover Letter" });

    await waitFor(() => expect(generateResumeButton).toBeEnabled());
    await waitFor(() => expect(generateCoverButton).toBeEnabled());

    fireEvent.click(generateResumeButton);

    fireEvent.click(generateCoverButton);
    await waitFor(() => {
      expect(screen.getByTestId("studio-critique-panel")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId("critique-issue-summary_generic")).toBeInTheDocument();
    });

    expect(screen.getByTestId("studio-critique-panel")).toHaveTextContent("Tighten the summary");

    fireEvent.click(screen.getByTestId("critique-best-next-action"));

    const regenerateResumeButton = await screen.findByTestId("studio-resume-regenerate");
    await waitFor(() => expect(regenerateResumeButton).toBeEnabled());
    fireEvent.click(regenerateResumeButton);

    await waitFor(() => {
      const resumeCalls = fetchMock.mock.calls.filter(([url, requestInit]) => {
        if (typeof url !== "string") return false;
        if (requestInit?.method !== "POST") return false;
        return url.endsWith("/api/resume") || url.endsWith("/api/resume/generate");
      });
      expect(resumeCalls).toHaveLength(2);
    });

    await waitFor(() => expect(resumeGenerationCount).toBe(2));
    await waitFor(() => expect(studioArtifactsFetchCount).toBeGreaterThan(1));
    await waitFor(() => {
      expect(screen.getByText(/rebuilt intake-to-resolution workflows/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("studio-critique-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("critique-issue-summary_generic")).toBeNull();
    });
  });
});
