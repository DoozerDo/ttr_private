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
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    ok,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
    blob: () => Promise.resolve(new Blob([text], { type: "application/json" })),
  };
}

function installBaselineFetches(extra: (url: string, init?: RequestInit) => Promise<any>) {
  setFetchImplementation(
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(
          createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]),
        );
      }
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            score: 88,
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/resume/readiness") || url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "ready", reasons: [] }));
      }
      return extra(url, init);
    }),
  );
}

describe("Studio generation error contract", () => {
  beforeEach(() => {
    overrideSearchParams({
      analysisId: "analysis-1",
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
    });
  });

  it("treats 422 generation_blocked as remediation, not generic failure", async () => {
    installBaselineFetches((url, init) => {
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse(
            {
              code: "generation_blocked",
              message:
                "Generation is not available for this role due to insufficient verified evidence.",
              blockers: [{ code: "full_block", message: "Missing verified evidence." }],
            },
            false,
            422,
          ),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getByText("Additional baseline detail required")).toBeInTheDocument();
    });
    expect(screen.queryByText("Resume generation failed.")).toBeNull();
  });

  it("shows generation_failed message as actual generation failure", async () => {
    installBaselineFetches((url, init) => {
      if (url.endsWith("/api/resume") && init?.method === "POST") {
        return Promise.resolve(
          createResponse(
            { code: "generation_failed", message: "Resume generation failed validation." },
            false,
            422,
          ),
        );
      }
      return Promise.resolve(createResponse({}));
    });

    renderStudio();
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate Resume" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate Resume" }));

    await waitFor(() => {
      expect(screen.getByText("Resume generation failed validation.")).toBeInTheDocument();
    });
  });
});
