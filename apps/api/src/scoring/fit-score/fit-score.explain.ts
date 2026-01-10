import { FitScoreDimensionScores } from './fit-score.types';
import { normalizeText } from './fit-score.utils';

type ThemeDefinition = {
  label: string;
  cues: string[];
  dimension: keyof FitScoreDimensionScores;
};

const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    label: 'leadership',
    cues: ['leadership', 'lead', 'direct', 'stakeholder', 'manage', 'mentor', 'global'],
    dimension: 'leadershipLevel',
  },
  {
    label: 'operations',
    cues: ['operations', 'ops', 'incidents', 'runbook', 'support', 'tickets', 'monitoring'],
    dimension: 'strategicTacticalFit',
  },
  {
    label: 'customer support',
    cues: ['customer support', 'customer experience', 'customer success', 'cx'],
    dimension: 'industryContext',
  },
  {
    label: 'program management',
    cues: ['program', 'portfolio', 'roadmap', 'strategy', 'scaling'],
    dimension: 'experienceAlignment',
  },
  {
    label: 'scaling teams',
    cues: ['scale', 'growing', 'expand', 'cross-functional', 'coaching', 'teams'],
    dimension: 'leadershipLevel',
  },
];

const hasCue = (text: string, cue: string) => normalizeText(text).includes(cue);
const MIN_THEME_SCORE = 60;

export const buildStrengths = (
  jobText: string,
  baselineText: string,
  dimensionScores: FitScoreDimensionScores,
): string[] => {
  const combined = `${jobText} ${baselineText}`;

  const scoredThemes = THEME_DEFINITIONS.map((theme) => {
    const cueCount = theme.cues.filter((cue) => hasCue(combined, cue)).length;
    const score = dimensionScores[theme.dimension];
    return { label: theme.label, cueCount, score };
  });

  const sorted = scoredThemes
    .filter((theme) => theme.cueCount > 0 || theme.score >= MIN_THEME_SCORE)
    .sort((a, b) => {
      const delta = b.score - a.score;
      if (delta !== 0) return delta;
      return b.cueCount - a.cueCount;
    });

  return [...new Set(sorted.map((theme) => theme.label))].slice(0, 4);
};

export const buildGaps = (
  missingTools: string[],
  dimensionScores: FitScoreDimensionScores,
): string[] => {
  const gaps: string[] = [];

  if (missingTools.length) {
    gaps.push(`Missing required tools: ${missingTools.join(', ')}`);
  }

  if (dimensionScores.leadershipLevel < 60) {
    gaps.push('Leadership signal is muted');
  }

  if (dimensionScores.strategicTacticalFit < 60) {
    gaps.push('Strategy orientation needs reinforcement');
  }

  if (dimensionScores.industryContext < 60) {
    gaps.push('Industry context feels misaligned');
  }

  if (!missingTools.length && dimensionScores.technicalPlatformFit < 60) {
    gaps.push('Platform familiarity is limited');
  }

  return gaps.slice(0, 4);
};
