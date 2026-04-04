import { OpportunityRescoreHandler } from './opportunity-rescore.handler';
import { Opportunity, OpportunityFitBand, OpportunityStatus } from './opportunity.entity';

function buildOpportunity(id: string, score: number, band: OpportunityFitBand): Opportunity {
  const now = new Date('2026-03-01T00:00:00.000Z');
  return {
    id,
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
    initialScore: score,
    savedFitScore: score,
    currentScore: score,
    initialBand: band,
    currentBand: band,
    baselineVersionUsed: null,
    dormant: false,
    savedGenerationCompleted: false,
    savedEvidenceSummary: null,
  };
}

describe('OpportunityRescoreHandler', () => {
  it('rescoring checks only boundary-near opportunities and updates only on band change', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([
        buildOpportunity('near', 79, OpportunityFitBand.VIABLE),
        buildOpportunity('far', 50, OpportunityFitBand.FIT_REVIEW),
      ]),
      save: jest.fn(async (value) => value),
    };
    const handler = new OpportunityRescoreHandler(repo as never);

    const result = await handler.rescoreNearBoundaries(
      'user-1',
      async (opportunity) => (opportunity.id === 'near' ? 82 : 90),
      'baseline-v2',
    );

    expect(result.precheckCandidates).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'near',
        currentScore: 82,
        currentBand: OpportunityFitBand.STRONG,
        baselineVersionUsed: 'baseline-v2',
      }),
    );
  });
});

