import { describe, expect, it } from "vitest";

import { deriveEvidenceLedger } from "@/lib/evidenceLedger";

describe("deriveEvidenceLedger", () => {
  it("returns clean top evidence entries from analysis payload", () => {
    const ledger = deriveEvidenceLedger({
      supportingSignals: ["Led support operations", { label: "Owned escalation workflows" }],
      baselineEvidence: ["Improved SLA compliance by 18%"],
      verification_coverage: { unverifiedRequirements: ["Five9"] },
    });

    expect(ledger.entries.length).toBe(3);
    expect(ledger.entries[0]?.sourceLabel).toBe("Verified baseline");
    expect(ledger.remainingWeakAreas).toEqual(["Five9"]);
  });

  it("de-duplicates duplicate evidence lines", () => {
    const ledger = deriveEvidenceLedger({
      supportingSignals: ["Led support operations", "Led support operations  "],
      baselineEvidence: "Led support operations",
    });

    expect(ledger.entries.length).toBe(1);
  });

  it("marks added via gap resolution only when provenance is explicit", () => {
    const ledger = deriveEvidenceLedger({
      supportingSignals: [{ label: "Added proof", source: "interview-record" }],
    });

    expect(ledger.entries[0]?.sourceLabel).toBe("Added via gap resolution");
  });

  it("returns empty ledger without inventing data", () => {
    const ledger = deriveEvidenceLedger({});
    expect(ledger.entries).toEqual([]);
  });
});
