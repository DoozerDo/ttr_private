import { fireEvent, render, screen } from "@testing-library/react";
import { ResumePreview } from "@/app/(app)/studio/ResumePreview";

describe("Studio resume experience accordion", () => {
  const payload = {
    preview: {
      resume: {
        heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
        summary: "Summary text",
        experience: [
          {
            company: "Employer One",
            roleTitle: "Principal Program Manager",
            dateRange: "2021 - Present",
            bullets: [
              "Role1 Bullet 1",
              "Role1 Bullet 2",
              "Role1 Bullet 3",
            ],
          },
          {
            company: "Employer Two",
            roleTitle: "Program Manager",
            dateRange: "2018 - 2021",
            bullets: ["Role2 Bullet 1"],
          },
        ],
      },
    },
  };

  it("renders roles collapsed by default and keeps controls visible", () => {
    render(<ResumePreview payload={payload} />);

    expect(screen.getByTestId("studio-resume-workspace-root")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Resume" })).toBeInTheDocument();
    expect(screen.getByTestId("studio-resume-experience-accordion")).toBeInTheDocument();

    expect(screen.queryByText("Role1 Bullet 1")).toBeNull();
    expect(screen.queryByText("Role2 Bullet 1")).toBeNull();
  });

  it("expands and collapses a role, and only shows one role body at a time", () => {
    render(<ResumePreview payload={payload} />);

    fireEvent.click(screen.getByTestId("studio-resume-experience-role-header-0"));
    expect(screen.getByTestId("studio-resume-experience-role-body-0")).toBeInTheDocument();
    expect(screen.getByText("Role1 Bullet 1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("studio-resume-experience-role-header-1"));
    expect(screen.queryByTestId("studio-resume-experience-role-body-0")).toBeNull();
    expect(screen.getByTestId("studio-resume-experience-role-body-1")).toBeInTheDocument();
    expect(screen.getByText("Role2 Bullet 1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("studio-resume-experience-role-header-1"));
    expect(screen.queryByTestId("studio-resume-experience-role-body-1")).toBeNull();
  });
});

