import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LandingPage } from "@/src/components/landing/LandingPage";

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("Landing conversion pass", () => {
  it("renders hero and input CTAs with clear example labeling", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(<LandingPage isAuthenticated={false} />);

    expect(
      screen.getByRole("heading", { name: "Know that you qualify before you apply." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check your compatibility" })).toHaveAttribute(
      "href",
      "#check-compatibility",
    );
    expect(screen.getByRole("button", { name: "Upload your resume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze this role" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Example compatibility analysis" })).toBeInTheDocument();
    expect(screen.getByText("Example analysis. Upload your resume to generate your own.")).toBeInTheDocument();
    expect(screen.getByText("Try a sample role (example only):")).toBeInTheDocument();

    const heroHeading = screen.getByRole("heading", { name: "Know that you qualify before you apply." });
    const inputHeading = screen.getByRole("heading", { name: "Check your compatibility" });
    const previewHeading = screen.getByRole("heading", { name: "Example compatibility analysis" });
    expect(
      heroHeading.compareDocumentPosition(inputHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      inputHeading.compareDocumentPosition(previewHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
