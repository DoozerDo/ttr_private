import { render, screen } from "@testing-library/react";

import { CareerAdjacencyRadar } from "@/app/(app)/results/components/CareerAdjacencyRadar";
import { buildCareerAdjacencyRadarDimensions } from "@/lib/careerAdjacencyRadar";

describe("CareerAdjacencyRadar", () => {
  it("derives bounded radar dimensions from the existing score breakdown", () => {
    const radarDimensions = buildCareerAdjacencyRadarDimensions({
      total_score: 77,
      dimensions: [
        {
          key: "role_scope_and_seniority",
          label: "Leadership scope",
          score: 21,
          weight: 25,
        },
        {
          key: "support_operations_and_process_rigor",
          label: "Operational rigor",
          score: 18,
          weight: 25,
        },
        {
          key: "tooling_and_platform_experience",
          label: "Tooling depth",
          score: 16,
          weight: 20,
        },
        {
          key: "domain_and_business_context",
          label: "Industry context",
          score: 11,
          weight: 15,
        },
        {
          key: "change_leadership_and_customer_advocacy",
          label: "Change leadership",
          score: 13,
          weight: 15,
        },
      ],
    });

    expect(radarDimensions).toHaveLength(6);
    radarDimensions.forEach((dimension) => {
      expect(dimension.value).toBeGreaterThanOrEqual(0);
      expect(dimension.value).toBeLessThanOrEqual(100);
    });
    expect(radarDimensions.map((dimension) => dimension.label)).toEqual([
      "Support Operations Leadership",
      "Incident / Reliability / NOC",
      "Customer Experience Strategy",
      "Technical Program / Change Management",
      "Tooling / Platform Depth",
      "Industry Context",
    ]);
  });

  it("does not render when no analysis-backed score breakdown exists", () => {
    render(<CareerAdjacencyRadar analysisId={null} score={null} scoreBreakdown={null} />);

    expect(screen.queryByTestId("career-adjacency-radar")).toBeNull();
    expect(screen.queryByText("Where You're Strongest")).toBeNull();
  });
});
