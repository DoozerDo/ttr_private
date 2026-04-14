import { Repository } from 'typeorm';
import { RealityCheckService } from './reality-check.service';
import type {
  RealityCheckAnswer,
  RealityCheckQuestion,
} from './reality-check.types';
import { RealityCheckRepository } from './reality-check.repository';
import { Baseline, BaselineStatus } from '../baseline/baseline.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import type { CxFitV2Result } from '../analysis/cx-fit-scoring-v2';
import type { ToolCoverage } from '../scoring/fit-score/tool-extractor';

describe('RealityCheckService', () => {
  const realityCheckRepositoryStub = {
    findLatestByJobAndBaseline: jest.fn(),
    createRealityCheck: jest.fn(),
  } satisfies Partial<RealityCheckRepository>;
  const baselineRepositoryStub = {
    findOne: jest.fn(),
    save: jest.fn(),
  } satisfies Partial<Repository<Baseline>>;
  const jobRepositoryStub = {
    findOne: jest.fn(),
    save: jest.fn(),
  } satisfies Partial<Repository<Job>>;

  const service = new RealityCheckService(
    realityCheckRepositoryStub as RealityCheckRepository,
    baselineRepositoryStub as Repository<Baseline>,
    jobRepositoryStub as Repository<Job>,
  );

  const job = new Job();
  job.id = 'job-1';
  job.userId = 'user-1';
  job.title = 'Director';
  job.company = 'ExampleCo';
  job.rawDescription = '';
  job.sourceUrl = 'https://example.com';
  job.sourceProviderId = null;
  job.sourceExternalId = null;
  job.canonicalUrl = null;
  job.dedupeHash = null;
  job.normalizedResponsibilities = [];
  job.normalizedRequirements = [];
  job.jdIngestionMethod = JobIngestionMethod.PASTE;
  job.jdParsedAt = new Date();
  job.createdAt = new Date();
  job.updatedAt = new Date();
  job.archivedAt = null;
  job.isArchived = false;

  const baseline = new Baseline();
  baseline.id = 'baseline-1';
  baseline.userId = job.userId;
  baseline.version = 1;
  baseline.originalFilename = 'baseline.docx';
  baseline.mimeType =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  baseline.storagePath = '/tmp/baseline.docx';
  baseline.hash = null;
  baseline.status = BaselineStatus.ACTIVE;
  baseline.archivedAt = null;
  baseline.sections = [];
  baseline.versions = [];
  baseline.createdAt = new Date();
  baseline.updatedAt = new Date();

  const baseCxFit: CxFitV2Result = {
    score: 20,
    scoreConfidence: 'high',
    scoreConfidenceReasons: [],
    scoreSanityFlags: [],
    likelyUnderestimatedFit: false,
    scorePresentationMode: 'normal',
    rubric: {
      id: 'scoring_contract_v1',
      // Only a couple of rubric fields are used by RealityCheckService today; keep the rest minimal but present.
      weights: {} as any,
      dimensionPercents: {
        // Default context should be "no mismatch" unless a test overrides it.
        role_scope_and_seniority: 80,
      } as any,
      dimensionPoints: {} as any,
      subtotal: 0,
      penalties: [],
      finalBeforeClamp: 20,
      rounding: 'round_half_up_final_only',
    },
    debug: {
      bandDelta: 0,
    } as any,
  };

  const baseToolCoverage: ToolCoverage = {
    matchedRequired: [],
    matchedPreferred: [],
    missingRequired: [],
    requiredCoverage: 0,
    preferredCoverage: 0,
  };

  type TestRealityCheckContext = {
    job: Job;
    baseline: Baseline;
    baselineSections: BaselineSection[];
    jobText: string;
    baselineText: string;
    cxFit: CxFitV2Result;
    toolCoverage: ToolCoverage;
    missingSkillOptions: string[];
  };

  const buildContext = (
    overrides: Partial<TestRealityCheckContext> = {},
  ): TestRealityCheckContext => ({
    job,
    baseline,
    baselineSections: [],
    jobText: '',
    baselineText: '',
    cxFit: baseCxFit,
    toolCoverage: baseToolCoverage,
    missingSkillOptions: [],
    ...overrides,
  });

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
    const answers = [
      ...validAnswers,
      { questionId: 'unknown', type: 'boolean', value: true },
    ];
    expect(() => service['validateAnswers'](baseQuestions, answers)).toThrow(
      /Unknown questionId/,
    );
  });

  it('computes mismatch when strong signals exist without updates', () => {
    const mismatchCxFit: CxFitV2Result = {
      ...baseCxFit,
      rubric: {
        ...baseCxFit.rubric,
        dimensionPercents: {
          ...(baseCxFit.rubric.dimensionPercents as any),
          role_scope_and_seniority: 50,
        } as any,
      },
      debug: {
        ...(baseCxFit.debug as any),
        bandDelta: 4,
      } as any,
    };
    const context = buildContext({
      cxFit: mismatchCxFit,
      toolCoverage: {
        ...baseToolCoverage,
        missingRequired: ['aws', 'kubernetes', 'terraform'],
      },
    });

    const outcome = service['computeOutcome'](
      context,
      baseQuestions,
      validAnswers,
    );
    expect(outcome.outcome).toBe('mismatch');
    expect(outcome.triggeredBy).toContain('seniority_mismatch');
    expect(outcome.triggeredBy).toContain('core_skill_mismatch');
  });

  it('recommends update when a trigger fires', () => {
    const answers = [
      { questionId: 'role_evolution', type: 'boolean', value: true },
      ...validAnswers.slice(1),
    ];

    const context = buildContext({
      cxFit: {
        ...baseCxFit,
        score: 90,
        components: {
          ...baseCxFit.components,
          scope: 85,
          leadership: 80,
        },
        bands: {
          baselineBand: 'L4',
          roleBand: 'L5',
          bandDelta: 1,
        },
      },
      toolCoverage: {
        ...baseToolCoverage,
        requiredCoverage: 1,
      },
    });

    const outcome = service['computeOutcome'](context, baseQuestions, answers);
    expect(outcome.outcome).toBe('update_recommended');
    expect(outcome.triggeredBy).toContain('role_evolution');
    expect(outcome.suggestedBaselineSections).toContain('experience');
  });

  it('returns valid when no signals or triggers exist', () => {
    const answers = [...validAnswers];
    const context = buildContext({
      cxFit: {
        ...baseCxFit,
        score: 90,
        components: {
          ...baseCxFit.components,
          scope: 90,
          leadership: 85,
        },
        bands: {
          baselineBand: 'L5',
          roleBand: 'L5',
          bandDelta: 0,
        },
      },
      toolCoverage: {
        ...baseToolCoverage,
        missingRequired: ['aws'],
      },
    });

    const outcome = service['computeOutcome'](context, baseQuestions, answers);
    expect(outcome.outcome).toBe('valid');
  });
});
