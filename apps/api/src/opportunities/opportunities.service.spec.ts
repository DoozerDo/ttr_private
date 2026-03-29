import { OpportunityActionsNeededService } from './opportunity-actions-needed.service';
import { Opportunity, OpportunityFitBand, OpportunityStatus } from './opportunity.entity';
import { OpportunityRescoreHandler } from './opportunity-rescore.handler';
import { OpportunityStateMachine } from './opportunity-state-machine';
import { OpportunitiesService } from './opportunities.service';

function createRepository() {
  return {
    create: jest.fn((input) => ({ ...input, id: input.id ?? 'created-id' })),
    save: jest.fn(async (input) => input),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  };
}

function buildOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  const now = new Date('2026-03-01T00:00:00.000Z');
  return {
    id: 'opp-1',
    userId: 'user-1',
    companyName: 'Acme',
    jobTitle: 'Engineer',
    salary: null,
    jobId: 'job-1',
    savedJobId: 'job-1',
    analysisId: 'analysis-1',
    baselineId: 'base-1',
    savedBaselineId: 'base-1',
    dateCreated: now,
    lastStatusChange: now,
    status: OpportunityStatus.SAVED,
    initialScore: 72,
    savedFitScore: 72,
    currentScore: 72,
    initialBand: OpportunityFitBand.VIABLE,
    currentBand: OpportunityFitBand.VIABLE,
    baselineVersionUsed: null,
    dormant: false,
    savedGenerationCompleted: false,
    savedEvidenceSummary: null,
    ...overrides,
  };
}

