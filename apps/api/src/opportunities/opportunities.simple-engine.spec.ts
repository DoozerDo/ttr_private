import { BadRequestException } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityActionsNeededService } from './opportunity-actions-needed.service';
import { OpportunityStateMachine } from './opportunity-state-machine';
import { OpportunityRescoreHandler } from './opportunity-rescore.handler';
import { OpportunityStatus } from './opportunity.entity';

function buildService() {
  const repository = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({
      ...value,
      id: value.id ?? 'opp-1',
      dateCreated: value.dateCreated ?? new Date(),
      updatedAt: new Date(),
    })),
  } as any;

  const service = new OpportunitiesService(
    repository,
    new OpportunityStateMachine(),
    { generateActionCards: jest.fn().mockReturnValue([]) } as unknown as OpportunityActionsNeededService,
    { rescoreNearBoundariesFromOverride: jest.fn().mockResolvedValue({ updatedCount: 0 }) } as unknown as OpportunityRescoreHandler,
  );

  return { service, repository };
}

describe('Opportunities simple engine', () => {
  it('assigns ready_to_apply path for score >= 70 on create', async () => {
    const { service, repository } = buildService();
    repository.findOne.mockResolvedValue(null);

    const created = await service.upsertOpportunity('user-1', {
      jobId: 'job-1',
      analysisId: 'analysis-1',
      baselineId: 'baseline-1',
      score: 75,
      company: 'Acme',
      roleTitle: 'Support Director',
    });

    expect(created.status).toBe(OpportunityStatus.SAVED);
  });

  it('assigns improving_fit path for score < 70 on create', async () => {
    const { service, repository } = buildService();
    repository.findOne.mockResolvedValue(null);

    const created = await service.upsertOpportunity('user-1', {
      jobId: 'job-1',
      analysisId: 'analysis-2',
      baselineId: 'baseline-1',
      score: 62,
      company: 'Acme',
      roleTitle: 'Support Manager',
    });

    expect(created.status).toBe(OpportunityStatus.IN_FIT_REVIEW);
  });

  it('updates status with allowed transitions only', async () => {
    const { service, repository } = buildService();
    repository.findOne.mockResolvedValue({
      id: 'opp-1',
      userId: 'user-1',
      status: OpportunityStatus.SAVED,
      currentScore: 82,
      companyName: 'Acme',
      jobTitle: 'Support Director',
      dateCreated: new Date(),
      updatedAt: new Date(),
      lastStatusChange: new Date(),
    });

    const updated = await service.updateOpportunity('opp-1', 'user-1', { status: 'applied' });
    expect(updated.status).toBe(OpportunityStatus.APPLIED);

    await expect(
      service.updateOpportunity('opp-1', 'user-1', { status: 'ready_to_apply' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

