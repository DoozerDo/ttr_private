import { describe, expect, it } from "vitest";

import {
  buildEvidenceSuggestion,
  buildRequirementGapInsight,
  shouldSuppressCategorySuggestion,
} from "@/lib/evidenceSuggestions";

describe("evidence suggestion engine", () => {
  it("builds grounded suggestion when canonical signals exist", () => {
    const result = buildEvidenceSuggestion({
      requirement: "Zendesk",
      supportingSignals: ["Managed support workflows", "Escalation operations"],
      baselineEvidence: "Led support operations with process ownership.",
    });

    expect(result).not.toBeNull();
    expect(result?.requirement).toBe("Zendesk");
    expect(result?.description).toMatch(/Managed support workflows|Escalation operations/i);
    expect(result?.scope).toMatch(/Led support operations/i);
  });

  it("returns null when no grounded signals are available", () => {
    const result = buildEvidenceSuggestion({
      requirement: "Zendesk",
      supportingSignals: [],
      baselineEvidence: "",
    });
    expect(result).toBeNull();
  });

  it("returns null when the baseline already has strong evidence coverage", () => {
    const result = buildEvidenceSuggestion({
      requirement: "Leadership Scope",
      supportingSignals: [
        "Led a 24-person team across three regions",
        "Managed multi-site support operations",
        "Owned $2.4M annual operations budget",
      ],
      baselineEvidence: "High confidence verified leadership scope evidence.",
    });

    expect(result).toBeNull();
  });

  it("builds a requirement-level gap insight from requirement and baseline evidence", () => {
    const result = buildRequirementGapInsight({
      requirement: "Leadership Scope",
      requirementEvidence: "Org-wide ownership across multiple functions",
      baselineEvidence: "Led a 24-person team across three regions",
      summary: "Strong operational leadership across support functions.",
    });

    expect(result).not.toBeNull();
    expect(result?.requirement).toBe("Leadership Scope");
    expect(result?.explanation).toMatch(/org-wide ownership across multiple functions/i);
    expect(result?.currentSignal).toMatch(/Led a 24-person team across three regions/i);
  });

  it("suppresses category suggestions when strong evidence already exists", () => {
    expect(
      shouldSuppressCategorySuggestion({
        categoryLabel: "Leadership Scope",
        supportingSignals: [
          "Led a 24-person team across three regions",
          "Managed multi-site support operations",
          "Owned $2.4M annual operations budget",
        ],
        baselineEvidence: "High confidence verified leadership scope evidence.",
      }),
    ).toBe(true);
    expect(
      shouldSuppressCategorySuggestion({
        categoryLabel: "Support Operations",
        supportingSignals: [
          "Led a 24-person team across three regions",
          "Managed multi-site support operations",
          "Owned $2.4M annual operations budget",
        ],
        baselineEvidence: "High confidence verified leadership scope evidence.",
      }),
    ).toBe(true);
  });
});

