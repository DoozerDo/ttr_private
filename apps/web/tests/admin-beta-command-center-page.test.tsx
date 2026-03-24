import { render, screen, waitFor } from "@testing-library/react";

import BetaCommandCenterPage from "@/app/(app)/admin/beta-command-center/page";
import { setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Admin Beta Command Center page", () => {
  it("renders roster, funnel, hotspots, bug feed, and action queue", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analytics/beta-command-center")) {
        return jsonResponse({
          generatedAt: "2026-03-24T07:00:00.000Z",
          roster: [
            {
              userId: "u-1",
              email: "user@example.com",
              accessCodeStatus: "redeemed",
              firstLoginAt: "2026-03-22T07:00:00.000Z",
              lastActiveAt: "2026-03-24T07:00:00.000Z",
              analysesRun: 3,
              studioVisits: 2,
              documentGenerations: 2,
              bugReportsSubmitted: 1,
              currentStateSummary: "Submitted bug report",
            },
          ],
          funnel: {
            invited: 10,
            activated: 8,
            loggedIn: 7,
            ranFirstAnalysis: 6,
            reachedResults: 6,
            openedStudio: 5,
            generatedResume: 4,
            generatedCoverLetter: 3,
            submittedBug: 2,
            trackedApplication: 1,
          },
          frictionHotspots: [
            { key: "limited_generation", label: "Limited generation counts", count: 3, examples: ["user@example.com"] },
          ],
          bugFeed: [
            {
              id: "bug-1",
              title: "Studio button confusion",
              severity: "major",
              category: "ux_confusion",
              where: "/studio",
              createdAt: "2026-03-24T07:00:00.000Z",
              userEmail: "user@example.com",
              status: "open",
              issueUrl: null,
            },
          ],
          actionNeededQueue: [
            {
              key: "limited_generation_and_stopped",
              label: "Users who hit limited generation and stopped",
              count: 2,
              users: ["user@example.com"],
            },
          ],
        });
      }
      return jsonResponse({});
    });

    render(<BetaCommandCenterPage />);

    await waitFor(() => {
      expect(screen.getByText("Closed Beta Command Center")).toBeInTheDocument();
      expect(screen.getByText("Beta User Roster")).toBeInTheDocument();
      expect(screen.getByText("Beta Funnel Snapshot")).toBeInTheDocument();
      expect(screen.getByText("Friction Hotspots")).toBeInTheDocument();
      expect(screen.getByText("Bug Report Feed")).toBeInTheDocument();
      expect(screen.getByText("Action Needed Queue")).toBeInTheDocument();
    });

    expect(screen.getAllByText("user@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Studio button confusion")).toBeInTheDocument();
    expect(screen.getByText(/Users who hit limited generation and stopped/i)).toBeInTheDocument();
  });

  it("shows admin-only error when access is forbidden", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/analytics/beta-command-center")) {
        return jsonResponse({ error: "forbidden" }, 403);
      }
      return jsonResponse({});
    });

    render(<BetaCommandCenterPage />);

    await waitFor(() => {
      expect(screen.getByText("Admin access required")).toBeInTheDocument();
    });
  });
});
