import { fireEvent, render, screen } from "@testing-library/react";
import { test, vi } from "vitest";

import AnalyzePage from "@/app/analyze/page";
import AdminUsersPage from "@/app/admin/users/page";
import BaselineDetailPage from "@/app/baseline/[id]/page";
import { BaselineDashboard } from "@/app/baseline/baseline-dashboard";
import CoverLettersPage from "@/app/cover-letters/page";
import FitReviewClient from "@/app/fit-review/FitReviewClient";
import InterviewToolkitPage from "@/app/interview-toolkit/page";
import InterviewToolkitResourcesPage from "@/app/interview-toolkit/resources/page";
import JobIngestionPage from "@/app/jobs/new/page";
import SearchSetRunPage from "@/app/search-sets/[id]/page";
import SearchSetsPage from "@/app/search-sets/page";
import { mockNotFound, mockUseParams, overrideSearchParams } from "../setup";

function createJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(
        typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body),
      ),
  };
}

const SEARCH_SET_RUN_RESULTS_STORAGE_KEY = "target-this-role.search-set-run-results";

test("job ingestion surfaces job list failures instead of blank panels", async () => {
  const fetchMock = vi.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/api/jobs")) {
      return Promise.resolve(createJsonResponse("Server failure", 500));
    }
    return Promise.resolve(createJsonResponse([]));
  });

  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  render(<JobIngestionPage />);

  const alert = await screen.findByTestId("job-list-error", undefined, { timeout: 2000 });
  expect(alert.textContent).toContain("Server failure");
});

test("analyze shows a baseline-loading error state when the API fails", async () => {
  const fetchMock = vi.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/api/baselines")) {
      return Promise.resolve(createJsonResponse("Baseline service failure", 500));
    }
    if (url.includes("/api/jobs")) {
      return Promise.resolve(createJsonResponse([]));
    }
    if (url.includes("/api/status") || url.includes("/api/health")) {
      return Promise.resolve(createJsonResponse({ status: "ok" }));
    }
    return Promise.resolve(createJsonResponse([]));
  });

  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  render(<AnalyzePage />);

  await screen.findByText("Baseline service failure");
});

test("fit review surfaces API errors for the latest analysis", async () => {
  overrideSearchParams({ jobId: "job-123" });

  const fetchMock = vi.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/api/analysis/job/")) {
      return Promise.resolve(createJsonResponse("Fit review failed", 500));
    }
    return Promise.resolve(createJsonResponse([]));
  });

  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  render(<FitReviewClient />);

  await screen.findByText("Fit review failed");
});

test("search sets surfaces request failures", async () => {
  const fetchMock = vi.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/search-sets")) {
      return Promise.resolve(createJsonResponse("Search set service down", 502));
    }
    return Promise.resolve(createJsonResponse([]));
  });

  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  render(<SearchSetsPage />);

  const urlInput = screen.getByPlaceholderText("https://...") as HTMLInputElement;
  fireEvent.change(urlInput, { target: { value: "https://example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Search Set" }));

  await screen.findByText("Search set service down");
});

