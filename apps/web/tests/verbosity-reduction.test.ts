import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";
import { buildLanguageStylePass, polishResumeBulletsText } from "@/lib/languageStylePass";

describe("verbosity reduction", () => {
  it("shortens verbose phrasing without losing the core meaning", () => {
    const plan = buildDocumentStrategyPlan({
      fitScore: 81,
      jobTitle: "Director of Support Operations",
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
      resumeBullets: [
        "Responsible for support operations in a highly collaborative environment with significant coordination across the team.",
      ],
    });

    const polished = polishResumeBulletsText(
      [
        "Responsible for support operations in a highly collaborative environment with significant coordination across the team.",
      ],
      pass,
    );

    expect(polished[0]?.length ?? 0).toBeLessThan(
      "Responsible for support operations in a highly collaborative environment with significant coordination across the team.".length,
    );
    expect(polished[0]?.toLowerCase()).toContain("support operations");
    expect(polished[0]?.toLowerCase()).not.toContain("responsible for");
    expect(polished[0]?.toLowerCase()).not.toContain("highly");
  });
});
