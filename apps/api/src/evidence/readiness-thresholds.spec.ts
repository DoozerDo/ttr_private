import type { InterpretedEvidenceSummary } from './evidence-model';
import {
  DEFAULT_EVIDENCE_READINESS_THRESHOLDS,
  resolveEvidenceReadinessFromSummary,
} from './readiness-thresholds';

// Phase 2: test-first contract for readiness alignment with interpreted evidence.
// No production readiness logic changes are implemented yet.

describe('evidence readiness thresholds (blueprint contract)', () => {
  it('returns ready when strongEvidenceCount >= readyStrongEvidenceMin', () => {
    const summary: InterpretedEvidenceSummary = {
      strongEvidenceCount: DEFAULT_EVIDENCE_READINESS_THRESHOLDS.readyStrongEvidenceMin,
      partialEvidenceCount: 0,
      weakEvidenceCount: 0,
      unusableEvidenceCount: 0,
    };
    expect(resolveEvidenceReadinessFromSummary(summary)).toBe('ready');
  });

  it('returns ready when strongEvidenceCount + partialEvidenceCount >= readyTotalUsableEvidenceMin', () => {
    const summary: InterpretedEvidenceSummary = {
      strongEvidenceCount: 0,
      partialEvidenceCount: DEFAULT_EVIDENCE_READINESS_THRESHOLDS.readyTotalUsableEvidenceMin,
      weakEvidenceCount: 0,
      unusableEvidenceCount: 0,
    };
    expect(resolveEvidenceReadinessFromSummary(summary)).toBe('ready');
  });

  it('returns degraded when partial evidence exists but ready thresholds are not met', () => {
    const summary: InterpretedEvidenceSummary = {
      strongEvidenceCount: 0,
      partialEvidenceCount: Math.max(1, DEFAULT_EVIDENCE_READINESS_THRESHOLDS.readyTotalUsableEvidenceMin - 1),
      weakEvidenceCount: 0,
      unusableEvidenceCount: 0,
    };
    expect(resolveEvidenceReadinessFromSummary(summary)).toBe('degraded');
  });

  it('returns blocked when all evidence is unusable (no meaningful verified experience)', () => {
    const summary: InterpretedEvidenceSummary = {
      strongEvidenceCount: 0,
      partialEvidenceCount: 0,
      weakEvidenceCount: 0,
      unusableEvidenceCount: 3,
    };
    expect(resolveEvidenceReadinessFromSummary(summary)).toBe('blocked');
  });

  it('does not treat partial evidence as zero experience (partial unlocks degraded, not blocked)', () => {
    const summary: InterpretedEvidenceSummary = {
      strongEvidenceCount: 0,
      partialEvidenceCount: 1,
      weakEvidenceCount: 0,
      unusableEvidenceCount: 0,
    };
    expect(resolveEvidenceReadinessFromSummary(summary)).toBe('degraded');
  });

  it('does not allow weak evidence alone to unlock ready', () => {
    const summary: InterpretedEvidenceSummary = {
      strongEvidenceCount: 0,
      partialEvidenceCount: 0,
      weakEvidenceCount: 5,
      unusableEvidenceCount: 0,
    };
    expect(resolveEvidenceReadinessFromSummary(summary)).toBe('blocked');
  });
});
