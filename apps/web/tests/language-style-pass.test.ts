import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";
import {
  buildLanguageStylePass,
  polishCoverLetterParagraphsText,
  polishResumeBulletsText,
  polishResumeSummaryText,
} from "@/lib/languageStylePass";

function buildSamplePlan() {
  const plan = buildDocumentStrategyPlan({
    fitScore: 86,
    jobTitle: "Director of Support Operations",
    jobCompany: "Acme",
    jobDescription:
      "Lead support operations, process design, and cross-functional execution for a SaaS team.",
    jobRequirements: ["Lead support operations", "Process design", "Cross-functional execution"],
    baselineSections: [
      {
        id: "section-1",
        title: "Support Operations",
        sectionType: "EXPERIENCE",
        content:
          "Led support operations programs, improved workflow quality, and partnered with engineering on service delivery.",
      },
    ],
  });

  plan.resumeEmphasis = ["support operations rigor", "process design"];
  plan.coverLetterThemes = ["role fit", "business impact"];
  return plan;
}

describe("language style pass", () => {
  it("removes generic phrases while preserving the underlying meaning", () => {
    const plan = buildSamplePlan();
    const pass = buildLanguageStylePass({
      plan,
      roleLabel: "Director of Support Operations",
      resumeSummary:
        "Results-driven leader with a proven track record of delivering results across teams.",
      resumeBullets: [
        "Responsible for support operations and leveraged automation to improve workflows.",
      ],
      coverOpening:
        "I am excited to apply for this role and am passionate about delivering results.",
      coverParagraphs: ["I am excited to apply for this role and am passionate about delivering results."],
    });

    const summary = polishResumeSummaryText(
      "Results-driven leader with a proven track record of delivering results across teams.",
      {
        plan,
        roleLabel: "Director of Support Operations",
      },
      pass,
    );
    const bullets = polishResumeBulletsText(
      ["Responsible for support operations and leveraged automation to improve workflows."],
      pass,
    );
    const cover = polishCoverLetterParagraphsText(
      ["I am excited to apply for this role and am passionate about delivering results."],
      {
        plan,
        roleLabel: "Director of Support Operations",
      },
      pass,
    );

    expect(summary.toLowerCase()).not.toContain("results-driven");
    expect(summary.toLowerCase()).not.toContain("proven track record");
    expect(bullets[0]?.toLowerCase()).not.toContain("responsible for");
    expect(bullets[0]?.toLowerCase()).toContain("support operations");
    expect(cover[0]?.toLowerCase()).toContain("director of support operations");
    expect(pass.transformationsApplied.length).toBeGreaterThan(0);
  });
});
