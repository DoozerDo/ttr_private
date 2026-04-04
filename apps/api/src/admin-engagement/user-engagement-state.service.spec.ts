import { UserEngagementStateService } from './user-engagement-state.service';

function repoMock<T>(rows: T[]) {
  return {
    find: jest.fn().mockResolvedValue(rows),
  } as any;
}

describe('UserEngagementStateService', () => {
  it('computes invited_not_started when user has no baseline and no analysis', async () => {
    const now = new Date('2026-03-24T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const service = new UserEngagementStateService(
      repoMock([{ id: 'u1', email: 'a@test.com', createdAt: now }]),
      repoMock([]),
      repoMock([]),
      repoMock([]),
      repoMock([]),
    );

    const states = await service.listStates();
    expect(states).toHaveLength(1);
    expect(states[0].stateFlags.invited_not_started).toBe(true);
    jest.useRealTimers();
  });

  it('computes analyzed_once_no_followup after threshold', async () => {
    const now = new Date('2026-03-24T10:00:00.000Z');
    const analysisAt = new Date('2026-03-23T07:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const service = new UserEngagementStateService(
      repoMock([{ id: 'u1', email: 'a@test.com', createdAt: now }]),
      repoMock([]),
      repoMock([
        { id: 'a1', userId: 'u1', overallScore: 65, createdAt: analysisAt },
      ]),
      repoMock([]),
      repoMock([{ userId: 'u1', eventName: 'role_analysis_completed', createdAt: analysisAt }]),
    );

    const states = await service.listStates();
    expect(states[0].stateFlags.analyzed_once_no_followup).toBe(true);
    expect(states[0].stateFlags.low_score_no_action).toBe(true);
    jest.useRealTimers();
  });

  it('computes reanalysis_available_not_used when baseline updated after analysis', async () => {
    const now = new Date('2026-03-24T10:00:00.000Z');
    const analysisAt = new Date('2026-03-23T07:00:00.000Z');
    const baselineUpdatedAt = new Date('2026-03-24T08:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const service = new UserEngagementStateService(
      repoMock([{ id: 'u1', email: 'a@test.com', createdAt: now }]),
      repoMock([
        {
          id: 'b1',
          userId: 'u1',
          updatedAt: baselineUpdatedAt,
          latestBaselineScore: 80,
          firstAnalyzedAt: analysisAt,
        },
      ]),
      repoMock([
        { id: 'a1', userId: 'u1', overallScore: 72, createdAt: analysisAt },
      ]),
      repoMock([]),
      repoMock([{ userId: 'u1', eventName: 'resume_studio_opened', createdAt: analysisAt }]),
    );

    const states = await service.listStates();
    expect(states[0].hasReanalysisAvailable).toBe(true);
    expect(states[0].stateFlags.reanalysis_available_not_used).toBe(true);
    jest.useRealTimers();
  });
});

