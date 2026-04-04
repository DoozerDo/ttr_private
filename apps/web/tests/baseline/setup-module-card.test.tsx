import { render, screen } from "@testing-library/react";

import { FormButton } from "@/components/FormButton";
import { SetupModuleCard } from "@/app/(app)/baseline/_components/SetupModuleCard";

describe("SetupModuleCard", () => {
  it("renders the primary action in the header and shows the description", () => {
    render(
      <SetupModuleCard
        label="LABEL"
        title="Test module"
        description="Guidance text"
        primaryAction={<FormButton>Primary</FormButton>}
      >
        <p>Body content</p>
      </SetupModuleCard>,
    );

    const primaryButton = screen.getByRole("button", { name: /primary/i });
    expect(primaryButton).toBeInTheDocument();

    const heading = screen.getByRole("heading", { name: "Test module" });
    expect(heading).toBeInTheDocument();
    expect(heading.closest("header")).toContainElement(primaryButton);

    expect(screen.getByText("Guidance text")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });
});
