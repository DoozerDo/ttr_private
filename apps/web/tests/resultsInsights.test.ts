import {
  buildStrategicBrief,
  buildReasonSummary,
  mapComplianceFlags,
  sanitizeGapMessage,
  sortComplianceFlagsBySeverity,
} from "@/lib/resultsInsights";
import { FALLBACK_RENDERED_TEXT } from "@/lib/renderedText";

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
    expect(brief.whatMayHurtYou[0].isCriticalRequirement).toBe(false);
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
    expect(["Hard Gap", "Soft Gap"]).toContain(risk.riskType);
    expect(typeof risk.detail).toBe("string");
    expect(risk.detail).toMatch(/This role explicitly calls for|The job description prioritizes/);
    expect(risk.detail).toContain("Own enterprise customer incident response for high-severity escalations");
    expect(risk.detail).toMatch(/adjacent evidence|direct ownership yet/);
    expect(risk.isCriticalRequirement).toBe(true);
    if (risk.impactLine) {
      expect(risk.impactLine).toMatch(/materially affect candidacy|affect candidacy/);
    }
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

  it("does not emit candidacy signal for non-critical or non-hard risks", () => {
    const brief = buildStrategicBrief({
      verdict: "Borderline",
      strengths: ["Operations"],
      criticalGaps: [
        {
          title: "Tool Adoption",
          requirementEvidence: "Improve team adoption of support tools",
          baselineEvidence: "Led tooling onboarding sessions",
          severityScore: 0.79,
        },
        {
          title: "Process Reporting",
          requirementEvidence: "Track weekly KPI reporting for support queues",
          baselineEvidence: null,
          severityScore: 0.55,
        },
      ],
    });

    expect(brief.whatMayHurtYou[0].impactLine).toBeUndefined();
    expect(brief.whatMayHurtYou[1].impactLine).toBeUndefined();
    expect(brief.whatMayHurtYou.every((risk) => !risk.isCriticalRequirement || !risk.impactLine)).toBe(true);
  });

  it("limits candidacy impact signal to one risk even when multiple qualify", () => {
    const brief = buildStrategicBrief({
      verdict: "Skip",
      strengths: ["Operations"],
      criticalGaps: [
        {
          title: "AI Support Tooling",
          requirementEvidence: "Own AI support tooling strategy and establish governance",
          baselineEvidence: null,
          severityScore: 0.92,
        },
        {
          title: "Incident Command",
          requirementEvidence: "Lead enterprise customer incident response and drive escalation command",
          baselineEvidence: null,
          severityScore: 0.9,
        },
        {
          title: "Global Support Design",
          requirementEvidence: "Build global support operations model across regions",
          baselineEvidence: null,
          severityScore: 0.88,
        },
      ],
    });

    const signaled = brief.whatMayHurtYou.filter((risk) => Boolean(risk.impactLine));
    expect(signaled.length).toBeLessThanOrEqual(1);
    expect(signaled.every((risk) => risk.isCriticalRequirement)).toBe(true);
  });

  it("sanitizes malformed helper output before it can reach the UI", () => {
    const brief = buildStrategicBrief({
      verdict: "Apply",
      strengths: ["{{broken strength}}"],
      criticalGaps: [
        {
          title: "{{broken title}}",
          requirementEvidence: "${unfinished",
          baselineEvidence: null,
          severityScore: 0.82,
        },
      ],
      verdictExplanation: "{{bad verdict}}",
    });

    expect(brief.whatMayHurtYou[0].title).toBe(FALLBACK_RENDERED_TEXT);
    expect(brief.whatMayHurtYou[0].detail).not.toContain("{{broken");
    expect(brief.whatMayHurtYou[0].detail).not.toContain("${unfinished");
    expect(brief.strategicSummary).not.toContain("{{broken");
    expect(brief.bestNextMove).not.toEqual(FALLBACK_RENDERED_TEXT);
  });
});
