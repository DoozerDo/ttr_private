import { render, screen } from "@testing-library/react";

import {
  OpportunityMapSection,
  getFitLevel,
  getOpportunityNextMove,
  getOpportunityVerdict,
  getReadinessLevel,
  getRiskLevel,
} from "@/app/(app)/results/page";

describe("Results opportunity map", () => {
  it("renders the opportunity map executive summary with the requested sections", () => {
    render(
      <OpportunityMapSection
        score={87}
        verdict={getOpportunityVerdict(87)}
        advantageSignals={[
          "Led global support operations",
          "Built escalation and incident workflows",
          "Drove cross-functional CX systems",
        ]}
        watchoutSignals={[
          "No direct firmware engineering experience",
          "Limited embedded systems exposure",
          "Weaker alignment with silicon development context",
        ]}
        nextMove={getOpportunityNextMove(87)}
        compactIndicators={[
          { label: "Fit", value: getFitLevel(87) },
          { label: "Risk", value: getRiskLevel(87, 0.82) },
          { label: "Readiness", value: getReadinessLevel(87, "High") },
        ]}
      />,
    );

    expect(screen.getByText("Opportunity Map")).toBeInTheDocument();
    expect(screen.getByText("Score and verdict")).toBeInTheDocument();
    expect(screen.getByText("Strong Match")).toBeInTheDocument();
    expect(screen.getByText("Your advantage")).toBeInTheDocument();
    expect(screen.getByText("Watchouts")).toBeInTheDocument();
    expect(screen.getByText("Best next move")).toBeInTheDocument();
    expect(screen.getByText("Tailor and apply")).toBeInTheDocument();
    expect(screen.getByText("Fit")).toBeInTheDocument();
    expect(screen.getByText("Risk")).toBeInTheDocument();
    expect(screen.getByText("Readiness")).toBeInTheDocument();
    expect(screen.queryByText("Recommended next step")).toBeNull();
  });

  it("maps score bands to the expected verdict and next move", () => {
    expect(getOpportunityVerdict(92)).toMatchObject({ label: "Prime Opportunity" });
    expect(getOpportunityVerdict(84)).toMatchObject({ label: "Strong Match" });
    expect(getOpportunityVerdict(75)).toMatchObject({ label: "Competitive Match" });
    expect(getOpportunityVerdict(64)).toMatchObject({ label: "Possible Fit" });
    expect(getOpportunityVerdict(52)).toMatchObject({ label: "Low Match" });

    expect(getOpportunityNextMove(92)).toMatchObject({ title: "Apply now" });
    expect(getOpportunityNextMove(84)).toMatchObject({ title: "Tailor and apply" });
    expect(getOpportunityNextMove(75)).toMatchObject({ title: "Tailor before applying" });
    expect(getOpportunityNextMove(64)).toMatchObject({
      title: "Strengthen baseline before applying",
    });
    expect(getOpportunityNextMove(52)).toMatchObject({
      title: "Consider skipping or repositioning",
    });
  });

  it("derives the compact confidence row from score and risk signals", () => {
    expect(getFitLevel(88)).toBe("High");
    expect(getRiskLevel(88, 0.82)).toBe("High");
    expect(getReadinessLevel(88, "High")).toBe("High");

    expect(getFitLevel(73)).toBe("Moderate");
    expect(getRiskLevel(73, 0.55)).toBe("Moderate");
    expect(getReadinessLevel(73, "Moderate")).toBe("Moderate");

    expect(getFitLevel(55)).toBe("Low");
    expect(getRiskLevel(55, 0.2)).toBe("Moderate");
    expect(getReadinessLevel(55, "Low")).toBe("Low");
  });
});
