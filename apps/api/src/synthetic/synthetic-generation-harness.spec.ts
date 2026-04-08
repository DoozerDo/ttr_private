import { SyntheticTransactionRunnerService } from './synthetic-transaction-runner.service';
import { listSyntheticGenerationScenarioBundles } from './generation/synthetic-generation.fixtures';

function findBundleForPlan(plan: { roleLens?: { requiredSignals?: string[]; priorities?: string[] }; positioningFrame?: string }) {
  const bundles = listSyntheticGenerationScenarioBundles();
  return (
    bundles.find((bundle) => {
      const requiredSignals = plan.roleLens?.requiredSignals ?? [];
      const priorities = plan.roleLens?.priorities ?? [];
      const scenarioSignals = bundle.scenario.expected.requiredRoleSignals;
      return (
        scenarioSignals.every((signal) =>
          requiredSignals.some(
            (candidate) => candidate.toLowerCase() === signal.toLowerCase(),
          ) || priorities.some((candidate) => candidate.toLowerCase() === signal.toLowerCase()),
        ) || bundle.benchmark?.benchmarkPositioningFrame === plan.positioningFrame
      );
    }) ?? bundles[0]
  );
}

function buildResumePayload(
  bundle: ReturnType<typeof listSyntheticGenerationScenarioBundles>[number],
  plan: { roleLens?: { priorities?: string[]; requiredSignals?: string[] } } = {},
) {
  const signals = [
    ...(plan.roleLens?.priorities ?? []),
    ...(plan.roleLens?.requiredSignals ?? []),
  ].filter(Boolean);
  const highlightSignals = signals.length > 0 ? signals : bundle.scenario.expected.requiredRoleSignals;
  return {
    summary: `${bundle.benchmark?.approvedBenchmarkResume.summary ?? ''} Focused on ${highlightSignals.join(', ')}.`,
    experience: [
      {
        bullets: [
          `${bundle.benchmark?.approvedBenchmarkResume.bullets[0] ?? ''} Built around ${highlightSignals[0]} and ${highlightSignals[1] ?? highlightSignals[0]}.`,
          `${bundle.benchmark?.approvedBenchmarkResume.bullets[1] ?? ''} Reinforced ${highlightSignals[1] ?? highlightSignals[0]} and ${highlightSignals[2] ?? highlightSignals[0]}.`,
          `${bundle.benchmark?.approvedBenchmarkResume.bullets[2] ?? ''} Kept ${highlightSignals[2] ?? highlightSignals[0]} and ${highlightSignals[3] ?? highlightSignals[0]} visible for leadership.`,
        ].filter(Boolean),
      },
    ],
  };
}

function buildCoverLetterPayload(
  bundle: ReturnType<typeof listSyntheticGenerationScenarioBundles>[number],
  plan: { roleLens?: { priorities?: string[]; requiredSignals?: string[] } } = {},
) {
  const signals = [
    ...(plan.roleLens?.priorities ?? []),
    ...(plan.roleLens?.requiredSignals ?? []),
  ].filter(Boolean);
  const highlightSignals = signals.length > 0 ? signals : bundle.scenario.expected.requiredRoleSignals;
  return {
    salutation: 'Dear Hiring Team,',
    opening: `${bundle.benchmark?.approvedBenchmarkCoverLetter.opening ?? ''} I would bring ${highlightSignals.join(', ')} to the team.`,
    bodyParagraphs: [
      `${bundle.benchmark?.approvedBenchmarkCoverLetter.bodyParagraphs[0] ?? ''} That work centered on ${highlightSignals[0]} and ${highlightSignals[1] ?? highlightSignals[0]}.`,
      `${bundle.benchmark?.approvedBenchmarkCoverLetter.bodyParagraphs[1] ?? ''} It also required ${highlightSignals[2] ?? highlightSignals[0]} and ${highlightSignals[3] ?? highlightSignals[0]} every day.`,
    ].filter(Boolean),
    closingParagraph: `${bundle.benchmark?.approvedBenchmarkCoverLetter.closingParagraph ?? ''} I would welcome the chance to keep delivering ${highlightSignals[0]} and ${highlightSignals[1] ?? highlightSignals[0]}.`,
    signoff: 'Sincerely,',
    signatureName: 'Synthetic Candidate',
  };
}

