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
    opening: `I am applying for the ${bundle.job.title} role at ${bundle.job.company} because my background lines up with the work described here. I have led customer facing operations where the goal was to keep workflow clear, make ownership visible, and help teams stay steady when demand changes. That mix of practical leadership and service discipline is what I would bring to this role, especially when ${highlightSignals[0]} needs to stay measurable under real pressure.`,
    bodyParagraphs: [
      `In my recent work, I have focused on ${highlightSignals[0]} and ${highlightSignals[1] ?? highlightSignals[0]}. I use operating reviews, clear escalation paths, and practical reporting so leaders can see what needs attention without noise. The goal is steadier execution over time, not more process.`,
      `I have built lightweight routines that keep ${highlightSignals[2] ?? highlightSignals[0]} visible without adding overhead: clear definitions for severity, handoffs that reduce ambiguity, and simple dashboards that show trend lines. That makes the next action obvious and helps leaders back the right fix sooner.`,
      `I also bring a collaborative style across support, product, and engineering. When those groups share the same picture of the work, it becomes easier to remove recurring issues and keep customers informed. I try to be direct, calm, and practical so the team can keep moving while keeping ${highlightSignals.slice(0, 3).join(', ')} visible in the operating rhythm.`,
      `If selected, I would start by learning the current operating model, identifying where the queue and escalations create avoidable noise, and partnering with the team to tighten the workflow one step at a time. I would aim to keep owners clear and keep ${highlightSignals[1] ?? highlightSignals[0]} steady even when demand changes.`,
    ],
    closingParagraph: `I would welcome the opportunity to discuss how I can help your team keep service quality visible and the workflow practical. Thank you for your time and consideration.`,
    signoff: 'Sincerely,',
    signatureName: 'Synthetic Candidate',
  };
}

