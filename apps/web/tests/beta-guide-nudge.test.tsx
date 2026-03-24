import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { BetaGuideNudge } from "@/src/components/layout/BetaGuideNudge";
import { BETA_GUIDE_DISMISS_KEY } from "@/lib/beta-templates";
import { mockPathname } from "@/tests/setup";

describe("BetaGuideNudge", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        },
      },
    });
    mockPathname.mockReturnValue("/analyze");
  });

  it("renders for authenticated app routes by default and links to /beta", async () => {
    render(<BetaGuideNudge />);

    await waitFor(() => {
      expect(screen.getByTestId("beta-guide-nudge")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Before you start" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Beta Guide" })).toHaveAttribute("href", "/beta");
  });

  it("does not render on /beta route", async () => {
    mockPathname.mockReturnValue("/beta");

    render(<BetaGuideNudge />);

    await waitFor(() => {
      expect(screen.queryByTestId("beta-guide-nudge")).toBeNull();
    });
  });

  it("dismiss action hides the nudge and persists localStorage state", async () => {
    const { unmount } = render(<BetaGuideNudge />);

    await waitFor(() => {
      expect(screen.getByTestId("beta-guide-nudge")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(window.localStorage.getItem(BETA_GUIDE_DISMISS_KEY)).toBe("true");
    expect(screen.queryByTestId("beta-guide-nudge")).toBeNull();

    unmount();
    render(<BetaGuideNudge />);

    await waitFor(() => {
      expect(screen.queryByTestId("beta-guide-nudge")).toBeNull();
    });
  });
});
