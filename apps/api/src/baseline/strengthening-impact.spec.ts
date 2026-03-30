import {
  classifyStrengtheningImpact,
  type StrengtheningImpactType,
} from './strengthening-impact';

describe('classifyStrengtheningImpact', () => {
  const unmetRequirements = [
    'reduce incident resolution time',
    'improve team coordination',
  ];

  it('treats irrelevant input as no_match and zero impact', () => {
    const result = classifyStrengtheningImpact({
      addition: 'Built an internal onboarding workflow that improved hiring speed by 20%.',
      existingEvidence: ['Led support operations across the customer success team.'],
      unmetRequirements,
    });

    expect(result).toMatchObject<{
      impactType: StrengtheningImpactType;
      scoreDelta: number;
      matchedRequirement: string | null;
    }>({
      impactType: 'no_match',
      scoreDelta: 0,
      matchedRequirement: null,
    });
  });

  it('treats weak input as low_quality and zero impact', () => {
    const result = classifyStrengtheningImpact({
      addition: 'Worked on things and helped out.',
      existingEvidence: ['Led support operations across the customer success team.'],
      unmetRequirements,
    });

    expect(result.impactType).toBe('low_quality');
    expect(result.scoreDelta).toBe(0);
  });

  it('treats duplicate input as duplicate and zero impact', () => {
    const duplicateEvidence = 'I reduced incident resolution time by 18% across the support team.';
    const result = classifyStrengtheningImpact({
      addition: duplicateEvidence,
      existingEvidence: [duplicateEvidence],
      unmetRequirements,
    });

    expect(result.impactType).toBe('duplicate');
    expect(result.scoreDelta).toBe(0);
  });

  it('treats valid new evidence as a new match', () => {
    const result = classifyStrengtheningImpact({
      addition: 'Reduced incident resolution time by 18% by redesigning the escalation workflow.',
      existingEvidence: ['Led support operations across the customer success team.'],
      unmetRequirements,
    });

    expect(result).toMatchObject({
      impactType: 'new_match',
      scoreDelta: 3,
      matchedRequirement: 'reduce incident resolution time',
    });
  });

  it('treats strengthened evidence as strengthened_match', () => {
    const result = classifyStrengtheningImpact({
      addition: 'Improved team coordination by creating a shared incident workflow.',
      existingEvidence: ['Improved team coordination with better incident runbooks.'],
      unmetRequirements,
    });

    expect(result).toMatchObject({
      impactType: 'strengthened_match',
      scoreDelta: 2,
      matchedRequirement: 'improve team coordination',
    });
  });
});
