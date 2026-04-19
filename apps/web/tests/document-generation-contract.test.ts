import { describe, expect, it } from "vitest";

import {
  isSystemOwnedFinalizedGeneration,
  resolveDocumentGenerationMode,
  shouldGenerateDocuments,
} from "@/lib/documentGenerationContract";

describe("document generation contract", () => {
  it("does not generate below 70", () => {
    expect(shouldGenerateDocuments(69)).toBe(false);
    expect(resolveDocumentGenerationMode(69)).toBe("draft");
    expect(isSystemOwnedFinalizedGeneration(69)).toBe(false);
  });

  it("generates draft at 70-79", () => {
    expect(shouldGenerateDocuments(70)).toBe(true);
    expect(resolveDocumentGenerationMode(78)).toBe("draft");
    expect(isSystemOwnedFinalizedGeneration(78)).toBe(false);
  });

  it("generates finalized at 80+", () => {
    expect(shouldGenerateDocuments(85)).toBe(true);
    expect(resolveDocumentGenerationMode(85)).toBe("finalized");
    expect(isSystemOwnedFinalizedGeneration(85)).toBe(true);
  });
});

