import type { Repository } from 'typeorm';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import {
  BetaFeedbackCategory,
  BetaFeedbackSeverity,
} from './beta-feedback.entity';
import {
  BetaFeedbackService,
  classifyBetaFeedbackCategory,
} from './beta-feedback.service';

type StoredFeedback = {
  id: string;
  title: string;
  where: string;
  actual: string;
  expected: string;
  severity: BetaFeedbackSeverity;
  category: BetaFeedbackCategory;
  jobDescription: string | null;
  notes: string | null;
  screenshotUrl: string | null;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; email?: string | null } | null;
};

describe('BetaFeedbackService', () => {
  const user = {
    id: 'admin-1',
    email: 'admin@ttr.ai',
    role: 'admin',
  } as AuthUserDto;

  function createRepository() {
    const store: StoredFeedback[] = [];

    const repo = {
      create: jest.fn((payload: Partial<StoredFeedback>) => payload),
      save: jest.fn(async (payload: Partial<StoredFeedback>) => {
        const entity: StoredFeedback = {
          id: `bf-${store.length + 1}`,
          title: payload.title ?? '',
          where: payload.where ?? '',
          actual: payload.actual ?? '',
          expected: payload.expected ?? '',
          severity: payload.severity ?? BetaFeedbackSeverity.MINOR,
          category: payload.category ?? BetaFeedbackCategory.OTHER,
          jobDescription: payload.jobDescription ?? null,
          notes: payload.notes ?? null,
          screenshotUrl: payload.screenshotUrl ?? null,
          userId: payload.userId ?? null,
          createdAt: new Date(Date.now() + store.length),
          updatedAt: new Date(Date.now() + store.length),
          user: payload.userId ? { id: payload.userId } : null,
        };
        store.push(entity);
        return entity;
      }),
      find: jest.fn(async () => store.map((item) => ({ ...item }))),
      createQueryBuilder: jest.fn(() => {
        let severity: BetaFeedbackSeverity | undefined;
        let category: BetaFeedbackCategory | undefined;
        const builder = {
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          andWhere: jest.fn((query: string, params: Record<string, unknown>) => {
            if (query.includes('severity')) severity = params.severity as BetaFeedbackSeverity;
            if (query.includes('category')) category = params.category as BetaFeedbackCategory;
            return builder;
          }),
          getMany: jest.fn(async () =>
            store
              .filter((item) => (severity ? item.severity === severity : true))
              .filter((item) => (category ? item.category === category : true))
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          ),
        };
        return builder;
      }),
    };

    return { repo: repo as unknown as Repository<any>, store };
  }

  it('classifies feedback by deterministic keyword rules', () => {
    expect(
      classifyBetaFeedbackCategory({
        title: 'Score looks wrong',
        where: 'Results',
        actual: 'Score too high for this role',
        expected: 'Lower fit score',
      }),
    ).toBe(BetaFeedbackCategory.SCORING_ISSUE);

    expect(
      classifyBetaFeedbackCategory({
        title: 'Made up claims',
        where: 'Studio',
        actual: 'The generated content invented experience',
        expected: 'No invented claims',
      }),
    ).toBe(BetaFeedbackCategory.HALLUCINATION);

    expect(
      classifyBetaFeedbackCategory({
        title: 'CTA confusing',
        where: 'Results',
        actual: 'I am not sure what to do next',
        expected: 'Clear next step',
      }),
    ).toBe(BetaFeedbackCategory.UX_CONFUSION);
  });

  it('creates feedback with auto category and fetches it', async () => {
    const { repo } = createRepository();
    const service = new BetaFeedbackService(repo);

    await service.create(
      {
        title: 'Score mismatch',
        where: 'Results page',
        actual: 'Score too low despite direct fit',
        expected: 'Score should be higher',
        severity: BetaFeedbackSeverity.MAJOR,
      },
      user,
    );

    const all = await service.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].category).toBe(BetaFeedbackCategory.SCORING_ISSUE);
    expect(all[0].userId).toBe('admin-1');
  });

  it('returns summary counts and recurring titles', async () => {
    const { repo } = createRepository();
    const service = new BetaFeedbackService(repo);

    await service.create(
      {
        title: 'Score mismatch',
        where: 'Results page',
        actual: 'Score too high',
        expected: 'Score lower',
        severity: BetaFeedbackSeverity.BLOCKER,
      },
      user,
    );
    await service.create(
      {
        title: 'Score mismatch',
        where: 'Results page',
        actual: 'Score too low',
        expected: 'Score higher',
        severity: BetaFeedbackSeverity.MAJOR,
      },
      user,
    );
    await service.create(
      {
        title: 'Broken route button',
        where: 'Analyze',
        actual: 'Button click goes to wrong page and broken flow',
        expected: 'Correct route',
        severity: BetaFeedbackSeverity.MINOR,
      },
      user,
    );

    const summary = await service.getSummary();
    expect(summary.totalCount).toBe(3);
    expect(summary.bySeverity.blocker).toBe(1);
    expect(summary.bySeverity.major).toBe(1);
    expect(summary.bySeverity.minor).toBe(1);
    expect(summary.byCategory.scoring_issue).toBe(2);
    expect(summary.byCategory.navigation_break).toBe(1);
    expect(summary.topRecurringTitles[0]).toEqual({ title: 'score mismatch', count: 2 });
  });
});
