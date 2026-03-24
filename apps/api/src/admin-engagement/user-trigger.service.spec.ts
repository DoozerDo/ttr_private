import { UserTriggerService } from './user-trigger.service';
import type { UserEngagementState } from './user-engagement-state.service';

function triggerRepoMock(latest: { createdAt: Date } | null = null) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(latest),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ ...value, id: 't1', createdAt: new Date() })),
  } as any;
}

function sampleState(overrides: Partial<UserEngagementState['stateFlags']> = {}): UserEngagementState {
  return {
    userId: 'u1',
    email: 'user@test.com',
    lastActiveAt: null,
    lastAnalysisAt: null,
    lastBaselineUpdateAt: null,
    lastOpportunityCreatedAt: null,
    hasBaseline: false,
    baselineProgress: null,
    totalAnalyses: 0,
    totalOpportunities: 0,
    mostRecentScore: null,
    hasReanalysisAvailable: false,
    stateFlags: {
      invited_not_started: false,
      baseline_started_not_completed: false,
      analyzed_once_no_followup: false,
      low_score_no_action: false,
      reanalysis_available_not_used: false,
      high_score_not_applied: false,
      inactive_after_activity: false,
      ...overrides,
    },
  };
}

describe('UserTriggerService', () => {
  it('maps state flag to expected trigger type', () => {
    const service = new UserTriggerService(
      { listStates: jest.fn() } as any,
      triggerRepoMock(),
    );
    const trigger = service.getTriggerForState(sampleState({ low_score_no_action: true }));
    expect(trigger?.triggerType).toBe('low_score_recovery');
    expect(trigger?.priority).toBe('high');
  });

  it('enforces cooldown and does not emit duplicates inside cooldown window', async () => {
    const now = new Date('2026-03-24T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const listStates = jest.fn().mockResolvedValue([sampleState({ invited_not_started: true })]);
    const repo = triggerRepoMock({ createdAt: new Date('2026-03-24T00:00:00.000Z') }); // <24h
    const service = new UserTriggerService({ listStates } as any, repo);

    const emitted = await service.runEvaluation();
    expect(emitted).toHaveLength(0);
    expect(repo.save).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
