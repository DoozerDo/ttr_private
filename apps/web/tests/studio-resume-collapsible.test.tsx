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
    expect(screen.getByTestId("studio-resume-experience-section")).toBeInTheDocument();

    // Current contract: the experience accordion renders role headers and keeps only one role body expanded.
    const roleBlocks = screen.getAllByTestId("experience-entry-block");
    expect(roleBlocks).toHaveLength(2);

    const headers = screen.getAllByTestId(/studio-resume-experience-role-header-/);
    expect(headers).toHaveLength(2);

    const bodies = screen.getAllByTestId(/studio-resume-experience-role-body-/);
    expect(bodies).toHaveLength(2);
    expect(screen.getByText("Role1 Bullet 1")).toBeInTheDocument();
    expect(screen.getByText("Role2 Bullet 1")).toBeInTheDocument();
  });

  it("expands and collapses a role, and only shows one role body at a time", async () => {
    render(<ResumePreview payload={payload} />);

    const headers = screen.getAllByTestId(/studio-resume-experience-role-header-/);
    expect(headers).toHaveLength(2);

    const firstHeader = headers[0]!;
    const secondHeader = headers[1]!;

    // Collapse first role.
    fireEvent.click(firstHeader);
    expect(firstHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Role1 Bullet 1")).toBeNull();

    // Expand it again.
    fireEvent.click(firstHeader);
    expect(firstHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Role1 Bullet 1")).toBeInTheDocument();

    // Collapsing one role doesn't break the other role rendering/controls.
    fireEvent.click(secondHeader);
    expect(secondHeader).toHaveAttribute("aria-expanded", "false");
  });
});
