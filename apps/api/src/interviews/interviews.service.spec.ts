import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { InterviewSession } from './interview-session.entity';

describe('InterviewsService', () => {
  const mockInterview: InterviewSession = {
    id: 'interview-1',
    userId: 'user-1',
    baselineId: 'baseline-1',
    jobId: null,
    status: 'scheduled',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    responses: [],
  };

  const createMockRepository = () => ({
    create: jest.fn((data: Partial<InterviewSession>) => ({ ...mockInterview, ...data })),
    save: jest.fn((data: InterviewSession) =>
      Promise.resolve({
        ...mockInterview,
        ...data,
        id: data.id || 'new-id',
      }),
    ),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn((data: InterviewSession) => Promise.resolve(data)),
  });

  const createService = (repository = createMockRepository()) =>
    new InterviewsService(repository as never);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createInterview', () => {
    it('creates interview with required fields', async () => {
      const repository = createMockRepository();
      const service = createService(repository);

      const result = await service.createInterview('user-1', {
        baselineId: 'baseline-1',
        date: '2024-02-01',
        type: 'phone',
        jobId: 'job-1',
      });

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        baselineId: 'baseline-1',
        jobId: 'job-1',
        status: 'phone',
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result.status).toBe('phone');
      expect(result.createdAt).toEqual(new Date('2024-02-01'));
    });

    it('throws when date is missing', async () => {
      const service = createService();

      await expect(
        service.createInterview('user-1', { baselineId: 'baseline-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when baselineId is missing', async () => {
      const service = createService();

      await expect(
        service.createInterview('user-1', { date: '2024-02-01' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listInterviewsForUser', () => {
    it('lists interviews for user ordered by createdAt', async () => {
      const repository = createMockRepository();
      repository.find.mockResolvedValue([mockInterview]);
      const service = createService(repository);

      const result = await service.listInterviewsForUser('user-1');

      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual([mockInterview]);
    });
  });

  describe('getInterviewForUser', () => {
    it('returns interview when found', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(mockInterview);
      const service = createService(repository);

      const interview = await service.getInterviewForUser('interview-1', 'user-1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'interview-1', userId: 'user-1' },
      });
      expect(interview).toEqual(mockInterview);
    });

    it('throws when interview not found', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(null);
      const service = createService(repository);

      await expect(service.getInterviewForUser('interview-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateInterview', () => {
    it('updates interview fields with validation', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue({ ...mockInterview });
      const service = createService(repository);

      const result = await service.updateInterview('interview-1', 'user-1', {
        date: '2024-03-01',
        type: 'onsite',
        jobId: 'job-2',
        baselineId: 'baseline-2',
        status: 'confirmed',
      });

      expect(repository.save).toHaveBeenCalled();
      expect(result.jobId).toBe('job-2');
      expect(result.baselineId).toBe('baseline-2');
      expect(result.status).toBe('confirmed');
      expect(result.createdAt).toEqual(new Date('2024-03-01'));
    });

    it('throws when type is empty', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue({ ...mockInterview });
      const service = createService(repository);

      await expect(
        service.updateInterview('interview-1', 'user-1', { type: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when date is empty', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue({ ...mockInterview });
      const service = createService(repository);

      await expect(
        service.updateInterview('interview-1', 'user-1', { date: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteInterview', () => {
    it('removes interview for user', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(mockInterview);
      const service = createService(repository);

      const result = await service.deleteInterview('interview-1', 'user-1');

      expect(repository.remove).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true, id: 'interview-1' });
    });
  });
});
