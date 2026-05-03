import type { InterpretedEvidenceSummary } from './evidence-model';

export type EvidenceReadiness = 'ready' | 'degraded' | 'blocked';

export const DEFAULT_EVIDENCE_READINESS_THRESHOLDS = {
  // "Enough strong evidence exists" threshold.
  readyStrongEvidenceMin: 1,
  // Alternative threshold: strong + partial evidence count sufficient to generate truthful drafts.
  readyTotalUsableEvidenceMin: 3,
} as const;

export function resolveEvidenceReadinessFromSummary(summary: InterpretedEvidenceSummary): EvidenceReadiness {
  const strong = Math.max(0, summary.strongEvidenceCount ?? 0);
  const partial = Math.max(0, summary.partialEvidenceCount ?? 0);
  const weak = Math.max(0, summary.weakEvidenceCount ?? 0);
  const unusable = Math.max(0, summary.unusableEvidenceCount ?? 0);

  const usable = strong + partial;
  const anyMeaningful = usable > 0;

  if (strong >= DEFAULT_EVIDENCE_READINESS_THRESHOLDS.readyStrongEvidenceMin) return 'ready';
  if (usable >= DEFAULT_EVIDENCE_READINESS_THRESHOLDS.readyTotalUsableEvidenceMin) return 'ready';

  // Degraded: meaningful verified evidence exists, but not enough to be "ready".
  if (anyMeaningful) return 'degraded';

  // Weak-only evidence is not enough to unlock generation-ready; treat as blocked for readiness.
  // (UI can still allow positioning-only behaviors later, but generation should not be unlocked by weak evidence alone.)
  if (weak > 0 && unusable >= 0) return 'blocked';

  return 'blocked';
}
