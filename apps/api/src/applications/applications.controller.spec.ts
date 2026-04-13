import { BadRequestException } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationStage } from './application.entity';

describe('ApplicationsController', () => {
  const createMockRequest = (userId?: string) =>
    ({ user: userId ? { id: userId } : undefined }) as {
      user?: { id?: string };
    };

  const createMockResponse = () => {
    const response: Partial<{ setHeader: jest.Mock; send: jest.Mock }> = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    response.send.mockReturnValue('csv-data');

    return response;
  };

  const createMockService = () =>
    ({
      createApplication: jest.fn().mockResolvedValue({ id: 'app-1' }),
      listApplicationsForUser: jest.fn().mockResolvedValue([]),
      getApplicationForUser: jest.fn().mockResolvedValue({ id: 'app-1' }),
      updateApplication: jest
        .fn()
        .mockResolvedValue({ id: 'app-1', stage: ApplicationStage.APPLIED }),
      getApplicationForPair: jest.fn().mockResolvedValue({ id: 'app-pair-1' }),
      upsertApplicationForPair: jest.fn().mockResolvedValue({ id: 'app-pair-1' }),
      deleteApplication: jest
        .fn()
        .mockResolvedValue({ deleted: true, id: 'app-1' }),
      exportApplicationsToCsv: jest.fn().mockResolvedValue({
        csv: 'csv-data',
        auditId: 'audit-id',
        baselineVersionHash: 'hash-id',
      }),
      buildInsightsForUser: jest
        .fn()
        .mockResolvedValue([{ type: 'warning', message: 'Insight' }]),
    }) as unknown as ApplicationsService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when user is missing', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);

    await expect(
      controller.createApplication(
        { company: 'Acme', title: 'Engineer' } as any,
        createMockRequest(),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates application with user context', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);
    const body = { company: 'Acme', title: 'Engineer' };
    const request = createMockRequest('user-1');

    await controller.createApplication(body as any, request as any);

    expect(service.createApplication).toHaveBeenCalledWith('user-1', body);
  });

  it('lists applications with filters', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);
    const request = createMockRequest('user-1');

    await controller.listApplications(
      request as any,
      ApplicationStage.SAVED,
      'Acme',
    );

    expect(service.listApplicationsForUser).toHaveBeenCalledWith('user-1', {
      stage: ApplicationStage.SAVED,
      company: 'Acme',
    });
  });

  it('gets application for a baseline and job pair', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);
    const request = createMockRequest('user-1');

    await controller.getApplicationForPair(request as any, 'base-1', 'job-1');

    expect(service.getApplicationForPair).toHaveBeenCalledWith(
      'user-1',
      'base-1',
      'job-1',
    );
  });

  it('upserts application for a baseline and job pair', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);
    const request = createMockRequest('user-1');
    const body = { baselineId: 'base-1', jobId: 'job-1' };

    await controller.upsertApplicationForPair(body as any, request as any);

    expect(service.upsertApplicationForPair).toHaveBeenCalledWith({
      ...body,
      userId: 'user-1',
    });
  });

  it('gets application for user', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);
    const request = createMockRequest('user-1');

    await controller.getApplication('app-1', request as any);

    expect(service.getApplicationForUser).toHaveBeenCalledWith(
      'app-1',
      'user-1',
    );
  });

  it('updates application for user', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);
    const request = createMockRequest('user-1');
    const update = { stage: ApplicationStage.INTERVIEWING };

    await controller.updateApplication('app-1', update as any, request as any);

    expect(service.updateApplication).toHaveBeenCalledWith(
      'app-1',
      'user-1',
      update,
    );
  });

  it('deletes application for user', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);
    const request = createMockRequest('user-1');

    await controller.deleteApplication('app-1', request as any);

    expect(service.deleteApplication).toHaveBeenCalledWith('app-1', 'user-1');
  });

  it('exports applications as csv and sets headers', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);
    const request = createMockRequest('user-1');
    const response = createMockResponse();

    await controller.exportApplications(request as any, response as any);

    expect(service.exportApplicationsToCsv).toHaveBeenCalledWith('user-1');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="applications.csv"',
    );
    expect(response.send).toHaveBeenCalledWith('csv-data');
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Compliance-Audit-Id',
      'audit-id',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Baseline-Version-Hash',
      'hash-id',
    );
  });

  it('returns user insights', async () => {
    const service = createMockService();
    const controller = new ApplicationsController(service);
    const request = createMockRequest('user-1');

    const result = await controller.getInsights(request as any);

    expect(service.buildInsightsForUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([{ type: 'warning', message: 'Insight' }]);
  });
});
