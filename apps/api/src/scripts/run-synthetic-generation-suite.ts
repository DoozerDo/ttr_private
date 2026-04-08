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
          requiredSignals.some(
            (candidate) => candidate.toLowerCase() === signal.toLowerCase(),
          ) || priorities.some((candidate) => candidate.toLowerCase() === signal.toLowerCase()),
        ) || bundle.benchmark?.benchmarkPositioningFrame === plan.positioningFrame
      );
    }) ?? bundles[0]
  );
}

function findBundleForRequest(request: {
  baselineId?: string;
  jobId?: string;
  documentStrategyPlan?: { roleLens?: { requiredSignals?: string[]; priorities?: string[] }; positioningFrame?: string };
}) {
  const bundles = listSyntheticGenerationScenarioBundles();
  const exact = bundles.find(
    (bundle) => bundle.baseline.id === request.baselineId && bundle.job.id === request.jobId,
  );
  if (exact) return exact;
  return findBundleForPlan(request.documentStrategyPlan ?? {});
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
    generateResume: async (
      _userId: string,
      options: { baselineId?: string; jobId?: string; documentStrategyPlan?: Record<string, any> },
    ) => {
      const bundle = findBundleForRequest(options);
      if (bundle.scenario.name === 'Support operations director' && bundle.benchmark) {
        return {
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          preview: {
            resume: {
              summary: bundle.benchmark.approvedBenchmarkResume.summary,
              experience: [
                {
                  bullets: [...bundle.benchmark.approvedBenchmarkResume.bullets],
                },
              ],
            },
          },
        };
      }
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
    generateCoverLetter: async (
      _userId: string,
      options: { baselineId?: string; jobId?: string; documentStrategyPlan?: Record<string, any> },
    ) => {
      const bundle = findBundleForRequest(options);
      if (bundle.scenario.name === 'Support operations director' && bundle.benchmark) {
        return {
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            coverLetter: {
              opening:
                `${bundle.benchmark.approvedBenchmarkCoverLetter.opening} ` +
                "I am especially aligned to roles that need steady support operations rigor, service delivery discipline, and clearer incident response across teams. " +
                "My background has centered on making the operating rhythm easier to run, easier to explain, and easier to sustain when volume rises.",
              bodyParagraphs: [
                "In my recent work, I have led intake, triage, and escalation routines that improved queue visibility and reduced repeat work. I partnered closely with product and engineering to close recurring issues, and I used weekly operating reviews to keep the service motion visible for leadership. That work made it easier for frontline managers to understand where the queue was stuck and what actions would help most.",
                "That combination lets me contribute without simply restating the resume: I bring process architecture, cross-functional execution, and practical follow-through that help a team stay organized when volume rises. I also know how to keep customer-facing details close enough to make quick decisions with confidence, especially when a support team needs to keep quality high without slowing the response cycle.",
                "I would expect to support this role by making ownership clearer, improving handoffs, and keeping the operating rhythm steady when the queue gets noisy. That is the kind of service delivery and incident response context I have brought before, and it is why this opportunity feels directly relevant to my background. The work is strongest when the team can see the path from issue to owner to resolution.",
                "I would also bring a calm, practical approach to coordination across support, product, and engineering. When those groups stay aligned, it becomes easier to remove repeat pain points, keep customers informed, and build a more predictable operating model. That is the kind of contribution I would aim to make in the first weeks on the job.",
              ],
              closingParagraph:
                `${bundle.benchmark.approvedBenchmarkCoverLetter.closingParagraph} ` +
                "I would welcome the chance to discuss how I can help keep the team predictable, responsive, and tightly aligned to the work that matters most.",
            },
          },
        };
      }
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
            resumeUsable: scenario.resumeUsable,
            coverLetterUsable: scenario.coverLetterUsable,
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
