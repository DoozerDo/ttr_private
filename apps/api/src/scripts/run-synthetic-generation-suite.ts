import { Logger } from '@nestjs/common';
import { SyntheticTransactionRunnerService } from '../synthetic/synthetic-transaction-runner.service';
import { listSyntheticGenerationScenarioBundles } from '../synthetic/generation/synthetic-generation.fixtures';

function findBundleForPlan(plan: {
  roleLens?: { requiredSignals?: string[]; priorities?: string[] };
  positioningFrame?: string;
}) {
  const bundles = listSyntheticGenerationScenarioBundles();
  return (
    bundles.find((bundle) => {
      const requiredSignals = plan.roleLens?.requiredSignals ?? [];
      const priorities = plan.roleLens?.priorities ?? [];
      const scenarioSignals = bundle.scenario.expected.requiredRoleSignals;
      return (
        scenarioSignals.every((signal) =>
          requiredSignals.some((candidate) => candidate.toLowerCase() === signal.toLowerCase()) ||
          priorities.some((candidate) => candidate.toLowerCase() === signal.toLowerCase()),
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

function buildHarnessService() {
  const usersService = { findByEmail: async () => null, create: async () => ({}) };
  const jobsService = { createJob: async () => ({}) };
  const analysisService = {
    runFitAssessment: async (_userId: string, input: { jobId: string }) => ({
      status: 'ok',
      assessmentId: `analysis-${input.jobId}`,
      score: 86,
      verdict: 'APPLY',
      summary: 'Strong fit',
      strengths: ['Support operations rigor', 'Cross-functional leadership'],
      gaps: [],
      recommendedActions: [],
    }),
  };
  const resumeService = {
    generateResume: async (_userId: string, options: { documentStrategyPlan?: Record<string, any> }) => {
      const bundle = findBundleForPlan(options.documentStrategyPlan ?? {});
      return {
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        preview: {
          resume: buildResumePayload(bundle, options.documentStrategyPlan as any),
        },
      };
    },
  };
  const coverLettersService = {
    generateCoverLetter: async (_userId: string, options: { documentStrategyPlan?: Record<string, any> }) => {
      const bundle = findBundleForPlan(options.documentStrategyPlan ?? {});
      return {
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        exports: { docx: true, pdf: true },
        preview: {
          coverLetter: buildCoverLetterPayload(bundle, options.documentStrategyPlan as any),
        },
      };
    },
  };
  const opportunitiesService = { upsertOpportunity: async () => ({}) };
  const inMemoryRepo = {
    findOneOrFail: async () => ({}),
    findOne: async () => null,
    save: async (value: any) => value,
    create: (value: any) => value,
    update: async () => undefined,
    find: async () => [],
  };

  const service = new SyntheticTransactionRunnerService(
    usersService as never,
    jobsService as never,
    analysisService as never,
    resumeService as never,
    coverLettersService as never,
    opportunitiesService as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
    inMemoryRepo as never,
  );

  (service as any).resolveOrCreateSyntheticUser = async () => ({
    id: 'synthetic-user-1',
    createdAt: new Date('2026-04-08T12:00:00.000Z'),
    isSynthetic: true,
    preserveFromCleanup: true,
  });
  (service as any).resolveOrCreateSyntheticBaselineFixture = async (_userId: string, fixture: { id: string }) => ({
    id: fixture.id,
    versions: [{ id: `${fixture.id}-version-1` }],
  });
  (service as any).resolveOrCreateSyntheticJobFixture = async (
    _userId: string,
    fixture: { id: string; title: string; company: string; rawDescription: string },
  ) => ({
    id: fixture.id,
    title: fixture.title,
    company: fixture.company,
    rawDescription: fixture.rawDescription,
  });

  return {
    service,
    userRepository: inMemoryRepo,
  };
}

async function main() {
  const logger = new Logger('SyntheticGenerationSuite');
  const { service } = buildHarnessService();

  try {
    const result = await service.runDocumentGenerationHarnessSuite('manual');
    logger.log(
      JSON.stringify(
        {
          status: result.status,
          passCount: result.passCount,
          failCount: result.failCount,
          scenarios: result.scenarioResults.map((scenario) => ({
            scenario: scenario.scenario,
            status: scenario.status,
            fitScore: scenario.fitScore,
            roleMatchReadiness: scenario.roleMatchReadiness,
            calibrationBarPassed: scenario.calibrationBarPassed,
            overallCalibration: scenario.overallCalibration,
            highSeverityCalibrationGapCount: scenario.highSeverityCalibrationGapCount,
            failureReasons: scenario.failureReasons,
          })),
        },
        null,
        2,
      ),
    );

    process.exitCode = result.status === 'pass' ? 0 : 1;
  } catch (error) {
    logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
