import { buildScoreDelta, hasBaselineUpdated } from "@/lib/reanalysis";

describe("reanalysis helpers", () => {
  it("detects baseline updates with baselineVersionId", () => {
    expect(
      hasBaselineUpdated({ baselineVersionId: "version-1" }, "version-2"),
    ).toBe(true);
    expect(
      hasBaselineUpdated({ baselineVersionId: "version-1" }, "version-1"),
    ).toBe(false);
  });

  it("computes score delta and signal changes", () => {
    const delta = buildScoreDelta(
      {
        score: 68,
        strengths: ["Incident management", "Stakeholder comms"],
      },
      {
        score: 80,
        strengths: ["Incident management", "SLA ownership"],
      },
    );

    expect(delta.delta).toBe(12);
    expect(delta.newSignals).toEqual(["SLA ownership"]);
    expect(delta.lostSignals).toEqual(["Stakeholder comms"]);
    expect(delta.noImprovement).toBe(false);
  });

  it("flags no-improvement when score and signals do not change", () => {
    const delta = buildScoreDelta(
      {
        score: 72,
        strengths: ["Operational rigor"],
      },
      {
        score: 72,
        strengths: ["Operational rigor"],
      },
    );

    expect(delta.noImprovement).toBe(true);
  });
});

