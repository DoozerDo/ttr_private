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
      screen.getByRole("heading", { name: "Upload your resume, paste the job description, and get your fit in seconds." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check Compatibility" })).toHaveAttribute(
      "href",
      "#check-compatibility",
    );
    expect(screen.getByRole("button", { name: "Select resume" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Career Compatibility Analysis" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Example compatibility analysis" })).toBeInTheDocument();
    expect(screen.getByText("This is a static example for format only. Your uploaded inputs produce your actual result.")).toBeInTheDocument();
    expect(screen.getByText("Try a sample role (example only):")).toBeInTheDocument();

    const heroHeading = screen.getByRole("heading", { name: "Upload your resume, paste the job description, and get your fit in seconds." });
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




