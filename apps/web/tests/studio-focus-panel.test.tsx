import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResumePreview } from "@/app/(app)/studio/ResumePreview";

describe("Studio Focus Panel", () => {
  it("renders deterministic recommendations based on available resume content", () => {
    render(
      <ResumePreview
        payload={{
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Summary exists",
              experience: [
                {
                  company: "Employer One",
                  roleTitle: "Role One",
                  bullets: ["Role1 Bullet 1"],
                },
                {
                  company: "Employer Two",
                  roleTitle: "Role Two",
                  bullets: ["Role2 Bullet 1"],
                },
              ],
            },
          },
        }}
      />,
    );

    expect(screen.getByTestId("studio-focus-panel")).toBeInTheDocument();

    const primary = screen.getByTestId("studio-focus-primary");
    expect(primary).toBeInTheDocument();
    expect(screen.getByTestId("studio-focus-action-role-0")).toBeInTheDocument();
    expect(primary).toHaveTextContent("Improve your most recent role");
    expect(primary).toHaveTextContent("Recruiters usually scan your most recent experience first.");

    const secondary = screen.getByTestId("studio-focus-secondary");
    expect(secondary).toBeInTheDocument();
    expect(screen.getByTestId("studio-focus-action-summary")).toBeInTheDocument();
    expect(secondary).toHaveTextContent("Your summary shapes the first impression of your fit.");
    expect(screen.getByTestId("studio-focus-action-role-1")).toBeInTheDocument();
    expect(secondary).toHaveTextContent("A second strong role reinforces depth and consistency.");
  });

  it("does not render actions when targets are missing", () => {
    render(
      <ResumePreview
        payload={{
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              experience: [
                {
                  company: "Employer One",
                  roleTitle: "Role One",
                  bullets: ["Role1 Bullet 1"],
                },
              ],
            },
          },
        }}
      />,
    );

    expect(screen.getByTestId("studio-focus-panel")).toBeInTheDocument();
    expect(screen.getByTestId("studio-focus-primary")).toBeInTheDocument();
    expect(screen.getByTestId("studio-focus-action-role-0")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-focus-secondary")).toBeNull();
    expect(screen.queryByTestId("studio-focus-action-summary")).toBeNull();
    expect(screen.queryByTestId("studio-focus-action-role-1")).toBeNull();
  });

  it("promotes summary as primary when no experience exists", () => {
    render(
      <ResumePreview
        payload={{
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Summary exists",
              experience: [],
            },
          },
        }}
      />,
    );

    const primary = screen.getByTestId("studio-focus-primary");
    expect(primary).toHaveTextContent("Review your summary");
    expect(primary).toHaveTextContent("Your summary shapes the first impression of your fit.");
    expect(screen.getByTestId("studio-focus-action-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("studio-focus-secondary")).toBeNull();
    expect(screen.queryByTestId("studio-focus-action-role-0")).toBeNull();
  });

  it("summary action focuses the summary section when present", async () => {
    render(
      <ResumePreview
        payload={{
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Summary exists",
              experience: [
                {
                  company: "Employer One",
                  roleTitle: "Role One",
                  bullets: ["Role1 Bullet 1"],
                },
              ],
            },
          },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-focus-action-summary"));
    const summary = screen.getByTestId("studio-resume-summary-section");

    await waitFor(() => expect(summary).toHaveFocus());
  });

  it("role actions expand the target role and keep the rest collapsed", async () => {
    render(
      <ResumePreview
        payload={{
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              summary: "Summary exists",
              experience: [
                {
                  company: "Employer One",
                  roleTitle: "Role One",
                  bullets: ["Role1 Bullet 1"],
                },
                {
                  company: "Employer Two",
                  roleTitle: "Role Two",
                  bullets: ["Role2 Bullet 1"],
                },
              ],
            },
          },
        }}
      />,
    );

    expect(screen.queryByTestId("studio-resume-experience-role-body-0")).toBeNull();
    expect(screen.queryByTestId("studio-resume-experience-role-body-1")).toBeNull();

    fireEvent.click(screen.getByTestId("studio-focus-action-role-0"));
    await waitFor(() =>
      expect(screen.getByTestId("studio-resume-experience-role-body-0")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("studio-resume-experience-role-body-1")).toBeNull();

    fireEvent.click(screen.getByTestId("studio-focus-action-role-1"));
    await waitFor(() =>
      expect(screen.getByTestId("studio-resume-experience-role-body-1")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("studio-resume-experience-role-body-0")).toBeNull();
  });
});
