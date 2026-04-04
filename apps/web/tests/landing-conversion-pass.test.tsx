import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LandingPage } from "@/src/components/landing/LandingPage";

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("Landing conversion pass", () => {
  it("shows a visible login route on the public landing page for unauthenticated users", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(<LandingPage isAuthenticated={false} />);

    const loginLinks = screen.getAllByRole("link", { name: "Log in" });
    const scoreButtons = screen.getAllByRole("button", { name: "Get your score" });

    expect(loginLinks.some((link) => link.getAttribute("href") === "/auth/login?next=%2Fbaseline")).toBe(true);
    expect(screen.getByRole("link", { name: "Get beta access" })).toHaveAttribute("href", "/auth/signup?next=%2Fbaseline");
    expect(scoreButtons.length).toBeGreaterThan(0);
  });
});




