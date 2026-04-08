import { render, screen, waitFor } from "@testing-library/react";
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
  return {
    ok,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
    blob: () => Promise.resolve(new Blob([text], { type: "application/json" })),
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

function installBaselineFetches(readinessStatus: "ready" | "limited" | "blocked") {
  mockedStudioState = readinessStatus;
  setFetchImplementation(
    vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(createResponse({ score: 88, jobId: "job-1", baselineId: "base-1", baselineVersionId: "base-version-1" }));
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
    }),
  );
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

  it("shows strong generation messaging when readiness is ready", async () => {
    installBaselineFetches("ready");
    renderStudio();

    await waitFor(() => expect(screen.getAllByText("Ready to generate").length).toBeGreaterThan(0));
    expect(screen.getByText("Generated from verified evidence.")).toBeInTheDocument();
    expect(screen.getByText("Why this output is grounded")).toBeInTheDocument();
    expect(screen.getByText("This output is grounded in your verified experience.")).toBeInTheDocument();
  });

  it("shows limited generation messaging when readiness is partial", async () => {
    installBaselineFetches("limited");
    renderStudio();

    await waitFor(() => expect(screen.getAllByText("Generation is usable.").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Generated from partially verified evidence/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Why this output is limited")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Generated from partially verified evidence. Verify key claims to strengthen it.",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("shows blocked guidance when compliance prevents generation", async () => {
    installBaselineFetches("blocked");
    renderStudio();

    await waitFor(() => expect(screen.getAllByText("Generation blocked").length).toBeGreaterThan(0));
    expect(screen.getByText("What's holding this back")).toBeInTheDocument();
    expect(
      screen.getByText("This role is not ready for clean Studio output yet. Return to Fit Review to strengthen verified evidence."),
    ).toBeInTheDocument();
  });
});
