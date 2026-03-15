import { GapAnalysisService } from './gap-analysis.service';

describe('GapAnalysisService', () => {
  const service = new GapAnalysisService();

  it('excludes salary and compensation text from gap signals', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and coaching programs.' }],
      jobRequirements: [
        'Compensation range is $120,000 - $150,000 base salary.',
        'Own incident management and escalation operations.',
      ],
      jobResponsibilities: ['Bonus and equity details available for this role.'],
    });

    const allEvidence = result.criticalGaps
      .map((gap) => `${gap.title} ${gap.requirementEvidence}`.toLowerCase())
      .join(' ');
    expect(allEvidence).not.toContain('salary');
    expect(allEvidence).not.toContain('compensation');
    expect(allEvidence).not.toContain('bonus');
  });

  it('truncates very long baseline evidence to display-safe length', () => {
    const oversizedEvidence =
      'Platform governance playbook '.repeat(25) +
      'with cross-functional operating rhythm and verification checkpoints.';

    const result = service.analyze({
      baselineSections: [{ content: oversizedEvidence }],
      jobRequirements: ['Build platform governance for cross-functional support teams.'],
      jobResponsibilities: ['Own long-range planning for support tooling.'],
    });

    for (const gap of result.criticalGaps) {
      if (gap.baselineEvidence) {
        expect(gap.baselineEvidence.length).toBeLessThanOrEqual(180);
      }
    }
  });

  it('deduplicates repeated requirement evidence blocks', () => {
    const repeated = 'Lead incident command during high-severity outages.';
    const result = service.analyze({
      baselineSections: [{ content: 'Managed daily support queue operations.' }],
      jobRequirements: [repeated, repeated],
      jobResponsibilities: [repeated],
    });

    const matching = result.criticalGaps.filter((gap) =>
      gap.requirementEvidence.toLowerCase().includes('incident command'),
    );
    expect(matching.length).toBeLessThanOrEqual(1);
  });

  it('deprioritizes generic company-footprint boilerplate in critical gaps', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led customer escalations and coaching programs.' }],
      jobRequirements: [
        'Company has global offices across 40 countries.',
        'Own executive incident review and operational governance.',
      ],
      jobResponsibilities: ['Lead weekly executive operational reviews.'],
    });

    const topGap = result.criticalGaps[0];
    expect((topGap?.requirementEvidence ?? '').toLowerCase()).not.toContain('global offices');
  });

  it('excludes legal, EEO, accommodation, and application-process boilerplate from gaps and interview risks', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and executive incident reviews.' }],
      jobRequirements: [
        'We are an equal opportunity employer and consider all qualified applicants without regard to protected characteristics.',
        'If you require reasonable accommodation during the application process, contact recruiting.',
        'Own executive incident review and operational governance.',
      ],
      jobResponsibilities: [
        'Background check required for employment.',
        'Lead weekly executive operational reviews.',
      ],
    });

    const flattened = [
      ...result.strengths,
      ...result.criticalGaps.map((gap) => `${gap.title} ${gap.requirementEvidence}`),
      ...result.recommendedActions,
      ...result.interviewRisks.map(
        (risk) => `${risk.topic} ${risk.whyTheyMayChallengeYou} ${risk.howToAddressIt}`,
      ),
    ]
      .join(' ')
      .toLowerCase();

    expect(flattened).not.toContain('equal opportunity');
    expect(flattened).not.toContain('all qualified applicants');
    expect(flattened).not.toContain('reasonable accommodation');
    expect(flattened).not.toContain('application process');
    expect(flattened).not.toContain('background check');
    expect(flattened).toContain('executive incident review');
  });

  it('returns baseline evidence snippets as strengths instead of taxonomy labels', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Led global support operations at SentinelOne.\nBuilt escalation and incident management workflows.\nDrove cross-functional CX systems.',
        },
      ],
      jobRequirements: [
        'Lead global support operations for enterprise customers.',
        'Build escalation and incident management workflows.',
        'Direct firmware engineering experience.',
      ],
      jobResponsibilities: ['Drive cross-functional CX systems.'],
    });

    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.strengths.every((value) => /SentinelOne|escalation|cross-functional/i.test(value))).toBe(
      true,
    );
    expect(result.strengths).not.toContain('Tooling and Platform Experience');
    expect(result.strengths).not.toContain('Support Operations and Process Rigor');
  });

  it('returns requirement-derived gap titles instead of taxonomy labels', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and customer escalations.' }],
      jobRequirements: [
        'Direct firmware engineering experience in pre-silicon environments.',
        'Embedded systems development exposure.',
      ],
      jobResponsibilities: [],
    });

    const gapTitles = result.criticalGaps.map((gap) => gap.title);
    expect(gapTitles).toContain('Direct Firmware Engineering Experience');
    expect(gapTitles).toContain('Embedded Systems Development Exposure.');
    expect(gapTitles).not.toContain('Tooling and Platform Experience');
    expect(gapTitles).not.toContain('Domain and Business Context');
  });

  it('filters requirement fragments and modifier-only phrases out of gap signals', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led customer support operations and escalation reviews.' }],
      jobRequirements: [
        'Proficient',
        'OR Equivalent Experience',
        'Strong ability',
        'Direct firmware engineering experience',
      ],
      jobResponsibilities: ['Embedded systems development exposure.'],
    });

    const flattened = [
      ...result.criticalGaps.map((gap) => `${gap.title} ${gap.requirementEvidence}`),
      ...result.recommendedActions,
      ...result.positioningSuggestions,
    ]
      .join(' ')
      .toLowerCase();

    expect(flattened).not.toContain('proficient');
    expect(flattened).not.toContain('equivalent experience');
    expect(flattened).not.toContain('strong ability');
    expect(flattened).toContain('direct firmware engineering experience');
    expect(flattened).toContain('embedded systems development exposure');
  });

  it('rejects buzzword-only baseline lines and keeps strengths evidence-based', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Leadership, team building, and innovation evangelism.\nLed customer operations and escalation programs.\nPartnered with engineering teams to operate complex systems.',
        },
      ],
      jobRequirements: [
        'Led customer operations and escalation programs.',
        'Partnered with engineering teams to operate complex systems.',
      ],
      jobResponsibilities: [],
    });

    expect(result.strengths).toContain('Led customer operations and escalation programs.');
    expect(result.strengths).toContain(
      'Partnered with engineering teams to operate complex systems.',
    );
    expect(result.strengths).not.toContain('Leadership, team building, and innovation evangelism.');
  });

  it('builds positioning suggestions from clean gap signals instead of keyword clusters', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and incident reviews.' }],
      jobRequirements: ['Direct firmware engineering experience in pre-silicon environments.'],
      jobResponsibilities: [],
    });

    expect(result.positioningSuggestions.length).toBeGreaterThan(0);
    expect(result.positioningSuggestions[0]?.toLowerCase()).toContain(
      'direct firmware engineering experience',
    );
    expect(result.positioningSuggestions.join(' ').toLowerCase()).not.toContain('proficient');
    expect(result.positioningSuggestions.join(' ').toLowerCase()).not.toContain(
      'equivalent experience',
    );
  });
});