describe('SyntheticGenerationHarness', () => {
  const buildService = () => {
    const usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    } as any;
    const jobsService = { createJob: jest.fn() } as any;
    const analysisService = { runFitAssessment: jest.fn() } as any;
    const resumeService = { generateResume: jest.fn() } as any;
    const coverLettersService = { generateCoverLetter: jest.fn() } as any;
    const opportunitiesService = { upsertOpportunity: jest.fn() } as any;

    const userRepository = { findOneOrFail: jest.fn(), findOne: jest.fn(), save: jest.fn() } as any;
    const baselineRepository = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() } as any;
    const baselineSectionRepository = { create: jest.fn(), save: jest.fn() } as any;
    const baselineVersionRepository = { create: jest.fn(), save: jest.fn() } as any;
    const baselineBlockPolicyRepository = { create: jest.fn(), save: jest.fn() } as any;
    const jobRepository = { findOne: jest.fn() } as any;
    const fitAssessmentRepository = { findOneOrFail: jest.fn(), findOne: jest.fn() } as any;
    const coverLetterRepository = { findOne: jest.fn() } as any;
    const opportunityRepository = { findOne: jest.fn() } as any;
    const applicationRepository = { findOne: jest.fn() } as any;
    const syntheticRunRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'synthetic-run-1' })),
      update: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    } as any;

    const service = new SyntheticTransactionRunnerService(
      usersService,
      jobsService,
      analysisService,
      resumeService,
      coverLettersService,
      opportunitiesService,
      userRepository,
      baselineRepository,
      baselineSectionRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobRepository,
      fitAssessmentRepository,
      coverLetterRepository,
      opportunityRepository,
      applicationRepository,
      syntheticRunRepository,
    );

    return {
      service,
      usersService,
      jobsService,
      analysisService,
      resumeService,
      coverLettersService,
      userRepository,
      syntheticRunRepository,
    };
  };

  it('runs all curated scenarios and returns a structured pass result', async () => {
    const {
      service,
      analysisService,
      resumeService,
      coverLettersService,
      userRepository,
      syntheticRunRepository,
    } = buildService();

    const user = {
      id: 'user-1',
      createdAt: new Date('2026-04-08T10:00:00.000Z'),
      isSynthetic: true,
      preserveFromCleanup: true,
    };
    jest.spyOn(service as any, 'resolveOrCreateSyntheticUser').mockResolvedValue(user);
    userRepository.findOneOrFail.mockResolvedValue(user);
    jest.spyOn(service as any, 'resolveOrCreateSyntheticBaselineFixture').mockImplementation(
      async (_userId: string, fixture: { id: string }) => ({
        id: fixture.id,
        versions: [{ id: `${fixture.id}-version-1` }],
      }),
    );
    jest.spyOn(service as any, 'resolveOrCreateSyntheticJobFixture').mockImplementation(
      async (_userId: string, fixture: { id: string; title: string; company: string; rawDescription: string }) => ({
        id: fixture.id,
        title: fixture.title,
        company: fixture.company,
        rawDescription: fixture.rawDescription,
      }),
    );

    analysisService.runFitAssessment.mockImplementation(async (_userId: string, input: { jobId: string }) => ({
      status: 'ok',
      assessmentId: `analysis-${input.jobId}`,
      score: 86,
      verdict: 'APPLY',
      summary: 'Strong fit for support operations leadership and service delivery.',
      strengths: ['Support operations rigor', 'Cross-functional leadership'],
      gaps: [],
      recommendedActions: [],
    }));

    resumeService.generateResume.mockImplementation(async (_userId: string, options: { documentStrategyPlan?: { roleLens?: { requiredSignals?: string[]; priorities?: string[] }; positioningFrame?: string } }) => {
      const bundle = findBundleForPlan(options.documentStrategyPlan ?? {});
      return {
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        preview: {
          resume: buildResumePayload(bundle, options.documentStrategyPlan),
        },
      };
    });

    coverLettersService.generateCoverLetter.mockImplementation(async (_userId: string, options: { documentStrategyPlan?: { roleLens?: { requiredSignals?: string[]; priorities?: string[] }; positioningFrame?: string } }) => {
      const bundle = findBundleForPlan(options.documentStrategyPlan ?? {});
      return {
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        exports: { docx: true, pdf: true },
        preview: {
          coverLetter: buildCoverLetterPayload(bundle, options.documentStrategyPlan),
        },
      };
    });

    const result = await service.runDocumentGenerationHarnessSuite();
    const scenarioBundles = listSyntheticGenerationScenarioBundles();

    expect(result.status).toBe('pass');
    expect(result.passCount).toBe(scenarioBundles.length);
    expect(result.failCount).toBe(0);
    expect(result.scenarioResults).toHaveLength(scenarioBundles.length);
    for (const scenario of result.scenarioResults) {
      expect(scenario.status).toBe('pass');
      expect(scenario.fitScore).toBeGreaterThanOrEqual(80);
      expect(scenario.resumeGenerated).toBe(true);
      expect(scenario.coverLetterGenerated).toBe(true);
      expect(scenario.roleMatchReadiness).toBe("needs_tightening");
      expect(scenario.failureReasons).toEqual([]);
    }
    expect(syntheticRunRepository.save).toHaveBeenCalled();
    expect(syntheticRunRepository.update).toHaveBeenCalled();
  });
});
