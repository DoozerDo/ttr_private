import { render, screen, waitFor } from "@testing-library/react";

import BetaFrictionDashboardPage from "@/app/(app)/admin/beta-friction-dashboard/page";
import { setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Admin Beta Friction Dashboard page", () => {
  it("renders summary, patterns, feedback, and friction sections", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/feedback")) {
        return jsonResponse([
          {
            id: "f1",
            userId: "u1",
            category: "bug",
            title: "Broken route",
            message: "Button stuck",
            pageContext: "/results",
            createdAt: "2026-03-24T09:00:00.000Z",
            triageStatus: "new",
            severity: "high",
            requiresFounderFollowup: false,
          },
        ]);
      }
      if (url.includes("/api/admin/friction-events")) {
        return jsonResponse([
          {
            id: "e1",
            userId: "u1",
            eventType: "low_score_no_recovery",
            reason: "Low score with no follow-up",
            createdAt: "2026-03-24T09:10:00.000Z",
            resolutionStatus: "open",
            severity: "medium",
            recovered: false,
            recoveryAction: null,
            requiresFounderFollowup: true,
          },
        ]);
      }
      if (url.includes("/api/admin/friction-patterns")) {
        return jsonResponse([
          {
            patternKey: "friction:low_score_no_recovery:key",
            label: "Low score with no recovery action",
            count: 3,
            affectedUsers: 2,
            latestSeenAt: "2026-03-24T09:10:00.000Z",
            severityMix: { medium: 3 },
          },
        ]);
      }
      return jsonResponse({});
    });

    render(<BetaFrictionDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Beta Friction Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Friction Patterns")).toBeInTheDocument();
      expect(screen.getByText("Raw Feedback")).toBeInTheDocument();
      expect(screen.getByText("Friction Events")).toBeInTheDocument();
    });
    expect(screen.getByText("Broken route")).toBeInTheDocument();
    expect(screen.getAllByText("Low score with no recovery action").length).toBeGreaterThan(0);
  });

  it("shows admin access required message on 403", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/")) {
        return jsonResponse({ error: "forbidden" }, 403);
      }
      return jsonResponse({});
    });

    render(<BetaFrictionDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Admin access required")).toBeInTheDocument();
    });
  });
});
