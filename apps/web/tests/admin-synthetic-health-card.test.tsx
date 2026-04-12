import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SyntheticHealthCard from "../app/(app)/admin/SyntheticHealthCard";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SyntheticHealthCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a failing health rollup with suite context", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createResponse({
        generatedAt: "2026-04-12T10:04:00.000Z",
        healthRollup: {
          status: "failing",
          statusLabel: "Failing",
          failingSuites: 1,
          failingSuiteNames: ["Landing / Auth Synthetic"],
          staleSuites: 0,
          staleSuiteNames: [],
          latestRunAt: "2026-04-12T10:00:00.000Z",
          latestRunAgeMinutes: 3,
          lastSuccessfulPublishAt: "2026-04-12T10:01:00.000Z",
          lastAttemptedPublishAt: "2026-04-12T10:04:00.000Z",
          recencyLabel: "last run 3 min ago",
          staleThresholdMinutes: 15,
        },
        suiteCount: 1,
        suites: [{ suiteName: "Landing / Auth Synthetic" }],
      }),
    );

    render(<SyntheticHealthCard />);

    await waitFor(() => expect(screen.getByText("Failing")).toBeInTheDocument());
    expect(screen.getByText("Failing suites")).toBeInTheDocument();
    expect(screen.getByText("First failing: Landing / Auth Synthetic")).toBeInTheDocument();
    expect(screen.getByText("Last published: 3 min ago")).toBeInTheDocument();
    expect(screen.getByText("Last attempt: just now")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Synthetic Reliability" })).toHaveAttribute(
      "href",
      "/admin/synthetics",
    );
  });

  it("renders a stale rollup", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createResponse({
        generatedAt: "2026-04-12T10:30:00.000Z",
        healthRollup: {
          status: "stale",
          statusLabel: "Stale",
          failingSuites: 0,
          failingSuiteNames: [],
          staleSuites: 1,
          staleSuiteNames: ["Landing / Auth Synthetic"],
          latestRunAt: "2026-04-12T09:30:00.000Z",
          latestRunAgeMinutes: 30,
          lastSuccessfulPublishAt: "2026-04-12T09:30:00.000Z",
          lastAttemptedPublishAt: "2026-04-12T09:45:00.000Z",
          recencyLabel: "stale",
          staleThresholdMinutes: 15,
        },
        suiteCount: 1,
        suites: [{ suiteName: "Landing / Auth Synthetic" }],
      }),
    );

    render(<SyntheticHealthCard />);

    await waitFor(() => expect(screen.getByText("Stale")).toBeInTheDocument());
    expect(screen.getByText("First stale: Landing / Auth Synthetic")).toBeInTheDocument();
    expect(screen.getByText("Last published: 60 min ago")).toBeInTheDocument();
    expect(screen.getByText("Last attempt: 45 min ago")).toBeInTheDocument();
  });

  it("renders unknown state when no history exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createResponse({
        generatedAt: "2026-04-12T10:00:00.000Z",
        healthRollup: {
          status: "unknown",
          statusLabel: "Unknown",
          failingSuites: 0,
          failingSuiteNames: [],
          staleSuites: 0,
          staleSuiteNames: [],
          latestRunAt: null,
          latestRunAgeMinutes: null,
          lastSuccessfulPublishAt: null,
          lastAttemptedPublishAt: null,
          recencyLabel: "No run history yet",
          staleThresholdMinutes: 15,
        },
        suiteCount: 1,
        suites: [{ suiteName: "Landing / Auth Synthetic" }],
      }),
    );

    render(<SyntheticHealthCard />);

    await waitFor(() => expect(screen.getByText("Unknown")).toBeInTheDocument());
    expect(screen.getAllByText("No run history yet").length).toBeGreaterThan(0);
    expect(screen.getByText("Last published: No publish yet")).toBeInTheDocument();
  });
});
