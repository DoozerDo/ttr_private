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
      if (url.includes("/api/admin/product-signal")) {
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
        });
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
    expect(screen.getByText("Module views")).toBeInTheDocument();
    expect(screen.getByText("CTA clicks")).toBeInTheDocument();
    expect(screen.getByText("Artifact used intent")).toBeInTheDocument();
    expect(screen.getByText("Opportunity commit intent")).toBeInTheDocument();
    expect(screen.getByText("Results improvement CTA rate: 25.0%")).toBeInTheDocument();
    expect(screen.getByText("Artifact to opportunity commit rate: 80.0%")).toBeInTheDocument();
    expect(
      screen.getAllByText((content) => content.includes("Generation failed from Studio")).length,
    ).toBeGreaterThan(0);
  });
});
