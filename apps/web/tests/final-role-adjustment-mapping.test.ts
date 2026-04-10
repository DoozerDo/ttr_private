import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@shared/documentStrategyPlan";
import {
  resolveRoleMatchFinalAdjustmentPreset,
  type RoleMatchFinalAdjustment,
} from "@shared/roleMatchFinalPass";

function buildPlan() {
  const plan = buildDocumentStrategyPlan({
    fitScore: 81,
    jobTitle: "Support Operations Manager",
    jobCompany: "Acme",
    jobDescription:
      "Support operations, incident response, process architecture, and role-specific customer experience leadership.",
    jobRequirements: ["Support operations", "Incident response", "Process architecture"],
    jobResponsibilities: ["Lead support operations", "Improve incident response"],
    baselineSections: [
      {
        id: "section-1",
        title: "Support Operations",
        sectionType: "EXPERIENCE",
        content: "Led support operations and improved SLA adherence.",
      },
      {
        id: "section-2",
        title: "Cover Letter Context",
        sectionType: "EXPERIENCE",
        content: "Partnered with product and engineering on customer experience priorities.",
      },
    ],
  });

  plan.roleLens.priorities = ["support operations", "incident response", "process architecture"];
  plan.roleLens.requiredSignals = ["support operations", "incident response", "process architecture"];
  plan.roleLens.targetKeywords = ["support operations", "incident response", "process architecture"];
  plan.selectedEvidence = [
    {
      baselineSection: "Support Operations",
      sourceId: "section-1",
      matchedSignals: ["support operations"],
      whySelected: "Core evidence.",
      approvedClaims: ["Improved SLA adherence"],
      rank: 1,
      score: 99,
    },
  ];
  plan.documentQualityScore = 83;
  plan.qualityPass.emphasisConfidence = "medium";
  return plan;
}

describe("final role adjustment mapping", () => {
  it("maps final-pass issues to safe refinement presets", () => {
    const plan = buildPlan();

    const summaryAdjustment: RoleMatchFinalAdjustment = {
      label: "Tighten the summary",
      type: "summary_tighten",
      target: "resume",
    };
    const bulletAdjustment: RoleMatchFinalAdjustment = {
      label: "Reorder bullets to surface the strongest proof",
      type: "bullet_reorder",
      target: "resume",
    };
    const keywordAdjustment: RoleMatchFinalAdjustment = {
      label: "Tighten role keywords naturally",
      type: "keyword_tighten",
      target: "both",
    };
    const coverAdjustment: RoleMatchFinalAdjustment = {
      label: "Focus the cover letter on this role",
      type: "cover_letter_role_focus",
      target: "cover_letter",
    };

    expect(resolveRoleMatchFinalAdjustmentPreset({ plan, resumeModel: null, coverLetterParagraphs: [] }, summaryAdjustment)?.key).toBe("tighten-summary");
    expect(resolveRoleMatchFinalAdjustmentPreset({ plan, resumeModel: null, coverLetterParagraphs: [] }, bulletAdjustment)?.key).toBe("strengthen-impact");
    expect(resolveRoleMatchFinalAdjustmentPreset({ plan, resumeModel: null, coverLetterParagraphs: [] }, keywordAdjustment)?.key).toBe("emphasize-operations");
    expect(resolveRoleMatchFinalAdjustmentPreset({ plan, resumeModel: null, coverLetterParagraphs: [] }, coverAdjustment)?.key).toBe("cover-role-fit");
  });
});

