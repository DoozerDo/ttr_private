import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Interview } from './interview.entity';
import { InterviewRecordsService } from './interview-records.service';
import { GapDetectionService } from './gap-detection.service';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { InterviewGap, InterviewQuestion } from './interview-types';

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
    recommendedAdditions: ['add'],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const createMockRepository = () => ({
    create: jest.fn((data: Partial<Interview>) => ({ ...mockInterview, ...data })),
    save: jest.fn(async (data: Interview) => data),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(async (data: Interview) => data),
  });

  const createService = (
    repository = createMockRepository(),
    gapDetectionService: Partial<GapDetectionService> = {},
    interviewQuestionGenerator: Partial<InterviewQuestionGeneratorService> = {},
  ) =>
    new InterviewRecordsService(
      repository as never,
      gapDetectionService as GapDetectionService,
      interviewQuestionGenerator as InterviewQuestionGeneratorService,
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
        recommendedAdditions: [' add '],
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

    const record = await service.getInterviewRecordForUser('interview-1', 'user-1');

    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 'interview-1', userId: 'user-1' } });
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
    const service = createService(repository);

    const result = await service.updateInterviewRecord('interview-1', 'user-1', {
      jobId: ' job-3 ',
      gapList: [{ gapId: 'gap-2' }],
      validationResults: { ok: false },
      recommendedAdditions: [' new '],
    });

    expect(repository.save).toHaveBeenCalled();
    expect(result.jobId).toBe('job-3');
    expect(result.gapList).toEqual([{ gapId: 'gap-2' }]);
    expect(result.validationResults).toEqual({ ok: false });
    expect(result.recommendedAdditions).toEqual([' new ']);
  });

  it('throws when updating with empty jobId', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({ ...mockInterview });
    const service = createService(repository);

    await expect(
      service.updateInterviewRecord('interview-1', 'user-1', { jobId: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
