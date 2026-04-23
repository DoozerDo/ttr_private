import { fireEvent, render, screen, within } from "@testing-library/react";
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
    const accordion = screen.getByTestId("studio-resume-experience-accordion");
    expect(accordion).toBeInTheDocument();
    expect(accordion.className).toContain("space-y-6");

    const roleBlocks = screen.getAllByTestId("experience-entry-block");
    expect(roleBlocks).toHaveLength(2);
    expect(roleBlocks[0]?.className).toContain("rounded-2xl");
    expect(roleBlocks[0]?.className).toContain("border");

    expect(screen.queryByText("Role1 Bullet 1")).toBeNull();
    expect(screen.queryByText("Role2 Bullet 1")).toBeNull();
  });

  it("expands and collapses a role, and only shows one role body at a time", () => {
    render(<ResumePreview payload={payload} />);

    fireEvent.click(screen.getByTestId("studio-resume-experience-role-header-0"));
    const role0Body = screen.getByTestId("studio-resume-experience-role-body-0");
    expect(role0Body).toBeInTheDocument();
    const bulletList = within(role0Body).getByRole("list");
    expect(bulletList.className).toContain("space-y-2");
    expect(screen.getByText("Role1 Bullet 1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("studio-resume-experience-role-header-1"));
    expect(screen.queryByTestId("studio-resume-experience-role-body-0")).toBeNull();
    expect(screen.getByTestId("studio-resume-experience-role-body-1")).toBeInTheDocument();
    expect(screen.getByText("Role2 Bullet 1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("studio-resume-experience-role-header-1"));
    expect(screen.queryByTestId("studio-resume-experience-role-body-1")).toBeNull();
  });
});
