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

  it("keeps evidence collapsed by default", () => {
    render(<ResumePreview payload={payload} />);
    expect(screen.queryByText(/Baseline section type:/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Show evidence" })[0]!);
    expect(screen.getByText(/Baseline section type:/i)).toBeInTheDocument();
  });
});

