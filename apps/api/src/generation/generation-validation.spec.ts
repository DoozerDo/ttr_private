import { validateGenerationTrace } from './generation-validation';

describe('validateGenerationTrace', () => {
  it('fails when lines are missing evidence or mappings are ambiguous', () => {
    const result = validateGenerationTrace(
      [
        { id: 'l1', text: 'Opening', sourceEvidenceIds: ['e1'] },
        { id: 'l2', text: 'Body', sourceEvidenceIds: [] },
        { id: 'l3', text: 'Closing', sourceEvidenceIds: ['e2', 'e2'] },
      ],
      ['e1', 'e2'],
    );

    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toContain('no source evidence');
    expect(result.failures.join(' ')).toContain('ambiguous evidence mapping');
    expect(result.traceCoverage).toBeGreaterThanOrEqual(50);
  });

  it('returns coverage and unused evidence', () => {
    const result = validateGenerationTrace(
      [{ id: 'l1', text: 'Line', sourceEvidenceIds: ['e1'] }],
      ['e1', 'e2'],
    );

    expect(result.passed).toBe(true);
    expect(result.traceCoverage).toBe(50);
    expect(result.unusedEvidence).toEqual(['e2']);
    expect(result.selectedEvidence).toEqual(['e1']);
  });
});
