import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "./setup";

let mockedStudioState: "ready" | "limited" | "blocked" = "ready";

vi.mock("@/app/(app)/studio/BaselineBlockPolicyPanel", () => ({
  BaselineBlockPolicyPanel: () => null,
}));

vi.mock("@/lib/jobsClient", () => ({
  listJobs: vi.fn(async () => [
    { id: "job-1", company: "Acme", title: "Director of Support", archivedAt: null, isArchived: false },
  ]),
}));

vi.mock("@/lib/baselines", async () => {
  const actual = await vi.importActual("@/lib/baselines");
  return {
    ...(actual as object),
    listBaselines: vi.fn(async () => [{ id: "base-1", originalFilename: "Leadership Resume", version: 1 }]),
  };
});

vi.mock("@/lib/generationProductReadiness", () => ({
  buildGenerationProductReadiness: vi.fn(() => ({
    generation_readiness: {
      canGenerate: mockedStudioState !== "blocked",
      canExport: mockedStudioState !== "blocked",
      reasons:
        mockedStudioState === "ready"
          ? []
          : [{ code: "personalization_limitation", message: "Some evidence is still lighter than others." }],
      verificationIssues: mockedStudioState === "blocked" ? [{ code: "full_block", severity: "block" }] : [],
      blocked: mockedStudioState === "blocked",
    },
    state: mockedStudioState === "blocked" ? "BLOCKED" : "ALLOWED",
    confidence: mockedStudioState === "ready" ? "HIGH" : mockedStudioState === "limited" ? "MEDIUM" : "LOW",
    needsVerification: mockedStudioState !== "ready",
    canOpenStudio: mockedStudioState !== "blocked",
    tier: mockedStudioState === "blocked" ? "fit_review_only" : "generation_allowed",
    generationMode: mockedStudioState === "ready" ? "verified" : "draft",
  })),
}));

vi.mock("@/lib/studioTrustGate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studioTrustGate")>("@/lib/studioTrustGate");
  return {
    ...actual,
    evaluateStudioTrustGate: vi.fn(() => ({
      allowed: mockedStudioState !== "blocked",
      reason: mockedStudioState === "blocked" ? "insufficient_evidence" : null,
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
  const response: {
    ok: boolean;
    status: number;
    headers: { get: (name: string) => string | null };
    json: () => Promise<unknown>;
    text: () => Promise<string>;
    blob: () => Promise<Blob>;
    clone: () => unknown;
  } = {
    ok,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
    blob: () => Promise.resolve(new Blob([text], { type: "application/json" })),
    clone: () => response,
  };
  return response;
}

function resolveStudioGenerationFallback(input: RequestInfo) {
  const url = typeof input === "string" ? input : input?.url ?? "";
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
  return Promise.resolve(createResponse({}, false, 404));
}

function installBaselineFetches(readinessStatus: "ready" | "limited" | "blocked", score = 88) {
  mockedStudioState = readinessStatus;
  const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            score,
            // Keep Studio out of "generate-now" mode for these UX state tests so the page doesn't
            // auto-run generation and bypass the blocked/draft-anyway surfaces.
            scoring_v2: { score: Math.min(79, score) },
            scoringV2: { score: Math.min(79, score) },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            ...(readinessStatus === "limited"
              ? {
                  verification_coverage: {
                    totalClaims: 3,
                    verifiedClaims: 0,
                    inferredClaims: 0,
                    unverifiedClaims: 3,
                    unverifiedRequirements: ["Measurable outcomes"],
                  },
                }
              : {}),
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
                : [{ code: "personalization_limitation", message: "Some evidence is still lighter than others." }],
            compliance_flags:
              readinessStatus === "blocked"
                ? [{ code: "full_block", severity: "block", message: "Missing verified evidence." }]
                : [],
          }),
        );
      }
      return resolveStudioGenerationFallback(input);
    });
  setFetchImplementation(fetchMock);
  return fetchMock;
}

describe("Studio state messaging", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("shows action-first blocked guidance and draft-anyway fallback when evidence is blocked", async () => {
    const fetchMock = installBaselineFetches("blocked", 88);
    renderStudio();

    await waitFor(() => expect(screen.getByTestId("studio-blocked-message")).toBeInTheDocument());
    expect(screen.getByTestId("studio-blocked-message")).toHaveTextContent(
      "We need clearer, verified examples of your experience",
    );
    expect(screen.getByRole("link", { name: "Resolve blockers" })).toBeInTheDocument();

    expect(screen.queryByText("Why generation is blocked")).toBeNull();
    expect(screen.queryByText("Limited output: not ready yet.")).toBeNull();
    expect(screen.queryByText("We couldn't generate a reliable result")).toBeNull();
  });

  it("hides draft-anyway fallback when score is under 70", async () => {
    installBaselineFetches("blocked", 65);
    renderStudio();

    await waitFor(() => expect(screen.getByTestId("studio-blocked-message")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Generate draft anyway" })).toBeNull();
  });

  it("shows action-first recovery for draft-only readiness without duplicate blocked messaging", async () => {
    installBaselineFetches("limited", 78);
    renderStudio();

    await waitFor(() => expect(screen.getByTestId("studio-blocked-primary-action")).toBeInTheDocument());
    expect(screen.getAllByTestId("studio-blocked-message")).toHaveLength(1);
    expect(screen.getByTestId("studio-blocked-message")).toHaveTextContent(
      "We need clearer, verified examples of your experience",
    );
    expect(screen.getByRole("link", { name: "Strengthen my experience" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View fit review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate draft anyway" })).toBeInTheDocument();
    expect(screen.queryByText("Why generation is blocked")).toBeNull();
    expect(screen.queryByText("Limited output: not ready yet.")).toBeNull();
    expect(screen.queryByText("We couldn't generate a reliable result")).toBeNull();
  });
});
