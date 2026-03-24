import { FeedbackIntelligenceService } from './feedback-intelligence.service';
import {
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackTriageStatus,
} from './feedback-item.entity';
import {
  FrictionEventType,
  FrictionResolutionStatus,
} from './friction-event.entity';

type AnyRecord = Record<string, unknown>;

function createRepo<T extends { id?: string }>(seed: T[] = []) {
  const store = [...seed];
  return {
    store,
    create: jest.fn((payload: Partial<T>) => payload as T),
    save: jest.fn(async (payload: Partial<T>) => {
      const entity = { ...payload } as T;
      if (!entity.id) {
        (entity as { id: string }).id = `id-${store.length + 1}`;
      }
      store.push(entity);
      return entity;
    }),
    find: jest.fn(async () => store),
    findOne: jest.fn(async ({ where }: { where: AnyRecord }) => {
      const rows = store.filter((row) =>
        Object.entries(where).every(([key, value]) => (row as AnyRecord)[key] === value),
      );
      return rows[rows.length - 1] ?? null;
    }),
    findOneBy: jest.fn(async (where: AnyRecord) => {
      const rows = store.filter((row) =>
        Object.entries(where).every(([key, value]) => (row as AnyRecord)[key] === value),
      );
      return rows[rows.length - 1] ?? null;
    }),
    update: jest.fn(async (where: AnyRecord, patch: Partial<T>) => {
      const found = store.find((row) =>
        Object.entries(where).every(([key, value]) => (row as AnyRecord)[key] === value),
      );
      if (found) Object.assign(found, patch);
    }),
    createQueryBuilder: jest.fn(() => {
      let triageStatus: string | undefined;
      let severity: string | undefined;
      let category: string | undefined;
      let pageContext: string | undefined;
      let unresolvedOnly = false;
      const builder = {
        andWhere: jest.fn((query: string, params: AnyRecord) => {
          if (query.includes('triageStatus')) triageStatus = String(params.triageStatus);
          if (query.includes('severity')) severity = String(params.severity);
          if (query.includes('category')) category = String(params.category);
          if (query.includes('pageContext')) pageContext = String(params.pageContext);
          if (query.includes('IN (:...statuses)')) unresolvedOnly = true;
          return builder;
        }),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () =>
          store.filter((item: AnyRecord) => {
            if (triageStatus && item.triageStatus !== triageStatus) return false;
            if (severity && item.severity !== severity) return false;
            if (category && item.category !== category) return false;
            if (pageContext && item.pageContext !== pageContext) return false;
            if (
              unresolvedOnly &&
              !['new', 'reviewed', 'planned'].includes(String(item.triageStatus))
            ) {
              return false;
            }
            return true;
          }),
        ),
      };
      return builder;
    }),
  };
}

