import { BadRequestException } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunityStatus } from './opportunity.entity';

describe('OpportunitiesController', () => {
  const request = (userId?: string) => ({ user: userId ? { id: userId } : undefined });
  const response = () => ({
    setHeader: jest.fn(),
    send: jest.fn(),
  });

  const service = () =>
    ({
      createFromResumeStudio: jest.fn(),
      createFromFitReviewOverride: jest.fn(),
      listForUser: jest.fn().mockResolvedValue([]),
      listGroupedByCompany: jest.fn().mockResolvedValue([]),
      getActionsNeeded: jest.fn().mockResolvedValue([]),
      runBoundaryRescoreFromOverrides: jest.fn().mockResolvedValue({ updatedCount: 0 }),
      runDormancySweep: jest.fn().mockResolvedValue({ updatedCount: 0 }),
      exportForUser: jest.fn().mockResolvedValue('csv'),
      getByIdForUser: jest.fn(),
      transitionStatus: jest.fn(),
    }) as any;

  it('validates user context', async () => {
    const controller = new OpportunitiesController(service());
    await expect(controller.list(request() as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('forwards status transitions', async () => {
    const mock = service();
    const controller = new OpportunitiesController(mock);
    await controller.transitionStatus(
      'opp-1',
      { status: OpportunityStatus.APPLIED } as any,
      request('user-1') as any,
    );
    expect(mock.transitionStatus).toHaveBeenCalledWith(
      'opp-1',
      'user-1',
      OpportunityStatus.APPLIED,
      { manualReset: undefined },
    );
  });

  it('exports csv and json payloads', async () => {
    const mock = service();
    const controller = new OpportunitiesController(mock);

    const csvRes = response();
    await controller.export(request('user-1') as any, 'csv', csvRes as any);
    expect(csvRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );

    const jsonRes = response();
    await controller.export(request('user-1') as any, 'json', jsonRes as any);
    expect(jsonRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/json; charset=utf-8',
    );
  });
});

