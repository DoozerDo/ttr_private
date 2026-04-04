import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { BetaGuideNudge } from "@/src/components/layout/BetaGuideNudge";
import { mockPathname } from "@/tests/setup";

describe("BetaGuideNudge", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/analyze");
  });

  it("renders a lightweight help trigger and opens the guide modal", () => {
    render(<BetaGuideNudge />);

    expect(screen.getByTestId("beta-guide-link")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "How this works" }));
    expect(screen.getByRole("dialog", { name: "How this works" })).toBeInTheDocument();
    expect(screen.getByText("1. Upload your resume to create a baseline.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full guide" })).toHaveAttribute("href", "/beta");
  });

  it("does not render on /beta route", async () => {
    mockPathname.mockReturnValue("/beta");

    render(<BetaGuideNudge />);

    expect(screen.queryByTestId("beta-guide-link")).toBeNull();
  });
});
