import { render, screen } from "@testing-library/react";

import { ResultsV2 } from "@/app/(app)/results/components/ResultsV2";

describe("ResultsV2", () => {
  it("renders fit evidence block when score signals exist", () => {
    render(
      <ResultsV2
        heroHeading="Test"
        heroScoreText="Score: 80"
        heroSupportText="Support text"
        activeScore={80}
        isLowScore={false}
        executionMode
        levelLabel="5"
        strengths={[]}
        gaps={[]}
        complianceError={null}
        complianceFlags={[]}
        primaryActionLabel="Primary"
        onPrimaryAction={() => {}}
        primaryActionDisabled={false}
        delta={null}
        confidenceScore={78}
        confidenceReasons={["missing_job_text"]}
        scoreBreakdown={{
          total_score: 80,
          dimensions: [
            {
              key: "role_scope_and_seniority",
              label: "Director level support leadership",
              score: 22,
              weight: 25,
            },
            {
              key: "domain_and_business_context",
              label: "Enterprise SaaS support",
              score: 13,
              weight: 15,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Why this role fits you")).toBeInTheDocument();
    expect(screen.getAllByText("Director level support leadership").length).toBeGreaterThan(0);
  });

  it("does not render evidence block when score signals are missing", () => {
    render(
      <ResultsV2
        heroHeading="Test"
        heroScoreText="Score: 80"
        heroSupportText="Support text"
        activeScore={80}
        isLowScore={false}
        executionMode
        levelLabel="5"
        strengths={[]}
        gaps={[]}
        complianceError={null}
        complianceFlags={[]}
        primaryActionLabel="Primary"
        onPrimaryAction={() => {}}
        primaryActionDisabled={false}
        delta={null}
        confidenceScore={78}
        confidenceReasons={["missing_job_text"]}
        scoreBreakdown={null}
      />,
    );

    expect(screen.queryByText("Why this role fits you")).toBeNull();
  });
});
