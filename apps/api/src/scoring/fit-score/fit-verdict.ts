export type FitScoreVerdictLabel = 'Skip' | 'Consider' | 'Apply';

export function verdictFromScore(
  score: number | null | undefined,
): FitScoreVerdictLabel {
  const s = typeof score === 'number' && Number.isFinite(score) ? score : 0;

  if (s < 60) return 'Skip';
  if (s < 80) return 'Consider';
  return 'Apply';
}
