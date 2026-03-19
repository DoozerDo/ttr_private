import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SupportHistoryPage from "@/app/(app)/support/history/page";
import { setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

const sampleItem = {
  issueNumber: 11,
  title: "Results crash",
  state: "open",
  status: "Investigating",
  labels: ["bug", "area:results", "severity:high"],
  createdAt: "2026-03-01T12:00:00.000Z",
  updatedAt: "2026-03-02T13:00:00.000Z",
  severity: "high",
  area: "Results (Route includes \"results\")",
  reporterMessagePreview: "App crashes when loading results.",
  sentryEventId: "sentry-abc",
  resolutionNote: null,
};

describe("SupportHistoryPage", () => {
  it("renders history items", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      if (typeof input === "string" && input.includes("/api/support/history")) {
        return createResponse({ items: [sampleItem] });
      }

      return createResponse({});
    });

    render(<SupportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Issue #11")).toBeInTheDocument();
    });

    expect(screen.getByText(/Severity: High/i)).toBeInTheDocument();
    expect(screen.getByText(/Sentry event ID: sentry-abc/i)).toBeInTheDocument();
  });

  it("shows an empty state when no bugs exist", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      if (typeof input === "string" && input.includes("/api/support/history")) {
        return createResponse({ items: [] });
      }

      return createResponse({});
    });

    render(<SupportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/You have not reported any bugs yet/i)).toBeInTheDocument();
    });
  });

  it("renders mapped statuses and resolution note", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      if (typeof input === "string" && input.includes("/api/support/history")) {
        return createResponse({
          items: [
            sampleItem,
            {
              ...sampleItem,
              issueNumber: 12,
              title: "Resolved upload bug",
              state: "closed",
              status: "Resolved",
              resolutionNote: "Fix shipped in the latest beta release.",
            },
          ],
        });
      }

      return createResponse({});
    });

    render(<SupportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Issue #11")).toBeInTheDocument();
      expect(screen.getByText("Issue #12")).toBeInTheDocument();
    });

    expect(screen.getByText("Investigating")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.getByText(/Fix shipped in the latest beta release/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /still seeing this issue/i })).toBeInTheDocument();
  });

  it("posts still-seeing signal for resolved issues", async () => {
    const calls: string[] = [];
    setFetchImplementation(async (input: RequestInfo) => {
      if (typeof input === "string") {
        calls.push(input);
        if (input.includes("/api/support/history/still-seeing")) {
          return createResponse({ issueNumber: 44, count: 1 });
        }
        if (input.includes("/api/support/history")) {
          return createResponse({
            items: [{ ...sampleItem, issueNumber: 44, state: "closed", status: "Resolved" }],
          });
        }
      }

      return createResponse({});
    });

    render(<SupportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Issue #44")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /still seeing this issue/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Thanks. We recorded that you're still seeing this issue/i),
      ).toBeInTheDocument();
    });

    expect(calls.some((value) => value.includes("/api/support/history/still-seeing"))).toBe(true);
  });

  it("shows an error and allows retry", async () => {
    let attempts = 0;
    setFetchImplementation(async (input: RequestInfo) => {
      if (typeof input === "string" && input.includes("/api/support/history")) {
        attempts += 1;
        if (attempts === 1) {
          return createResponse({ message: "boom" }, false, 500);
        }

        return createResponse({ items: [sampleItem] });
      }

      return createResponse({});
    });

    render(<SupportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to load your support history right now/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByText("Issue #11")).toBeInTheDocument();
    });
  });
});
