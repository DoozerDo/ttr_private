import { render, screen } from "@testing-library/react";

import { RouteStateShell } from "@/components/RouteStateShell";

describe("RouteStateShell", () => {
  it("renders a consistent shell structure with CTA and children", () => {
    render(
      <RouteStateShell
        testId="route-shell"
        tone="success"
        eyebrow="Success"
        title="Generation unlocked"
        body={<p>Ready to proceed.</p>}
        cta={<button type="button">OPEN STUDIO</button>}
      >
        <p>Supporting details</p>
      </RouteStateShell>,
    );

    expect(screen.getByTestId("route-shell")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Generation unlocked" })).toBeInTheDocument();
    expect(screen.getByText("Ready to proceed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OPEN STUDIO" })).toBeInTheDocument();
    expect(screen.getByText("Supporting details")).toBeInTheDocument();
  });
});
