import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { listBaselines } from "@/lib/baselines";
import { listJobs } from "@/lib/jobsClient";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { overrideSearchParams, setFetchImplementation } from "./setup";

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

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => payload,
    blob: async () => new Blob([payload], { type: "application/json" }),
  };
}

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

describe("Studio execution surface", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("renders READY hero and unified materials flow", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({ score: 88, jobId: "job-1", baselineId: "base-1", baselineVersionId: "base-version-1" });
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return createResponse({ status: "ready", reasons: [] });
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByTestId("studio-generation-readiness")).toBeInTheDocument();
    });

    expect(
      screen.queryByText("Ready to generate") ?? screen.getByText("Generation limited"),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByRole("button", { name: "Generate Resume" }).length +
        screen.queryAllByRole("button", { name: "Generate Resume With Limits" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryAllByRole("button", { name: "Generate Cover Letter" }).length +
        screen.queryAllByRole("button", { name: "Generate Cover Letter With Limits" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Your application materials")).toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Cover letter")).toBeInTheDocument();
  });

  it("renders BLOCKED hero with remediation-first action", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({ score: 91, jobId: "job-1", baselineId: "base-1", baselineVersionId: "base-version-1" });
      }
      if (url.includes("/api/resume/readiness")) {
        return createResponse({ status: "blocked", reasons: [{ code: "full_block", message: "blocked" }] });
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return createResponse({ status: "ready", reasons: [] });
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Generation blocked")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "Resolve gaps before generating" })).toBeInTheDocument();
  });

  it("demotes advanced controls with optional labels", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/baselines/base-1/versions")) {
        return createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]);
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return createResponse({ score: 82, jobId: "job-1", baselineId: "base-1", baselineVersionId: "base-version-1" });
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return createResponse({ status: "ready", reasons: [] });
      }
      return createResponse({});
    });

    renderStudio();

    await waitFor(() => {
      expect(screen.getByText("Adjust positioning (optional)")).toBeInTheDocument();
    });
    expect(screen.getByText("Customize content (advanced)")).toBeInTheDocument();
  });
});
