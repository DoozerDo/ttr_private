import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  classifyFileAge,
  getLikelyCleanupCandidates,
  getUniqueExtensions,
} from "@/src/lib/fileStalenessAudit.shared";

vi.mock("server-only", () => ({}), { virtual: true });

import { runFileStalenessAudit } from "@/src/lib/fileStalenessAudit";

describe("fileStalenessAudit", () => {
  it("classifies file age buckets at the expected thresholds", () => {
    expect(classifyFileAge(0)).toBe("ACTIVE");
    expect(classifyFileAge(30)).toBe("ACTIVE");
    expect(classifyFileAge(31)).toBe("DORMANT");
    expect(classifyFileAge(60)).toBe("DORMANT");
    expect(classifyFileAge(61)).toBe("STALE");
    expect(classifyFileAge(90)).toBe("STALE");
    expect(classifyFileAge(91)).toBe("COLD");
  });

  it("scans repo-style roots, normalizes relative paths, and excludes noise directories", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "file-staleness-audit-"));
    const now = new Date("2026-04-01T12:00:00.000Z");

    await fs.mkdir(path.join(repoRoot, "src", "nested"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, "node_modules", "ignored"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, "dist"), { recursive: true });

    const activeFile = path.join(repoRoot, "src", "nested", "active.ts");
    const dormantFile = path.join(repoRoot, "src", "stale-note.md");
    const coldFile = path.join(repoRoot, ".env.local");
    const excludedFile = path.join(repoRoot, "node_modules", "ignored", "skip.js");

    await fs.writeFile(activeFile, "console.log('active');");
    await fs.writeFile(dormantFile, "# note");
    await fs.writeFile(coldFile, "SECRET=hidden");
    await fs.writeFile(excludedFile, "ignored");

    const activeTime = new Date("2026-03-25T12:00:00.000Z");
    const dormantTime = new Date("2026-02-28T12:00:00.000Z");
    const coldTime = new Date("2025-12-01T12:00:00.000Z");
    await fs.utimes(activeFile, activeTime, activeTime);
    await fs.utimes(dormantFile, dormantTime, dormantTime);
    await fs.utimes(coldFile, coldTime, coldTime);

    const result = await runFileStalenessAudit(repoRoot, { now, maxDepth: 6 });

    expect(result.records.map((record) => record.relativePath)).toEqual([
      ".env.local",
      "src/stale-note.md",
      "src/nested/active.ts",
    ]);
    expect(result.records[0].kind).toBe("env");
    expect(result.records[0].sizeBytes).toBeNull();
    expect(result.records[1].bucket).toBe("DORMANT");
    expect(result.records[2].bucket).toBe("ACTIVE");
    expect(result.summary.active).toBe(1);
    expect(result.summary.dormant).toBe(1);
    expect(result.summary.cold).toBe(1);
    expect(result.summary.totalExcluded).toBeGreaterThanOrEqual(2);
    expect(result.excludedPaths.some((entry) => entry.includes("node_modules"))).toBe(true);
  });

  it("returns cleanup candidates for cold files in suspicious locations", () => {
    const candidates = getLikelyCleanupCandidates([
      {
        relativePath: "scripts/old-prototype.mjs",
        lastModifiedAt: "2025-01-01T00:00:00.000Z",
        ageDays: 120,
        bucket: "COLD",
        extension: ".mjs",
        kind: "file",
        sizeBytes: 123,
      },
      {
        relativePath: "apps/web/app/(app)/admin/notes.txt",
        lastModifiedAt: "2025-01-01T00:00:00.000Z",
        ageDays: 120,
        bucket: "COLD",
        extension: ".txt",
        kind: "file",
        sizeBytes: 45,
      },
      {
        relativePath: "apps/web/app/(app)/admin/recent.ts",
        lastModifiedAt: "2026-03-20T00:00:00.000Z",
        ageDays: 10,
        bucket: "ACTIVE",
        extension: ".ts",
        kind: "file",
        sizeBytes: 12,
      },
    ]);

    expect(candidates.map((record) => record.relativePath)).toEqual([
      "scripts/old-prototype.mjs",
      "apps/web/app/(app)/admin/notes.txt",
    ]);
  });

  it("collects unique extensions for extension filtering", () => {
    expect(
      getUniqueExtensions([
        { relativePath: "a.ts", lastModifiedAt: "", ageDays: 1, bucket: "ACTIVE", extension: ".ts", kind: "file", sizeBytes: 1 },
        { relativePath: "b.md", lastModifiedAt: "", ageDays: 1, bucket: "ACTIVE", extension: ".md", kind: "file", sizeBytes: 1 },
        { relativePath: "c.ts", lastModifiedAt: "", ageDays: 1, bucket: "ACTIVE", extension: ".ts", kind: "file", sizeBytes: 1 },
      ]),
    ).toEqual([".md", ".ts"]);
  });
});
