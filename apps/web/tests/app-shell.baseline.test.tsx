import { render, screen, waitFor } from "@testing-library/react";

import { AppShell, filterJourneyNavStateForPath } from "@/src/components/layout/AppShell";
import { resolveJourneyNavStateFromPathname } from "@/src/lib/journeyNav";
import { mockPathname, setFetchImplementation } from "@/tests/setup";

const createResponse = (body: unknown, ok = true, status = ok ? 200 : 401) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

describe("AppShell baseline behavior", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/baseline");
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/users/me")) {
        return createResponse({ email: "user@example.com" });
      }
      if (url.includes("/api/baselines") || url.includes("/api/jobs")) {
        return createResponse([]);
      }
      return createResponse({});
    });
  });

  it("does not render the sidebar on the baseline page", async () => {
    const { container } = render(
      <AppShell userEmail="user@example.com">
        <div>content</div>
      </AppShell>,
    );
    await waitFor(() => {
      expect(screen.getByText("Session console")).toBeInTheDocument();
    });
    expect(container.querySelector("aside")).toBeNull();
  });
});

describe("filterJourneyNavStateForPath", () => {
  it("removes the Search Sets step when on the baseline path", () => {
    const baselineState = resolveJourneyNavStateFromPathname("/baseline");
    const filtered = filterJourneyNavStateForPath("/baseline", baselineState);
    expect(filtered.steps.some((step) => step.id === "searchSets")).toBe(false);

    const otherState = resolveJourneyNavStateFromPathname("/results");
    const reFiltered = filterJourneyNavStateForPath("/results", otherState);
    expect(reFiltered.steps.some((step) => step.id === "searchSets")).toBe(true);
  });
});
