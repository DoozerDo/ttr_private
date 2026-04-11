import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Interview } from './interview.entity';
import { InterviewRecordsService } from './interview-records.service';
import { GapDetectionService } from './gap-detection.service';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import {
  InterviewGap,
  InterviewQuestion,
  RecommendedAddition,
} from './interview-types';
import { BaselineVersionService } from '../baseline/baseline-version.service';
import { AnalysisService } from '../analysis/analysis.service';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';

describe('InterviewRecordsService', () => {
  const mockInterview: Interview = {
    id: 'interview-1',
    userId: 'user-1',
    baselineId: 'baseline-1',
    baselineVersionId: 'baseline-version-1',
    jobId: 'job-1',
    gapList: [],
    questions: [],
    responses: ['r1'],
    validationResults: { ok: true },
    recommendedAdditions: [
      {
        id: createHash('sha256')
          .update(JSON.stringify({ text: 'add', sources: [] }))
          .digest('hex'),
        text: 'add',
        sources: [],
        status: 'proposed',
      },
    ],
    acceptedAdditionIds: [],
    expandedFitAssessment: null,
    promotedBaselineVersionId: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const createMockRepository = () => ({
    create: jest.fn((data: Partial<Interview>) => ({
      ...mockInterview,
      ...data,
    })),
    save: jest.fn((data: Interview) => Promise.resolve(data)),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn((data: Interview) => Promise.resolve(data)),
  });

  const createAcceptedAdditionsRepository = () => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  });

  const createService = (
    repository = createMockRepository(),
    acceptedAdditionsRepository = createAcceptedAdditionsRepository(),
    baselineVersionRepository: Partial<{ findOne: jest.Mock }> = {},
    gapDetectionService: Partial<GapDetectionService> = {},
    interviewQuestionGenerator: Partial<InterviewQuestionGeneratorService> = {},
    recommendedAdditionsService: Partial<{
      generateFromResponses: () => RecommendedAddition[];
    }> = {
      generateFromResponses: jest.fn().mockReturnValue([]),
    },
    baselineVersionService: Partial<BaselineVersionService> = {
      approveVerifiedAdditions: jest.fn(),
    },
    analysisService?: Partial<AnalysisService>,
    workflowIdempotencyService: Partial<WorkflowIdempotencyService> = {
      reserve: jest.fn().mockResolvedValue({
        status: 'accepted_new',
        runId: 'run-1',
        dedupeKey: 'dedupe-1',
        recordId: 'record-1',
      }),
      complete: jest.fn().mockResolvedValue({ status: 'completed' }),
      markFailure: jest.fn().mockResolvedValue({ status: 'rejected_stale' }),
    },
  ) =>
    new InterviewRecordsService(
      repository as never,
      { ...createAcceptedAdditionsRepository(), ...acceptedAdditionsRepository } as never,
      {
        findOne: jest.fn().mockResolvedValue({ versionNumber: 1, fileHash: 'hash' }),
        ...baselineVersionRepository,
      } as never,
      {
        detectGaps: jest.fn().mockResolvedValue({
          baselineId: 'baseline-1',
          baselineVersionId: 'baseline-version-1',
          jobId: 'job-1',
          gaps: [],
        }),
        ...gapDetectionService,
      } as GapDetectionService,
      {
        generateQuestions: jest.fn().mockReturnValue([]),
        ...interviewQuestionGenerator,
      } as InterviewQuestionGeneratorService,
      recommendedAdditionsService as any,
      baselineVersionService as BaselineVersionService,
      analysisService as AnalysisService,
      workflowIdempotencyService as WorkflowIdempotencyService,
    );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates an interview record with required jobId and sanitization', async () => {
    const repository = createMockRepository();
    const gapList: InterviewGap[] = [
      {
        gapId: 'gap-1',
        domain: 'experience',
        jdExcerpt: 'JD item',
        baselineExcerpt: null,
        confidence: 'high',
      },
    ];
    const questions: InterviewQuestion[] = [
      {
        gapId: 'gap-1',
        category: 'Direct Experience',
        prompt: 'Question',
        jdReference: 'JD item',
      },
    ];
    const service = createService(
      repository,
      undefined,
      undefined,
      {
        detectGaps: jest.fn().mockResolvedValue({
          baselineId: 'baseline-1',
          baselineVersionId: 'baseline-version-1',
          jobId: 'job-2',
          gaps: gapList,
        }),
      },
      { generateQuestions: jest.fn().mockReturnValue(questions) },
    );

    const result = await service.createInterviewRecord('user-1', {
      jobId: ' job-2 ',
      baselineVersionId: 'baseline-version-1',
      responses: [' a '],
      recommendedAdditions: [' add '],
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-2',
        gapList,
        questions,
        responses: [' a '],
        recommendedAdditions: [
          {
            id: expect.any(String),
            sources: [],
            status: 'proposed',
            text: 'add',
          },
        ],
      }),
    );
    expect(result.jobId).toBe('job-2');
  });

  it('lists interview records for a user', async () => {
    const repository = createMockRepository();
    repository.find.mockResolvedValue([mockInterview]);
    const service = createService(repository);

    const records = await service.listInterviewRecordsForUser('user-1');

    expect(repository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { createdAt: 'DESC' },
    });
    expect(records).toEqual([mockInterview]);
  });

  it('retrieves an interview record for a user', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue(mockInterview);
    const service = createService(repository);

    const record = await service.getInterviewRecordForUser(
      'interview-1',
      'user-1',
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'interview-1', userId: 'user-1' },
    });
    expect(record).toEqual(mockInterview);
  });

  it('throws when interview record not found', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue(null);
    const service = createService(repository);

    await expect(
      service.getInterviewRecordForUser('missing', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an interview record with validation', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({ ...mockInterview });
    const recommendedAdditions = [
      { id: 'abc', text: 'addition', sources: [], status: 'proposed' as const },
    ];
    const service = createService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        generateFromResponses: jest.fn().mockReturnValue(recommendedAdditions),
      },
    );

    const result = await service.updateInterviewRecord(
      'interview-1',
      'user-1',
      {
        jobId: ' job-3 ',
        gapList: [{ gapId: 'gap-2' }],
        validationResults: { ok: false },
        responses: [' a '],
      },
    );

    expect(repository.save).toHaveBeenCalled();
    expect(result.jobId).toBe('job-3');
    expect(result.gapList).toEqual([{ gapId: 'gap-2' }]);
    expect(result.validationResults).toEqual({ ok: false });
    expect(result.recommendedAdditions).toEqual(recommendedAdditions);
  });

  it('throws when updating with empty jobId', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({ ...mockInterview });
    const service = createService(repository);

    await expect(
      service.updateInterviewRecord('interview-1', 'user-1', { jobId: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generates recommended additions when compliance allows', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({
      ...mockInterview,
      recommendedAdditions: [],
    });
    const additions = [
      { id: 'a', text: 'Addition 1', sources: [], status: 'proposed' as const },
    ];
    const recommendedAdditionsService = {
      generateFromResponses: jest.fn().mockReturnValue(additions),
    };
    const service = createService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      recommendedAdditionsService,
    );

    const result = await service.updateInterviewRecord(
      'interview-1',
      'user-1',
      {
        responses: [' Response '],
      },
    );

    expect(
      recommendedAdditionsService.generateFromResponses,
    ).toHaveBeenCalledWith({
      responses: [' Response '],
      questions: [],
      gaps: [],
    });
    expect(result.recommendedAdditions).toEqual(additions);
  });

  it('skips recommendations when compliance blocks', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({
      ...mockInterview,
      validationResults: {
        blocked: false,
        complianceFlags: [{ severity: 'block' }],
      },
    });
    const recommendedAdditionsService = {
      generateFromResponses: jest.fn(),
    };
    const service = createService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      recommendedAdditionsService,
    );

    const result = await service.updateInterviewRecord(
      'interview-1',
      'user-1',
      {
        responses: [' Response '],
      },
    );

    expect(
      recommendedAdditionsService.generateFromResponses,
    ).not.toHaveBeenCalled();
    expect(result.recommendedAdditions).toEqual([]);
  });

  it('applies decisions to recommended additions', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({
      ...mockInterview,
      recommendedAdditions: [
        {
          id: 'a1',
          text: 'Addition A',
          sources: [],
          status: 'proposed' as const,
        },
        {
          id: 'a2',
          text: 'Addition B',
          sources: [],
          status: 'proposed' as const,
        },
      ],
    });
    const baselineVersionService = { approveVerifiedAdditions: jest.fn() };
    const service = createService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      baselineVersionService,
    );

    const result = await service.applyAdditionDecisions(
      'interview-1',
      'user-1',
      {
        decisions: [
          { additionId: 'a1', decision: 'reject' },
          { additionId: 'a2', decision: 'defer' },
        ],
      },
    );

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(result.recommendedAdditions).toEqual([
      { id: 'a1', text: 'Addition A', sources: [], status: 'rejected' },
      { id: 'a2', text: 'Addition B', sources: [], status: 'deferred' },
    ]);
    expect(
      baselineVersionService.approveVerifiedAdditions,
    ).not.toHaveBeenCalled();
  });

  it('rejects promotion when no accepted additions are set', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({
      ...mockInterview,
      recommendedAdditions: [
        {
          id: 'a1',
          text: 'Addition A',
          sources: [],
          status: 'proposed' as const,
        },
      ],
      acceptedAdditionIds: [],
    });
    const baselineVersionService = { approveVerifiedAdditions: jest.fn() };
    const service = createService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      baselineVersionService,
    );

    await expect(
      service.promoteAcceptedAdditions('interview-1', 'user-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: 'invalid_promotion_state',
        }),
      }),
    });

    expect(
      baselineVersionService.approveVerifiedAdditions,
    ).not.toHaveBeenCalled();
  });

  it('stores expanded fit assessment when computed', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({
      ...mockInterview,
      recommendedAdditions: [
        {
          id: 'a1',
          text: 'Addition A',
          sources: [],
          status: 'proposed' as const,
        },
      ],
      acceptedAdditionIds: ['a1'],
    });
    const acceptedAdditionsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          suggestion: 'Addition A',
        },
      ]),
    };
    const baselineVersionRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ versionNumber: 4, fileHash: 'hash' }),
    };
    const analysisService = {
      runExpandedFitAssessment: jest.fn().mockResolvedValue({
        ok: true,
        originalScore: 72,
        expandedScore: 90,
        delta: 18,
      }),
    };
    const service = createService(
      repository,
      acceptedAdditionsRepository,
      baselineVersionRepository,
      {},
      {},
      undefined,
      undefined,
      analysisService,
    );

    const result = await service.computeExpandedFit('interview-1', 'user-1');

    expect(analysisService.runExpandedFitAssessment).toHaveBeenCalledWith(
      'user-1',
      {
        jobId: 'job-1',
        baselineId: 'baseline-1',
        baselineVersion: 4,
        interviewId: 'interview-1',
        verifiedAdditions: ['Addition A'],
      },
    );
    expect(result).toMatchObject({
      status: 'success',
      code: 'expanded_fit_ready',
      message: 'Expanded fit is ready.',
      retryable: false,
      nextAction: 'review_results',
      payload: expect.objectContaining({
        expandedFitAssessment: expect.objectContaining({
          ok: true,
          originalScore: 72,
          expandedScore: 90,
          delta: 18,
        }),
      }),
    });
    expect(repository.save).toHaveBeenCalled();
  });

  it('reuses a completed expanded fit computation instead of recomputing', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({
      ...mockInterview,
      recommendedAdditions: [
        {
          id: 'a1',
          text: 'Addition A',
          sources: [],
          status: 'proposed' as const,
        },
      ],
      acceptedAdditionIds: ['a1'],
    });
    const acceptedAdditionsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          suggestion: 'Addition A',
        },
      ]),
    };
    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue({ versionNumber: 4, fileHash: 'hash' }),
    };
    const analysisService = {
      runExpandedFitAssessment: jest.fn(),
    };
    const workflowIdempotencyService = {
      reserve: jest.fn().mockResolvedValue({
        status: 'existing_completed',
        runId: 'run-dup',
        dedupeKey: 'dedupe-dup',
        recordId: 'workflow-1',
        responseBody: {
          status: 'success',
          code: 'expanded_fit_ready',
          message: 'Expanded fit is ready.',
          retryable: false,
          nextAction: 'review_results',
          payload: {
            ...mockInterview,
            expandedFitAssessment: {
              ok: true,
              originalScore: 72,
              expandedScore: 90,
              delta: 18,
              requestHash: 'request-hash',
            },
          },
          runId: 'run-dup',
          idempotency: {
            status: 'existing_completed',
            runId: 'run-dup',
            dedupeKey: 'dedupe-dup',
            reused: true,
          },
        },
      }),
      complete: jest.fn(),
      markFailure: jest.fn(),
    };
    const service = createService(
      repository,
      acceptedAdditionsRepository,
      baselineVersionRepository,
      {},
      {},
      undefined,
      undefined,
      analysisService,
      workflowIdempotencyService as any,
    );

    const result = await service.computeExpandedFit('interview-1', 'user-1');

    expect(result.status).toBe('success');
    expect(result.idempotency?.reused).toBe(true);
    expect(analysisService.runExpandedFitAssessment).not.toHaveBeenCalled();
  });

  it('returns a typed failure when the baseline linkage is invalid', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({
      ...mockInterview,
      baselineVersionId: 'missing-version',
      acceptedAdditionIds: ['a1'],
      recommendedAdditions: [
        {
          id: 'a1',
          text: 'Addition A',
          sources: [],
          status: 'proposed' as const,
        },
      ],
    });
    const acceptedAdditionsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          suggestion: 'Addition A',
        },
      ]),
    };
    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const service = createService(repository, acceptedAdditionsRepository, baselineVersionRepository);

    await expect(
      service.computeExpandedFit('interview-1', 'user-1'),
    ).resolves.toMatchObject({
      status: 'error',
      code: 'baseline_version_mismatch',
      nextAction: 'return_to_baseline',
      retryable: true,
    });
  });

  it('surfaces a typed failure when expanded fit analysis throws unexpectedly', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({
      ...mockInterview,
      acceptedAdditionIds: ['a1'],
      recommendedAdditions: [
        {
          id: 'a1',
          text: 'Addition A',
          sources: [],
          status: 'proposed' as const,
        },
      ],
    });
    const acceptedAdditionsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          suggestion: 'Addition A',
        },
      ]),
    };
    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue({ versionNumber: 4, fileHash: 'hash' }),
    };
    const analysisService = {
      runExpandedFitAssessment: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const service = createService(
      repository,
      acceptedAdditionsRepository,
      baselineVersionRepository,
      {},
      {},
      undefined,
      undefined,
      analysisService,
    );

    await expect(
      service.computeExpandedFit('interview-1', 'user-1'),
    ).resolves.toMatchObject({
      status: 'error',
      code: 'computation_failed',
      nextAction: 'retry_compute',
      retryable: true,
    });
  });

  it('deletes an interview record', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue(mockInterview);
    const service = createService(repository);

    const result = await service.deleteInterviewRecord('interview-1', 'user-1');

    expect(repository.remove).toHaveBeenCalledWith(mockInterview);
    expect(result).toEqual({ deleted: true, id: 'interview-1' });
  });
});
