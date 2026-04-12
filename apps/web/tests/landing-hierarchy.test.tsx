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
    const resultStructure = screen.getByTestId("result-structure");
    const radarTeaser = screen.getByTestId("landing-adjacency-radar-teaser");
    const primaryAction = screen.getByTestId("landing-primary-action");

    expect(hero.compareDocumentPosition(analysisBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(analysisBlock.compareDocumentPosition(trustStrip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trustStrip.compareDocumentPosition(resultStructure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resultStructure.compareDocumentPosition(radarTeaser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hero.className).not.toMatch(/bg-slate-950\/70|shadow/);
    expect(analysisCard.className).toMatch(/bg-slate-900\/95|shadow/);
    expect(within(hero).getByRole("link", { name: "Get your score" })).toHaveAttribute(
      "href",
      "#check-compatibility",
    );
    expect(within(hero).queryByRole("button")).toBeNull();
    expect(primaryAction).toBeInTheDocument();
    expect(within(analysisBlock).getAllByTestId("landing-primary-action")).toHaveLength(1);
    expect(screen.getByText("Most tools try to make you look qualified. This tells you if you actually are.")).toBeInTheDocument();
    expect(screen.getByText("A compliance-gated analysis that shows where you are strongest and what to do next.")).toBeInTheDocument();
    expect(screen.getByText("Where you match")).toBeInTheDocument();
    expect(screen.getByText("What's missing and how much it matters")).toBeInTheDocument();
    expect(screen.getByText("Whether to apply or fix the gaps first")).toBeInTheDocument();
    expect(screen.getByText("Where you actually win")).toBeInTheDocument();
    expect(screen.getByText("We show where your background gives you the clearest edge.")).toBeInTheDocument();
    expect(screen.queryByText("Strategic preview")).toBeNull();
    expect(screen.queryByText("Know your fit before you apply.")).toBeNull();
    expect(screen.getByText("Know before you apply.")).toBeInTheDocument();
  });
});
