import { describe, expect, it } from "vitest";

import { buildProgressSummary } from "@/lib/progressSummary";

describe("buildProgressSummary", () => {
  it("detects improvement when gaps are reduced and score increases", () => {
    const summary = buildProgressSummary(
      {
        score: 68,
        gaps: ["Zendesk", "Escalation management"],
      },
      {
        score: 78,
        gaps: ["Zendesk"],
      },
    );

    expect(summary.scoreChange).toBe(10);
    expect(summary.gapsClosed).toEqual(["Escalation management"]);
    expect(summary.gapsRemaining).toEqual(["Zendesk"]);
    expect(summary.gapsNew).toEqual([]);
    expect(summary.improvementDetected).toBe(true);
  });

  it("does not detect meaningful improvement when gaps are unchanged", () => {
    const summary = buildProgressSummary(
      {
        score: 74,
        gaps: ["Zendesk"],
      },
      {
        score: 74,
        gaps: ["Zendesk"],
      },
    );

    expect(summary.scoreChange).toBe(0);
    expect(summary.gapsClosed).toEqual([]);
    expect(summary.gapsRemaining).toEqual(["Zendesk"]);
    expect(summary.gapsNew).toEqual([]);
    expect(summary.improvementDetected).toBe(false);
  });
});
