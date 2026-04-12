import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS } from "@/lib/careerAdjacencyRadar";
import { LandingPage } from "@/src/components/landing/LandingPage";

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("Landing adjacency radar teaser", () => {
  it("renders the radar teaser below the explanation and keeps the explanation visually secondary", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(<LandingPage isAuthenticated={true} />);

    const explanation = screen.getByTestId("result-structure");
    const radarTeaser = screen.getByTestId("landing-adjacency-radar-teaser");

    expect(explanation.compareDocumentPosition(radarTeaser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(explanation.className).not.toMatch(/bg-slate-950\/35|bg-slate-900\/35|shadow/);
    expect(screen.getByText("Where you actually win")).toBeInTheDocument();
    expect(screen.getByText("We show where your background gives you the clearest edge.")).toBeInTheDocument();
    expect(screen.queryByText("Strategic preview")).toBeNull();

    CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS.forEach((axis) => {
      expect(screen.getByText(axis.teaserLabel)).toBeInTheDocument();
    });
  });
});