test("search set run page rehydrates stored results", async () => {
  mockUseParams.mockReturnValue({ id: "search-set-1" });

  const storedRunAt = "2026-01-01T00:00:00.000Z";
  const storedEntry = {
    baselineVersionId: "baseline-version-1",
    runAt: storedRunAt,
    results: [
      {
        jobId: "job-001",
        title: "Product Manager",
        company: "TargetThisRole",
        applyUrl: "https://jobs.example.com/1",
        sourceUrl: "https://jobs.example.com/1",
        fitScore: 97.4,
        verdict: "Strong fit",
      },
    ],
  };

  localStorage.setItem(
    SEARCH_SET_RUN_RESULTS_STORAGE_KEY,
    JSON.stringify({ "search-set-1": storedEntry }),
  );

  const fetchMock = vi.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";

    if (url.includes("/api/search-sets/") && !url.includes("/run")) {
      return Promise.resolve(
        createJsonResponse({
          id: "search-set-1",
          titlePatterns: [],
          seniority: [],
          industry: [],
          workMode: [],
          location: "Remote",
          sourceUrl: "https://jobs.example.com",
          parseWarning: null,
          urlBacked: true,
          isActive: true,
          createdAt: storedRunAt,
          updatedAt: storedRunAt,
          lastRunAt: storedRunAt,
          lastRunBaselineVersionId: storedEntry.baselineVersionId,
          lastRunResultCount: storedEntry.results.length,
        }),
      );
    }

    if (url.includes("/api/baselines")) {
      return Promise.resolve(
        createJsonResponse([
          {
            id: "baseline-1",
            userId: "user-1",
            version: 1,
            originalFilename: "baseline.pdf",
            mimeType: "application/pdf",
            storagePath: "/baselines/baseline-1.pdf",
            hash: null,
            createdAt: storedRunAt,
            updatedAt: storedRunAt,
            sections: [],
            versions: [
              {
                id: storedEntry.baselineVersionId,
                baselineId: "baseline-1",
                versionNumber: 1,
                fileHash: "abcdef",
                storagePath: "/baselines/baseline-1/v1",
                createdAt: storedRunAt,
              },
            ],
          },
        ]),
      );
    }

    return Promise.resolve(createJsonResponse([]));
  });

  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  render(<SearchSetRunPage />);

  await screen.findByText("Product Manager");
});

test("baseline detail surfaces backend fetch errors instead of silent 404", async () => {
  const fetchMock = vi.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/api/baselines/error-baseline")) {
      return Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve("Baseline service failure"),
      });
    }
    return Promise.resolve(createJsonResponse([]));
  });

  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  const element = await BaselineDetailPage({
    params: Promise.resolve({ id: "error-baseline" }),
  });
  render(element);

  await screen.findByText("Baseline service failure");
  expect(mockNotFound).not.toHaveBeenCalled();
});

test("baseline dashboard surfaces the initial fetch error", () => {
  render(<BaselineDashboard initialBaselines={[]} initialFetchError="Baselines broken" />);

  expect(screen.getByText("Baselines broken")).toBeInTheDocument();
});

test("cover letters shows history failures instead of blank panels", async () => {
  const fetchMock = vi.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/api/cover-letters")) {
      return Promise.resolve(createJsonResponse("History failure", 500));
    }
    if (url.includes("/api/jobs")) {
      return Promise.resolve(createJsonResponse([]));
    }
    if (url.includes("/api/baselines")) {
      return Promise.resolve(createJsonResponse([]));
    }
    return Promise.resolve(createJsonResponse([]));
  });

  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  render(<CoverLettersPage />);

  const historyAlerts = await screen.findAllByText("History failure");
  expect(historyAlerts.length).toBeGreaterThan(0);
});

test("admin users page renders", async () => {
  const users = [
    {
      id: "user-1",
      email: "user@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      accountType: "free",
    },
  ];

  const fetchMock = vi.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/api/admin/users")) {
      return Promise.resolve(createJsonResponse(users));
    }
    return Promise.resolve(createJsonResponse([]));
  });

  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  render(<AdminUsersPage />);

  await screen.findByRole("heading", { name: /Admin users/i });
  await screen.findByText("user@example.com");
});

test("tier change confirmation appears", async () => {
  const users = [
    {
      id: "user-1",
      email: "user@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      accountType: "free",
    },
  ];

  const fetchMock = vi.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/api/admin/users")) {
      return Promise.resolve(createJsonResponse(users));
    }
    return Promise.resolve(createJsonResponse([]));
  });

  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  render(<AdminUsersPage />);

  const accountTypeSelect = await screen.findByDisplayValue("Free");
  fireEvent.change(accountTypeSelect, { target: { value: "paid" } });
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));

  await screen.findByRole("dialog");
  await screen.findByText("Change user@example.com from Free to Paid?");
});

test("interview toolkit resources route renders seeded content", async () => {
  render(<InterviewToolkitResourcesPage />);

  const seededTitle = await screen.findByText("Cracking the PM Interview (Article)");
  expect(seededTitle).toBeInTheDocument();
});

test("interview toolkit page renders the resources section", async () => {
  render(<InterviewToolkitPage />);

  const seededTitle = await screen.findByText("Cracking the PM Interview (Article)");
  expect(seededTitle).toBeInTheDocument();
});
