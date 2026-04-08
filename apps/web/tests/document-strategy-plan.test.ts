import { describe, expect, it } from "vitest";

import {
  buildDocumentStrategyPlan,
  buildDocumentStrategyPlanSummary,
} from "@/lib/documentStrategyPlan";

describe("document strategy plan", () => {
  it("derives a role lens, selects aligned evidence, and records suppression notes", () => {
    const plan = buildDocumentStrategyPlan({
      fitScore: 84,
      jobTitle: "Director of Support",
      jobCompany: "Acme",
      jobDescription:
        "Lead support operations, workflow design, and cross-functional coordination for a SaaS platform with high volume service delivery.",
      jobRequirements: [
        "Own process and workflow improvements.",
        "Partner with product and engineering.",
      ],
      analysisSummary: "Strong fit for support operations leadership.",
      baselineSections: [
        {
          id: "section-1",
          title: "Support Operations",
          sectionType: "EXPERIENCE",
          content:
            "Led support operations programs, improved workflows, and partnered with product and engineering on service delivery.",
        },
        {
          id: "section-2",
          title: "People Leadership",
          sectionType: "EXPERIENCE",
          content: "Managed a team of 12 and hired new support managers.",
        },
        {
          id: "section-3",
          title: "Education",
          sectionType: "EDUCATION",
          content: "State University, BA",
        },
      ],
    });

    expect(plan.fitBand).toBe("strong");
    expect(plan.roleLens.titleFamily).toBe("Customer Operations / Support Strategy");
    expect(plan.roleLens.seniority).toBe("senior leadership");
    expect(plan.positioningFrame).toBe("Incident and service delivery leader");
    expect(plan.selectedEvidence.length).toBeGreaterThan(0);
    expect(plan.selectedEvidence[0].baselineSection).toBe("Support Operations");
    expect(plan.selectedEvidence[0].approvedClaims.join(" ")).toContain("support operations");
    expect(plan.summaryStrategy).toContain("lead with Incident and service delivery leader");
    expect(plan.suppressionNotes.length).toBeGreaterThan(0);

    const summary = buildDocumentStrategyPlanSummary(plan);
    expect(summary.positioning).toBe("Incident and service delivery leader");
    expect(summary.evidence).toContain("Support Operations");
  });

  it("falls back to a human-safe strategy when the baseline is sparse", () => {
    const plan = buildDocumentStrategyPlan({
      fitScore: 68,
      jobTitle: "Operations Manager",
      jobCompany: "Acme",
      jobDescription: "Coordinate support operations and process improvements.",
      baselineSections: [],
    });

    expect(plan.fitBand).toBe("borderline");
    expect(plan.positioningFrame).toBeTruthy();
    expect(plan.selectedEvidence).toEqual([]);
    expect(plan.summaryStrategy).toContain("keep lower-relevance background out of the opening story");
    expect(plan.suppressionNotes.length).toBeGreaterThan(0);
  });
});
