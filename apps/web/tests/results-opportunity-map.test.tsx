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
      />,
    );

    expect(screen.getByText("Opportunity Map")).toBeInTheDocument();
    expect(
      screen.getByText("Executive compatibility summary for this role."),
    ).toBeInTheDocument();
    expect(screen.getByText("Score and verdict")).toBeInTheDocument();
    expect(screen.getByText("Strong Match")).toBeInTheDocument();
    expect(screen.getByText("Your advantage")).toBeInTheDocument();
    expect(screen.queryByText("Watchouts")).toBeNull();
    expect(screen.queryByText("Best next move")).toBeNull();
    expect(screen.queryByText("Fit")).toBeNull();
    expect(screen.queryByText("Risk")).toBeNull();
    expect(screen.queryByText("Readiness")).toBeNull();
  });

  it("maps score bands to the expected verdict", () => {
    expect(getOpportunityVerdict(92)).toMatchObject({ label: "Prime Opportunity" });
    expect(getOpportunityVerdict(84)).toMatchObject({ label: "Strong Match" });
    expect(getOpportunityVerdict(75)).toMatchObject({ label: "Competitive Match" });
    expect(getOpportunityVerdict(64)).toMatchObject({ label: "Possible Fit" });
    expect(getOpportunityVerdict(52)).toMatchObject({ label: "Low Match" });
  });
});
