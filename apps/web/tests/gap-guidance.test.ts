import { describe, expect, it } from "vitest";

import { mapGapToUserGuidance } from "@/lib/userGuidance";

describe("gap guidance formatter", () => {
  it("translates raw gap metadata into user-safe guidance", () => {
    const result = mapGapToUserGuidance({
      requirement: "Category: Context",
      categoryLabel: "Domain: experience",
      domainLabel: "Confidence: medium",
      confidenceLabel: "2f9a7f4e-1d3c-4cf4-bc4f-4b8a9a2a0c12",
      baselineEvidence: "Gap 2668f0de-3886-447f-a592-d5c556ba5391",
      supportingSignals: ["Led a support team of 12", "Owned escalations"],
      summary: "WHAT CONTEXT SURROUNDED ANY WORK YOU HAVE DONE RELATED TO THIS, IF APPLICABLE?",
    });

    expect(result.title).toMatch(/strengthen|add|clarify|show/i);
    expect(result.description).not.toMatch(/category:|domain:|confidence:|2668f0de-3886-447f-a592-d5c556ba5391/i);
    expect(result.whyItMatters ?? "").not.toMatch(/category:|domain:|confidence:/i);
    expect(result.examplePrompt ?? "").not.toMatch(/category:|domain:|confidence:|if applicable/i);
  });

  it("falls back to safe generic guidance when the input is incomplete", () => {
    const result = mapGapToUserGuidance({
      requirement: "",
      categoryLabel: "",
      domainLabel: "",
      baselineEvidence: "",
      supportingSignals: [],
      summary: "",
      fallbackTitle: "Strengthen this example",
    });

    expect(result.title).toBe("Strengthen this example");
    expect(result.description).toContain("real experience");
    expect(result.description).not.toMatch(/category:|domain:|confidence:|gap id/i);
    expect(result.examplePrompt ?? "").not.toMatch(/category:|domain:|confidence:|uuid/i);
  });
});
