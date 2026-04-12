import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { LandingPage } from "@/src/components/landing/LandingPage";

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("Landing hierarchy", () => {
  it("keeps the hero light and the analysis block as the single dominant conversion surface", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(<LandingPage isAuthenticated={true} />);

    const hero = screen.getByTestId("landing-hero");
    const analysisBlock = screen.getByTestId("landing-analysis-block");
    const analysisCard = screen.getByTestId("landing-analysis-card");
    const trustStrip = screen.getByTestId("landing-trust-strip");
    const primaryAction = screen.getByTestId("landing-primary-action");

    expect(hero.compareDocumentPosition(analysisBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(analysisBlock.compareDocumentPosition(trustStrip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hero.className).not.toMatch(/bg-slate-950\/70|shadow/);
    expect(analysisCard.className).toMatch(/bg-slate-900\/95|shadow/);
    expect(within(hero).getByRole("link", { name: "Jump to analysis" })).toHaveAttribute(
      "href",
      "#check-compatibility",
    );
    expect(within(hero).queryByRole("button", { name: "Check fit" })).toBeNull();
    expect(primaryAction).toBeInTheDocument();
    expect(within(analysisBlock).getAllByTestId("landing-primary-action")).toHaveLength(1);
    expect(screen.getByText("Upload resume")).toBeInTheDocument();
    expect(screen.getByText("PDF or DOCX only")).toBeInTheDocument();
  });
});
