import { render, screen, waitFor } from "@testing-library/react";

import FunnelDiagnosticsPage from "@/app/(app)/admin/funnel-diagnostics/page";
import { setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Admin Funnel Diagnostics page", () => {
  it("renders funnel, time, recovery, segments, and user drill-down", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/funnel-metrics")) {
        return jsonResponse({
          funnel: {
            totalUsers: 2,
            stepCounts: {
              user_created: 2,
              baseline_started: 2,
              baseline_completed: 1,
              first_analysis_completed: 1,
              low_score_detected: 1,
              baseline_updated_after_low_score: 1,
              reanalysis_completed: 1,
              high_score_achieved: 1,
              opportunity_created: 1,
              documents_generated: 1,
            },
            conversionRates: {
              baseline_started_to_completed: 50,
              completed_to_first_analysis: 100,
              analysis_to_high_score: 100,
              high_score_to_opportunity: 100,
              opportunity_to_documents: 100,
            },
            dropOffRates: {
              user_created: 0,
              baseline_started: 50,
              baseline_completed: 0,
              first_analysis_completed: 0,
              low_score_detected: 0,
              baseline_updated_after_low_score: 0,
              reanalysis_completed: 0,
              high_score_achieved: 0,
              opportunity_created: 0,
              documents_generated: 50,
            },
          },
          time: {
            avgTimeToBaselineComplete: 2,
            avgTimeToFirstAnalysis: 1.5,
            avgTimeToReanalysis: 2,
            avgTimeToHighScore: 3,
            avgTimeToOpportunity: 1,
          },
          recovery: {
            usersWithLowScore: 1,
            usersWhoRecovered: 1,
            recoveryRate: 100,
            avgTimeToRecovery: 4,
          },
        });
      }
      if (url.includes("/api/admin/funnel-users")) {
        return jsonResponse([
          {
            userId: "u1",
            email: "user@example.com",
            currentStep: "documents_generated",
            lastActivityAt: "2026-03-24T07:00:00.000Z",
            mostRecentScore: 82,
            analysisCount: 2,
          },
        ]);
      }
      if (url.includes("/api/admin/funnel-segments")) {
        return jsonResponse({
          scoreBucket: { lt_70: 1, between_70_84: 0, gte_85: 1, unknown: 0 },
          baselineCompletenessAtFirstAnalysis: { complete: 1, incomplete_or_missing: 1 },
          analysisCount: { one: 1, two_plus: 1 },
        });
      }
      return jsonResponse({});
    });

    render(<FunnelDiagnosticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Funnel Diagnostics Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Funnel")).toBeInTheDocument();
      expect(screen.getByText("Time Metrics (hours)")).toBeInTheDocument();
      expect(screen.getByText("Recovery Metrics")).toBeInTheDocument();
      expect(screen.getByText("Segments")).toBeInTheDocument();
      expect(screen.getByText("User Drill-down")).toBeInTheDocument();
    });
    expect(screen.getAllByText("user@example.com").length).toBeGreaterThan(0);
  });

  it("shows admin access required on forbidden", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/funnel-")) {
        return jsonResponse({ error: "forbidden" }, 403);
      }
      return jsonResponse({});
    });

    render(<FunnelDiagnosticsPage />);
    await waitFor(() => {
      expect(screen.getByText("Admin access required")).toBeInTheDocument();
    });
  });
});

