import { OpportunityActionsNeededService } from './opportunity-actions-needed.service';
import { Opportunity, OpportunityFitBand, OpportunityStatus } from './opportunity.entity';

function buildOpportunity(overrides: Partial<Opportunity>): Opportunity {
  const now = new Date('2026-03-01T00:00:00.000Z');
  return {
    id: 'opp-1',
    userId: 'user-1',
    companyName: 'Acme',
    jobTitle: 'Engineer',
    salary: null,
    dateCreated: now,
    lastStatusChange: now,
    status: OpportunityStatus.SAVED,
    initialScore: 65,
    currentScore: 65,
    initialBand: OpportunityFitBand.FIT_REVIEW,
    currentBand: OpportunityFitBand.FIT_REVIEW,
    baselineVersionUsed: null,
    dormant: false,
    ...overrides,
  };
}

describe('OpportunityActionsNeededService', () => {
  const service = new OpportunityActionsNeededService();

  it('prioritizes cards by required trigger priority and caps at five', () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const cards = service.generateActionCards(
      [
        buildOpportunity({
          id: 'v',
          initialScore: 66,
          currentScore: 72,
          initialBand: OpportunityFitBand.FIT_REVIEW,
          currentBand: OpportunityFitBand.VIABLE,
        }),
        buildOpportunity({
          id: 'u',
          initialScore: 72,
          currentScore: 86,
          initialBand: OpportunityFitBand.VIABLE,
          currentBand: OpportunityFitBand.STRONG,
        }),
        buildOpportunity({
          id: 'f',
          status: OpportunityStatus.APPLIED,
          lastStatusChange: new Date('2026-02-20T00:00:00.000Z'),
        }),
        buildOpportunity({
          id: 'w',
          lastStatusChange: new Date('2025-12-31T00:00:00.000Z'),
        }),
        buildOpportunity({
          id: 'd',
          status: OpportunityStatus.DORMANT,
          dormant: true,
        }),
        buildOpportunity({
          id: 'extra',
          initialScore: 60,
          currentScore: 75,
          initialBand: OpportunityFitBand.FIT_REVIEW,
          currentBand: OpportunityFitBand.VIABLE,
        }),
      ],
      now,
    );

    expect(cards).toHaveLength(5);
    expect(cards[0].type).toBe('viable_crossing');
    expect(cards[1].type).toBe('viable_crossing');
    expect(cards.map((card) => card.priority)).toEqual(
      [...cards.map((card) => card.priority)].sort((a, b) => a - b),
    );
  });
});
