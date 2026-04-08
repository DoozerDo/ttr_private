import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";
import { buildLanguageStylePass, polishCoverLetterParagraphsText } from "@/lib/languageStylePass";

describe("ai cadence detection", () => {
  it("flags repetitive sentence structures and rewrites the opening to read more naturally", () => {
    const plan = buildDocumentStrategyPlan({
      fitScore: 83,
      jobTitle: "Support Operations Manager",
      jobCompany: "Acme",
      jobDescription: "Lead support operations and process design.",
      jobRequirements: ["Lead support operations", "Process design"],
      baselineSections: [
        {
          id: "section-1",
          title: "Support Operations",
          sectionType: "EXPERIENCE",
          content: "Led support operations and improved workflow quality.",
        },
      ],
    });

    const pass = buildLanguageStylePass({
      plan,
      roleLabel: "Support Operations Manager",
      coverOpening: "I am excited to apply for this role. I am excited to bring my background. I am excited to contribute.",
      coverParagraphs: [
        "I am excited to apply for this role.",
        "I am excited to bring my background.",
        "I am excited to contribute.",
      ],
    });

    const polished = polishCoverLetterParagraphsText(
      [
        "I am excited to apply for this role.",
        "I am excited to bring my background.",
        "I am excited to contribute.",
      ],
      { plan, roleLabel: "Support Operations Manager" },
      pass,
    );

    expect(pass.issues.some((issue) => issue.type === "ai_cadence")).toBe(true);
    expect(polished[0]?.toLowerCase()).toContain("support operations manager");
    expect(polished[0]?.toLowerCase()).not.toContain("i am excited");
  });
});
