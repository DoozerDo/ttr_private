import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";

import { LandingPage } from "@/src/components/landing/LandingPage";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

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

    expect(loginLinks.some((link) => link.getAttribute("href") === "/auth/login?next=%2Fbaseline")).toBe(true);
    expect(screen.getByRole("link", { name: "Get beta access" })).toHaveAttribute("href", "/auth/signup?next=%2Fbaseline");
    expect(screen.getByRole("link", { name: "Get your score" })).toHaveAttribute("href", "#check-compatibility");
    expect(screen.queryByRole("button", { name: "Get your score" })).toBeNull();
    expect(screen.getByRole("button", { name: "Check fit" })).toBeInTheDocument();
    expect(screen.getByText("Upload resume")).toBeInTheDocument();
    expect(screen.getByText("PDF or DOCX only")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Paste the full job description, including responsibilities and requirements.")).toBeInTheDocument();
    expect(screen.getByText("Paste at least 120 characters from the job description to enable analysis.")).toBeInTheDocument();
    expect(screen.getByTestId("landing-primary-action")).toBeInTheDocument();
    expect(screen.getAllByTestId("landing-primary-action")).toHaveLength(1);
  });

  it("redirects unauthenticated Check fit clicks to auth without firing the preview request", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any);
    pushMock.mockClear();

    render(<LandingPage isAuthenticated={false} />);

    fireEvent.change(screen.getByTestId("landing-job-description-input"), {
      target: { value: "a".repeat(200) },
    });

    fireEvent.click(screen.getByRole("button", { name: "Check fit" }));

    expect(
      fetchSpy.mock.calls.some((call) =>
        String(call[0]).includes("/api/preview/compatibility-score"),
      ),
    ).toBe(false);
    expect(pushMock).toHaveBeenCalledWith("/auth/signup?next=%2Fbaseline");

    fetchSpy.mockRestore();
  });
});