describe('OpportunitiesService', () => {
  it('creates from resume studio only when fit >= 70', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue(null);
    const service = new OpportunitiesService(
      repository as never,
      new OpportunityStateMachine(),
      new OpportunityActionsNeededService(),
      { rescoreNearBoundariesFromOverride: jest.fn() } as never,
    );

    const skipped = await service.createFromResumeStudio('user-1', {
      companyName: 'Acme',
      jobTitle: 'Engineer',
      fitScore: 68,
    });
    const created = await service.createFromResumeStudio('user-1', {
      companyName: 'Acme',
      jobTitle: 'Engineer',
      fitScore: 76,
    });

    expect(skipped).toBeNull();
    expect(created?.status).toBe(OpportunityStatus.SAVED);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('creates fit review override opportunity in IN_FIT_REVIEW state', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue(null);
    const service = new OpportunitiesService(
      repository as never,
      new OpportunityStateMachine(),
      new OpportunityActionsNeededService(),
      { rescoreNearBoundariesFromOverride: jest.fn() } as never,
    );

    const created = await service.createFromFitReviewOverride('user-1', {
      companyName: 'Acme',
      jobTitle: 'Engineer',
      fitScore: 64,
    });

    expect(created.status).toBe(OpportunityStatus.IN_FIT_REVIEW);
  });

  it('captures immutable snapshot fields on upsert create', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue(null);
    const service = new OpportunitiesService(
      repository as never,
      new OpportunityStateMachine(),
      new OpportunityActionsNeededService(),
      { rescoreNearBoundariesFromOverride: jest.fn() } as never,
    );

    await service.upsertOpportunity('user-1', {
      jobId: 'job-1',
      analysisId: 'analysis-1',
      baselineId: 'base-1',
      score: 81,
      company: 'Acme',
      roleTitle: 'Engineer',
      generationCompleted: true,
      savedEvidenceSummary: ['Owned support workflows', 'Cut escalations by 22%'],
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        savedFitScore: 81,
        savedGenerationCompleted: true,
        savedEvidenceSummary: ['Owned support workflows', 'Cut escalations by 22%'],
      }),
    );
  });

  it('enforces forward-only status updates unless manual reset is used', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue(buildOpportunity({ status: OpportunityStatus.APPLIED }));
    const service = new OpportunitiesService(
      repository as never,
      new OpportunityStateMachine(),
      new OpportunityActionsNeededService(),
      { rescoreNearBoundariesFromOverride: jest.fn() } as never,
    );

    await expect(
      service.transitionStatus('opp-1', 'user-1', OpportunityStatus.SAVED),
    ).rejects.toThrow('Invalid status transition');

    await service.transitionStatus('opp-1', 'user-1', OpportunityStatus.SAVED, {
      manualReset: true,
    });
    expect(repository.save).toHaveBeenCalled();
  });

  it('blocks APPLIED status when fit score is below 70', async () => {
    const repository = createRepository();
    repository.findOne.mockResolvedValue(buildOpportunity({ currentScore: 65 }));
    const service = new OpportunitiesService(
      repository as never,
      new OpportunityStateMachine(),
      new OpportunityActionsNeededService(),
      { rescoreNearBoundariesFromOverride: jest.fn() } as never,
    );

    await expect(
      service.transitionStatus('opp-1', 'user-1', OpportunityStatus.APPLIED),
    ).rejects.toMatchObject({
      response: {
        error: 'INSUFFICIENT_FIT_SCORE',
        message: 'Fit score must be at least 70 to apply.',
      },
    });
  });

  it('sorts grouped tracker output by band priority then score then status change', async () => {
    const repository = createRepository();
    repository.find.mockResolvedValue([
      buildOpportunity({
        id: 'b',
        companyName: 'Acme',
        currentBand: OpportunityFitBand.VIABLE,
        currentScore: 75,
        lastStatusChange: new Date('2026-02-25T00:00:00.000Z'),
      }),
      buildOpportunity({
        id: 'a',
        companyName: 'Acme',
        currentBand: OpportunityFitBand.ELITE,
        currentScore: 91,
        lastStatusChange: new Date('2026-02-20T00:00:00.000Z'),
      }),
    ]);
    const service = new OpportunitiesService(
      repository as never,
      new OpportunityStateMachine(),
      new OpportunityActionsNeededService(),
      { rescoreNearBoundariesFromOverride: jest.fn() } as never,
    );

    const grouped = await service.listGroupedByCompany('user-1');
    expect(grouped).toHaveLength(1);
    expect(grouped[0].opportunities[0].id).toBe('a');
    expect(grouped[0].opportunities[0].nextAction).toBeDefined();
  });

  it('exports csv and json payloads', async () => {
    const repository = createRepository();
    repository.find.mockResolvedValue([buildOpportunity()]);
    const service = new OpportunitiesService(
      repository as never,
      new OpportunityStateMachine(),
      new OpportunityActionsNeededService(),
      { rescoreNearBoundariesFromOverride: jest.fn() } as never,
    );

    const csv = await service.exportForUser('user-1', 'csv');
    const json = await service.exportForUser('user-1', 'json');

    expect(csv).toContain('company_name');
    expect(json).toContain('"companyName"');
  });

  it('runs dormant sweep and marks stale entries dormant', async () => {
    const repository = createRepository();
    repository.find.mockResolvedValue([
      buildOpportunity({
        status: OpportunityStatus.SAVED,
        lastStatusChange: new Date('2025-10-01T00:00:00.000Z'),
      }),
    ]);
    const service = new OpportunitiesService(
      repository as never,
      new OpportunityStateMachine(),
      new OpportunityActionsNeededService(),
      { rescoreNearBoundariesFromOverride: jest.fn() } as never,
    );

    const result = await service.runDormancySweep(undefined, new Date('2026-03-01T00:00:00.000Z'));

    expect(result.updatedCount).toBe(1);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: OpportunityStatus.DORMANT,
        dormant: true,
      }),
    );
  });

  it('delegates boundary rescoring to handler', async () => {
    const repository = createRepository();
    const handler: Partial<OpportunityRescoreHandler> = {
      rescoreNearBoundariesFromOverride: jest.fn().mockResolvedValue({ updatedCount: 1 }),
    };
    const service = new OpportunitiesService(
      repository as never,
      new OpportunityStateMachine(),
      new OpportunityActionsNeededService(),
      handler as OpportunityRescoreHandler,
    );

    const result = await service.runBoundaryRescoreFromOverrides(
      'user-1',
      { 'opp-1': 82 },
      'baseline-v2',
    );

    expect(handler.rescoreNearBoundariesFromOverride).toHaveBeenCalledWith(
      'user-1',
      { 'opp-1': 82 },
      'baseline-v2',
    );
    expect(result).toEqual({ updatedCount: 1 });
  });
});

