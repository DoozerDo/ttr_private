import type { DocumentStrategyPlanLike } from '../document-strategy-plan.types';
import type { SyntheticGenerationFixtureBundle } from './generation/synthetic-generation.types';

export function buildSyntheticTestPlan(
  bundle: SyntheticGenerationFixtureBundle,
  fitScore: number,
): DocumentStrategyPlanLike {
  const requiredSignals = bundle.scenario.expected.requiredRoleSignals;
  const selectedEvidence = bundle.baseline.sections.slice(0, 3).map((section, index) => ({
    baselineSection: section.title,
    sourceId: section.id,
    matchedSignals: requiredSignals.slice(index, index + 2),
    whySelected: `Supports ${requiredSignals[index] ?? requiredSignals[0] ?? 'the role'}.`,
    approvedClaims: [section.content],
    rank: index + 1,
    score: 100 - index * 3,
  }));

  return {
    fitScore,
    fitBand: fitScore >= 80 ? 'strong' : fitScore >= 70 ? 'moderate' : 'borderline',
    positioningFrame:
      bundle.benchmark?.benchmarkPositioningFrame ??
      bundle.job.title ??
      bundle.scenario.name,
    roleLens: {
      titleFamily: 'Synthetic target role',
      seniority: 'senior leadership',
      scope: 'cross-functional',
      domainContext: bundle.job.company,
      priorities: requiredSignals.slice(0, 4),
      requiredSignals: requiredSignals.slice(0, 4),
      targetKeywords: [
        ...requiredSignals.slice(0, 4),
        bundle.job.title,
        bundle.job.company,
      ].filter(Boolean) as string[],
    },
    selectedEvidence,
    summaryStrategy: `${bundle.scenario.name} strategy`,
    resumeEmphasis: requiredSignals.slice(0, 4),
    coverLetterThemes: requiredSignals.slice(0, 3),
    suppressionNotes: [
      `Keep the story centered on ${requiredSignals[0] ?? bundle.scenario.name}.`,
      'Avoid generic filler and unsupported scope.',
    ],
    qualityPass: {
      framingStrength: 'high',
      emphasisConfidence: 'high',
      topNarrativeAxes: requiredSignals.slice(0, 3),
      cutCandidates: [],
      mustLeadWith: requiredSignals.slice(0, 3),
      avoidRepeating: [],
      coverLetterDelta: [
        `Lead with ${requiredSignals[0] ?? bundle.scenario.name}.`,
        'Keep the cover letter role-specific and additive.',
      ],
    },
    documentQualityScore: 88,
  };
}
