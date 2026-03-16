import { render, screen } from "@testing-library/react";

import { OpportunityMapSection, getOpportunityVerdict } from "@/app/(app)/results/page";

describe("Results opportunity map", () => {
  it("renders the opportunity map as a concise executive summary", () => {
    render(
      <OpportunityMapSection
        score={87}
        verdict={getOpportunityVerdict(87)}
        advantageSignals={[
          "Led global support operations",
          "Built escalation and incident workflows",
          "Drove cross-functional CX systems",
        ]}
        primaryCta={{ label: "Open Resume and Cover Letter Studio", href: "/studio" }}
        scoreAnalysisHref="#advanced-insights"
      />,
    );

    expect(screen.queryByText("Opportunity Map")).toBeNull();
    expect(
      screen.queryByText(
        "A focused read on how strong this match is, why it holds up, and what you should do next.",
      ),
    ).toBeNull();
    expect(screen.getByText("Strong Match")).toBeInTheDocument();
    expect(screen.getByText("YOUR ADVANTAGE")).toBeInTheDocument();
    expect(screen.getByText("View score analysis")).toBeInTheDocument();
    expect(screen.getByText("Open Resume and Cover Letter Studio")).toBeInTheDocument();
    expect(screen.queryByText("Watchouts")).toBeNull();
    expect(screen.queryByText("Best next move")).toBeNull();
    expect(screen.queryByText("Fit")).toBeNull();
    expect(screen.queryByText("Risk")).toBeNull();
    expect(screen.queryByText("Readiness")).toBeNull();
  });

  it("suppresses the advantage section when no verified advantages exist", () => {
    render(
      <OpportunityMapSection
        score={74}
        verdict={getOpportunityVerdict(74)}
        advantageSignals={[]}
        primaryCta={{ label: "Open Resume and Cover Letter Studio", href: "/studio" }}
        scoreAnalysisHref="#advanced-insights"
      />,
    );

    expect(screen.queryByText("YOUR ADVANTAGE")).toBeNull();
    expect(screen.queryByText("Verified baseline advantages are not available for this run yet.")).toBeNull();
  });

  it("maps score bands to the expected verdict", () => {
    expect(getOpportunityVerdict(92)).toMatchObject({ label: "Prime Opportunity" });
    expect(getOpportunityVerdict(84)).toMatchObject({ label: "Strong Match" });
    expect(getOpportunityVerdict(75)).toMatchObject({ label: "Competitive Match" });
    expect(getOpportunityVerdict(64)).toMatchObject({ label: "Possible Fit" });
    expect(getOpportunityVerdict(52)).toMatchObject({ label: "Low Match" });
  });
});
