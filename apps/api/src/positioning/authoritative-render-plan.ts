import type { PositioningPlan } from './positioning-plan.service';

export type AuthoritativeRenderPlan = {
  orderedRoleIds: string[];
  suppressedRoleIds: string[];
  summaryNarrative: string | null;
  evidencePriorities: string[];
  coverLetterThesis: string | null;
  allowedEvidenceSnippetIds: string[];
  bannedWeakFragments: string[];
  sources: {
    positioningPlan: boolean;
  };
};

function toIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

export function buildAuthoritativeRenderPlan(input: {
  positioningPlan: PositioningPlan | null;
  orderedFallbackRoleIds?: string[] | null;
  suppressedFallbackRoleIds?: string[] | null;
  allowedEvidenceSnippetIds?: string[] | null;
}): AuthoritativeRenderPlan {
  const plan = input.positioningPlan;
  const orderedRoleIds = toIds(plan?.emphasizeRoleIds).length
    ? toIds(plan?.emphasizeRoleIds)
    : toIds(input.orderedFallbackRoleIds);
  const suppressedRoleIdsRaw = Array.from(
    new Set([...toIds(input.suppressedFallbackRoleIds), ...toIds(plan?.suppressRoleIds)]),
  );
  const suppressedRoleIds = suppressedRoleIdsRaw.filter((id) => !orderedRoleIds.includes(id));

  const summaryNarrative =
    typeof plan?.positioningThesis === 'string' && plan.positioningThesis.trim()
      ? plan.positioningThesis.trim()
      : null;
  const coverLetterThesis =
    typeof plan?.coverLetterStrategy?.openingAngle === 'string' && plan.coverLetterStrategy.openingAngle.trim()
      ? plan.coverLetterStrategy.openingAngle.trim()
      : summaryNarrative;

  const evidencePriorities = toIds(plan?.topEvidenceThemes);
  const allowedEvidenceSnippetIds = Array.from(new Set(toIds(input.allowedEvidenceSnippetIds)));

  return {
    orderedRoleIds,
    suppressedRoleIds,
    summaryNarrative,
    evidencePriorities,
    coverLetterThesis,
    allowedEvidenceSnippetIds,
    bannedWeakFragments: ['vue', 'react', 'deck builder', 'frontend'],
    sources: { positioningPlan: Boolean(plan) },
  };
}
