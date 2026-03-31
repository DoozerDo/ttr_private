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

  it("returns null for support operations when verified baseline evidence already covers the category", () => {
    const result = buildRequirementGapInsight({
      requirement: "Support Operations",
      requirementEvidence: "Own support operations and escalation management across customer teams",
      baselineEvidence: "Owned global incident and escalation management for customer operations supporting fortune 500",
      supportingSignals: [
        "Led support and development teams of fifty plus across na, emea, and apac",
        "Owned escalation management and support process improvements",
      ],
      summary: "Strong support leadership and incident management evidence.",
    });

    expect(result).toBeNull();
  });

  it("keeps unsupported categories visible when relevant evidence is absent", () => {
    const result = buildRequirementGapInsight({
      requirement: "Change Leadership",
      requirementEvidence: "Lead enterprise change rollout and adoption",
      baselineEvidence: "Supported day-to-day ticket triage for a regional support queue",
      supportingSignals: ["Handled inbox routing and ticket triage"],
      summary: "Operational support evidence without change leadership proof.",
    });

    expect(result).not.toBeNull();
    expect(result?.requirement).toBe("Change Leadership");
    expect(result?.explanation).toMatch(/requires/i);
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

  it("suppresses change leadership suggestions when leadership-at-scale evidence is already present", () => {
    expect(
      shouldSuppressCategorySuggestion({
        categoryLabel: "Change Leadership and Customer Advocacy",
        supportingSignals: [
          "Led support and development teams of fifty plus across na, emea, and apac",
          "Owned global incident and escalation management for customer operations",
          "Drove rollout and adoption of new support workflows across regions",
        ],
        baselineEvidence: "Verified baseline evidence for leadership scope and operational change.",
      }),
    ).toBe(true);
  });
});

