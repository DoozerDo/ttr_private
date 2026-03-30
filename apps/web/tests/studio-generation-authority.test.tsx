import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { mockRouterPush, overrideSearchParams, setFetchImplementation } from "./setup";

const trackEventMock = vi.fn();
vi.mock("@/src/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));
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
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
}

function setupFetch(readinessStatus: "ready" | "limited" | "blocked", score = 94, totalClaims = 3) {
  setFetchImplementation(
    vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
            scoring_v2: {
              score,
            },
            verification_coverage: {
              totalClaims,
              verifiedClaims: readinessStatus === "ready" ? totalClaims : 0,
              inferredClaims: readinessStatus === "limited" ? 1 : 0,
              unverifiedClaims: readinessStatus === "ready" ? 0 : 1,
              unverifiedRequirements: readinessStatus === "ready" ? [] : ["Salesforce"],
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
                : [{ code: readinessStatus === "blocked" ? "full_block" : "personalization_limitation", message: "Needs verification support." }],
            compliance_flags:
              readinessStatus === "blocked"
                ? [{ code: "fictional_technology", severity: "block", message: "Unsupported claim Salesforce." }]
                : [],
          }),
        );
      }
      if (url.includes("/api/resume") || url.includes("/api/cover-letters")) {
        return Promise.resolve(createResponse({ status: "success" }));
      }
      return Promise.resolve(createResponse({}));
    }),
  );
}

describe("Studio generation authority", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
    trackEventMock.mockClear();
  });

  it("READY shows ready status and normal CTA", async () => {
    setupFetch("ready");
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Ready to generate")).toBeInTheDocument();
    });
    const readiness = screen.getByTestId("studio-generation-readiness");
    const generationHeadline = await screen.findByText("You’re ready to generate");
    const generationSection = generationHeadline.closest("section");
    expect(readiness).toHaveTextContent(/^Ready/);
    expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled();
    expect(generationSection).not.toBeNull();
    expect(within(generationSection as HTMLElement).getByRole("button", { name: "Generate Cover Letter" })).toBeEnabled();
  });

  it("LIMITED shows limited status and constrained CTA label without Studio Ready copy", async () => {
    setupFetch("limited");
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation blocked")).toBeInTheDocument();
    });
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.queryByText("Ready to generate")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue Building Experience" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove unsupported requirements and continue" }),
    ).toBeInTheDocument();
  });

  it("BLOCKED shows blocked status and remediation CTA", async () => {
    setupFetch("blocked");
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation blocked")).toBeInTheDocument();
    });
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Resume" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove unsupported requirements and continue" }),
    ).toBeInTheDocument();
  });

  it("blocked generation action does not proceed and routes to remediation", async () => {
    setupFetch("blocked", 68);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation blocked")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Generate Resume" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove unsupported requirements and continue" }),
    ).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("suppresses 0 / 0 coverage and shows honest fallback", async () => {
    setupFetch("limited", 88, 0);
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation blocked")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Verified claims:\s*0\s*\/\s*0/i)).toBeNull();
    expect(screen.queryByText(/Verification Coverage:/i)).toBeNull();
  });
});
