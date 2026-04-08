import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentStrategyPlanSummary } from "@/components/DocumentStrategyPlanSummary";
import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";

describe("studio document plan summary", () => {
  it("renders a user-safe explanation without internal metadata", () => {
    const plan = buildDocumentStrategyPlan({
      fitScore: 88,
      jobTitle: "Director of Support",
      jobCompany: "Acme",
      jobDescription: "Lead support operations and workflow design for a SaaS platform.",
      jobRequirements: ["Partner with product and engineering."],
      baselineSections: [
        {
          id: "section-1",
          title: "Support Operations",
          sectionType: "EXPERIENCE",
          content: "Led support operations programs and improved workflows.",
        },
      ],
    });

    render(<DocumentStrategyPlanSummary plan={plan} />);

    expect(screen.getByTestId("studio-document-plan-summary")).toHaveTextContent(
      "One plan, two artifacts",
    );
    expect(screen.getByText("Positioning")).toBeInTheDocument();
    expect(screen.getByText("Emphasis")).toBeInTheDocument();
    expect(screen.getByText("Selected evidence")).toBeInTheDocument();
    expect(screen.queryByText(/sourceId/i)).toBeNull();
    expect(screen.queryByText(/section-1/i)).toBeNull();
    expect(screen.getByTestId("studio-document-plan-summary")).toHaveTextContent("Support Operations");
  });
});
