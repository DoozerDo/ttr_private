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
});

