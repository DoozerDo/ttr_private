import { ProductNarrativeService } from './product-narrative.service';

describe('ProductNarrativeService', () => {
  it('returns concise evidence-based narrative without hype language', () => {
    const service = new ProductNarrativeService();
    const { narrative } = service.generateNarrative({
      snapshot: {
        totalUsers: 24,
        reachedAnalysisPercent: 75,
        recoveredFromLowScorePercent: 48,
        reachedHighScorePercent: 44,
        createdOpportunityPercent: 31,
        avgTimeToHighScore: 16,
        biggestDropOff: 'baseline_completed',
        topFrictionPattern: 'Results viewed repeatedly without next action',
      },
      conversions: {
        reachedAnalysisPercent: 75,
        reachedHighScorePercent: 44,
        createdOpportunityPercent: 31,
        generatedDocumentsPercent: 28,
      },
      recovery: {
        usersWithLowScore: 12,
        usersWhoRecovered: 6,
        recoveryRate: 50,
        avgTimeToRecovery: 22,
      },
      topFrictionPattern: 'Results viewed repeatedly without next action',
    });

    const sentences = narrative.split('.').filter((part) => part.trim().length > 0);
    expect(sentences.length).toBeGreaterThanOrEqual(5);
    expect(sentences.length).toBeLessThanOrEqual(7);
    expect(narrative.toLowerCase()).not.toContain('ai');
    expect(narrative.toLowerCase()).not.toContain('amazing');
    expect(narrative.toLowerCase()).not.toContain('revolutionary');
  });
});

