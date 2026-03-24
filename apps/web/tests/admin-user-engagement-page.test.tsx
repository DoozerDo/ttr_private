import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UserEngagementPage from "@/app/(app)/admin/user-engagement/page";
import { setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Admin User Engagement page", () => {
  it("renders states and trigger column", async () => {
    setFetchImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/admin/user-engagement-states")) {
        return jsonResponse([
          {
            userId: "u1",
            email: "user@test.com",
            lastActiveAt: "2026-03-24T00:00:00.000Z",
            mostRecentScore: 65,
            stateFlags: {
              invited_not_started: false,
              baseline_started_not_completed: false,
              analyzed_once_no_followup: true,
              low_score_no_action: true,
              reanalysis_available_not_used: false,
              high_score_not_applied: false,
              inactive_after_activity: false,
            },
          },
        ]);
      }
      if (url.includes("/api/admin/user-triggers")) {
        return jsonResponse([
          {
            id: "t1",
            userId: "u1",
            triggerType: "low_score_recovery",
            priority: "high",
            reason: "low score",
            createdAt: "2026-03-24T00:10:00.000Z",
          },
        ]);
      }
      if (url.includes("/api/admin/generate-outreach-draft") && init?.method === "POST") {
        return jsonResponse({
          subject: "Recover from low-fit score",
          message: "Your latest score is below 70. Update baseline and rerun.",
        });
      }
      if (url.includes("/api/admin/run-trigger-evaluation") && init?.method === "POST") {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });

    render(<UserEngagementPage />);

    await waitFor(() => {
      expect(screen.getByText("User Engagement Dashboard")).toBeInTheDocument();
      expect(screen.getByText("user@test.com")).toBeInTheDocument();
      expect(screen.getByText("low_score_recovery")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Draft" }));

    await waitFor(() => {
      expect(screen.getByText("Outreach draft")).toBeInTheDocument();
      expect(screen.getByText("Recover from low-fit score")).toBeInTheDocument();
    });
  });
});

