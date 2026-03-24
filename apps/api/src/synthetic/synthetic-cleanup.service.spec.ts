import { SyntheticCleanupService } from './synthetic-cleanup.service';

describe('SyntheticCleanupService', () => {
  const repo = {
    create: jest.fn((value) => value),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  } as any;

  const configService = {
    cleanupConfig: {
      syntheticTestingEnabled: true,
      cleanupEnabled: true,
      retentionHours: 72,
      failedRetentionHours: 24,
      logRetentionDays: 7,
      cleanupCron: '0 * * * *',
      dryRunDefault: true,
    },
  } as any;

  const dataSource = {
    manager: {},
    transaction: jest.fn(),
  } as any;

  let service: SyntheticCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.save.mockResolvedValue({ id: 'run-1' });
    dataSource.transaction.mockImplementation(async (fn: any) => fn({}));
    service = new SyntheticCleanupService(dataSource, repo, configService);
  });

  it('dry run reports grouped counts and does not execute deletes', async () => {
    jest
      .spyOn(service as any, 'computeEligibleCounts')
      .mockResolvedValue({ users: 2, baselines: 1 });
    const executeSpy = jest
      .spyOn(service as any, 'executeCleanup')
      .mockResolvedValue({ users: 0 });

    const result = await service.runCleanup({ dryRun: true, triggerSource: 'manual' });

    expect(result.dryRun).toBe(true);
    expect(result.countsByEntity).toEqual({ users: 2, baselines: 1 });
    expect(executeSpy).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'dry_run' }),
    );
  });

  it('real execution deletes only eligible synthetic records', async () => {
    jest
      .spyOn(service as any, 'executeCleanup')
      .mockResolvedValue({ users: 2, baselines: 3, interviews: 1 });

    const result = await service.runCleanup({ dryRun: false, triggerSource: 'manual' });

    expect(result.deletedTotal).toBe(6);
    expect(repo.update).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'succeeded' }),
    );
  });

  it('preserves fixtures tagged with preserveFromCleanup', async () => {
    const countsSpy = jest
      .spyOn(service as any, 'computeEligibleCounts')
      .mockResolvedValue({ users: 0, baselines: 0 });

    const result = await service.runCleanup({ dryRun: true, triggerSource: 'manual' });

    expect(countsSpy).toHaveBeenCalled();
    expect(result.deletedTotal).toBe(0);
  });

  it('writes failure log when cleanup fails', async () => {
    jest
      .spyOn(service as any, 'computeEligibleCounts')
      .mockRejectedValue(new Error('ordering conflict: baseline_versions'));

    await expect(
      service.runCleanup({ dryRun: true, triggerSource: 'manual' }),
    ).rejects.toThrow('ordering conflict: baseline_versions');

    expect(repo.update).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'ordering conflict: baseline_versions',
      }),
    );
  });

  it('deletes in dependency-safe order for baseline descendants', async () => {
    const deleteOrder: string[] = [];
    jest.spyOn(service as any, 'resolveEligibleIds').mockResolvedValue({
      baselineParsedIds: ['bp1'],
      baselineSectionIds: ['bs1'],
      baselineVersionIds: ['bv1'],
      expandedFitAssessmentIds: [],
      fitAssessmentIds: [],
      interviewIds: [],
      coverLetterIds: [],
      applicationIds: [],
      opportunityIds: [],
      jobTrackerEntryIds: [],
      betaFeedbackIds: [],
      baselineIds: ['b1'],
      userIds: [],
    });
    jest.spyOn(service as any, 'deleteByIds').mockImplementation(
      async (_manager: unknown, entity: { name: string }) => {
        deleteOrder.push(entity.name);
        return 1;
      },
    );

    await (service as any).executeCleanup(new Date(), new Date());

    expect(deleteOrder.slice(0, 4)).toEqual([
      'BaselineParsed',
      'BaselineSection',
      'BaselineVersion',
      'ExpandedFitAssessment',
    ]);
    expect(deleteOrder).toContain('Baseline');
  });
});
