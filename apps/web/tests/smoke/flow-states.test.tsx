import { fireEvent, render, screen } from "@testing-library/react";
import { test, vi } from "vitest";

import AnalyzePage from "@/app/analyze/page";
import CoverLettersPage from "@/app/cover-letters/page";
import InterviewToolkitPage from "@/app/interview-toolkit/page";
import InterviewToolkitResourcesPage from "@/app/interview-toolkit/resources/page";
import JobIngestionPage from "@/app/jobs/new/page";
import { BaselineDashboard } from "@/app/baseline/baseline-dashboard";
import FitReviewClient from "@/app/fit-review/FitReviewClient";
import SearchSetsPage from "@/app/search-sets/page";
import { overrideSearchParams } from "../setup";

function createJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(
        typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body),
      ),
  };
}

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
