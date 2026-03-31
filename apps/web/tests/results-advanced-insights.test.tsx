import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdvancedInsightsCard } from "@/app/(app)/results/page";

describe("results advanced insights", () => {
  it("collapses diagnostics by default and expands on demand", () => {
    render(
      <AdvancedInsightsCard
        scoreBreakdown={{
          total_score: 78,
          dimensions: [
            { key: "role_scope_and_seniority", label: "Leadership scope", score: 22, weight: 25 },
            { key: "support_operations_and_process_rigor", label: "Operational rigor", score: 18, weight: 25 },
            { key: "tooling_and_platform_experience", label: "Tooling fit", score: 16, weight: 25 },
          ],
        }}
        showScoreDrivers={true}
        renderDriverGrid={() => <div>Driver grid details</div>}
      />,
    );

    expect(screen.getByText("1 strong scoring signals and 2 review areas.")).toBeInTheDocument();
    expect(screen.queryByText("Driver grid details")).toBeNull();
    expect(screen.queryByText("Supporting score breakdown")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "VIEW DETAILS" }));

    expect(screen.getByRole("button", { name: "HIDE DETAILS" })).toBeInTheDocument();
    expect(screen.getByText("Driver grid details")).toBeInTheDocument();
    expect(screen.getByText("Supporting score breakdown")).toBeInTheDocument();
    expect(screen.getByText("Leadership scope")).toBeInTheDocument();
  });
});
