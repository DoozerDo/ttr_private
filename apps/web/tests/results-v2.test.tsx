import { render, screen } from "@testing-library/react";

import { ResultsV2 } from "@/app/(app)/results/components/ResultsV2";

describe("ResultsV2", () => {
  it("renders the confidence line when a score exists", () => {
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
      />,
    );

    expect(screen.getByText("Confidence: 78%")).toBeInTheDocument();
    expect(screen.getByText("Confidence reasons")).toBeInTheDocument();
    expect(screen.getByText("Job text missing")).toBeInTheDocument();
  });
});
