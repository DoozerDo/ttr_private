export type FitScoreVerdictLabel = 'Skip' | 'Consider' | 'Apply';

export type VerdictDefinition = {
  label: string;
  description: string;
};

const VERDICT_DETAILS: Record<FitScoreVerdictLabel, VerdictDefinition> = {
  Apply: {
    label: 'Apply',
    description: 'You meet the core requirements. Focus on the highlighted strengths.',
  },
  Consider: {
    label: 'Consider',
    description: 'There are some gaps. Address the highlighted areas before you proceed.',
  },
  Skip: {
    label: 'Skip',
    description: 'Significant gaps detected. Open Fit Review to see the highest impact adjustments.',
  },
};

const verdictLabelFromString = (value?: string | null): FitScoreVerdictLabel | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('apply')) return 'Apply';
  if (normalized.startsWith('consider')) return 'Consider';
  if (normalized.includes('skip')) return 'Skip';
  return null;
};

const getVerdictDisplay = (value?: string | null): VerdictDefinition | null => {
  const key = verdictLabelFromString(value);
  return key ? VERDICT_DETAILS[key] : null;
};

export function getVerdictDisplayOrDefault(value?: string | null): VerdictDefinition {
  return (
    getVerdictDisplay(value) ?? {
      label: 'Verdict pending',
      description: 'Load an analysis to see how this role compares to your baseline.',
    }
  );
}
