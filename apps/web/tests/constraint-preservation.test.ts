import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@shared/documentStrategyPlan";
import {
  buildLanguageStylePass,
  polishResumeBulletsText,
  polishResumeSummaryText,
} from "@shared/languageStylePass";

describe("constraint preservation", () => {
  it("preserves positioning, chronology, and factual content while polishing language", () => {
    const plan = buildDocumentStrategyPlan({
      fitScore: 88,
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

    const pass = buildLanguageStylePass({
      plan,
      roleLabel: "Director of Support Operations",
      resumeSummary:
        "Results-driven leader with a proven track record of delivering support operations improvements.",
      resumeBullets: [
        "2019: Led support operations programs and improved workflow quality.",
        "2020: Partnered with engineering on service delivery.",
      ],
    });

    const summary = polishResumeSummaryText(
      "Results-driven leader with a proven track record of delivering support operations improvements.",
      { plan, roleLabel: "Director of Support Operations" },
      pass,
    );
    const bullets = polishResumeBulletsText(
      [
        "2019: Led support operations programs and improved workflow quality.",
        "2020: Partnered with engineering on service delivery.",
      ],
      pass,
    );

    expect(summary).toContain(plan.positioningFrame);
    expect(bullets[0]).toContain("2019");
    expect(bullets[1]).toContain("2020");
    expect(bullets.join(" ")).not.toContain("50%");
  });
});

