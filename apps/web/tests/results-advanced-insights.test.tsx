import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdvancedInsightsCard } from "@/app/(app)/results/page";

describe("results advanced insights", () => {
  it("collapses diagnostics by default and expands on demand", () => {
    const renderDriverGrid = vi
      .fn()
      .mockImplementation((showExtraLine: boolean, limit: number, offset: number) =>
        showExtraLine ? (
          <div>{`Driver grid ${limit}:${offset}`}</div>
        ) : (
          <div>{`Driver grid compact ${limit}:${offset}`}</div>
        ),
      );

    render(
      <AdvancedInsightsCard
        scoreBreakdown={{
          total_score: 78,
          dimensions: [
            { key: "role_scope_and_seniority", label: "Leadership scope", score: 22, weight: 25 },
            { key: "support_operations_and_process_rigor", label: "Operational rigor", score: 18, weight: 25 },
            { key: "tooling_and_platform_experience", label: "Tooling fit", score: 16, weight: 25 },
            { key: "domain_and_business_context", label: "Business context", score: 12, weight: 25 },
            { key: "change_leadership_and_customer_advocacy", label: "Change leadership", score: 11, weight: 25 },
            { key: "industry_context", label: "Leadership depth", score: 10, weight: 25 },
          ],
        }}
        showScoreDrivers={true}
        renderDriverGrid={renderDriverGrid}
      />,
    );

    expect(screen.getByText("1 strong scoring signals and 5 review areas.")).toBeInTheDocument();
    expect(screen.queryByText("Driver grid 2:0")).toBeNull();
    expect(screen.queryByText("Supporting score breakdown")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "VIEW DETAILS" }));

    expect(screen.getByRole("button", { name: "HIDE DETAILS" })).toBeInTheDocument();
    expect(screen.getByText("Top signals")).toBeInTheDocument();
    expect(screen.getByText("Additional details")).toBeInTheDocument();
    expect(renderDriverGrid.mock.calls[0]).toEqual([{ showExtraLine: true, limit: 2, offset: 0 }]);
    expect(renderDriverGrid.mock.calls[1]).toEqual([
      { showExtraLine: true, limit: 5, offset: 2, forceShowExtraLine: false },
    ]);
    expect(screen.getByText("Score Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Leadership scope")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+4 MORE" })).toBeInTheDocument();
  });
});
