import { SupportOutreachService } from './support-outreach.service';

describe('SupportOutreachService', () => {
  it('generates low_score_recovery draft with state reason and no fabricated details', () => {
    const service = new SupportOutreachService();
    const draft = service.buildDraft({
      triggerType: 'low_score_recovery',
      state: {
        userId: 'u1',
        email: 'user@test.com',
        lastActiveAt: null,
        lastAnalysisAt: null,
        lastBaselineUpdateAt: null,
        lastOpportunityCreatedAt: null,
        hasBaseline: true,
        baselineProgress: 80,
        totalAnalyses: 1,
        totalOpportunities: 0,
        mostRecentScore: 62,
        hasReanalysisAvailable: false,
        stateFlags: {
          invited_not_started: false,
          baseline_started_not_completed: false,
          analyzed_once_no_followup: false,
          low_score_no_action: true,
          reanalysis_available_not_used: false,
          high_score_not_applied: false,
          inactive_after_activity: false,
        },
      },
    });

    expect(draft.subject.length).toBeGreaterThan(0);
    expect(draft.message).toContain('62');
    expect(draft.message.toLowerCase()).toContain('re-run');
    expect(draft.message.toLowerCase()).not.toContain('congratulations');
  });
});

