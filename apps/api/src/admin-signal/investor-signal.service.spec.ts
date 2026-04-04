import { InvestorSignalService } from './investor-signal.service';

describe('InvestorSignalService', () => {
  it('builds investor snapshot from funnel and friction metrics', async () => {
    const service = new InvestorSignalService(
      {
        getFunnelMetrics: jest.fn().mockResolvedValue({
          funnel: {
            totalUsers: 10,
            stepCounts: {
              first_analysis_completed: 8,
              high_score_achieved: 5,
              opportunity_created: 4,
            },
            dropOffRates: {
              user_created: 0,
              baseline_started: 20,
              baseline_completed: 35,
            },
          },
          time: { avgTimeToHighScore: 18 },
          recovery: { recoveryRate: 42 },
        }),
      } as any,
      {
        getFrictionPatterns: jest.fn().mockResolvedValue([{ label: 'Generation failed from Studio' }]),
      } as any,
    );

    const snapshot = await service.getInvestorSnapshot();
    expect(snapshot.totalUsers).toBe(10);
    expect(snapshot.reachedAnalysisPercent).toBe(80);
    expect(snapshot.recoveredFromLowScorePercent).toBe(42);
    expect(snapshot.reachedHighScorePercent).toBe(50);
    expect(snapshot.createdOpportunityPercent).toBe(40);
    expect(snapshot.avgTimeToHighScore).toBe(18);
    expect(snapshot.biggestDropOff).toBe('baseline_completed');
    expect(snapshot.topFrictionPattern).toBe('Generation failed from Studio');
  });
});

