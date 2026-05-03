import type { EvidenceItem } from './evidence-model';

// Phase 2: test-first contract for audit metadata required by
// `docs/manual_target_this_role_workflow_blueprint.md`.
//
// The concrete audit implementation will live in generation pipelines; this file defines the shape
// we must be able to assert in Phase 3+.

type GenerationAuditMetadata = {
  evidenceUsed: Array<{
    evidenceItemId: string;
    evidenceStrength: EvidenceItem['evidenceStrength'];
    evidenceSource: EvidenceItem['evidenceSource'];
    supportLevel: EvidenceItem['supportLevel'];
    generationUse: EvidenceItem['generationUse'];
    constraintsApplied: string[];
    missingElements: EvidenceItem['missingElements'];
  }>;
  omissions: Array<{
    evidenceItemId?: string;
    reason: string;
  }>;
};

describe('generation audit metadata (blueprint contract)', () => {
  it.todo('includes evidence item id, strength, source, supportLevel, generationUse, constraints, missingElements');

  it.todo('includes omissions when evidence is insufficient to support a requested claim');

  it('compiles the expected audit metadata contract type (Phase 2 scaffolding)', () => {
    const audit: GenerationAuditMetadata = {
      evidenceUsed: [],
      omissions: [],
    };
    expect(audit.evidenceUsed).toEqual([]);
  });
});

