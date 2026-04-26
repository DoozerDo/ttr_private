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
    const baselineSectionRepository = {
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;
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
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      coverLetterRepository,
      opportunityRepository,
      applicationRepository,
      syntheticRunRepository,
      getCapturedRunId: () => capturedRunId,
    };
  };

  it('creates a synthetic user with a passwordHash when missing', async () => {
    const { service, usersService } = buildService();

    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue({ id: 'u-synth', email: 'synthetic@example.com', isSynthetic: true });

    const user = await (service as any).resolveOrCreateSyntheticUser();

    expect(user).toMatchObject({ id: 'u-synth' });
    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'synthetic@example.com',
        passwordHash: expect.any(String),
        firstName: expect.any(String),
        lastName: expect.any(String),
        emailConfirmed: true,
      }),
      expect.objectContaining({ isSynthetic: true }),
    );
    const passwordHash = usersService.create.mock.calls[0][0].passwordHash;
    expect(typeof passwordHash).toBe('string');
    expect(passwordHash.length).toBeGreaterThan(0);
  });

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
    expect(jobsService.createJob).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        rawDescription: expect.any(String),
      }),
    );
    const jobPayload = jobsService.createJob.mock.calls[0][1];
    expect(typeof jobPayload.rawDescription).toBe('string');
    expect(jobPayload.rawDescription.length).toBeGreaterThanOrEqual(1000);
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

  it('is idempotent when job creation hits JOB_DUPLICATE conflict', async () => {
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
      jobRepository,
      fitAssessmentRepository,
      coverLetterRepository,
      opportunityRepository,
      applicationRepository,
    } = buildService();
    jest.spyOn(service as any, 'assertSyntheticPropagation').mockResolvedValue(undefined);

    usersService.findByEmail.mockResolvedValue({ id: 'u1', isSynthetic: true, preserveFromCleanup: true });
    userRepository.findOneOrFail.mockResolvedValue({ id: 'u1' });
    baselineRepository.findOne.mockResolvedValue({ id: 'b1', isSynthetic: true, preserveFromCleanup: true, versions: [{ id: 'bv1' }] });

    jobsService.createJob
      .mockResolvedValueOnce({ job: { id: 'j1' } })
      .mockRejectedValueOnce(
        Object.assign(new Error('Conflict Exception'), {
          name: 'ConflictException',
          getResponse: () => ({ error: { code: 'JOB_DUPLICATE', existingJobId: 'j1' } }),
        }),
      );
    jobRepository.findOne.mockResolvedValue({ id: 'j1', userId: 'u1' });

    analysisService.runFitAssessment.mockResolvedValue({ status: 'ok', assessmentId: 'a1', score: 82, verdict: 'APPLY' });
    resumeService.generateResume.mockResolvedValue({ status: 'success', preview: { resume: { experience: [{ company: 'X' }] } } });
    coverLettersService.generateCoverLetter.mockResolvedValue({ status: 'success', preview: { coverLetter: { content: 'ok' } } });
    opportunitiesService.upsertOpportunity.mockResolvedValue({ id: 'o1', currentScore: 82 });

    fitAssessmentRepository.findOneOrFail.mockResolvedValue({ id: 'a1', overallScore: 82 });
    fitAssessmentRepository.findOne.mockResolvedValue({ isSynthetic: true });
    coverLetterRepository.findOne.mockResolvedValue({ isSynthetic: true });
    opportunityRepository.findOne.mockResolvedValue({ isSynthetic: true });
    applicationRepository.findOne.mockResolvedValue({ isSynthetic: true });

    const first = await service.runCoreLoopSmoke();
    const second = await service.runCoreLoopSmoke();

    expect(first.status).toBe('succeeded');
    expect(second.status).toBe('succeeded');
    expect(jobRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'j1', userId: 'u1' },
      }),
    );
  });

  it('reuses existing job when JobsService.createJob throws a plain ConflictException', async () => {
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
      jobRepository,
      fitAssessmentRepository,
      coverLetterRepository,
      opportunityRepository,
      applicationRepository,
    } = buildService();
    jest.spyOn(service as any, 'assertSyntheticPropagation').mockResolvedValue(undefined);

    usersService.findByEmail.mockResolvedValue({ id: 'u1', isSynthetic: true, preserveFromCleanup: true });
    userRepository.findOneOrFail.mockResolvedValue({ id: 'u1' });
    baselineRepository.findOne.mockResolvedValue({ id: 'b1', isSynthetic: true, preserveFromCleanup: true, versions: [{ id: 'bv1' }] });

    jobsService.createJob.mockRejectedValue(
      Object.assign(new Error('Conflict Exception'), {
        name: 'ConflictException',
        getResponse: () => ({ statusCode: 409, message: 'Conflict' }),
      }),
    );
    jobRepository.findOne.mockResolvedValue({
      id: 'j-existing',
      userId: 'u1',
      title: 'Core loop synthetic role',
      company: 'TargetThisRole Synthetic',
      rawDescription: 'Core loop synthetic job description (local deterministic fixture).\n\nBody',
      createdAt: new Date(),
    });

    analysisService.runFitAssessment.mockResolvedValue({ status: 'ok', assessmentId: 'a1', score: 82, verdict: 'APPLY' });
    resumeService.generateResume.mockResolvedValue({ status: 'success', preview: { resume: { experience: [{ company: 'X' }] } } });
    coverLettersService.generateCoverLetter.mockResolvedValue({ status: 'success', preview: { coverLetter: { content: 'ok' } } });
    opportunitiesService.upsertOpportunity.mockResolvedValue({ id: 'o1', currentScore: 82 });

    fitAssessmentRepository.findOneOrFail.mockResolvedValue({ id: 'a1', overallScore: 82 });
    fitAssessmentRepository.findOne.mockResolvedValue({ isSynthetic: true });
    coverLetterRepository.findOne.mockResolvedValue({ isSynthetic: true });
    opportunityRepository.findOne.mockResolvedValue({ isSynthetic: true });
    applicationRepository.findOne.mockResolvedValue({ isSynthetic: true });

    const result = await service.runCoreLoopSmoke();
    expect(result.status).toBe('succeeded');
    expect(analysisService.runFitAssessment).toHaveBeenCalledWith('u1', expect.objectContaining({ jobId: 'j-existing' }));
  });

  it('enriches create_job conflicts with exception shape details when reuse fails', async () => {
    const {
      service,
      usersService,
      jobsService,
      analysisService,
      userRepository,
      baselineRepository,
      jobRepository,
    } = buildService();
    jest.spyOn(service as any, 'assertSyntheticPropagation').mockResolvedValue(undefined);

    usersService.findByEmail.mockResolvedValue({ id: 'u1', isSynthetic: true, preserveFromCleanup: true });
    userRepository.findOneOrFail.mockResolvedValue({ id: 'u1' });
    baselineRepository.findOne.mockResolvedValue({ id: 'b1', isSynthetic: true, preserveFromCleanup: true, versions: [{ id: 'bv1' }] });

    jobsService.createJob.mockRejectedValue(
      Object.assign(new Error('Conflict Exception'), {
        response: { statusCode: 409, message: 'Conflict' },
        status: 409,
      }),
    );
    jobRepository.findOne.mockResolvedValue(null);
    analysisService.runFitAssessment.mockResolvedValue({ status: 'ok' });

    const result = await service.runCoreLoopSmoke();
    expect(result.status).toBe('failed');
    const createJobStep = result.stepResults.find((s) => s.step === 'create_job');
    expect(createJobStep?.status).toBe('failed');
    expect(createJobStep?.errorMessage ?? '').toContain('step=create_job');
    expect(createJobStep?.errorMessage ?? '').toContain('Exception=');
  });

  it('retries when cover letter generation is in flight', async () => {
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
      jobRepository,
      fitAssessmentRepository,
      coverLetterRepository,
      opportunityRepository,
      applicationRepository,
    } = buildService();
    jest.spyOn(service as any, 'assertSyntheticPropagation').mockResolvedValue(undefined);

    usersService.findByEmail.mockResolvedValue({ id: 'u1', isSynthetic: true, preserveFromCleanup: true });
    userRepository.findOneOrFail.mockResolvedValue({ id: 'u1' });
    baselineRepository.findOne.mockResolvedValue({ id: 'b1', isSynthetic: true, preserveFromCleanup: true, versions: [{ id: 'bv1' }] });

    jobsService.createJob.mockResolvedValue({ job: { id: 'j1' } });
    jobRepository.findOne.mockResolvedValue({ id: 'j1', userId: 'u1' });

    analysisService.runFitAssessment.mockResolvedValue({ status: 'ok', assessmentId: 'a1', score: 82, verdict: 'APPLY' });
    resumeService.generateResume.mockResolvedValue({ status: 'success', preview: { resume: { experience: [{ company: 'X' }] } } });

    coverLettersService.generateCoverLetter
      .mockRejectedValueOnce(
        Object.assign(new Error('Conflict Exception'), {
          name: 'ConflictException',
          getResponse: () => ({ error: { code: 'generation_in_flight', runId: 'r1', dedupeKey: 'k1' } }),
        }),
      )
      .mockResolvedValueOnce({ status: 'success', preview: { coverLetter: { content: 'ok' } } });

    opportunitiesService.upsertOpportunity.mockResolvedValue({ id: 'o1', currentScore: 82 });

    fitAssessmentRepository.findOneOrFail.mockResolvedValue({ id: 'a1', overallScore: 82 });
    fitAssessmentRepository.findOne.mockResolvedValue({ isSynthetic: true });
    coverLetterRepository.findOne.mockResolvedValue({ isSynthetic: true });
    opportunityRepository.findOne.mockResolvedValue({ isSynthetic: true });
    applicationRepository.findOne.mockResolvedValue({ isSynthetic: true });

    const result = await service.runCoreLoopSmoke();
    expect(result.status).toBe('succeeded');
    expect(coverLettersService.generateCoverLetter).toHaveBeenCalledTimes(2);
  });

  it('returns enriched conflict diagnostics instead of generic Conflict Exception', async () => {
    const {
      service,
      usersService,
      jobsService,
      analysisService,
      userRepository,
      baselineRepository,
    } = buildService();
    jest.spyOn(service as any, 'assertSyntheticPropagation').mockResolvedValue(undefined);

    usersService.findByEmail.mockResolvedValue({ id: 'u1', isSynthetic: true, preserveFromCleanup: true });
    userRepository.findOneOrFail.mockResolvedValue({ id: 'u1' });
    baselineRepository.findOne.mockResolvedValue({ id: 'b1', isSynthetic: true, preserveFromCleanup: true, versions: [{ id: 'bv1' }] });

    jobsService.createJob.mockResolvedValue({ job: { id: 'j1' } });
    analysisService.runFitAssessment.mockRejectedValue(
      Object.assign(new Error('Conflict Exception'), {
        name: 'ConflictException',
        getResponse: () => ({ error: { code: 'generation_in_flight', runId: 'r1', dedupeKey: 'k1' } }),
      }),
    );

    const result = await service.runCoreLoopSmoke();
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('step=run_fit_assessment');
    expect(result.errorMessage).toContain('already in flight');
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
      userId: 'u1',
      isSynthetic: true,
      preserveFromCleanup: true,
      syntheticScenarioKey: 'core_loop_smoke',
      versions: [{ id: 'bv1' }],
    });
    baselineSectionRepository.createQueryBuilder.mockReturnValue({
      select: () => ({
        addSelect: () => ({
          where: () => ({
            getRawOne: async () => ({ sectionCount: '2', totalChars: '700' }),
          }),
        }),
      }),
    });

    const baseline = await service.resolveOrCreateBaselineFixture('u1', {
      scenarioKey: 'core_loop_smoke',
      runId: 'run-1',
      syntheticCreatedAt: new Date(),
    });

    expect(baseline.id).toBe('b1');
    expect(baselineSectionRepository.save).not.toHaveBeenCalled();
  });

  it('repairs a synthetic baseline fixture when sections are missing or too small', async () => {
    const { service, baselineRepository, baselineSectionRepository } = buildService() as any;

    baselineRepository.findOne.mockResolvedValue({
      id: 'b1',
      userId: 'u1',
      isSynthetic: true,
      preserveFromCleanup: true,
      syntheticScenarioKey: 'core_loop_smoke',
      versions: [{ id: 'bv1' }],
    });
    baselineSectionRepository.createQueryBuilder.mockReturnValue({
      select: () => ({
        addSelect: () => ({
          where: () => ({
            getRawOne: async () => ({ sectionCount: '0', totalChars: '0' }),
          }),
        }),
      }),
    });
    baselineSectionRepository.create.mockImplementation((value: any) => value);
    baselineSectionRepository.save.mockResolvedValue([]);

    const baseline = await service.resolveOrCreateBaselineFixture('u1', {
      scenarioKey: 'core_loop_smoke',
      runId: 'run-1',
      syntheticCreatedAt: new Date(),
    });

    expect(baseline.id).toBe('b1');
    expect(baselineSectionRepository.delete).toHaveBeenCalled();
    expect(baselineSectionRepository.save).toHaveBeenCalled();
  });

  it('enriches raw replace crashes so the API returns diagnostics', async () => {
    const {
      service,
      usersService,
      userRepository,
      baselineRepository,
      jobsService,
      analysisService,
      resumeService,
      coverLettersService,
    } = buildService();
    jest
      .spyOn(service as any, 'assertSyntheticPropagation')
      .mockResolvedValue(undefined);

    usersService.findByEmail.mockResolvedValue({ id: 'u1', isSynthetic: true, preserveFromCleanup: true });
    userRepository.findOneOrFail.mockResolvedValue({ id: 'u1' });
    baselineRepository.findOne.mockResolvedValue({ id: 'b1', userId: 'u1', isSynthetic: true, preserveFromCleanup: true, versions: [{ id: 'bv1' }] });

    jobsService.createJob.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'replace')"));
    analysisService.runFitAssessment.mockResolvedValue({ status: 'ok', assessmentId: 'a1', score: 80, verdict: 'APPLY' });
    resumeService.generateResume.mockResolvedValue({ status: 'success', preview: { resume: { experience: [{ company: 'X' }] } } });
    coverLettersService.generateCoverLetter.mockResolvedValue({ status: 'success' });

    const result = await service.runCoreLoopSmoke();

    expect(result.status).toBe('failed');
    expect(String(result.errorMessage ?? '')).toContain('Synthetic core loop seed crashed');
  });

  it('creates a baseline fixture with a non-null userId when missing', async () => {
    const { service, baselineRepository, baselineVersionRepository, baselineSectionRepository } = buildService() as any;

    baselineRepository.findOne.mockResolvedValue(null);
    baselineRepository.create.mockImplementation((value: any) => value);
    baselineRepository.save.mockResolvedValue({ id: 'b-new', userId: 'u1', storagePath: 'synthetic/path.pdf', versions: [] });

    baselineVersionRepository.create.mockImplementation((value: any) => value);
    baselineVersionRepository.save.mockResolvedValue({ id: 'bv-new' });

    baselineSectionRepository.create.mockImplementation((value: any) => value);
    baselineSectionRepository.save.mockResolvedValue([]);

    const baseline = await service.resolveOrCreateBaselineFixture('u1', {
      scenarioKey: 'core_loop_smoke',
      runId: 'run-1',
      syntheticCreatedAt: new Date(),
    });

    expect(baselineRepository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    expect(baseline.userId).toBe('u1');
  });
});
