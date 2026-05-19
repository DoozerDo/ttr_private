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

function rawFetchUrl(input: RequestInfo): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input instanceof Request
        ? input.url
        : typeof input === "object" && input && "url" in input
          ? String((input as { url?: unknown }).url ?? "")
          : typeof input === "object" && input && "href" in input
            ? String((input as { href?: unknown }).href ?? "")
            : String(input ?? "");
}

describe("partial regeneration", () => {
  beforeEach(() => {
    window.localStorage?.clear?.();
    window.sessionStorage?.clear?.();
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("reruns only the targeted artifact when a refinement is applied", async () => {
    let resumePersisted = false;
    const readinessCalls: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = rawFetchUrl(input);
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
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
      if (url.includes("/api/studio/artifacts")) {
        return Promise.resolve(
          createResponse({
            status: "COMPLETED",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            baselineVersionHash: "hash-1",
            jobId: "job-1",
            jobFingerprint: "job-fingerprint-1",
            generationContractVersion: "studio-artifacts-v1",
            artifactReadiness: "ready",
            resume: resumePersisted
              ? {
                  artifactType: "resume",
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
                }
              : null,
            coverLetter: null,
          }),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/") && url.includes("analysis-1")) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.info("[TEST] fit-assessments served", { url });
        }
        const payload = {
          assessmentId: "analysis-1",
          scoring_v2: { score: 75 },
          score: 75,
          overallScore: 75,
          fitScore: 75,
          matchScore: 75,
          analysisScore: 75,
          scoringV2: { score: 75 },
          result: { score: 75 },
          assessment: { score: 75 },
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
        return Promise.resolve(createResponse(payload));
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        const body = (() => {
          try {
            return init?.body ? JSON.parse(String(init.body)) : null;
          } catch {
            return init?.body ?? null;
          }
        })();
        readinessCalls.push({ url, body });
        return Promise.resolve(
          createResponse({
            status: "ready",
            reasons: [],
            compliance_flags: [],
          }),
        );
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        resumePersisted = true;
        return Promise.resolve(
          createResponse({
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
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => rawFetchUrl(input as RequestInfo).includes("/api/analysis/fit-assessments/")),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText("Unable to load role analysis.")).toBeNull();
    });

    await waitFor(() => {
      expect(readinessCalls.filter((call) => call.url.includes("/api/resume/readiness"))).toHaveLength(1);
      expect(readinessCalls.filter((call) => call.url.includes("/api/cover-letters/readiness"))).toHaveLength(1);
    });
    expect(readinessCalls[0]?.body).toMatchObject({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });

    const resumeButtons = await screen.findAllByRole("button", { name: "Generate Resume" });
    const resumeButton = resumeButtons[0];
    await waitFor(() => expect(resumeButton).toBeEnabled());
    fireEvent.click(resumeButton);

    await waitFor(() => {
      const initialResumeCalls = fetchMock.mock.calls.filter(
        ([url, init]) => typeof url === "string" && url.endsWith("/api/resume") && init?.method === "POST",
      );
      expect(initialResumeCalls).toHaveLength(1);
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => rawFetchUrl(input as RequestInfo).includes("/api/studio/artifacts")),
      ).toBe(true);
    });

    const openResumeButtons = await screen.findAllByRole("button", { name: "Resume" });
    const openResumeButton = openResumeButtons[0];
    await waitFor(() => expect(openResumeButton).toBeEnabled());
    fireEvent.click(openResumeButton);

    await screen.findByTestId("studio-refinement-panel");
    await screen.findByTestId("refinement-option-tighten-summary");

    fireEvent.click(screen.getByTestId("refinement-option-tighten-summary"));

    await waitFor(() => {
      const resumeCalls = fetchMock.mock.calls.filter(
        ([url, init]) => typeof url === "string" && url.endsWith("/api/resume") && init?.method === "POST",
      );
      expect(resumeCalls).toHaveLength(2);
    });

    const resumeCalls = fetchMock.mock.calls.filter(
      ([url, init]) => typeof url === "string" && url.endsWith("/api/resume") && init?.method === "POST",
    );
    const initialBody = JSON.parse((resumeCalls[0]?.[1]?.body as string) ?? "{}");
    const refinedBody = JSON.parse((resumeCalls[1]?.[1]?.body as string) ?? "{}");
    expect(refinedBody.documentStrategyPlan.summaryStrategy).not.toEqual(
      initialBody.documentStrategyPlan.summaryStrategy,
    );
    expect(refinedBody.documentStrategyPlan.summaryStrategy.toLowerCase()).toContain("tight");
    expect(refinedBody.documentStrategyPlan.positioningFrame).toBe(
      initialBody.documentStrategyPlan.positioningFrame,
    );

    const coverCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        typeof url === "string" && url.endsWith("/api/cover-letters") && init?.method === "POST",
    );
    expect(coverCalls).toHaveLength(0);
  });
});
