import { BadRequestException } from '@nestjs/common';
import { SyntheticCleanupController } from './synthetic-cleanup.controller';

describe('SyntheticCleanupController', () => {
  const cleanupService = {
    getCleanupConfig: jest.fn(),
    listRecentRuns: jest.fn(),
    getSyntheticDataSummary: jest.fn(),
    runCleanup: jest.fn(),
  } as any;

  const controller = new SyntheticCleanupController(cleanupService);

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('requires explicit dryRun flag', async () => {
    await expect(
      controller.triggerCleanup({} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks non-destructive production manual cleanup', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      controller.triggerCleanup({ dryRun: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('triggers cleanup with manual source and explicit dryRun false', async () => {
    process.env.NODE_ENV = 'production';
    cleanupService.runCleanup.mockResolvedValue({ ok: true });

    const result = await controller.triggerCleanup({
      dryRun: false,
      scenarioKey: 'beta-smoke',
      syntheticRunId: 'run-1',
    });

    expect(cleanupService.runCleanup).toHaveBeenCalledWith({
      dryRun: false,
      triggerSource: 'manual',
      scenarioKey: 'beta-smoke',
      syntheticRunId: 'run-1',
    });
    expect(result).toEqual({ ok: true });
  });
});
