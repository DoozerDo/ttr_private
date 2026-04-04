import {
  buildFileStalenessAuditSummaryText,
  buildPersistedSnapshot,
  getAuditReminderStatus,
  getCandidateReason,
  getCandidateTag,
  matchesAuditQuery,
} from "@/src/lib/fileStalenessAudit.shared";

describe("fileStalenessAudit UX helpers", () => {
  it("classifies reminder status by days since last audit", () => {
    expect(getAuditReminderStatus(null)).toBe("first_run");
    expect(getAuditReminderStatus(0)).toBe("healthy");
    expect(getAuditReminderStatus(30)).toBe("healthy");
    expect(getAuditReminderStatus(31)).toBe("due_soon");
    expect(getAuditReminderStatus(44)).toBe("due_soon");
    expect(getAuditReminderStatus(45)).toBe("overdue");
  });

  it("builds a persisted snapshot from a scan result", () => {
    const snapshot = buildPersistedSnapshot({
      scannedAt: "2026-04-01T00:00:00.000Z",
      repoRoot: "C:/repo",
      summary: {
        active: 1,
        dormant: 2,
        stale: 3,
        cold: 4,
        totalScanned: 10,
        totalExcluded: 5,
      },
      records: [],
      excludedPaths: [],
    });

    expect(snapshot).toEqual({
      lastAuditRunAt: "2026-04-01T00:00:00.000Z",
      repoRoot: "C:/repo",
      summary: {
        active: 1,
        dormant: 2,
        stale: 3,
        cold: 4,
        totalScanned: 10,
        totalExcluded: 5,
      },
    });
  });

  it("generates cleanup summary copy text", () => {
    const text = buildFileStalenessAuditSummaryText({
      scannedAt: "2026-04-01T00:00:00.000Z",
      summary: {
        active: 1,
        dormant: 2,
        stale: 3,
        cold: 4,
        totalScanned: 10,
        totalExcluded: 5,
      },
      candidatesCount: 2,
    });

    expect(text).toContain("File Staleness Audit");
    expect(text).toContain("Likely cleanup candidates: 2");
  });

  it("matches search across path segments and filename", () => {
    expect(matchesAuditQuery({ relativePath: "scripts/old/prototype-note.md", extension: ".md" }, "proto")).toBe(true);
    expect(matchesAuditQuery({ relativePath: "docs/notes/archive-plan.txt", extension: ".txt" }, "archive")).toBe(true);
    expect(matchesAuditQuery({ relativePath: "apps/web/page.tsx", extension: ".tsx" }, "tsx")).toBe(true);
  });

  it("tags review candidates and explains why they are flagged", () => {
    const record = {
      relativePath: "scripts/legacy/final-final-export.csv",
      lastModifiedAt: "2025-01-01T00:00:00.000Z",
      ageDays: 140,
      bucket: "COLD" as const,
      extension: ".csv",
      kind: "file" as const,
      sizeBytes: 100,
    };

    expect(getCandidateTag(record)).toBe("Strong review candidate");
    expect(getCandidateReason(record)).toMatch(/Older than 90 days/);
    expect(getCandidateReason(record)).toMatch(/leftover-style filename|common review file type/i);
  });
});
