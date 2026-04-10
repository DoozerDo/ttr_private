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

function getScenarioFitScore(
  bundle: ReturnType<typeof listSyntheticGenerationScenarioBundles>[number],
): number {
  switch (bundle.scenario.expected.fitBand) {
    case 'strong':
      return Math.max(bundle.scenario.expected.minFitScore, 86);
    case 'moderate':
      return Math.max(bundle.scenario.expected.minFitScore, 74);
    case 'weak':
      return Math.max(bundle.scenario.expected.minFitScore, 64);
    case 'blocked':
      return 42;
    default:
      return bundle.scenario.expected.minFitScore;
  }
}

function buildResumePayload(
  bundle: ReturnType<typeof listSyntheticGenerationScenarioBundles>[number],
  plan: { roleLens?: { priorities?: string[]; requiredSignals?: string[] } } = {},
) {
  const signals = [
    ...(plan.roleLens?.priorities ?? []),
    ...(plan.roleLens?.requiredSignals ?? []),
  ].filter(Boolean);
  const highlightSignals = Array.from(
    new Set([
      ...bundle.scenario.expected.requiredRoleSignals,
      ...(signals.length > 0 ? signals : []),
    ]),
  );
  if (bundle.benchmark && bundle.scenario.expected.generationMode === 'generate') {
    return {
      summary: bundle.benchmark.approvedBenchmarkResume.summary,
      experience: [
        {
          bullets: [...bundle.benchmark.approvedBenchmarkResume.bullets],
        },
      ],
    };
  }
  return {
    summary: `${bundle.scenario.title} focused on ${highlightSignals.slice(0, 4).join(', ')} and practical cross-functional execution.`,
    experience: [
      {
        bullets: bundle.baseline.sections.slice(0, 3).map(
          (section, index) =>
            `${section.content} This keeps ${highlightSignals[index] ?? highlightSignals[0]} visible for the team while reinforcing ${highlightSignals.join(', ')} across the work.`,
        ),
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
  const highlightSignals = Array.from(
    new Set([
      ...bundle.scenario.expected.requiredRoleSignals,
      ...(signals.length > 0 ? signals : []),
    ]),
  );
  if (bundle.benchmark && bundle.scenario.expected.generationMode === 'generate') {
    return {
      opening: bundle.benchmark.approvedBenchmarkCoverLetter.opening,
      bodyParagraphs: [...bundle.benchmark.approvedBenchmarkCoverLetter.bodyParagraphs],
      closingParagraph: bundle.benchmark.approvedBenchmarkCoverLetter.closingParagraph,
    };
  }
  return {
    salutation: 'Dear Hiring Team,',
    opening: `I am applying for the ${bundle.job.title} role at ${bundle.job.company} because my background lines up with the work described here. I have led customer facing operations where the goal was to keep workflow clear, make ownership visible, and help teams stay steady when demand changes. That mix of practical leadership and service discipline is what I would bring to this role.`,
    bodyParagraphs: [
      `In my recent work, I have focused on ${highlightSignals.join(', ')}. I have used operating reviews, escalation paths, and clear reporting to make it easier for leaders to see what needs attention. I also like work that connects the day to day execution with a longer term improvement plan, because that is how teams get more predictable over time and how service quality stays visible.`,
      `I would also bring a collaborative style across support, product, and engineering. When those groups share the same picture of the work, it becomes easier to remove recurring issues, keep customers informed, and improve the experience for the people doing the work. I try to be direct, calm, and practical so the team can keep moving while keeping ${highlightSignals.slice(0, 3).join(', ')} visible in the operating rhythm.`,
      `The opportunity is appealing because it combines service quality, operational rhythm, and cross functional follow through. That combination matches the way I like to work and the kind of value I expect to add. I would welcome the chance to contribute to a team that wants measurable improvement, clear ownership, and stronger results across ${highlightSignals.join(', ')}.`,
    ],
    closingParagraph: `I would welcome the opportunity to discuss how I can help your team keep service quality visible and the workflow practical. I would aim to bring steady execution, clear communication, and a reliable operating rhythm from the first weeks on the job.`,
    signoff: 'Sincerely,',
    signatureName: 'Synthetic Candidate',
  };
}

function buildHarnessService() {
  const bundles = listSyntheticGenerationScenarioBundles();
  const bundlesByJobId = new Map(bundles.map((bundle) => [bundle.job.id, bundle]));
  const usersService = { findByEmail: async () => null, create: async () => ({}) };
  const jobsService = { createJob: async () => ({}) };
  const analysisService = {
    runFitAssessment: async (_userId: string, input: { jobId: string }) => ({
      status: 'ok',
      assessmentId: `analysis-${input.jobId}`,
      score: getScenarioFitScore(bundlesByJobId.get(input.jobId) ?? bundles[0]),
      verdict: 'APPLY',
      summary: 'Synthetic fit evaluation',
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

  const service = new SyntheticTransactionRunnerService();

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
            scenarioId: scenario.scenarioId,
            scenario: scenario.scenario,
            scenarioTitle: scenario.scenarioTitle,
            personaKey: scenario.personaKey,
            baselineFixtureId: scenario.baselineFixtureId,
            jobFixtureId: scenario.jobFixtureId,
            tags: scenario.tags,
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
