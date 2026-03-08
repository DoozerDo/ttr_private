import {
  buildStrategicBrief,
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

  it("builds a strategic brief with grounded win and risk factors", () => {
    const brief = buildStrategicBrief({
      verdict: "Apply",
      verdictExplanation: "You are a strong match for this role.",
      strengths: ["Support Operations and Process Rigor"],
      criticalGaps: [
        {
          title: "AI Support Tooling Experience",
          requirementEvidence: "Experience implementing AI automation in support operations",
          baselineEvidence: "Led support workflow automation rollout across escalation queues",
          severityScore: 0.71,
        },
      ],
    });

    expect(brief.strategicSummary).toContain("Apply.");
    expect(brief.whyYouCanWin[0].detail).toContain("The role emphasizes");
    expect(brief.whatMayHurtYou[0].riskType).toBe("Soft Gap");
    expect(brief.whatMayHurtYou[0].detail).toContain("Experience implementing AI automation in support operations");
    expect(brief.whatMayHurtYou[0].detail).toContain("Led support workflow automation rollout across escalation queues");
    expect(brief.bestNextMove).toContain("Apply and tailor your resume");
  });

  it("uses stronger language for high-severity hard gaps and includes JD phrase", () => {
    const brief = buildStrategicBrief({
      verdict: "Skip",
      strengths: ["Support Leadership"],
      criticalGaps: [
        {
          title: "Enterprise Incident Response",
          requirementEvidence: "Own enterprise customer incident response for high-severity escalations",
          baselineEvidence: null,
          severityScore: 0.86,
        },
      ],
    });

    const risk = brief.whatMayHurtYou[0];
    expect(risk.riskType).toBe("Hard Gap");
    expect(risk.detail).toContain("This role explicitly calls for");
    expect(risk.detail).toContain("Own enterprise customer incident response for high-severity escalations");
    expect(risk.detail).toContain("does not currently show direct evidence");
  });

  it("produces meaningfully different risk explanations when job language and baseline evidence differ", () => {
    const jobA = buildStrategicBrief({
      verdict: "Borderline",
      strengths: ["Operations"],
      criticalGaps: [
        {
          title: "AI Tooling Ownership",
          requirementEvidence: "Operationalizing AI automation in support workflows",
          baselineEvidence: "Led workflow automation initiatives across support queues",
          severityScore: 0.68,
        },
      ],
    });

    const jobB = buildStrategicBrief({
      verdict: "Borderline",
      strengths: ["Operations"],
      criticalGaps: [
        {
          title: "Global Team Scaling",
          requirementEvidence: "Scaling global support teams across regions",
          baselineEvidence: "Managed queue coverage for a single regional support pod",
          severityScore: 0.68,
        },
      ],
    });

    const riskA = jobA.whatMayHurtYou[0].detail;
    const riskB = jobB.whatMayHurtYou[0].detail;

    expect(riskA).toContain("Operationalizing AI automation in support workflows");
    expect(riskB).toContain("Scaling global support teams across regions");
    expect(riskA).toContain("Led workflow automation initiatives across support queues");
    expect(riskB).toContain("Managed queue coverage for a single regional support pod");
    expect(riskA).not.toEqual(riskB);
  });
});
