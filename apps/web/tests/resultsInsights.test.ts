import {
  buildReasonSummary,
  mapComplianceFlags,
  sanitizeGapMessage,
  sortComplianceFlagsBySeverity,
} from "@/lib/resultsInsights";

describe("results insights helpers", () => {
  it("sanitizes internal gap descriptors", () => {
    expect(sanitizeGapMessage("Leadership signal is muted")).toBe(
      "Leadership contributions feel understated",
    );
  });

  it("builds the top two strengths + one gap", () => {
    const summary = buildReasonSummary(["impact", "operations"], [
      "Leadership signal is muted",
      "Missing required tools: go",
    ]);

    expect(summary.primary).toEqual([
      { type: "strength", message: "impact" },
      { type: "strength", message: "operations" },
      { type: "gap", message: "Leadership contributions feel understated" },
    ]);

    expect(summary.extras).toEqual([
      { type: "gap", message: "Missing required tools: go" },
    ]);
  });

  it("maps compliance flag text to severity and sorts correctly", () => {
    const mapped = mapComplianceFlags([
      "Baseline too short for reliable scoring",
      "Platform mismatch detected",
    ]);

    expect(mapped[0].severity).toBe("warn");
    expect(mapped[1].severity).toBe("block");

    const sorted = sortComplianceFlagsBySeverity(mapped);
    expect(sorted[0].severity).toBe("block");
    expect(sorted[1].severity).toBe("warn");
  });
});
