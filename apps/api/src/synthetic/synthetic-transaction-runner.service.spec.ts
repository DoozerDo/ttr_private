import { SyntheticTransactionRunnerService } from './synthetic-transaction-runner.service';

describe('SyntheticTransactionRunnerService', () => {
  const buildService = () => {
    let capturedRunId = 'run-id';
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
      create: jest.fn((x) => {
        capturedRunId = x.syntheticRunId ?? capturedRunId;
        return x;
      }),
      save: jest.fn().mockResolvedValue({ id: 'run-log-1' }),
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
    });

    return {
      service,
      usersService,
      jobsService,
      analysisService,
      resumeService,
      coverLettersService,
      opportunitiesService,
      userRepository,
      baselineRepository,
      baselineSectionRepository,
      fitAssessmentRepository,
      coverLetterRepository,
      opportunityRepository,
      applicationRepository,
      syntheticRunRepository,
      getCapturedRunId: () => capturedRunId,
    };
  };

  it('executes happy path and records success with propagated metadata', async () => {
    const {
      service,
      usersService,
      jobsService,
      analysisService,
      resumeService,
      coverLettersService,
      opportunitiesService,
      userRepository,
      baselineRepository,
      fitAssessmentRepository,
      coverLetterRepository,
      opportunityRepository,
      applicationRepository,
      syntheticRunRepository,
      getCapturedRunId,
    } = buildService();
    jest
      .spyOn(service as any, 'assertSyntheticPropagation')
      .mockResolvedValue(undefined);

    usersService.findByEmail.mockResolvedValue({
      id: 'u1',
      isSynthetic: true,
      preserveFromCleanup: true,
    });
    userRepository.findOneOrFail.mockResolvedValue({ id: 'u1' });

    baselineRepository.findOne.mockResolvedValue({
      id: 'b1',
      isSynthetic: true,
      preserveFromCleanup: true,
      versions: [{ id: 'bv1' }],
    });

    jobsService.createJob.mockResolvedValue({ job: { id: 'j1' } });
    analysisService.runFitAssessment.mockResolvedValue({
      status: 'ok',
      assessmentId: 'a1',
      score: 82,
      verdict: 'APPLY',
    });
    resumeService.generateResume.mockResolvedValue({
      status: 'success',
      preview: { resume: { experience: [{ company: 'X' }] } },
      trackerEntryId: 't1',
      opportunityId: 'o-from-resume',
    });
    coverLettersService.generateCoverLetter.mockResolvedValue({
      status: 'success',
      id: 'cl1',
      preview: { coverLetter: { content: 'This is a valid synthetic preview paragraph.' } },
    });
    fitAssessmentRepository.findOneOrFail.mockResolvedValue({ id: 'a1', overallScore: 82 });
    opportunitiesService.upsertOpportunity.mockResolvedValue({ id: 'o1', currentScore: 82 });

    fitAssessmentRepository.findOne.mockImplementation(async () => ({
      isSynthetic: true,
      syntheticRunId: getCapturedRunId(),
    }));
    opportunityRepository.findOne.mockImplementation(async () => ({
      isSynthetic: true,
      syntheticRunId: getCapturedRunId(),
    }));
    coverLetterRepository.findOne.mockImplementation(async () => ({
      isSynthetic: true,
      syntheticRunId: getCapturedRunId(),
    }));
    applicationRepository.findOne.mockImplementation(async () => ({
      isSynthetic: true,
      syntheticRunId: getCapturedRunId(),
    }));

    const result = await service.runCoreLoopSmoke();
    expect(result.status).toBe('succeeded');
    expect(result.stepResults.every((step) => step.status === 'succeeded')).toBe(true);
    expect(syntheticRunRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runType: 'synthetic_transaction',
        triggerSource: 'manual',
        scenarioKey: 'core_loop_smoke',
      }),
    );
    expect(analysisService.runFitAssessment).toHaveBeenCalledWith(
      'u1',
      expect.any(Object),
    );
    expect(resumeService.generateResume).toHaveBeenCalledWith(
      'u1',
      expect.any(Object),
      undefined,
      expect.objectContaining({ isSynthetic: true }),
    );
    expect(coverLettersService.generateCoverLetter).toHaveBeenCalledWith(
      'u1',
      expect.any(Object),
      expect.objectContaining({ isSynthetic: true }),
    );
    expect(opportunitiesService.upsertOpportunity).toHaveBeenCalledWith(
      'u1',
      expect.any(Object),
      expect.objectContaining({ isSynthetic: true }),
    );
    expect(syntheticRunRepository.update).toHaveBeenCalledWith(
      'run-log-1',
      expect.objectContaining({ status: 'succeeded' }),
    );
  });

  it('records failed status and step details on intermediate failure', async () => {
    const {
      service,
      usersService,
      userRepository,
      baselineRepository,
      jobsService,
      analysisService,
      syntheticRunRepository,
    } = buildService();
    jest
      .spyOn(service as any, 'assertSyntheticPropagation')
      .mockResolvedValue(undefined);

    usersService.findByEmail.mockResolvedValue({ id: 'u1', isSynthetic: true, preserveFromCleanup: true });
    userRepository.findOneOrFail.mockResolvedValue({ id: 'u1' });
    baselineRepository.findOne.mockResolvedValue({ id: 'b1', isSynthetic: true, preserveFromCleanup: true, versions: [{ id: 'bv1' }] });
    jobsService.createJob.mockResolvedValue({ job: { id: 'j1' } });
    analysisService.runFitAssessment.mockResolvedValue({ status: 'compliance_blocked' });

    const result = await service.runCoreLoopSmoke();

    expect(result.status).toBe('failed');
    expect(result.stepResults.some((step) => step.step === 'run_fit_assessment' && step.status === 'failed')).toBe(true);
    expect(syntheticRunRepository.update).toHaveBeenCalledWith(
      'run-log-1',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('fails business assertion when resume preview is missing structured content', async () => {
    const {
      service,
      usersService,
      userRepository,
      baselineRepository,
      jobsService,
      analysisService,
      resumeService,
    } = buildService();
    jest
      .spyOn(service as any, 'assertSyntheticPropagation')
      .mockResolvedValue(undefined);

    usersService.findByEmail.mockResolvedValue({ id: 'u1', isSynthetic: true, preserveFromCleanup: true });
    userRepository.findOneOrFail.mockResolvedValue({ id: 'u1' });
    baselineRepository.findOne.mockResolvedValue({ id: 'b1', isSynthetic: true, preserveFromCleanup: true, versions: [{ id: 'bv1' }] });
    jobsService.createJob.mockResolvedValue({ job: { id: 'j1' } });
    analysisService.runFitAssessment.mockResolvedValue({ status: 'ok', assessmentId: 'a1', score: 80, verdict: 'APPLY' });
    resumeService.generateResume.mockResolvedValue({ status: 'success', preview: { resume: null } });

    const result = await service.runCoreLoopSmoke();

    expect(result.status).toBe('failed');
    expect(result.stepResults.some((step) => step.step === 'generate_resume_preview' && step.status === 'failed')).toBe(true);
  });

  it('does not recreate preserved baseline fixture when it already exists', async () => {
    const { service, baselineRepository, baselineSectionRepository } = buildService() as any;

    baselineRepository.findOne.mockResolvedValue({
      id: 'b1',
      isSynthetic: true,
      preserveFromCleanup: true,
      versions: [{ id: 'bv1' }],
    });

    const baseline = await service.resolveOrCreateBaselineFixture('u1', {
      scenarioKey: 'core_loop_smoke',
      runId: 'run-1',
      syntheticCreatedAt: new Date(),
    });

    expect(baseline.id).toBe('b1');
    expect(baselineSectionRepository.save).not.toHaveBeenCalled();
  });
});
