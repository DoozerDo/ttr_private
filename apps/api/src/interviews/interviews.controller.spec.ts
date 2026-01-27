import { BadRequestException } from '@nestjs/common';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

describe('InterviewsController', () => {
  const createMockRequest = (userId?: string) =>
    ({ user: userId ? { id: userId } : undefined }) as {
      user?: { id?: string };
    };

  const createMockService = () =>
    ({
      createInterview: jest.fn().mockResolvedValue({ id: 'interview-1' }),
      listInterviewsForUser: jest.fn().mockResolvedValue([]),
      getInterviewForUser: jest.fn().mockResolvedValue({ id: 'interview-1' }),
      startInterviewFromFitReview: jest
        .fn()
        .mockResolvedValue({ id: 'interview-1', jobId: 'job-1' }),
      updateInterview: jest
        .fn()
        .mockResolvedValue({ id: 'interview-1', status: 'scheduled' }),
      deleteInterview: jest
        .fn()
        .mockResolvedValue({ deleted: true, id: 'interview-1' }),
    }) as unknown as InterviewsService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when user is missing on create', async () => {
    const service = createMockService();
    const controller = new InterviewsController(service);

    await expect(
      controller.createInterview({}, createMockRequest()),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates interview with user context', async () => {
    const service = createMockService();
    const controller = new InterviewsController(service);
    const request = createMockRequest('user-1');
    const body = {
      baselineId: 'baseline-1',
      date: '2024-02-01',
      type: 'phone',
    };

    await controller.createInterview(body, request as any);

    expect(service.createInterview).toHaveBeenCalledWith('user-1', body);
  });

  it('lists interviews for user', async () => {
    const service = createMockService();
    const controller = new InterviewsController(service);
    const request = createMockRequest('user-1');

    await boundList(request as any);

    expect(service.listInterviewsForUser).toHaveBeenCalledWith('user-1');
  });

  it('gets interview for user', async () => {
    const service = createMockService();
    const controller = new InterviewsController(service);
    const request = createMockRequest('user-1');

    const boundGet = controller.getInterview.bind(controller);
    await boundGet('interview-1', request as any);

    expect(service.getInterviewForUser).toHaveBeenCalledWith(
      'interview-1',
      'user-1',
    );
  });

  it('starts interview from fit review', async () => {
    const service = createMockService();
    const controller = new InterviewsController(service);
    const request = createMockRequest('user-1');
    const body = { jobId: 'job-1', baselineId: 'baseline-1' };

    const boundStart = controller.startInterviewFromFitReview.bind(controller);
    await boundStart(body, request as any);

    expect(service.startInterviewFromFitReview).toHaveBeenCalledWith(
      'user-1',
      body,
    );
  });

  it('updates interview for user', async () => {
    const service = createMockService();
    const controller = new InterviewsController(service);
    const request = createMockRequest('user-1');
    const update = { status: 'confirmed' };

    const boundUpdate = controller.updateInterview.bind(controller);
    await boundUpdate('interview-1', update, request as any);

    expect(service.updateInterview).toHaveBeenCalledWith(
      'interview-1',
      'user-1',
      update,
    );
  });

  it('deletes interview for user', async () => {
    const service = createMockService();
    const controller = new InterviewsController(service);
    const request = createMockRequest('user-1');

    const boundDelete = controller.deleteInterview.bind(controller);
    await boundDelete('interview-1', request as any);

    expect(service.deleteInterview).toHaveBeenCalledWith(
      'interview-1',
      'user-1',
    );
  });
});
