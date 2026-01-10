import { RealityCheckService } from './reality-check.service';
import type { RealityCheckAnswer, RealityCheckQuestion } from './reality-check.types';

describe('RealityCheckService', () => {
  const service = new RealityCheckService(null as any, null as any, null as any, null as any);

  const baseQuestions: RealityCheckQuestion[] = [
    {
      id: 'role_evolution',
      type: 'boolean',
      prompt: '',
      mapsToSections: ['experience'],
      gatingTag: 'role_evolution',
    },
    {
      id: 'scope_verification',
      type: 'boolean',
      prompt: '',
      mapsToSections: ['leadership'],
      gatingTag: 'scope_verification',
    },
    {
      id: 'skill_currency',
      type: 'multi_select',
      prompt: '',
      mapsToSections: ['skills'],
      gatingTag: 'skill_currency',
      options: [
        { label: 'AWS', value: 'aws' },
        { label: 'Kubernetes', value: 'kubernetes' },
      ],
    },
    {
      id: 'time_relevance',
      type: 'boolean',
      prompt: '',
      mapsToSections: ['summary'],
      gatingTag: 'time_relevance',
    },
    {
      id: 'summary_confidence',
      type: 'boolean',
      prompt: '',
      mapsToSections: ['summary'],
      gatingTag: 'summary_confidence',
    },
  ];

  const validAnswers: RealityCheckAnswer[] = [
    { questionId: 'role_evolution', type: 'boolean', value: false },
    { questionId: 'scope_verification', type: 'boolean', value: false },
    { questionId: 'skill_currency', type: 'multi_select', value: [] },
    { questionId: 'time_relevance', type: 'boolean', value: true },
    { questionId: 'summary_confidence', type: 'boolean', value: true },
  ];

  it('validates answers when structure matches questions', () => {
    const validated = service['validateAnswers'](baseQuestions, validAnswers);
    expect(validated.length).toBe(baseQuestions.length);
  });

  it('throws when an answer references an unknown question', () => {
    const answers = [...validAnswers, { questionId: 'unknown', type: 'boolean', value: true }];
    expect(() => service['validateAnswers'](baseQuestions, answers)).toThrow(
      /Unknown questionId/,
    );
  });

  it('computes mismatch when strong signals exist without updates', () => {
    const context = {
      job: {} as any,
      baseline: {} as any,
      baselineSections: [],
      jobText: '',
      baselineText: '',
      cxFit: {
        score: 20,
        components: {
          scope: 45,
          leadership: 40,
          domain: 0,
          strategy: 0,
          execution: 0,
          tooling: 0,
        },
        adjustments: {
          selfSimilarityApplied: false,
          selfSimilarityFloor: 0,
          stretchDampenerApplied: false,
          stretchDampenerPoints: 0,
          toolingFloorApplied: false,
        },
        bands: {
          baselineBand: 'L1',
          roleBand: 'L5',
          bandDelta: 4,
        },
        debug: {
          domainTagsBaseline: [],
          domainTagsRole: [],
          responsibilityOverlapPercent: 0,
          baselineCoveragePercent: 0,
        },
      },
      toolCoverage: {
        matchedRequired: [],
        matchedPreferred: [],
        missingRequired: ['aws', 'kubernetes', 'terraform'],
        requiredCoverage: 0,
        preferredCoverage: 0,
      },
      missingSkillOptions: [],
    };

    const outcome = service['computeOutcome'](context as any, baseQuestions, validAnswers);
    expect(outcome.outcome).toBe('mismatch');
    expect(outcome.triggeredBy).toContain('seniority_mismatch');
    expect(outcome.triggeredBy).toContain('core_skill_mismatch');
  });

  it('recommends update when a trigger fires', () => {
    const answers = [
      { questionId: 'role_evolution', type: 'boolean', value: true },
      ...validAnswers.slice(1),
    ];

    const context = {
      job: {} as any,
      baseline: {} as any,
      baselineSections: [],
      jobText: '',
      baselineText: '',
      cxFit: {
        score: 90,
        components: {
          scope: 85,
          leadership: 80,
          domain: 0,
          strategy: 0,
          execution: 0,
          tooling: 0,
        },
        adjustments: {
          selfSimilarityApplied: false,
          selfSimilarityFloor: 0,
          stretchDampenerApplied: false,
          stretchDampenerPoints: 0,
          toolingFloorApplied: false,
        },
        bands: {
          baselineBand: 'L4',
          roleBand: 'L5',
          bandDelta: 1,
        },
        debug: {
          domainTagsBaseline: [],
          domainTagsRole: [],
          responsibilityOverlapPercent: 0,
          baselineCoveragePercent: 0,
        },
      },
      toolCoverage: {
        matchedRequired: [],
        matchedPreferred: [],
        missingRequired: [],
        requiredCoverage: 1,
        preferredCoverage: 0,
      },
      missingSkillOptions: [],
    };

    const outcome = service['computeOutcome'](context as any, baseQuestions, answers);
    expect(outcome.outcome).toBe('update_recommended');
    expect(outcome.triggeredBy).toContain('role_evolution');
    expect(outcome.suggestedBaselineSections).toContain('experience');
  });

  it('returns valid when no signals or triggers exist', () => {
    const answers = [...validAnswers];
    const context = {
      job: {} as any,
      baseline: {} as any,
      baselineSections: [],
      jobText: '',
      baselineText: '',
      cxFit: {
        score: 90,
        components: {
          scope: 90,
          leadership: 85,
          domain: 0,
          strategy: 0,
          execution: 0,
          tooling: 0,
        },
        adjustments: {
          selfSimilarityApplied: false,
          selfSimilarityFloor: 0,
          stretchDampenerApplied: false,
          stretchDampenerPoints: 0,
          toolingFloorApplied: false,
        },
        bands: {
          baselineBand: 'L5',
          roleBand: 'L5',
          bandDelta: 0,
        },
        debug: {
          domainTagsBaseline: [],
          domainTagsRole: [],
          responsibilityOverlapPercent: 0,
          baselineCoveragePercent: 0,
        },
      },
      toolCoverage: {
        matchedRequired: [],
        matchedPreferred: [],
        missingRequired: ['aws'],
        requiredCoverage: 0,
        preferredCoverage: 0,
      },
      missingSkillOptions: [],
    };

    const outcome = service['computeOutcome'](context as any, baseQuestions, answers);
    expect(outcome.outcome).toBe('valid');
  });
});
