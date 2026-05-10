import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runHygieneAudit } from "@/src/lib/hygieneAudit";
import { formatHygieneSummaryText } from "@/src/lib/hygieneAudit.shared";

describe("hygiene audit", () => {
  it("finds dead code and route drift review candidates deterministically", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hygiene-audit-"));
    await fs.mkdir(path.join(repoRoot, "src", "components"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, "apps", "web", "app", "legacy"), { recursive: true });

    await fs.writeFile(path.join(repoRoot, "src", "components", "old.copy.tsx"), "export const OldCopy = 1;");
    await fs.writeFile(path.join(repoRoot, "apps", "web", "app", "legacy", "page.tsx"), "export default function Page(){return null;}");
    // This creates a fixture import path inside the temporary repo (it is not an import in this test file).
    await fs.writeFile(path.join(repoRoot, "src", "index.ts"), "export * from './components/old.copy';");

    const now = new Date("2026-04-04T00:00:00.000Z");
    const audit = await runHygieneAudit(repoRoot, now);

    expect(audit.deadCode.summary.totalCandidates).toBeGreaterThanOrEqual(1);
    expect(audit.routes.summary.totalCandidates).toBeGreaterThanOrEqual(1);
    expect(audit.deadCode.candidates.some((candidate) => candidate.path.includes("old.copy.tsx"))).toBe(true);
    expect(formatHygieneSummaryText("Dead Code Review", audit.scannedAt, audit.deadCode.summary)).toContain("Total candidates");
  });
});
