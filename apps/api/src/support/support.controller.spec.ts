import { ForbiddenException } from '@nestjs/common';
import { SupportController } from './support.controller';

jest.mock('../common/sentry', () => ({
  captureSupportEvent: jest.fn(),
  isSentryEnabled: jest.fn(() => false),
}));

describe('SupportController', () => {
  const supportService = {
    reportBug: jest.fn(),
    ingestAutoError: jest.fn(),
    getUserHistory: jest.fn(),
    recordStillSeeingIssue: jest.fn(),
    getConfiguration: jest.fn(),
    getSupportStatus: jest.fn(),
    getErrorHealth: jest.fn(),
  } as any;
  const criticalFlowTrackerService = {
    getCriticalFlowHealth: jest.fn(),
  } as any;

  const controller = new SupportController(supportService, criticalFlowTrackerService);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('blocks error health for non-admin users', async () => {
    await expect(
      controller.getErrorHealth(
        { user: { id: 'u1', role: 'member' } } as any,
        '10',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns error health for admin users', async () => {
    supportService.getErrorHealth.mockReturnValue([{ fingerprint: 'abc' }]);

    const result = await controller.getErrorHealth(
      { user: { id: 'u2', role: 'admin' } } as any,
      '25',
    );

    expect(supportService.getErrorHealth).toHaveBeenCalledWith({ limit: 25 });
    expect(result).toEqual({ items: [{ fingerprint: 'abc' }] });
  });

  it('blocks critical flow health for non-admin users', async () => {
    await expect(
      controller.getCriticalFlowHealth(
        { user: { id: 'u1', role: 'member' } } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns critical flow health for admin users', async () => {
    criticalFlowTrackerService.getCriticalFlowHealth.mockReturnValue([{ flowName: 'score_generated' }]);
    const result = await controller.getCriticalFlowHealth(
      { user: { id: 'u2', role: 'admin' } } as any,
    );
    expect(criticalFlowTrackerService.getCriticalFlowHealth).toHaveBeenCalled();
    expect(result).toEqual({ items: [{ flowName: 'score_generated' }] });
  });

  it('records still-seeing signal for the authenticated user', async () => {
    supportService.recordStillSeeingIssue.mockResolvedValue({ issueNumber: 55, count: 1 });

    const result = await controller.markStillSeeing(
      { issueNumber: 55 } as any,
      { user: { id: 'u9', role: 'member' } } as any,
    );

    expect(supportService.recordStillSeeingIssue).toHaveBeenCalledWith('u9', 55);
    expect(result).toEqual({ issueNumber: 55, count: 1 });
  });

  it('returns support status', async () => {
    supportService.getSupportStatus.mockReturnValue({ bugReporting: 'MISCONFIGURED' });
    const result = await controller.getStatus();
    expect(result).toEqual({ bugReporting: 'MISCONFIGURED' });
  });

  it('returns typed bug report submission metadata', async () => {
    supportService.reportBug.mockResolvedValue({
      issueNumber: 123,
      issueUrl: 'https://github.com/org/repo/issues/123',
      sentryEventId: 'event-1',
    });

    const result = await controller.reportBug(
      { message: 'Valid bug report message' } as any,
      { user: { id: 'u1', role: 'member' } } as any,
    );

    expect(result).toMatchObject({
      status: 'submission_success',
      reportId: '123',
      issueNumber: 123,
      issueUrl: 'https://github.com/org/repo/issues/123',
      sentryEventId: 'event-1',
    });
  });
});
