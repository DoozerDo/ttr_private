import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import BaselineDetailPage from "@/app/(app)/baseline/[id]/page";
import { mockRouterRefresh, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, ok = false, status = 500): Response {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "text/plain" : null),
    },
    json: async () => {
      throw new Error("not json");
    },
    text: async () => body,
  } as Response;
}

describe("BaselineDetailPage", () => {
  it("loads a valid baseline using the canonical route id", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("/api/baselines/base-1");
      return jsonResponse({
        id: "base-1",
        userId: "user-1",
        version: 1,
        versionNumber: 1,
        isActive: true,
        originalFilename: "resume.pdf",
        mimeType: "application/pdf",
        storagePath: "/tmp/base-1",
        hash: null,
        status: "ACTIVE",
        archivedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        sections: [
          {
            id: "section-1",
            baselineId: "base-1",
            sectionType: "SUMMARY",
            title: "Summary",
            content: "Summary content",
            includePolicy: "always",
            order: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      });
    });
    setFetchImplementation(fetchSpy as unknown as typeof fetch);

    const element = await BaselineDetailPage({
      params: Promise.resolve({ id: "base-1" }),
      searchParams: {},
    });
    render(<>{element}</>);

    expect(screen.getByRole("heading", { name: "resume.pdf" })).toBeInTheDocument();
    expect(screen.getByText("Summary content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to baselines" })).toHaveAttribute(
      "href",
      "/baseline",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders a specific 404 state with one error panel", async () => {
    setFetchImplementation(async () => jsonResponse({ message: "missing" }, false, 404) as unknown as typeof fetch);

    const element = await BaselineDetailPage({
      params: Promise.resolve({ id: "base-missing" }),
      searchParams: {},
    });
    render(<>{element}</>);

    expect(screen.getByText("We couldn't find this baseline.")).toBeInTheDocument();
    expect(screen.queryByText("fetch failed")).toBeNull();
    expect(screen.queryByText("Baseline unavailable")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("renders a session-expired state for unauthorized requests", async () => {
    setFetchImplementation(async () => jsonResponse({ message: "unauthorized" }, false, 401) as unknown as typeof fetch);

    const element = await BaselineDetailPage({
      params: Promise.resolve({ id: "base-1" }),
      searchParams: {},
    });
    render(<>{element}</>);

    expect(screen.getByText("Your session expired. Refresh and try again.")).toBeInTheDocument();
    expect(screen.queryByText("Check your connection")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("renders a retryable server error state", async () => {
    setFetchImplementation(async () => jsonResponse({ message: "upstream error" }, false, 500) as unknown as typeof fetch);

    const element = await BaselineDetailPage({
      params: Promise.resolve({ id: "base-1" }),
      searchParams: {},
    });
    render(<>{element}</>);

    expect(screen.getByText("We couldn't load this baseline. Try again.")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry baseline" }));
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it("renders the connection copy only for real network failures", async () => {
    setFetchImplementation(async () => {
      throw new TypeError("fetch failed");
    });

    const element = await BaselineDetailPage({
      params: Promise.resolve({ id: "base-1" }),
      searchParams: {},
    });
    render(<>{element}</>);

    expect(screen.getByText("We couldn't reach the baseline service.")).toBeInTheDocument();
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("does not render duplicate fallback panels on error", async () => {
    setFetchImplementation(async () => textResponse("service down", false, 503) as unknown as typeof fetch);

    const element = await BaselineDetailPage({
      params: Promise.resolve({ id: "base-1" }),
      searchParams: {},
    });
    render(<>{element}</>);

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByText("Parsed sections")).toBeNull();
    expect(screen.queryByText("Baseline unavailable")).toBeNull();
  });
});
