import { buildResultsNarrative } from './results-narrative.builder';

describe('buildResultsNarrative', () => {
  it('returns a 90+ narrative with clear strengths and no gaps', () => {
    const narrative = buildResultsNarrative({
      overallScore: 95,
      dimensionScores: {
        role_scope_and_seniority: 92,
        support_operations_and_process_rigor: 88,
        tooling_and_platform_experience: 80,
        domain_and_business_context: 77,
        change_leadership_and_customer_advocacy: 76,
      },
    });

    expect(narrative.headline).toBe('Your background aligns very strongly with this role.');
    expect(narrative.gaps).toEqual([]);
    expect(narrative.strengths).toEqual(['Experience Alignment', 'Leadership Level']);
    expect(narrative.summary).toContain(
      'Clear alignment appears in Experience Alignment and Leadership Level.',
    );
  });

  it('builds the 60-69 narrative with gaps and the closer', () => {
    const narrative = buildResultsNarrative({
      overallScore: 65,
      dimensionScores: {
        role_scope_and_seniority: 78,
        support_operations_and_process_rigor: 58,
        tooling_and_platform_experience: 62,
        domain_and_business_context: 55,
        change_leadership_and_customer_advocacy: 61,
      },
    });

    expect(narrative.headline).toBe('This role expects experience that is not clearly reflected yet.');
    expect(narrative.strengths).toEqual(['Experience Alignment']);
    expect(narrative.gaps).toEqual([
      'Industry and Context Fit',
      'Leadership Level',
    ]);
    expect(narrative.summary).toContain('Clear alignment appears in Experience Alignment.');
    expect(narrative.summary).toContain(
      'However, Industry and Context Fit and Leadership Level are less emphasized relative to this role.',
    );
    expect(narrative.summary).toContain('These areas may require meaningful repositioning to match this role.');
  });

  it('uses a limited alignment mention and neutral gaps when below 50', () => {
    const narrative = buildResultsNarrative({
      overallScore: 45,
      dimensionScores: {
        role_scope_and_seniority: 72,
        support_operations_and_process_rigor: 65,
        tooling_and_platform_experience: 64,
        domain_and_business_context: 63,
        change_leadership_and_customer_advocacy: 62,
      },
    });

    expect(narrative.headline).toBe('There is significant misalignment for this role.');
    expect(narrative.strengths).toEqual(['Experience Alignment']);
    expect(narrative.gaps).toEqual([
      'Strategic versus Tactical Balance',
      'Industry and Context Fit',
    ]);
    expect(narrative.summary).toContain(
      'Some alignment appears in Experience Alignment, but it is not the primary focus of the role.',
    );
    expect(narrative.summary).toContain(
      'The thinnest alignment right now is in Strategic versus Tactical Balance and Industry and Context Fit.',
    );
  });
});
