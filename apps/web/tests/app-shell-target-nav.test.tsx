import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

import { AppShell } from "@/src/components/layout/AppShell";
import { mockPathname, mockRouterPush } from "@/tests/setup";
import { setFetchImplementation } from "@/tests/setup";

vi.mock("@/app/(app)/lib/session", async () => {
  const actual = await vi.importActual<typeof import("@/app/(app)/lib/session")>("@/app/(app)/lib/session");
  return {
    ...actual,
    readLastAnalysis: () => ({
      savedAt: "2026-04-18T00:00:00.000Z",
      analysis: { score: null },
      baselineId: "base-active",
      jobSource: { type: "unknown" },
      fitScore: null,
    }),
  };
});

vi.mock("@/src/components/layout/TopNavAccountArea", () => ({
  TopNavAccountArea: () => null,
}));

vi.mock("@/src/components/layout/BetaGuideNudge", () => ({
  BetaGuideNudge: () => null,
}));

vi.mock("@/src/components/support/ReportBugProvider", () => ({
  ReportBugProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ReportBugTrigger: () => null,
}));

vi.mock("@/src/lib/baseline-sync", () => ({
  subscribeBaselineUpdated: () => () => {},
}));

describe("AppShell unlock path navigation", () => {
  it("routes Target rail click to /target with the active baseline when on /baseline", async () => {
    mockPathname.mockReturnValue("/baseline");

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/baselines")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "base-active", isActive: true }],
          text: async () => "[]",
        } as Response;
      }
      if (url.includes("/api/jobs")) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
          text: async () => "[]",
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <AppShell userEmail="test@example.com">
        <div>Child</div>
      </AppShell>,
    );

    const rail = await screen.findByTestId("unlock-path-bar");
    const nav = within(rail).getByRole("navigation", { name: "Unlock Path" });
    const targetButton = within(nav).getByRole("button", { name: /Target/i });
    fireEvent.click(targetButton);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/target?baselineId=base-active");
    });
  });
});
