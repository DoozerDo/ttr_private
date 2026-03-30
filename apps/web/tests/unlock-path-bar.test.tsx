import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { UnlockPathBar } from "@/src/components/layout/UnlockPathBar";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/baseline",
  useRouter: () => ({
    push,
  }),
}));

describe("UnlockPathBar", () => {
  it("shows CURRENT only for the active stage and omits the redundant helper label", () => {
    render(
      <UnlockPathBar
        currentPathname="/baseline"
        baselineReady={false}
        analysisExists={false}
        score={null}
        readinessStatus={null}
        hasGeneratedDocuments={false}
        hasSavedOpportunity={false}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Unlock Path" });
    const baselineCard = within(nav).getAllByRole("button")[0];
    expect(within(baselineCard).getByText("CURRENT")).toBeInTheDocument();
    expect(within(baselineCard).queryByText("You are here")).toBeNull();
  });
});
