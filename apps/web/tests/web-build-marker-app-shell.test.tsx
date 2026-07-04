import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { mockPathname } from "@/tests/setup";

vi.mock("@/app/(app)/lib/session", async () => {
  const actual = await vi.importActual<typeof import("@/app/(app)/lib/session")>(
    "@/app/(app)/lib/session",
  );
  return {
    ...actual,
    readLastAnalysis: () => null,
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AppShell production build marker diagnostic", () => {
  it("renders the explicit production build-identity diagnostic instead of crashing when the marker is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GIT_SHA", "");
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_SHA", "");
    mockPathname.mockReturnValue("/baseline");

    vi.resetModules();
    const { AppShell } = await import("@/src/components/layout/AppShell");

    render(
      <AppShell userEmail="test@example.com">
        <div data-testid="baseline-route-root">Child</div>
      </AppShell>,
    );

    expect(screen.getByTestId("web-build-marker-diagnostic")).toHaveTextContent(
      /Production build identity unavailable/i,
    );
    expect(screen.getByTestId("baseline-route-root")).toBeInTheDocument();
  });
});
