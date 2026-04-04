import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ErrorHealthPage from "@/app/(app)/admin/error-health/page";
import { setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("ErrorHealthPage", () => {
  it("renders mixed status rows", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      if (typeof input === "string" && input.includes("/api/support/error-health")) {
        return createResponse({
          items: [
            {
              fingerprint: "fp-1",
              summary: "Results API failure",
              sourceType: "api",
              areaOrRoute: "Results",
              count: 8,
              firstSeenAt: "2026-03-01T00:00:00.000Z",
              lastSeenAt: "2026-03-02T00:00:00.000Z",
              releaseId: "abc1234",
              escalated: true,
              issueNumber: 101,
              issueUrl: "https://github.com/o/r/issues/101",
              statusHint: "Active",
            },
            {
              fingerprint: "fp-2",
              summary: "Studio regression",
              sourceType: "runtime",
              areaOrRoute: "/studio",
              count: 2,
              firstSeenAt: "2026-03-03T00:00:00.000Z",
              lastSeenAt: "2026-03-03T01:00:00.000Z",
              releaseId: "def5678",
              escalated: false,
              issueNumber: null,
              issueUrl: null,
              statusHint: "Regressed",
            },
          ],
        });
      }
      if (typeof input === "string" && input.includes("/api/support/critical-flow-health")) {
        return createResponse({
          items: [
            {
              flowName: "score_generated",
              successRatePct: 85,
              totalAttempts: 20,
              totalFailures: 3,
              thresholdPct: 10,
              status: "Degraded",
              lastEventAt: "2026-03-03T01:00:00.000Z",
              escalated: false,
              issueNumber: null,
              issueUrl: null,
            },
          ],
        });
      }
      return createResponse({});
    });

    render(<ErrorHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("fp-1")).toBeInTheDocument();
      expect(screen.getByText("fp-2")).toBeInTheDocument();
    });

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Regressed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Yes (#101)" })).toBeInTheDocument();
    expect(screen.getByText("Critical Flow Health")).toBeInTheDocument();
    expect(screen.getByText("score_generated")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      if (typeof input === "string" && input.includes("/api/support/error-health")) {
        return createResponse({ items: [] });
      }
      if (typeof input === "string" && input.includes("/api/support/critical-flow-health")) {
        return createResponse({ items: [] });
      }
      return createResponse({});
    });

    render(<ErrorHealthPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/No auto-captured error fingerprints/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No critical flow events/i),
      ).toBeInTheDocument();
    });
  });

  it("shows retryable error state", async () => {
    let attempts = 0;
    setFetchImplementation(async (input: RequestInfo) => {
      if (typeof input === "string" && input.includes("/api/support/error-health")) {
        attempts += 1;
        if (attempts === 1) {
          return createResponse({ message: "fail" }, false, 500);
        }
        return createResponse({ items: [] });
      }
      if (typeof input === "string" && input.includes("/api/support/critical-flow-health")) {
        return createResponse({ items: [] });
      }
      return createResponse({});
    });

    render(<ErrorHealthPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to load error health right now/i),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/No auto-captured error fingerprints/i),
      ).toBeInTheDocument();
    });
  });
});
