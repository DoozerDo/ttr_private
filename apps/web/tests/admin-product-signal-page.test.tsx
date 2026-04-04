import { render, screen, waitFor } from "@testing-library/react";

import ProductSignalPage from "@/app/(app)/admin/product-signal/page";
import { setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Admin Product Signal page", () => {
  it("renders product signal metrics, investor snapshot, and narrative action", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/product-signal")) {
        return jsonResponse({
          funnelMetrics: { funnel: { totalUsers: 10 }, recovery: { recoveryRate: 45 } },
          frictionHotspots: [{ label: "Generation failed from Studio", count: 4 }],
          triggerDistribution: { low_score_recovery: 3 },
          keyConversions: {
            reachedAnalysisPercent: 80,
            reachedHighScorePercent: 50,
            createdOpportunityPercent: 40,
            generatedDocumentsPercent: 30,
          },
          topBottleneck: "baseline_completed",
          biggestRecoveryDriver: "reanalysis_completed",
        });
      }
      if (url.includes("/api/analytics/summary")) {
        return jsonResponse({
          resultsImprovementModuleViews: 12,
          resultsImprovementCtaClicks: 3,
          artifactUsedIntents: 5,
          artifactRefineIntents: 2,
          opportunityCommitIntents: 4,
          resultsImprovementCtaRate: 0.25,
          artifactToOpportunityCommitRate: 0.8,
          refineIntentShare: 0.33,
          trendContext: {
            resultsImprovementCtaRate: { current: 0.25, previous: 0.2, delta: 0.05, direction: "up" },
            artifactToOpportunityCommitRate: { current: 0.8, previous: 0.9, delta: -0.1, direction: "down" },
            refineIntentShare: { current: 0.33, previous: 0.4, delta: -0.07, direction: "down" },
          },
          weakestStep: {
            weakestStepKey: "ctaToArtifactRate",
            weakestStepLabel: "Results CTA to artifact intent",
            weakestStepRate: 0.1,
            weakestStepPreviousRate: 0.05,
            weakestStepDelta: 0.05,
            weakestStepDirection: "improving",
            weakestStepPreviousNumerator: 1,
            weakestStepPreviousDenominator: 20,
            weakestStepTrendReason: "This weakest step is performing better than in the prior period.",
            benchmarkStepRate: 0.8,
            relativeDrop: 0.7,
            weakestStepNumerator: 2,
            weakestStepDenominator: 25,
            severity: "High",
            confidence: "Medium",
            confidenceReason: "Based on moderate current-period volume",
            watchlistStatus: "action_needed",
            watchlistPriority: "high",
            watchlistReason: "This bottleneck is severe, supported by meaningful volume, and is not improving.",
            recommendationTitle: "Reduce Studio entry friction",
            recommendationBody: "Users click the Results CTA but do not continue into artifact intent. Review routing, load time, and first screen clarity in Studio.",
          },
          releaseAnnotations: [
            {
              id: "results-improvement-copy-update",
              label: "Results improvement module copy update",
              date: "2026-03-30",
              type: "content",
              notes: "Clarified the Results improvement module CTA and reduced competing action copy.",
              isInCurrentWindow: true,
              isInPreviousWindow: false,
            },
            {
              id: "studio-first-screen-simplification",
              label: "Studio first screen simplification",
              date: "2026-03-22",
              type: "feature",
              notes: "Simplified the first Studio screen so the generation path reads more clearly.",
              isInCurrentWindow: false,
              isInPreviousWindow: true,
            },
          ],
          weakestStepReleaseContext: {
            relevantCurrentWindowReleases: [
              {
                id: "results-improvement-copy-update",
                label: "Results improvement module copy update",
                date: "2026-03-30",
                type: "content",
                notes: "Clarified the Results improvement module CTA and reduced competing action copy.",
                isInCurrentWindow: true,
                isInPreviousWindow: false,
              },
            ],
            relevantPreviousWindowReleases: [
              {
                id: "studio-first-screen-simplification",
                label: "Studio first screen simplification",
                date: "2026-03-22",
                type: "feature",
                notes: "Simplified the first Studio screen so the generation path reads more clearly.",
                isInCurrentWindow: false,
                isInPreviousWindow: true,
              },
            ],
            releaseContextSummary: "Recent relevant product changes exist in the current comparison window.",
          },
          operatorSummary: {
            headline: "Action needed: Results CTA to artifact intent is the main funnel bottleneck right now.",
            subheadline: "The current weakest step is severe, supported by meaningful volume, and is not improving.",
            tone: "urgent",
            primaryFocus: "weak_step_action",
            supportingReason:
              "Combine the weakest-step recommendation with release context to investigate likely causes.",
            recommendedActionTitle: "Reduce Studio entry friction",
          },
          recommendedNextAction: {
            actionTitle: "Reduce Studio entry friction",
            actionBody:
              "Review routing, load time, and first screen clarity to ensure users who click through can continue immediately. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
            actionFocus: "studio_entry",
            actionSource: "weakest_step_with_release_context",
          },
          adminSummaryExport: {
            headline: "Action needed: Results CTA to artifact intent is the main funnel bottleneck right now.",
            tone: "urgent",
            primaryFocus: "weak_step_action",
            weakestStepLabel: "Results CTA to artifact intent",
            weakestStepRate: 0.1,
            weakestStepDirection: "improving",
            watchlistStatus: "action_needed",
            watchlistPriority: "high",
            severity: "High",
            confidence: "Medium",
            recommendedActionTitle: "Reduce Studio entry friction",
            recommendedActionBody:
              "Review routing, load time, and first screen clarity to ensure users who click through can continue immediately. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
            releaseContextSummary: "Recent relevant product changes exist in the current comparison window.",
          },
          exportMetadata: {
            exportedAt: "2026-04-02T12:00:00.000Z",
            selectedWindowDays: 30,
          },
          formattedExports: {
            plainTextBrief: "Product Signal Summary\nWindow: last 30 days\nExported: 2026-04-02T12:00:00.000Z",
            jsonPayload: JSON.stringify({ exportedAt: "2026-04-02T12:00:00.000Z" }, null, 2),
          },
        });
      }
      if (url.includes("/api/admin/product-signal/snapshots/compare")) {
        return jsonResponse({
          hasSnapshot: true,
          latestSnapshotCreatedAt: "2026-04-01T12:00:00.000Z",
          comparisonSummary: "Current Product Signal summary differs from the latest saved snapshot in 2 key field(s).",
          changedFields: [
            {
              field: "headline",
              previousValue: "Old headline",
              currentValue: "Action needed: Results CTA to artifact intent is the main funnel bottleneck right now.",
            },
            {
              field: "releaseContextSummary",
              previousValue: "Old release context",
              currentValue: "Recent relevant product changes exist in the current comparison window.",
            },
          ],
        });
      }
      if (url.includes("/api/admin/product-signal/snapshots")) {
        return jsonResponse([
          {
            id: "snapshot-1",
            createdAt: "2026-04-01T12:00:00.000Z",
            selectedWindowDays: 30,
            headline: "Action needed: Results CTA to artifact intent is the main funnel bottleneck right now.",
            tone: "urgent",
            primaryFocus: "weak_step_action",
            weakestStepLabel: "Results CTA to artifact intent",
            weakestStepRate: "0.10000000",
            weakestStepDirection: "improving",
            watchlistStatus: "action_needed",
            watchlistPriority: "high",
            severity: "High",
            confidence: "Medium",
            recommendedActionTitle: "Reduce Studio entry friction",
            recommendedActionBody: "Review routing, load time, and first screen clarity to ensure users who click through can continue immediately.",
            releaseContextSummary: "Recent relevant product changes exist in the current comparison window.",
            exportPayloadJson: "{}",
            reviewStatus: "monitoring",
            reviewNote: "",
            reviewedAt: "2026-04-02T14:00:00.000Z",
          },
        ]);
      }
      if (url.includes("/api/admin/investor-snapshot")) {
        return jsonResponse({
          totalUsers: 10,
          reachedAnalysisPercent: 80,
          recoveredFromLowScorePercent: 45,
          reachedHighScorePercent: 50,
          createdOpportunityPercent: 40,
          avgTimeToHighScore: 12,
          biggestDropOff: "baseline_completed",
          topFrictionPattern: "Generation failed from Studio",
        });
      }
      if (url.includes("/api/admin/generate-product-narrative")) {
        return jsonResponse({ narrative: "Users are progressing through analysis and recovering after low scores." });
      }
      return jsonResponse({});
    });

    render(<ProductSignalPage />);

    await waitFor(() => {
      expect(screen.getByText("Product Signal")).toBeInTheDocument();
      expect(screen.getByText("Top Bottleneck")).toBeInTheDocument();
      expect(screen.getByText("Results to Studio conversion")).toBeInTheDocument();
      expect(screen.getByText("Investor Snapshot")).toBeInTheDocument();
      expect(screen.getByText("Product Narrative")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Action needed: Results CTA to artifact intent is the main funnel bottleneck right now."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The current weakest step is severe, supported by meaningful volume, and is not improving."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Combine the weakest-step recommendation with release context to investigate likely causes."),
    ).toBeInTheDocument();
    expect(screen.getByText("Module views")).toBeInTheDocument();
    expect(screen.getByText("CTA clicks")).toBeInTheDocument();
    expect(screen.getByText("Artifact used intent")).toBeInTheDocument();
    expect(screen.getByText("Opportunity commit intent")).toBeInTheDocument();
    expect(screen.getByText(/Results improvement CTA rate: 25\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/prev 20\.0% · up 5\.0 pts/)).toBeInTheDocument();
    expect(screen.getByText(/Artifact to opportunity commit rate: 80\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/prev 90\.0% · down 10\.0 pts/)).toBeInTheDocument();
    expect(screen.getByText(/Refine vs commit split: 33\.0% refine/)).toBeInTheDocument();
    expect(screen.getByText(/prev 40\.0% · down 7\.0 pts/)).toBeInTheDocument();
    expect(screen.getByText("Weakest funnel step")).toBeInTheDocument();
    expect(screen.getByText("Results CTA to artifact intent")).toBeInTheDocument();
    expect(screen.getByText("10.0%")).toBeInTheDocument();
    expect(screen.getByText("Previous rate: 5.0%")).toBeInTheDocument();
    expect(screen.getByText("Delta vs prior period: 5.0 pts")).toBeInTheDocument();
    expect(screen.getByText("Trend: Improving")).toBeInTheDocument();
    expect(screen.getByText("Sample: 2 / 25")).toBeInTheDocument();
    expect(screen.getByText("Previous sample: 1 / 20")).toBeInTheDocument();
    expect(screen.getByText("Severity: High")).toBeInTheDocument();
    expect(screen.getByText("Confidence: Medium")).toBeInTheDocument();
    expect(screen.getByText("Watchlist status: Action needed")).toBeInTheDocument();
    expect(screen.getByText("Priority: High")).toBeInTheDocument();
    expect(screen.getByText("Recommended next action")).toBeInTheDocument();
    expect(screen.getAllByText("Reduce Studio entry friction").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(
        "Review routing, load time, and first screen clarity to ensure users who click through can continue immediately. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Next: Reduce Studio entry friction")).toBeInTheDocument();
    expect(screen.getByText("Export summary")).toBeInTheDocument();
    expect(screen.getByText("Copy plain text")).toBeInTheDocument();
    expect(screen.getByText("Copy JSON")).toBeInTheDocument();
    expect(screen.getByText(/Window: last 30 days · Exported: 2026-04-02T12:00:00\.000Z/)).toBeInTheDocument();
    expect(screen.getByText("Review snapshots")).toBeInTheDocument();
    expect(screen.getByText("Save snapshot")).toBeInTheDocument();
    expect(screen.getByText("Most recent snapshot: 2026-04-01T12:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("Latest snapshot review")).toBeInTheDocument();
    expect(screen.getByText("Status: monitoring")).toBeInTheDocument();
    expect(screen.getAllByText(/No review note yet\./).length).toBeGreaterThan(0);
    expect(screen.getByText("Reviewed at: 2026-04-02T14:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("Review status")).toBeInTheDocument();
    expect(screen.getByText("Review note")).toBeInTheDocument();
    expect(screen.getByText("Save review")).toBeInTheDocument();
    expect(
      screen.getByText("Current Product Signal summary differs from the latest saved snapshot in 2 key field(s)."),
    ).toBeInTheDocument();
    expect(screen.getByText("headline")).toBeInTheDocument();
    expect(screen.getByText("releaseContextSummary")).toBeInTheDocument();
    expect(screen.getByText("Release context")).toBeInTheDocument();
    expect(
      screen.getByText("Recent relevant product changes exist in the current comparison window."),
    ).toBeInTheDocument();
    expect(screen.getByText("Relevant current window releases")).toBeInTheDocument();
    expect(screen.getByText("Relevant previous window releases")).toBeInTheDocument();
    expect(screen.getByText("Results improvement module copy update")).toBeInTheDocument();
    expect(screen.getByText("2026-03-30 · content")).toBeInTheDocument();
    expect(screen.getByText("Studio first screen simplification")).toBeInTheDocument();
    expect(screen.getByText("2026-03-22 · feature")).toBeInTheDocument();
    expect(
      screen.getByText("This bottleneck is severe, supported by meaningful volume, and is not improving."),
    ).toBeInTheDocument();
    expect(screen.getByText("Based on moderate current-period volume")).toBeInTheDocument();
    expect(screen.getAllByText("Reduce Studio entry friction").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText("This weakest step is performing better than in the prior period."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Users click the Results CTA but do not continue into artifact intent/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText((content) => content.includes("Generation failed from Studio")).length,
    ).toBeGreaterThan(0);
  });

  it("renders a neutral weakest-step state when there is not enough signal", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/product-signal")) {
        return jsonResponse({
          funnelMetrics: { funnel: { totalUsers: 10 }, recovery: { recoveryRate: 45 } },
          frictionHotspots: [],
          triggerDistribution: {},
          keyConversions: {
            reachedAnalysisPercent: 80,
            reachedHighScorePercent: 50,
            createdOpportunityPercent: 40,
            generatedDocumentsPercent: 30,
          },
          topBottleneck: "baseline_completed",
          biggestRecoveryDriver: "reanalysis_completed",
        });
      }
      if (url.includes("/api/analytics/summary")) {
        return jsonResponse({
          resultsImprovementModuleViews: 0,
          resultsImprovementCtaClicks: 0,
          artifactUsedIntents: 0,
          artifactRefineIntents: 0,
          opportunityCommitIntents: 0,
          resultsImprovementCtaRate: 0,
          artifactToOpportunityCommitRate: 0,
          refineIntentShare: 0,
          trendContext: {
            resultsImprovementCtaRate: { current: 0, previous: 0, delta: 0, direction: "flat" },
            artifactToOpportunityCommitRate: { current: 0, previous: 0, delta: 0, direction: "flat" },
            refineIntentShare: { current: 0, previous: 0, delta: 0, direction: "flat" },
          },
          weakestStep: {
            weakestStepKey: null,
            weakestStepLabel: null,
            weakestStepRate: 0,
            weakestStepPreviousRate: 0,
            weakestStepDelta: 0,
            weakestStepDirection: "none",
            weakestStepPreviousNumerator: 0,
            weakestStepPreviousDenominator: 0,
            weakestStepTrendReason: "No prior-period comparison is available for this weakest step.",
            benchmarkStepRate: 0,
            relativeDrop: 0,
            weakestStepNumerator: 0,
            weakestStepDenominator: 0,
            severity: "None",
            confidence: "None",
            confidenceReason: "Not enough current-period volume to trust this signal yet",
            watchlistStatus: "stable",
            watchlistPriority: "none",
            watchlistReason: "No active weakest-step signal is available yet.",
            recommendationTitle: "Not enough signal yet",
            recommendationBody: "There is not enough current period funnel activity to identify a weak point.",
          },
          releaseAnnotations: [],
          weakestStepReleaseContext: {
            relevantCurrentWindowReleases: [],
            relevantPreviousWindowReleases: [],
            releaseContextSummary: "No weakest-step release context is available yet.",
          },
          operatorSummary: {
            headline: "Not enough signal yet to identify a funnel risk.",
            subheadline:
              "Product Signal does not yet have enough current-period activity to surface a trustworthy weakest step.",
            tone: "neutral",
            primaryFocus: "no_signal",
            supportingReason: "No active weakest-step signal is available yet.",
            recommendedActionTitle: null,
          },
          recommendedNextAction: {
            actionTitle: "No action recommended yet",
            actionBody: "There is not enough current-period signal to determine a meaningful next action.",
            actionFocus: "none",
            actionSource: "none",
          },
          adminSummaryExport: {
            headline: "Not enough signal yet to identify a funnel risk.",
            tone: "neutral",
            primaryFocus: "no_signal",
            weakestStepLabel: null,
            weakestStepRate: 0,
            weakestStepDirection: "none",
            watchlistStatus: "stable",
            watchlistPriority: "none",
            severity: "None",
            confidence: "None",
            recommendedActionTitle: null,
            recommendedActionBody: "There is not enough current-period signal to determine a meaningful next action.",
            releaseContextSummary: "No weakest-step release context is available yet.",
          },
          exportMetadata: {
            exportedAt: "2026-04-02T12:00:00.000Z",
            selectedWindowDays: 30,
          },
          formattedExports: {
            plainTextBrief:
              "Product Signal Summary\nWindow: last 30 days\nExported: 2026-04-02T12:00:00.000Z\n\nWeakest step: None\nRecommended action: No action recommended yet",
          jsonPayload: JSON.stringify({ exportedAt: "2026-04-02T12:00:00.000Z" }, null, 2),
          },
        });
      }
      if (url.includes("/api/admin/product-signal/snapshots/compare")) {
        return jsonResponse({
          hasSnapshot: false,
          latestSnapshotCreatedAt: null,
          comparisonSummary: "No saved Product Signal snapshot exists yet.",
          changedFields: [],
        });
      }
      if (url.includes("/api/admin/product-signal/snapshots")) {
        return jsonResponse([]);
      }
      if (url.includes("/api/admin/investor-snapshot")) {
        return jsonResponse({
          totalUsers: 10,
          reachedAnalysisPercent: 80,
          recoveredFromLowScorePercent: 45,
          reachedHighScorePercent: 50,
          createdOpportunityPercent: 40,
          avgTimeToHighScore: 12,
          biggestDropOff: "baseline_completed",
          topFrictionPattern: "Generation failed from Studio",
        });
      }
      return jsonResponse({});
    });

    render(<ProductSignalPage />);

    await waitFor(() => {
      expect(screen.getByText("Weakest funnel step")).toBeInTheDocument();
      expect(screen.getByText("Not enough signal yet")).toBeInTheDocument();
      expect(screen.getByText("Previous rate: 0.0%")).toBeInTheDocument();
      expect(screen.getByText("Trend: None")).toBeInTheDocument();
      expect(screen.getByText("Delta vs prior period: 0.0 pts")).toBeInTheDocument();
      expect(screen.getByText("Severity: None")).toBeInTheDocument();
      expect(screen.getByText("Confidence: None")).toBeInTheDocument();
      expect(screen.getByText("Watchlist status: Stable")).toBeInTheDocument();
      expect(screen.getByText("Priority: None")).toBeInTheDocument();
      expect(screen.getByText("Recommended next action")).toBeInTheDocument();
      expect(screen.getByText("No action recommended yet")).toBeInTheDocument();
      expect(
        screen.getByText("There is not enough current-period signal to determine a meaningful next action."),
      ).toBeInTheDocument();
      expect(screen.getByText("Export summary")).toBeInTheDocument();
      expect(screen.getByText("Copy plain text")).toBeInTheDocument();
      expect(screen.getByText("Copy JSON")).toBeInTheDocument();
      expect(screen.getByText("Review snapshots")).toBeInTheDocument();
      expect(screen.getByText("Save snapshot")).toBeInTheDocument();
      expect(screen.getByText("No saved Product Signal snapshot exists yet.")).toBeInTheDocument();
      expect(screen.queryByText("Latest snapshot review")).not.toBeInTheDocument();
      expect(screen.queryByText("Review status")).not.toBeInTheDocument();
      expect(screen.getByText("Release context")).toBeInTheDocument();
      expect(screen.getByText("No weakest-step release context is available yet.")).toBeInTheDocument();
      expect(screen.getByText("None in current window")).toBeInTheDocument();
      expect(screen.getByText("None in previous window")).toBeInTheDocument();
      expect(screen.getByText("Not enough signal yet to identify a funnel risk.")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Product Signal does not yet have enough current-period activity to surface a trustworthy weakest step.",
        ),
      ).toBeInTheDocument();
      expect(screen.getAllByText("No active weakest-step signal is available yet.").length).toBeGreaterThan(0);
      expect(
        screen.getByText("Not enough current-period volume to trust this signal yet"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("No prior-period comparison is available for this weakest step."),
      ).toBeInTheDocument();
      expect(
        screen.getAllByText(/There is not enough current period funnel activity/i).length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("No reliable weak point")).not.toBeInTheDocument();
    });
  });
});
