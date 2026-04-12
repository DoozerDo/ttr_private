import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { LandingPage } from "@/src/components/landing/LandingPage";

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("Landing trust strip", () => {
  it("renders directly below the analysis block and stays CTA-free", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(<LandingPage isAuthenticated={true} />);

    const analysisBlock = screen.getByTestId("landing-analysis-block");
    const trustStrip = screen.getByTestId("landing-trust-strip");

    expect(analysisBlock.compareDocumentPosition(trustStrip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(trustStrip).getByText("No invented experience")).toBeInTheDocument();
    expect(within(trustStrip).getByText("Evidence-based fit scoring")).toBeInTheDocument();
    expect(within(trustStrip).getByText("Clear strengths, gaps, and next move")).toBeInTheDocument();
    expect(within(trustStrip).queryByRole("link")).toBeNull();
    expect(within(trustStrip).queryByRole("button")).toBeNull();
  });
});
