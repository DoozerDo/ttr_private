import { fireEvent, render, screen } from "@testing-library/react";

import { AdvancedInsightsCard } from "@/app/(app)/results/page";

describe("Results advanced insights", () => {
  it("keeps detailed score analysis collapsed by default and expands on demand", () => {
    render(
      <AdvancedInsightsCard
        showScoreDrivers={false}
        renderDriverGrid={() => null}
        scoreBreakdown={{
          total_score: 80,
          dimensions: [
            {
              key: "role_scope_and_seniority",
              label: "Role Scope and Seniority",
              score: 20,
              weight: 25,
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("Supporting score breakdown")).toBeNull();
    const toggle = screen.getByRole("button", { name: "View detailed scoring breakdown" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide detailed scoring breakdown" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Supporting score breakdown")).toBeInTheDocument();
  });
});

