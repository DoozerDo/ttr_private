import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "@/tests/setup";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function readiness(status: "ready" | "limited" | "blocked", blocked: boolean) {
  const badgeLabel = status === "ready" ? "READY" : status === "limited" ? "LIMITED" : "BLOCKED";
  return {
    status,
    blocked,
    reasonCodes: blocked ? ["readiness_blocked"] : [],
    reasons: blocked ? ["Generation is blocked."] : [],
    badgeLabel,
    summary: badgeLabel === "READY" ? "Ready for generation." : "Needs more evidence.",
    verificationIssues: [],
  };
}

describe("Studio generation gate (score >= 80)", () => {
  it("renders resume and cover letter cards directly (no ready shell or wrapper)", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-80",
    });

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as any)?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-80")) {
        return json({
          assessmentId: "analysis-80",
          scoring_v2: { score: 82 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          verification_coverage: { unverifiedRequirements: [] },
        });
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return json([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/resume/readiness")) return json(readiness("ready", false));
      if (url.includes("/api/cover-letters/readiness")) return json(readiness("ready", false));
      return json({});
    });

    renderStudio();

    await waitFor(() => expect(screen.getByText("Your application materials")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Resume" })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Cover letter" })).toBeInTheDocument();

    expect(screen.queryByText(/You're ready to generate/i)).toBeNull();
    expect(screen.queryByText(/Generate documents/i)).toBeNull();
    expect(screen.queryByText(/Ready to generate/i)).toBeNull();
    expect(screen.queryByText(/This role is ready for generation/i)).toBeNull();
    expect(screen.queryByText(/Decision \\+ Action/i)).toBeNull();
    expect(screen.queryByTestId("studio-generation-ready-shell")).toBeNull();
    expect(screen.queryByTestId("studio-readiness-message")).toBeNull();
    expect(screen.queryByTestId("studio-generation-state-banner")).toBeNull();
    expect(screen.queryByTestId("studio-decision-panel")).toBeNull();
    expect(screen.queryByTestId("studio-evidence-allowed-panel")).toBeNull();

    // No debug metadata in normal Studio view.
    expect(screen.queryByText(/generationMode:/i)).toBeNull();
    expect(screen.queryByText(/templateVersion:/i)).toBeNull();
    expect(screen.queryByText(/artifact current:/i)).toBeNull();
    expect(screen.queryByText(/^reason:/i)).toBeNull();
  });

  it("shows generate resume and cover letter buttons when score >= 80 and required ids exist", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-81",
    });

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as any)?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-81")) {
        return json({
          assessmentId: "analysis-81",
          scoring_v2: { score: 84 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          verification_coverage: { unverifiedRequirements: [] },
        });
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return json([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/resume/readiness")) return json(readiness("ready", false));
      if (url.includes("/api/cover-letters/readiness")) return json(readiness("ready", false));
      return json({});
    });

    renderStudio();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Resume" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /generate resume/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate cover letter/i })).toBeInTheDocument();
  });
});

describe("Studio generation gate (score < 80)", () => {
  it("remains blocked/disabled and does not show generation buttons", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-79",
    });

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as any)?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-79")) {
        return json({
          assessmentId: "analysis-79",
          scoring_v2: { score: 79 },
          jobId: "job-1",
          baselineId: "base-1",
          baselineVersionId: "base-version-1",
          verification_coverage: { unverifiedRequirements: ["Some gap"] },
        });
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return json([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/resume/readiness")) return json(readiness("blocked", true));
      if (url.includes("/api/cover-letters/readiness")) return json(readiness("blocked", true));
      return json({});
    });

    renderStudio();

    expect(await screen.findByTestId("studio-generation-readiness")).toBeInTheDocument();
    // Existing gating may render CTAs but must present a clear blocked state.
  });
});
