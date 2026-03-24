import { FunnelMetricsService } from './funnel-metrics.service';

function repoMock<T>(rows: T[]) {
  return {
    find: jest.fn().mockResolvedValue(rows),
  } as any;
}

describe('FunnelMetricsService', () => {
  it('excludes synthetic records by default', async () => {
    const userRepo = repoMock([]);
    const baselineRepo = repoMock([]);
    const assessmentRepo = repoMock([]);
    const opportunityRepo = repoMock([]);
    const analyticsRepo = repoMock([]);

    const service = new FunnelMetricsService(
      userRepo,
      baselineRepo,
      assessmentRepo,
      opportunityRepo,
      analyticsRepo,
    );

    await service.listUserFunnelStates();

    expect(userRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'user', isSynthetic: false },
      }),
    );
    expect(analyticsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isSynthetic: false },
      }),
    );
  });

  it('computes canonical steps in deterministic order', async () => {
    const service = new FunnelMetricsService(
      repoMock([
        { id: 'u1', email: 'u1@test.com', role: 'user', createdAt: new Date('2026-03-20T00:00:00.000Z') },
      ]),
      repoMock([
        {
          id: 'b1',
          userId: 'u1',
          createdAt: new Date('2026-03-20T01:00:00.000Z'),
          updatedAt: new Date('2026-03-20T02:00:00.000Z'),
          originalBaselineScore: 100,
          latestBaselineScore: 100,
        },
      ]),
      repoMock([
        {
          id: 'a1',
          userId: 'u1',
          jobId: 'j1',
          overallScore: 60,
          createdAt: new Date('2026-03-20T03:00:00.000Z'),
        },
        {
          id: 'a2',
          userId: 'u1',
          jobId: 'j1',
          overallScore: 78,
          createdAt: new Date('2026-03-20T05:00:00.000Z'),
        },
      ]),
      repoMock([{ id: 'o1', userId: 'u1', dateCreated: new Date('2026-03-20T06:00:00.000Z') }]),
      repoMock([{ userId: 'u1', eventName: 'resume_generation_succeeded', createdAt: new Date('2026-03-20T07:00:00.000Z') }]),
    );

    const states = await service.listUserFunnelStates();
    expect(states).toHaveLength(1);
    expect(states[0].steps.user_created).not.toBeNull();
    expect(states[0].steps.baseline_started).not.toBeNull();
    expect(states[0].steps.baseline_completed).not.toBeNull();
    expect(states[0].steps.low_score_detected).not.toBeNull();
    expect(states[0].steps.reanalysis_completed).not.toBeNull();
    expect(states[0].steps.high_score_achieved).not.toBeNull();
    expect(states[0].steps.opportunity_created).not.toBeNull();
    expect(states[0].steps.documents_generated).not.toBeNull();
  });

  it('computes aggregation and conversion metrics correctly', async () => {
    const service = new FunnelMetricsService(
      repoMock([
        { id: 'u1', email: 'u1@test.com', role: 'user', createdAt: new Date('2026-03-20T00:00:00.000Z') },
        { id: 'u2', email: 'u2@test.com', role: 'user', createdAt: new Date('2026-03-20T00:00:00.000Z') },
      ]),
      repoMock([
        {
          id: 'b1',
          userId: 'u1',
          createdAt: new Date('2026-03-20T01:00:00.000Z'),
          updatedAt: new Date('2026-03-20T02:00:00.000Z'),
          originalBaselineScore: 100,
          latestBaselineScore: 100,
        },
        {
          id: 'b2',
          userId: 'u2',
          createdAt: new Date('2026-03-20T01:00:00.000Z'),
          updatedAt: new Date('2026-03-20T02:00:00.000Z'),
          originalBaselineScore: 80,
          latestBaselineScore: 80,
        },
      ]),
      repoMock([{ id: 'a1', userId: 'u1', jobId: 'j1', overallScore: 75, createdAt: new Date('2026-03-20T03:00:00.000Z') }]),
      repoMock([{ id: 'o1', userId: 'u1', dateCreated: new Date('2026-03-20T04:00:00.000Z') }]),
      repoMock([]),
    );
    const metrics = await service.getFunnelMetrics();
    expect(metrics.funnel.totalUsers).toBe(2);
    expect(metrics.funnel.stepCounts.baseline_started).toBe(2);
    expect(metrics.funnel.stepCounts.baseline_completed).toBe(1);
    expect(metrics.funnel.conversionRates.baseline_started_to_completed).toBe(50);
  });

  it('computes time metrics excluding null paths', async () => {
    const service = new FunnelMetricsService(
      repoMock([{ id: 'u1', email: 'u1@test.com', role: 'user', createdAt: new Date('2026-03-20T00:00:00.000Z') }]),
      repoMock([
        {
          id: 'b1',
          userId: 'u1',
          createdAt: new Date('2026-03-20T01:00:00.000Z'),
          updatedAt: new Date('2026-03-20T03:00:00.000Z'),
          originalBaselineScore: 100,
          latestBaselineScore: 100,
        },
      ]),
      repoMock([{ id: 'a1', userId: 'u1', jobId: 'j1', overallScore: 75, createdAt: new Date('2026-03-20T05:00:00.000Z') }]),
      repoMock([{ id: 'o1', userId: 'u1', dateCreated: new Date('2026-03-20T08:00:00.000Z') }]),
      repoMock([]),
    );
    const metrics = await service.getFunnelMetrics();
    expect(metrics.time.avgTimeToBaselineComplete).toBe(2);
    expect(metrics.time.avgTimeToFirstAnalysis).toBe(2);
    expect(metrics.time.avgTimeToOpportunity).toBe(3);
  });

  it('computes recovery metrics for low-score users', async () => {
    const service = new FunnelMetricsService(
      repoMock([{ id: 'u1', email: 'u1@test.com', role: 'user', createdAt: new Date('2026-03-20T00:00:00.000Z') }]),
      repoMock([
        {
          id: 'b1',
          userId: 'u1',
          createdAt: new Date('2026-03-20T01:00:00.000Z'),
          updatedAt: new Date('2026-03-20T04:00:00.000Z'),
          originalBaselineScore: 100,
          latestBaselineScore: 100,
        },
      ]),
      repoMock([
        { id: 'a1', userId: 'u1', jobId: 'j1', overallScore: 55, createdAt: new Date('2026-03-20T02:00:00.000Z') },
        { id: 'a2', userId: 'u1', jobId: 'j1', overallScore: 78, createdAt: new Date('2026-03-20T06:00:00.000Z') },
      ]),
      repoMock([]),
      repoMock([]),
    );
    const metrics = await service.getFunnelMetrics();
    expect(metrics.recovery.usersWithLowScore).toBe(1);
    expect(metrics.recovery.usersWhoRecovered).toBe(1);
    expect(metrics.recovery.recoveryRate).toBe(100);
  });

  it('segments users by score buckets and analysis count', async () => {
    const service = new FunnelMetricsService(
      repoMock([
        { id: 'u1', email: 'u1@test.com', role: 'user', createdAt: new Date('2026-03-20T00:00:00.000Z') },
        { id: 'u2', email: 'u2@test.com', role: 'user', createdAt: new Date('2026-03-20T00:00:00.000Z') },
      ]),
      repoMock([]),
      repoMock([
        { id: 'a1', userId: 'u1', jobId: 'j1', overallScore: 65, createdAt: new Date('2026-03-20T01:00:00.000Z') },
        { id: 'a2', userId: 'u2', jobId: 'j2', overallScore: 87, createdAt: new Date('2026-03-20T01:00:00.000Z') },
        { id: 'a3', userId: 'u2', jobId: 'j2', overallScore: 89, createdAt: new Date('2026-03-20T02:00:00.000Z') },
      ]),
      repoMock([]),
      repoMock([]),
    );
    const segments = await service.getSegmentBreakdown();
    expect(segments.scoreBucket.lt_70).toBe(1);
    expect(segments.scoreBucket.gte_85).toBe(1);
    expect(segments.analysisCount.one).toBe(1);
    expect(segments.analysisCount.two_plus).toBe(1);
  });
});

