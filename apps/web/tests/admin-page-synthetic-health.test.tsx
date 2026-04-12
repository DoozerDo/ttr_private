import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/(app)/admin/SyntheticHealthCard", () => ({
  default: () => <div data-testid="synthetic-health-card" />,
}));

vi.mock("@/src/lib/fileStalenessAudit", () => ({
  getFileStalenessHygieneStatus: () => ({ daysSinceLastRun: null, insight: { label: "Healthy", detail: "ok" } }),
  readPersistedFileStalenessAuditSnapshot: async () => ({ summary: { cold: 0 }, likelyCleanupCandidates: 0 }),
}));

vi.mock("@/src/lib/hygieneAudit", () => ({
  runHygieneAudit: async () => ({
    deadCode: { summary: { totalCandidates: 0, strongCandidates: 0 } },
    routes: { summary: { totalCandidates: 0, strongCandidates: 0 } },
  }),
}));

import AdminPage from "../app/(app)/admin/page";

describe("AdminPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the synthetic health card on the admin page", async () => {
    const element = await AdminPage();
    render(element);

    expect(screen.getByTestId("synthetic-health-card")).toBeInTheDocument();
  });
});