describe('FeedbackIntelligenceService', () => {
  it('creates explicit feedback with category and context links', async () => {
    const feedbackRepo = createRepo([]);
    const service = new FeedbackIntelligenceService(
      feedbackRepo as never,
      createRepo([]) as never,
      createRepo([]) as never,
      createRepo([]) as never,
      createRepo([]) as never,
      createRepo([]) as never,
    );

    const item = await service.createFeedback({
      userId: 'u1',
      category: FeedbackCategory.BUG,
      title: 'Broken CTA',
      message: 'Button does not route',
      pageContext: '/results',
      analysisId: 'a1',
      baselineId: 'b1',
      opportunityId: 'o1',
    });

    expect(item.category).toBe(FeedbackCategory.BUG);
    expect(item.pageContext).toBe('/results');
    expect(item.analysisId).toBe('a1');
    expect(item.baselineId).toBe('b1');
    expect(item.opportunityId).toBe('o1');
    expect(item.triageStatus).toBe(FeedbackTriageStatus.NEW);
  });

  it('creates baseline_abandoned friction event and dedupes same open reason', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T10:00:00.000Z'));
    const frictionRepo = createRepo([]);
    const baselineRepo = createRepo([
      {
        id: 'b1',
        userId: 'u1',
        latestBaselineScore: 40,
        updatedAt: new Date('2026-03-22T10:00:00.000Z'),
      },
    ]);
    const service = new FeedbackIntelligenceService(
      createRepo([]) as never,
      frictionRepo as never,
      baselineRepo as never,
      createRepo([]) as never,
      createRepo([]) as never,
      createRepo([]) as never,
    );

    const first = await service.runFrictionDetection();
    const second = await service.runFrictionDetection();

    expect(first.some((item) => item.eventType === FrictionEventType.BASELINE_ABANDONED)).toBe(true);
    expect(second).toHaveLength(0);
    jest.useRealTimers();
  });

  it('does not create low_score_no_recovery when baseline updated after analysis', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T10:00:00.000Z'));
    const frictionRepo = createRepo([]);
    const baselineRepo = createRepo([
      {
        id: 'b1',
        userId: 'u1',
        latestBaselineScore: 90,
        updatedAt: new Date('2026-03-24T09:00:00.000Z'),
      },
    ]);
    const assessmentRepo = createRepo([
      {
        id: 'a1',
        userId: 'u1',
        baselineId: 'b1',
        jobId: 'j1',
        overallScore: 55,
        createdAt: new Date('2026-03-23T06:00:00.000Z'),
      },
    ]);
    const service = new FeedbackIntelligenceService(
      createRepo([]) as never,
      frictionRepo as never,
      baselineRepo as never,
      assessmentRepo as never,
      createRepo([]) as never,
      createRepo([]) as never,
    );

    const emitted = await service.runFrictionDetection();
    expect(emitted.some((item) => item.eventType === FrictionEventType.LOW_SCORE_NO_RECOVERY)).toBe(false);
    jest.useRealTimers();
  });

  it('computes recovered state after generation succeeds', async () => {
    const frictionRepo = createRepo([
      {
        id: 'f1',
        userId: 'u1',
        eventType: FrictionEventType.GENERATION_ATTEMPT_FAILED,
        reason: 'Generation attempt failed or was blocked.',
        resolutionStatus: FrictionResolutionStatus.OPEN,
        severity: FeedbackSeverity.HIGH,
        createdAt: new Date('2026-03-24T08:00:00.000Z'),
      },
    ]);
    const analyticsRepo = createRepo([
      {
        id: 'e1',
        userId: 'u1',
        eventName: 'resume_generation_succeeded',
        createdAt: new Date('2026-03-24T09:00:00.000Z'),
      },
    ]);
    const service = new FeedbackIntelligenceService(
      createRepo([]) as never,
      frictionRepo as never,
      createRepo([]) as never,
      createRepo([]) as never,
      createRepo([]) as never,
      analyticsRepo as never,
    );

    const events = await service.listFrictionEvents();
    expect(events[0].recovered).toBe(true);
    expect(events[0].recoveryAction).toBe('generation_succeeded');
  });

  it('groups recurring feedback/friction into deterministic patterns', async () => {
    const feedbackRepo = createRepo([
      {
        id: 'fb1',
        userId: 'u1',
        category: FeedbackCategory.CONFUSION,
        pageContext: '/results',
        title: 'Confusing next step',
        message: 'not sure',
        severity: FeedbackSeverity.MEDIUM,
        createdAt: new Date('2026-03-24T08:00:00.000Z'),
      },
      {
        id: 'fb2',
        userId: 'u2',
        category: FeedbackCategory.CONFUSION,
        pageContext: '/results',
        title: 'Still confusing',
        message: 'not sure',
        severity: FeedbackSeverity.LOW,
        createdAt: new Date('2026-03-24T09:00:00.000Z'),
      },
    ]);
    const frictionRepo = createRepo([
      {
        id: 'fr1',
        userId: 'u1',
        eventType: FrictionEventType.REPEATED_RESULTS_VIEW_NO_ACTION,
        reason: 'Results viewed repeatedly with no downstream action.',
        severity: FeedbackSeverity.MEDIUM,
        resolutionStatus: FrictionResolutionStatus.OPEN,
        createdAt: new Date('2026-03-24T08:30:00.000Z'),
      },
    ]);
    const service = new FeedbackIntelligenceService(
      feedbackRepo as never,
      frictionRepo as never,
      createRepo([]) as never,
      createRepo([]) as never,
      createRepo([]) as never,
      createRepo([]) as never,
    );

    const patterns = await service.getFrictionPatterns();
    expect(patterns.some((item) => item.patternKey === 'feedback:confusion:/results')).toBe(true);
    expect(
      patterns.some((item) => item.patternKey.startsWith('friction:repeated_results_view_no_action:')),
    ).toBe(true);
  });
});
