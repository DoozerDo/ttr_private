import { fireEvent, render, screen } from "@testing-library/react";
import { ResumePreview } from "@/app/(app)/studio/ResumePreview";

describe("ResumePreview", () => {
  const payload = {
    sections: [
      {
        id: "summary-1",
        type: "SUMMARY",
        title: "Summary",
        bullets: [
          {
            id: "summary-1:0",
            text: "Led support modernization across global teams.",
            confidence: "High",
            claimRisk: {
              level: "High",
              flaggedTerms: [{ term: "Datadog", reason: "Technology not found in baseline." }],
            },
            source: {
              baselineSectionType: "SUMMARY",
              baselineSectionId: "summary-1",
              bulletIndex: 0,
            },
          },
        ],
      },
      {
        id: "exp-1",
        type: "EXPERIENCE",
        title: "Experience",
        bullets: [
          {
            id: "exp-1:0",
            text: "Improved incident response playbooks and SLA performance.",
            confidence: "High",
            claimRisk: {
              level: "None",
              flaggedTerms: [],
            },
            source: {
              baselineSectionType: "EXPERIENCE",
              baselineSectionId: "exp-1",
              bulletIndex: 0,
            },
          },
        ],
      },
    ],
  };

  it("renders key section headings", () => {
    render(<ResumePreview payload={payload} />);
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Professional Experience")).toBeInTheDocument();
  });

  it("shows claim risk badge only when level is not None and keeps details collapsed by default", () => {
    render(<ResumePreview payload={payload} />);
    expect(screen.queryByText(/Baseline section type:/i)).not.toBeInTheDocument();
    expect(screen.getByText("Claim risk: High")).toBeInTheDocument();
    expect(screen.queryByText("Claim risk: None")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Show details" })[0]!);
    expect(screen.getByText(/Baseline section type:/i)).toBeInTheDocument();
  });
});
