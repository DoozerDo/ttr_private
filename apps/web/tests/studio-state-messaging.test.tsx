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
      return Promise.resolve(createResponse({}));
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

    await waitFor(() => expect(screen.getByText("Ready to generate")).toBeInTheDocument());
    expect(screen.getByText("Why this output is grounded")).toBeInTheDocument();
    expect(screen.getByText("This output is grounded in your verified experience.")).toBeInTheDocument();
  });

  it("shows limited generation messaging when readiness is partial", async () => {
    installBaselineFetches("limited");
    renderStudio();

    await waitFor(() => expect(screen.getByText("Generation is usable.")).toBeInTheDocument());
    expect(screen.getByText("Why this output is limited")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your baseline supports tailored output. You can use this now, and refine it later if you want a stronger version.",
      ),
    ).toBeInTheDocument();
  });

  it("shows blocked guidance when compliance prevents generation", async () => {
    installBaselineFetches("blocked");
    renderStudio();

    await waitFor(() => expect(screen.getByText("Generation blocked")).toBeInTheDocument());
    expect(screen.getByText("Why generation is blocked")).toBeInTheDocument();
    expect(
      screen.getByText("This role is not ready for clean Studio output yet. Return to Fit Review to strengthen verified evidence."),
    ).toBeInTheDocument();
  });
});
