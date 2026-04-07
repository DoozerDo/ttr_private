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
    expect(result?.intro).toBe("This claim needs verification before Studio can use it.");
    expect(result?.context).toMatch(/grounded in your experience/i);
    expect(result?.description).toMatch(/real experience/i);
    expect(result?.scope).toMatch(/Example anchor/i);
  });

  it("returns null when no grounded signals are available", () => {
    const result = buildEvidenceSuggestion({
      requirement: "Zendesk",
      supportingSignals: [],
      baselineEvidence: "",
    });
    expect(result).toBeNull();
  });

  it.each([
    {
      label: "Support Operations",
      requirementEvidence: "Own support operations and escalation management across customer teams",
      baselineEvidence:
        "Owned global incident and escalation management for customer operations supporting fortune 500",
      supportingSignals: [
        "Led support and development teams of fifty plus across na, emea, and apac",
        "Owned escalation management and support process improvements",
      ],
      summary: "Strong support leadership and incident management evidence.",
    },
    {
      label: "Support Operations",
      requirementEvidence: "Own service delivery and support process ownership for customer teams",
      baselineEvidence: "Led support process design and service delivery improvements across regional queues",
      supportingSignals: [
        "Managed support workflow improvements",
        "Owned service delivery outcomes across queues",
      ],
      summary: "Verified support process ownership evidence.",
    },
  ])("suppresses support operations when verified evidence already covers the category", (input) => {
    const result = buildRequirementGapInsight({
      requirement: input.label,
      requirementEvidence: input.requirementEvidence,
      baselineEvidence: input.baselineEvidence,
      supportingSignals: input.supportingSignals,
      summary: input.summary,
    });

    expect(result).toBeNull();
  });

  it.each([
    {
      label: "Change Leadership",
      requirementEvidence: "Lead enterprise change rollout and adoption",
      baselineEvidence: "Led support and development teams of fifty plus across na, emea, and apac",
      supportingSignals: [
        "Owned regional team leadership across three markets",
        "Managed cross-functional support teams at global scale",
      ],
      summary: "Leadership at scale evidence without the exact phrase.",
    },
    {
      label: "Change Leadership",
      requirementEvidence: "Lead transformation and operating model change",
      baselineEvidence: "Drove rollout of a new support operating model across regions",
      supportingSignals: [
        "Championed process rollout across customer operations",
        "Spearheaded adoption of a new service delivery model",
      ],
      summary: "Rollout and operating-model change evidence.",
    },
  ])("suppresses change leadership when equivalent evidence exists", (input) => {
    const result = buildRequirementGapInsight({
      requirement: input.label,
      requirementEvidence: input.requirementEvidence,
      baselineEvidence: input.baselineEvidence,
      supportingSignals: input.supportingSignals,
      summary: input.summary,
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

