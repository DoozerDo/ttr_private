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
      screen.getByRole("heading", { name: "Beta invite holders use Target This Role to see if their background truly fits a role before they apply." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get beta access" })).toHaveAttribute("href", "/auth/signup?next=%2Fbaseline");
    expect(screen.getByRole("button", { name: "Select resume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Career Compatibility Analysis" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it works" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Example compatibility analysis" })).toBeInTheDocument();
    expect(screen.getByText("This is a static example for format only. Your uploaded inputs produce your actual result.")).toBeInTheDocument();

    const heroHeading = screen.getByRole("heading", { name: "Beta invite holders use Target This Role to see if their background truly fits a role before they apply." });
    const inputHeading = screen.getByRole("button", { name: "Select resume" });
    const previewHeading = screen.getByRole("heading", { name: "Example compatibility analysis" });
    expect(
      heroHeading.compareDocumentPosition(inputHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      inputHeading.compareDocumentPosition(previewHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});




