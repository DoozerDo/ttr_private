import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/src/lib/fileStalenessAudit", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/fileStalenessAudit.shared")>(
    "@/src/lib/fileStalenessAudit.shared",
  );
  return {
    ...actual,
    readPersistedFileStalenessAuditSnapshot: vi.fn(),
    getFileStalenessHygieneStatus: actual.getFileStalenessHygieneStatus,
  };
});

vi.mock("@/src/lib/hygieneAudit", () => ({
  runHygieneAudit: vi.fn().mockResolvedValue({
    scannedAt: "2026-04-04T00:00:00.000Z",
    deadCode: {
      summary: { totalCandidates: 3, strongCandidates: 1, byCategory: { "not found in import graph": 2 } },
      candidates: [],
    },
    routes: {
      summary: { totalCandidates: 2, strongCandidates: 0, byCategory: { "no discovered internal links": 2 } },
      candidates: [],
    },
  }),
}));

import { getFileStalenessHygieneStatus, readPersistedFileStalenessAuditSnapshot } from "@/src/lib/fileStalenessAudit";
import { HygieneStatusModule } from "@/app/(app)/admin/file-staleness-audit/HygieneStatusModule";
import AdminLayout from "@/app/(app)/admin/layout";
import AdminPage from "@/app/(app)/admin/page";

describe("admin hygiene status", () => {
  it("classifies reminder status and insights from persisted audit metadata", () => {
    const status = getFileStalenessHygieneStatus(
      {
        lastAuditRunAt: "2026-02-10T00:00:00.000Z",
        repoRoot: "C:/repo",
        summary: {
          active: 12,
          dormant: 4,
          stale: 7,
          cold: 27,
          totalScanned: 50,
          totalExcluded: 8,
        },
        likelyCleanupCandidates: 6,
      },
      new Date("2026-04-04T00:00:00.000Z"),
    );

    expect(status.reminderStatus).toBe("overdue");
    expect(status.daysSinceLastRun).toBeGreaterThanOrEqual(45);
    expect(status.insight.label).toBe("High cleanup opportunity");
  });

  it("renders the hygiene module with the run CTA and insight line", () => {
    render(
      <HygieneStatusModule
        snapshot={{
          lastAuditRunAt: "2026-04-01T10:00:00.000Z",
          repoRoot: "C:/repo",
          summary: {
            active: 9,
            dormant: 2,
            stale: 3,
            cold: 0,
            totalScanned: 14,
            totalExcluded: 5,
          },
          likelyCleanupCandidates: 0,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "File Staleness" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run Audit" })).toHaveAttribute("href", "/admin/file-staleness-audit");
    expect(screen.getByText("Light drift")).toBeInTheDocument();
    expect(screen.getByText("3 stale files, worth a monthly pass")).toBeInTheDocument();
  });

  it("shows the overdue repo hygiene banner in the admin layout when the audit is stale", async () => {
    vi.mocked(readPersistedFileStalenessAuditSnapshot).mockResolvedValueOnce({
      lastAuditRunAt: "2026-02-01T00:00:00.000Z",
      repoRoot: "C:/repo",
      summary: {
        active: 1,
        dormant: 2,
        stale: 3,
        cold: 4,
        totalScanned: 10,
        totalExcluded: 5,
      },
      likelyCleanupCandidates: 2,
    });

    const tree = await AdminLayout({ children: <div>Admin content</div> });
    render(tree);
    expect(screen.getByText("Repo hygiene overdue. Review stale and cold files.")).toBeInTheDocument();
  });

  it("renders the hygiene module on the admin landing page", async () => {
    vi.mocked(readPersistedFileStalenessAuditSnapshot).mockResolvedValueOnce({
      lastAuditRunAt: "2026-04-01T10:00:00.000Z",
      repoRoot: "C:/repo",
      summary: {
        active: 9,
        dormant: 2,
        stale: 3,
        cold: 0,
        totalScanned: 14,
        totalExcluded: 5,
      },
      likelyCleanupCandidates: 0,
    });

    const tree = await AdminPage();
    render(tree);

    expect(screen.getByText("Hygiene Status")).toBeInTheDocument();
    expect(screen.getByText(/Repository hygiene/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run File Audit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Dead Code" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Routes" })).toBeInTheDocument();
  });
});
