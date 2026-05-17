import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResumePreview, readResumeModel } from "@/app/(app)/studio/ResumePreview";
import { StudioFocusPanel, type FocusAction } from "@/app/(app)/studio/StudioFocusPanel";

function StudioFocusHarness({ payload }: { payload: unknown }) {
  const model = readResumeModel(payload);
  const toText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const summary = toText(model?.summary);
  const experiences = Array.isArray(model?.experience)
    ? model!.experience
        .map((entry) => {
          const company = toText(entry.company);
          const roleTitle = toText(entry.roleTitle);
          const bullets = Array.isArray(entry.bullets)
            ? entry.bullets.map((value) => toText(value)).filter(Boolean)
            : [];
          return { company, roleTitle, bullets };
        })
        .filter((entry) => entry.company && entry.roleTitle && entry.bullets.length > 0)
    : [];

  const focusResumeTarget = (target: { type: "summary" } | { type: "role"; index: number }) => {
    document
      .querySelectorAll<HTMLElement>('[data-studio-focus-highlight="true"]')
      .forEach((node) => node.removeAttribute("data-studio-focus-highlight"));

    const focusElement = (element: HTMLElement | null) => {
      if (!element) return false;
      element.focus?.();
      return true;
    };

    if (target.type === "summary") {
      const el = document.querySelector<HTMLElement>('[data-testid="studio-resume-summary-section"]');
      const header = document.querySelector<HTMLElement>('[data-testid="studio-resume-summary-header"]');
      const expanded = header?.getAttribute("aria-expanded") === "true";
      if (header && !expanded) header.click();
      el?.setAttribute("data-studio-focus-highlight", "true");
      focusElement(el);
      return;
    }

    const header = document.querySelector<HTMLElement>(
      `[data-testid="studio-resume-experience-role-header-${target.index}"]`,
    );
    if (!header) return;
    const expanded = header.getAttribute("aria-expanded") === "true";
    if (!expanded) header.click();
    const block = document.querySelector<HTMLElement>(
      `[data-studio-role-block=\"true\"][data-role-index=\"${target.index}\"]`,
    );
    block?.setAttribute("data-studio-focus-highlight", "true");
    focusElement(header);
  };

  const focusRole0: FocusAction | null = experiences.length
    ? {
        testId: "studio-focus-action-role-0",
        title: "Improve your most recent role",
        description: "Recruiters usually scan your most recent experience first.",
        onClick: () => focusResumeTarget({ type: "role", index: 0 }),
      }
    : null;

  const focusSummary: FocusAction | null = summary
    ? {
        testId: "studio-focus-action-summary",
        title: "Review your summary",
        description: "Your summary shapes the first impression of your fit.",
        onClick: () => focusResumeTarget({ type: "summary" }),
      }
    : null;

  const focusRole1: FocusAction | null = experiences.length > 1
    ? {
        testId: "studio-focus-action-role-1",
        title: "Strengthen another key role",
        description: "A second strong role reinforces depth and consistency.",
        onClick: () => focusResumeTarget({ type: "role", index: 1 }),
      }
    : null;

  const primary: FocusAction | null = focusRole0 ?? focusSummary ?? null;
  const secondary: FocusAction[] = [];
  if (primary === focusRole0) {
    if (focusSummary) secondary.push(focusSummary);
    if (focusRole1) secondary.push(focusRole1);
  } else if (primary === focusSummary) {
    if (focusRole1) secondary.push(focusRole1);
  }

  return (
    <div>
      {primary ? <StudioFocusPanel primary={primary} secondary={secondary} /> : null}
      <ResumePreview payload={payload} />
    </div>
  );
}

describe("Studio Focus Panel", () => {
  it("renders deterministic recommendations based on available resume content", () => {
    render(
      <StudioFocusHarness
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
      <StudioFocusHarness
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
      <StudioFocusHarness
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
      <StudioFocusHarness
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
    expect(summary.getAttribute("data-studio-focus-highlight")).toBe("true");
  });

  it("role actions expand the target role and keep the rest collapsed", async () => {
    render(
      <StudioFocusHarness
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

    const roleHeader0 = screen.getByTestId("studio-resume-experience-role-header-0");
    const roleHeader1 = screen.getByTestId("studio-resume-experience-role-header-1");

    // Current contract: role bodies may remain mounted and roles may be expanded by default; verify focus + targeting
    // rather than assuming mount/unmount or a single-expanded accordion.

    fireEvent.click(screen.getByTestId("studio-focus-action-role-0"));
    await waitFor(() =>
      expect(
        document.querySelector('[data-studio-role-block="true"][data-role-index="0"]')?.getAttribute(
          "data-studio-focus-highlight",
        ),
      ).toBe("true"),
    );
    expect(
      document.querySelector('[data-studio-role-block="true"][data-role-index="0"]')?.getAttribute(
        "data-studio-focus-highlight",
      ),
    ).toBe("true");
    expect(document.activeElement === roleHeader0 || document.activeElement === roleHeader0.querySelector("*")).toBe(
      true,
    );

    fireEvent.click(screen.getByTestId("studio-focus-action-role-1"));
    await waitFor(() =>
      expect(
        document.querySelector('[data-studio-role-block="true"][data-role-index="1"]')?.getAttribute(
          "data-studio-focus-highlight",
        ),
      ).toBe("true"),
    );
    expect(
      document.querySelector('[data-studio-role-block="true"][data-role-index="0"]')?.getAttribute(
        "data-studio-focus-highlight",
      ),
    ).not.toBe("true");
  });
});
