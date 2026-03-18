import { applyFitScoreAdjustment } from './fit-score-adjustment';

describe('applyFitScoreAdjustment', () => {
  it('keeps aligned support operations leadership unchanged', () => {
    const result = applyFitScoreAdjustment({
      rawScore: 88,
      jobTitle: 'Director of Customer Support Operations',
      jobDescription:
        'Lead global support operations, incident management, quality programs, and executive reporting.',
    });

    expect(result.adjustedScore).toBe(88);
    expect(result.scoreAdjustmentApplied).toBe(false);
    expect(result.scoreAdjustmentType).toBe('none');
  });

  it('caps product manager roles with overlap language', () => {
    const result = applyFitScoreAdjustment({
      rawScore: 86,
      jobTitle: 'Senior Product Manager',
      jobDescription:
        'Own product roadmap, product strategy, and cross functional execution with support partner input.',
    });

    expect(result.adjustedScore).toBe(60);
    expect(result.scoreAdjustmentApplied).toBe(true);
    expect(result.scoreAdjustmentReasons.join(' ')).toContain('Product');
  });

  it('caps game design roles with systems and operations language', () => {
    const result = applyFitScoreAdjustment({
      rawScore: 82,
      jobTitle: 'Principal Game Economy Designer',
      jobDescription:
        'Design monetization systems and game economy health with live operations collaboration.',
    });

    expect(result.adjustedScore).toBe(60);
    expect(result.scoreAdjustmentApplied).toBe(true);
    expect(result.scoreAdjustmentReasons.join(' ')).toContain('Game Design');
  });

  it('caps engineering and infrastructure roles with customer language', () => {
    const result = applyFitScoreAdjustment({
      rawScore: 84,
      jobTitle: 'Senior Site Reliability Engineer',
      jobDescription:
        'Own site reliability, infrastructure operations, and on call coverage for customer critical systems.',
    });

    expect(result.adjustedScore).toBe(60);
    expect(result.scoreAdjustmentApplied).toBe(true);
    expect(result.scoreAdjustmentReasons.join(' ')).toContain('Core function differs');
  });

  it('caps downlevel individual contributor roles', () => {
    const result = applyFitScoreAdjustment({
      rawScore: 85,
      jobTitle: 'Customer Support Specialist',
      jobDescription:
        'Individual contributor specialist role handling ticket queues and direct customer follow up.',
    });

    expect(result.adjustedScore).toBe(70);
    expect(result.scoreAdjustmentApplied).toBe(true);
    expect(result.scoreAdjustmentType).toBe('seniority_cap');
  });

  it('applies domain penalty only when role family is not aligned and evidence is shaky', () => {
    const result = applyFitScoreAdjustment({
      rawScore: 74,
      jobTitle: 'Operations Program Manager',
      jobDescription:
        'Drive program execution for a fintech payments platform with process metrics and stakeholder coordination.',
    });

    expect(result.adjustedScore).toBe(64);
    expect(result.scoreAdjustmentApplied).toBe(true);
    expect(result.scoreAdjustmentType).toBe('domain_penalty');
  });
});
