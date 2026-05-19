import { render, screen } from "@testing-library/react";

import { ComingSoonNotice } from "@/app/(app)/interview-toolkit/_components/ComingSoonNotice";
import { sidebarRoutes } from "@/src/navigation/routes";

describe("Interview Toolkit coming soon", () => {
  it("renders a clear coming soon notice with safe next actions", () => {
    render(<ComingSoonNotice />);

    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Baseline" })).toHaveAttribute("href", "/baseline");
    expect(screen.getByRole("link", { name: "Go to Results" })).toHaveAttribute("href", "/results");
  });

  it("does not include Interview Toolkit in sidebar navigation", () => {
    const route = sidebarRoutes.find((item) => item.id === "interviewToolkit");

    expect(route).toBeUndefined();
  });
});
