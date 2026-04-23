import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StudioPage from "@/app/(app)/studio/page";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { mockRouterReplace, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

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
  const stringBody = typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body);
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
    text: () => Promise.resolve(stringBody),
    blob: () => Promise.resolve(new Blob([stringBody], { type: "application/json" })),
  };
}

describe("Studio unlock flow", () => {
  it("renders unlock panel and suppresses generic Studio workspace", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
      fromUnlock: "true",
      unlockDimension: "Tools and systems",
      missingEvidence: ["Zendesk configuration ownership", "Salesforce Service Cloud administration"],
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 77 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    expect(await screen.findByTestId("studio-unlock-panel")).toBeInTheDocument();
    expect(screen.getByText("Complete this to unlock your documents")).toBeInTheDocument();
    const list = screen.getByTestId("studio-unlock-missing-evidence");
    expect(list).toHaveTextContent("Zendesk configuration ownership");
    expect(list).toHaveTextContent("Salesforce Service Cloud administration");

    expect(screen.queryByTestId("studio-generation-readiness")).toBeNull();
    expect(screen.queryByTestId("studio-focus-panel")).toBeNull();
  });

  it("saves missing evidence and triggers re-evaluation loop", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
      fromUnlock: "true",
      unlockDimension: "Tools and systems",
      missingEvidence: ["Zendesk configuration ownership", "Salesforce Service Cloud administration"],
    });

    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";

      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 77 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }

      if (url.includes("/api/baselines/base-1/strengthening-additions") && init?.method === "PATCH") {
        return Promise.resolve(createResponse({ id: "base-1" }));
      }

      if (url === "/api/analysis/run" && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-2",
            baselineVersionId: "base-version-2",
          }),
        );
      }

      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }

      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findByTestId("studio-unlock-panel");

    fireEvent.change(screen.getByTestId("studio-unlock-input-0"), {
      target: { value: "Configured Zendesk routing and macros; reduced median response time 22%." },
    });
    fireEvent.change(screen.getByTestId("studio-unlock-input-1"), {
      target: { value: "Administered Service Cloud queues and reporting; improved CSAT by 0.3 points." },
    });

    fireEvent.click(screen.getByTestId("studio-unlock-cta"));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input, init]) => {
          const url = typeof input === "string" ? input : input?.url ?? "";
          return url.includes("/api/baselines/base-1/strengthening-additions") && init?.method === "PATCH";
        }).length,
      ).toBe(2);
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const url = typeof input === "string" ? input : input?.url ?? "";
          return url === "/api/analysis/run" && init?.method === "POST";
        }),
      ).toBe(true);
    });

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalled());
    const replacedHref = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(replacedHref).toContain("/studio?");
    expect(replacedHref).not.toContain("fromUnlock=true");
  });

  it("skip returns to normal Studio without unlock params", async () => {
    overrideSearchParams({
      jobId: "job-1",
      baselineId: "base-1",
      baselineVersionId: "base-version-1",
      analysisId: "analysis-1",
      fromUnlock: "true",
      unlockDimension: "Tools and systems",
      missingEvidence: ["Zendesk configuration ownership"],
    });

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/analysis/fit-assessments/analysis-1")) {
        return Promise.resolve(
          createResponse({
            assessmentId: "analysis-1",
            scoring_v2: { score: 77 },
            jobId: "job-1",
            baselineId: "base-1",
            baselineVersionId: "base-version-1",
          }),
        );
      }
      if (url.includes("/api/baselines/base-1/versions")) {
        return Promise.resolve(createResponse([{ id: "base-version-1", fileHash: "hash-1", versionNumber: 1 }]));
      }
      if (url.includes("/api/resume/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      if (url.includes("/api/cover-letters/readiness")) {
        return Promise.resolve(createResponse({ status: "blocked", reasons: [] }));
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock);

    renderStudio();

    await screen.findByTestId("studio-unlock-panel");
    fireEvent.click(screen.getByTestId("studio-unlock-skip"));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalled());
    const replacedHref = String(mockRouterReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(replacedHref).toContain("/studio?");
    expect(replacedHref).not.toContain("fromUnlock=true");
    expect(replacedHref).not.toContain("unlockDimension=");
  });
});

