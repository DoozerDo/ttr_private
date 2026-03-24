import { describe, expect, it } from "vitest";

import { buildEvidenceSuggestion } from "@/lib/evidenceSuggestions";

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
});

