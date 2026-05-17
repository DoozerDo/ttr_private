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
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
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
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            score: 84,
            scoring_v2: { score: 84 },
            scoringV2: { score: 84 },
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
              totalClaims: 3,
              verifiedClaims: 3,
              inferredClaims: 0,
              unverifiedClaims: 0,
              verifiedRequirements: ["Support operations"],
              unverifiedRequirements: [],
            },
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [], compliance_flags: [] }));
      }
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        const callCount = fetchMock.mock.calls.filter(
          ([calledUrl, calledInit]) =>
            typeof calledUrl === "string" && calledUrl.endsWith("/api/resume") && calledInit?.method === "POST",
        ).length;
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
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    const resumeButtons = await screen.findAllByRole("button", { name: /resume/i });
    const generateResumeButton = resumeButtons[0];
    await waitFor(() => expect(generateResumeButton).toBeEnabled());
    fireEvent.click(generateResumeButton);

    await waitFor(() => {
      expect(screen.getByTestId("studio-refinement-panel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("refinement-option-tighten-summary"));

    await waitFor(() => {
      const resumeCalls = fetchMock.mock.calls.filter(
        ([url, init]) => typeof url === "string" && url.endsWith("/api/resume") && init?.method === "POST",
      );
      expect(resumeCalls).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo last refinement" }));

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
  });
});
