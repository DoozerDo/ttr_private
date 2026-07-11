import { buildAuthoritativeRenderPlan } from './authoritative-render-plan';

describe('buildAuthoritativeRenderPlan', () => {
  it('preserves explicit suppression even when the suppressed role is also ordered', () => {
    const plan = buildAuthoritativeRenderPlan({
      positioningPlan: null,
      orderedFallbackRoleIds: ['resume_v2_exp_1'],
      suppressedFallbackRoleIds: ['resume_v2_exp_1'],
      allowedEvidenceSnippetIds: null,
    });

    expect(plan.orderedRoleIds).toEqual(['resume_v2_exp_1']);
    expect(plan.suppressedRoleIds).toEqual(['resume_v2_exp_1']);
  });
});