describe('SyntheticGenerationHarness', () => {
  const buildService = () => {
    const bundles = listSyntheticGenerationScenarioBundles();
    const bundlesByJobId = new Map(bundles.map((bundle) => [bundle.job.id, bundle]));
    const usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    } as any;
    const jobsService = { createJob: jest.fn() } as any;
    const analysisService = {
      runFitAssessment: jest.fn(async (_userId: string, input: { jobId: string }) => ({
        status: 'ok',
        assessmentId: `analysis-${input.jobId}`,
        score: getScenarioFitScore(bundlesByJobId.get(input.jobId) ?? bundles[0]),
        verdict: 'APPLY',
        summary: 'Synthetic fit evaluation.',
        strengths: ['Support operations rigor', 'Cross-functional leadership'],
        gaps: [],
        recommendedActions: [],
      })),
    } as any;
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

    const service = new SyntheticTransactionRunnerService({
      usersService,
      jobsService,
      analysisService,
      resumeService,
      coverLettersService,
      opportunitiesService,
      userRepository,
      syntheticRunRepository,
    });

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

  it('runs the catalog-driven scenarios and returns a structured pass result', async () => {
    const {
      service,
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

    resumeService.generateResume.mockImplementation(async (_userId: string, options: { baselineId?: string; jobId?: string; documentStrategyPlan?: { roleLens?: { requiredSignals?: string[]; priorities?: string[] }; positioningFrame?: string } }) => {
      const bundle = findBundleForRequest(options);
      if (bundle.benchmark && bundle.scenario.expected.generationMode === 'generate') {
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
      if (bundle.scenario.expected.generationMode === 'blocked') {
        return {
          status: 'success',
          generationStatus: 'blocked',
          exportReady: false,
          preview: { resume: null },
        };
      }
      return {
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        preview: {
          resume: buildResumePayload(bundle, options.documentStrategyPlan),
        },
      };
    });

    coverLettersService.generateCoverLetter.mockImplementation(async (_userId: string, options: { baselineId?: string; jobId?: string; documentStrategyPlan?: { roleLens?: { requiredSignals?: string[]; priorities?: string[] }; positioningFrame?: string } }) => {
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
                "In my recent work, I have led intake, triage, and escalation routines that improved queue visibility and reduced repeat work. I partnered closely with product and engineering to close recurring issues, and I used weekly operating reviews to keep the service motion visible for leadership. That work made it easier for the support team to understand where the queue was stuck and what actions would help most.",
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
      if (bundle.benchmark && bundle.scenario.expected.generationMode === 'generate') {
        const benchmarkOpening = bundle.benchmark.approvedBenchmarkCoverLetter.opening.replace(
          /^\s*(i am|i'm)\s+/i,
          'Bringing ',
        );
        const benchmarkBody = bundle.benchmark.approvedBenchmarkCoverLetter.bodyParagraphs.map(
          (paragraph, index) => {
            const leadIn =
              index === 0 ? 'First, ' : index === 1 ? 'Next, ' : index === 2 ? 'Also, ' : 'Finally, ';
            return `${leadIn}${paragraph}`;
          },
        );
        return {
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          exports: { docx: true, pdf: true },
          preview: {
            coverLetter: {
              opening: benchmarkOpening,
              bodyParagraphs: benchmarkBody,
              closingParagraph: bundle.benchmark.approvedBenchmarkCoverLetter.closingParagraph,
            },
          },
        };
      }
      if (bundle.scenario.expected.generationMode === 'blocked') {
        return {
          status: 'success',
          generationStatus: 'blocked',
          exportReady: false,
          exports: { docx: false, pdf: false },
          preview: { coverLetter: null },
        };
      }
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

    if (result.status !== 'pass') {
      const failures = result.scenarioResults
        .filter((scenario) => scenario.status !== 'pass')
        .map((scenario) => ({
          scenario: scenario.scenario,
          reasons: scenario.failureReasons.slice(0, 3),
        }))
        .slice(0, 5);
      throw new Error(`Harness suite failed: ${JSON.stringify(failures)}`);
    }

    expect(result.status).toBe('pass');
    expect(result.passCount).toBe(scenarioBundles.length);
    expect(result.failCount).toBe(0);
    expect(result.scenarioResults).toHaveLength(scenarioBundles.length);
    for (const scenario of result.scenarioResults) {
      expect(scenario.scenarioId).toBeTruthy();
      expect(scenario.scenarioTitle).toBeTruthy();
      expect(scenario.personaKey).toBeTruthy();
      expect(Array.isArray(scenario.tags)).toBe(true);
      expect(scenario.fitScore).not.toBeNull();
      expect(scenario.failureReasons).toHaveLength(0);

      if (scenario.tags.includes('blocked')) {
        expect(scenario.resumeGenerated).toBe(false);
        expect(scenario.coverLetterGenerated).toBe(false);
        expect(scenario.resumeUsable).toBeNull();
        expect(scenario.coverLetterUsable).toBeNull();
        expect(scenario.roleMatchReadiness).toBeNull();
        expect(scenario.overallCalibration).toBeNull();
        expect(scenario.calibrationBarPassed).toBeNull();
      } else {
        expect(scenario.resumeGenerated).toBe(true);
        expect(scenario.coverLetterGenerated).toBe(true);
        expect(scenario.resumeUsable).toBe(true);
        expect(scenario.coverLetterUsable).toBe(true);
        expect(scenario.roleMatchReadiness).toMatch(/ready|needs_tightening/);
        if (scenario.tags.includes('calibration-backed')) {
          expect(scenario.calibrationBarPassed).toBe(true);
          // The minimum bar is "close" and above; "aligned" is aspirational and may
          // fluctuate as style checks evolve.
          expect(scenario.overallCalibration).toMatch(/aligned|close/);
        } else {
          expect(scenario.calibrationBarPassed).toBeNull();
          expect(scenario.overallCalibration).toBeNull();
        }
      }
    }
    expect(syntheticRunRepository.save).toHaveBeenCalled();
    expect(syntheticRunRepository.update).toHaveBeenCalled();
  });
});
