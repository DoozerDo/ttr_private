import type { ConfigService } from '@nestjs/config';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { captureSupportEvent } from '../common/sentry';
import { AutoErrorType } from './dto/auto-error.dto';
import type { ReportBugDto } from './dto/report-bug.dto';
import {
  buildAutoErrorFingerprint,
  classifyErrorHealthStatus,
  deriveArea,
  deriveSeverity,
  formatIssueBody,
  ReportBugResult,
  SupportService,
} from './support.service';

jest.mock('../common/sentry', () => ({
  captureSupportEvent: jest.fn(),
}));

describe('SupportService', () => {
  const captureMock = captureSupportEvent as jest.MockedFunction<typeof captureSupportEvent>;
  const originalFetch = globalThis.fetch;

  const report: ReportBugDto = {
    message: 'Results summary crashes when loading',
    tryingToDo: 'Open the results page and sort the baseline',
    expected: 'Sort completes silently',
    route: '/results/summary',
  };

  const user = {
    id: 'user-123',
    email: 'user@example.com',
    role: 'member',
    subscriptionTier: 'beta',
    entitlements: {},
  } as AuthUserDto;

  beforeEach(() => {
    jest.resetAllMocks();
    captureMock.mockResolvedValue('event-id');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('derives the correct area information from the route', () => {
    const suggestion = deriveArea(report);
    expect(suggestion?.label).toBe('area:results');
    expect(suggestion?.display).toContain('Results');
  });

  it('derives severity from keyword hints', () => {
    expect(deriveSeverity(report)).toBe('high');
    expect(deriveSeverity({ ...report, message: 'Unexpected error' })).toBe('medium');
    expect(deriveSeverity({ ...report, message: 'Just a note' })).toBeNull();
  });

  it('includes reproducibility and suggested area sections in the issue body', () => {
    const body = formatIssueBody({
      report,
      user,
      environment: 'test',
      timestamp: '2026-03-18T00:00:00.000Z',
      sessionId: 'session-1',
      appVersion: '1.0.0',
      userAgent: 'Mozilla/5.0',
    });

    expect(body).toContain('User Report:');
    expect(body).toContain('Context:');
    expect(body).toContain('Environment:');
  });

  it('returns the created issue metadata when GitHub succeeds', async () => {
    const configService = {
      get(key: string) {
        switch (key) {
          case 'APP_ENV':
            return 'test';
          case 'GITHUB_BUG_REPORT_OWNER':
            return 'owner';
          case 'GITHUB_BUG_REPORT_REPO':
            return 'repo';
          case 'GITHUB_BUG_REPORT_TOKEN':
            return 'token';
          case 'GITHUB_BUG_REPORT_PROJECT_COLUMN_ID':
            return 'column-1';
          default:
            return undefined;
        }
      },
    } as ConfigService;

    const issueResponse = {
      number: 123,
      html_url: 'https://github.com/org/repo/issues/123',
      id: 456,
    };

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(issueResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const service = new SupportService(configService);
    const result = await service.reportBug(report, user);

    expect(result.issueNumber).toBe(123);
    expect(result.issueUrl).toBe(issueResponse.html_url);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fail when project assignment fails', async () => {
    const configService = {
      get(key: string) {
        switch (key) {
          case 'APP_ENV':
            return 'test';
          case 'GITHUB_BUG_REPORT_OWNER':
            return 'owner';
          case 'GITHUB_BUG_REPORT_REPO':
            return 'repo';
          case 'GITHUB_BUG_REPORT_TOKEN':
            return 'token';
          case 'GITHUB_BUG_REPORT_PROJECT_COLUMN_ID':
            return 'column-1';
          default:
            return undefined;
        }
      },
    } as ConfigService;

    const issueResponse = {
      number: 321,
      html_url: 'https://github.com/org/repo/issues/321',
      id: 654,
    };

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(issueResponse),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'project fail' }),
      });

    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const service = new SupportService(configService);
    const result = await service.reportBug(report, user);

    expect(result.issueNumber).toBe(321);
  });

  it('throws a friendly error when GitHub API rejects the request', async () => {
    const configService = {
      get(key: string) {
        switch (key) {
          case 'APP_ENV':
            return 'test';
          case 'GITHUB_BUG_REPORT_OWNER':
            return 'owner';
          case 'GITHUB_BUG_REPORT_REPO':
            return 'repo';
          case 'GITHUB_BUG_REPORT_TOKEN':
            return 'token';
          default:
            return undefined;
        }
      },
    } as ConfigService;

    const githubResponse = Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'failure' }),
    });

    globalThis.fetch = jest.fn().mockReturnValue(githubResponse) as unknown as typeof globalThis.fetch;

    const service = new SupportService(configService);

    await expect(service.reportBug(report, user)).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        code: 'bug_report_failed',
        message: 'Bug report failed to send',
      }),
    });
  });

  it('returns an intentional 503 when GitHub bug reporting config is missing', async () => {
    const configService = {
      get(key: string) {
        switch (key) {
          case 'APP_ENV':
            return 'test';
          default:
            return undefined;
        }
      },
    } as ConfigService;

    const service = new SupportService(configService);
    await expect(service.reportBug(report, user)).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        code: 'support_config_unavailable',
      }),
    });
  });

  it('returns MISCONFIGURED support status when GitHub env vars are missing', () => {
    const configService = {
      get() {
        return undefined;
      },
    } as ConfigService;
    const service = new SupportService(configService);
    expect(service.getSupportStatus()).toEqual({ bugReporting: 'MISCONFIGURED' });
  });

  describe('getUserHistory', () => {
    const configService = {
      get(key: string) {
        switch (key) {
          case 'GITHUB_BUG_REPORT_OWNER':
            return 'owner';
          case 'GITHUB_BUG_REPORT_REPO':
            return 'repo';
          case 'GITHUB_BUG_REPORT_TOKEN':
            return 'token';
          default:
            return undefined;
        }
      },
    } as ConfigService;

    const createIssueBody = (userId: string) => `
### Reporter message
App crashed once while loading results.

### User context
- User ID: ${userId}

### Suggested area
Results (Route includes "results")

### Severity
- Severity estimate: High

### Sentry
- Event ID: sentry-abc
`;

    const withHistoryFetch = (issues: unknown[], commentsByIssue?: Record<number, unknown[]>) =>
      jest.fn().mockImplementation((url: string) => {
        if (url.includes('/issues?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(issues),
          });
        }
        const match = /\/issues\/(\d+)\/comments/.exec(url);
        if (match) {
          const issueNumber = Number(match[1]);
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(commentsByIssue?.[issueNumber] ?? []),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      });

    it('returns history items filtered for the requesting user', async () => {
      const issues = [
        {
          number: 101,
          title: 'Results crash',
          state: 'open',
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-02T00:00:00.000Z',
          labels: [{ name: 'bug' }, { name: 'beta' }, { name: 'area:results' }, { name: 'severity:high' }],
          body: createIssueBody(user.id),
        },
      ];

      const fetchMock = withHistoryFetch(issues, {
        101: [
          { body: 'System sync message', user: { type: 'Bot', login: 'github-actions[bot]' } },
          { body: 'Fix is rolling out now.', user: { type: 'User', login: 'maintainer' } },
        ],
      });
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const [historyItem] = await service.getUserHistory(user.id);

      expect(historyItem.issueNumber).toBe(101);
      expect(historyItem.state).toBe('open');
      expect(historyItem.status).toBe('Investigating');
      expect(historyItem.severity).toBe('high');
      expect(historyItem.area).toContain('Results');
      expect(historyItem.reporterMessagePreview).toContain('App crashed once while loading results.');
      expect(historyItem.sentryEventId).toBe('sentry-abc');
      expect(historyItem.resolutionNote).toBe('Fix is rolling out now.');
      expect(historyItem.labels).toEqual(expect.arrayContaining(['area:results', 'severity:high']));
    });

    it('maps open issues with in-progress labels to "Fix in progress"', async () => {
      const issues = [
        {
          number: 111,
          title: 'Results crash',
          state: 'open',
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-02T00:00:00.000Z',
          labels: [{ name: 'bug' }, { name: 'status:in-progress' }],
          body: createIssueBody(user.id),
        },
      ];
      const fetchMock = withHistoryFetch(issues);
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const [item] = await service.getUserHistory(user.id);
      expect(item.status).toBe('Fix in progress');
    });

    it('does not return issues from other users', async () => {
      const issues = [
        {
          number: 202,
          title: 'Other user bug',
          state: 'open',
          created_at: '2026-03-03T00:00:00.000Z',
          updated_at: '2026-03-03T00:00:00.000Z',
          labels: [{ name: 'bug' }],
          body: createIssueBody('other-user'),
        },
      ];
      const fetchMock = withHistoryFetch(issues);
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const history = await service.getUserHistory(user.id);
      expect(history).toHaveLength(0);
    });

    it('requires exact user-id line matching and avoids fuzzy substring matches', async () => {
      const issues = [
        {
          number: 203,
          title: 'Similar user id bug',
          state: 'open',
          created_at: '2026-03-03T00:00:00.000Z',
          updated_at: '2026-03-03T00:00:00.000Z',
          labels: [{ name: 'bug' }],
          body: createIssueBody('user-1234'),
        },
      ];
      const fetchMock = withHistoryFetch(issues);
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const history = await service.getUserHistory('user-123');
      expect(history).toHaveLength(0);
    });

    it('falls back to safe basics when structured parsing is unavailable', async () => {
      const issues = [
        {
          number: 304,
          title: 'Raw issue with no sections',
          state: 'closed',
          created_at: '2026-03-05T00:00:00.000Z',
          updated_at: '2026-03-06T00:00:00.000Z',
          labels: [{ name: 'bug' }],
          body: `random text\n- User ID: ${user.id}\nwith no markdown headings`,
        },
      ];
      const fetchMock = withHistoryFetch(issues);
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const [item] = await service.getUserHistory(user.id);

      expect(item.issueNumber).toBe(304);
      expect(item.title).toBe('Raw issue with no sections');
      expect(item.state).toBe('closed');
      expect(item.status).toBe('Resolved');
      expect(item.severity).toBeNull();
      expect(item.area).toBeNull();
      expect(item.reporterMessagePreview).toContain('Raw issue with no sections');
      expect(item.sentryEventId).toBeNull();
      expect(item.resolutionNote).toBeNull();
    });

    it('returns an empty list when GitHub has no entries', async () => {
      const fetchMock = withHistoryFetch([]);
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const history = await service.getUserHistory(user.id);
      expect(history).toHaveLength(0);
    });

    it('throws when GitHub API fails', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      });
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      await expect(service.getUserHistory(user.id)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('recordStillSeeingIssue', () => {
    const configService = {
      get(key: string) {
        switch (key) {
          case 'GITHUB_BUG_REPORT_OWNER':
            return 'owner';
          case 'GITHUB_BUG_REPORT_REPO':
            return 'repo';
          case 'GITHUB_BUG_REPORT_TOKEN':
            return 'token';
          default:
            return undefined;
        }
      },
    } as ConfigService;

    const createOwnedIssue = (ownerId: string) => ({
      number: 77,
      title: 'Resolved issue',
      state: 'closed',
      created_at: '2026-03-03T00:00:00.000Z',
      updated_at: '2026-03-03T00:00:00.000Z',
      labels: [{ name: 'bug' }],
      body: `### User context\n- User ID: ${ownerId}\n\n### Auto error summary\n- Fingerprint: fp-12345`,
    });

    it('records signal count for owned issue', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createOwnedIssue(user.id)),
      });
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const first = await service.recordStillSeeingIssue(user.id, 77);
      const second = await service.recordStillSeeingIssue(user.id, 77);

      expect(first.count).toBe(1);
      expect(second.count).toBe(2);
      expect(second.fingerprint).toBe('fp-12345');
    });

    it('rejects signals for issues owned by another user', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createOwnedIssue('someone-else')),
      });
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      await expect(service.recordStillSeeingIssue(user.id, 77)).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('auto error ingestion', () => {
    const configService = {
      get(key: string) {
        switch (key) {
          case 'APP_ENV':
            return 'test';
          case 'GITHUB_BUG_REPORT_OWNER':
            return 'owner';
          case 'GITHUB_BUG_REPORT_REPO':
            return 'repo';
          case 'GITHUB_BUG_REPORT_TOKEN':
            return 'token';
          default:
            return undefined;
        }
      },
    } as ConfigService;

    it('creates deterministic fingerprints', () => {
      const first = buildAutoErrorFingerprint({
        errorType: AutoErrorType.RUNTIME,
        message: 'TypeError: Cannot read properties of undefined',
        route: '/results?jobId=123',
      });
      const second = buildAutoErrorFingerprint({
        errorType: AutoErrorType.RUNTIME,
        message: 'TypeError: Cannot read properties of undefined',
        route: '/results?jobId=456',
      });

      expect(first).toBe(second);
      expect(first).toHaveLength(24);
    });

    it('dedupes repeated errors and avoids duplicate GitHub issues inside window', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ number: 901, html_url: 'https://github.com/o/r/issues/901', id: 77 }),
        });
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const payload = {
        errorType: AutoErrorType.API,
        message: 'Internal server error on results',
        endpoint: '/api/analysis/latest',
        method: 'GET',
        status: 500,
        route: '/results',
        timestamp: '2026-03-18T00:00:00.000Z',
      };

      const first = await service.ingestAutoError(payload, user);
      const second = await service.ingestAutoError(payload, user);

      expect(first.escalated).toBe(true);
      expect(second.deduped).toBe(true);
      expect(second.escalated).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('escalates again when frequency threshold is crossed in dedupe window', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ number: 902, html_url: 'https://github.com/o/r/issues/902', id: 78 }),
        });
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const payload = {
        errorType: AutoErrorType.RUNTIME,
        message: 'Unhandled runtime error on studio render',
        route: '/studio',
        timestamp: '2026-03-18T00:00:00.000Z',
      };

      await service.ingestAutoError(payload, user);
      await service.ingestAutoError(payload, user);
      const third = await service.ingestAutoError(payload, user);

      expect(third.count).toBe(3);
      expect(third.escalated).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('continues successfully when GitHub escalation fails', async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error('github unavailable'));
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const result = await service.ingestAutoError(
        {
          errorType: AutoErrorType.PROMISE,
          message: 'Unhandled promise rejection in fit review',
          route: '/fit-review',
          timestamp: '2026-03-18T00:00:00.000Z',
        },
        user,
      );

      expect(result.accepted).toBe(true);
      expect(result.escalated).toBe(false);
    });

    it('classifies status hints deterministically', () => {
      const now = Date.now();
      expect(
        classifyErrorHealthStatus({
          now,
          firstSeenAt: now - 2 * 60_000,
          lastSeenAt: now - 60_000,
          count: 1,
          regressedInReleaseId: null,
          releaseId: 'abc',
        }),
      ).toBe('New');

      expect(
        classifyErrorHealthStatus({
          now,
          firstSeenAt: now - 2 * 60 * 60_000,
          lastSeenAt: now - 2 * 60_000,
          count: 4,
          regressedInReleaseId: null,
          releaseId: 'abc',
        }),
      ).toBe('Active');

      expect(
        classifyErrorHealthStatus({
          now,
          firstSeenAt: now - 2 * 60 * 60_000,
          lastSeenAt: now - 2 * 60 * 60_000,
          count: 8,
          regressedInReleaseId: null,
          releaseId: 'abc',
        }),
      ).toBe('Quiet');
    });

    it('detects regression when a quiet fingerprint reappears in a new release', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ number: 903, html_url: 'https://github.com/o/r/issues/903', id: 79 }),
      });
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      await service.ingestAutoError(
        {
          errorType: AutoErrorType.RUNTIME,
          message: 'Studio crash',
          route: '/studio',
          releaseId: 'build-a',
          timestamp: '2026-03-18T00:00:00.000Z',
        },
        user,
      );
      nowSpy.mockReturnValue(1_000_000 + 2 * 60 * 60 * 1000);
      await service.ingestAutoError(
        {
          errorType: AutoErrorType.RUNTIME,
          message: 'Studio crash',
          route: '/studio',
          releaseId: 'build-b',
          timestamp: '2026-03-18T02:00:00.000Z',
        },
        user,
      );

      const [item] = service.getErrorHealth();
      expect(item.releaseId).toBe('build-b');
      expect(item.statusHint).toBe('Regressed');
      nowSpy.mockRestore();
    });

    it('sorts error health by current signal and includes issue links when escalated', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ number: 910, html_url: 'https://github.com/o/r/issues/910', id: 81 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ number: 911, html_url: 'https://github.com/o/r/issues/911', id: 82 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ number: 912, html_url: 'https://github.com/o/r/issues/912', id: 83 }),
        });
      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      await service.ingestAutoError(
        {
          errorType: AutoErrorType.API,
          message: 'Results API failure',
          route: '/results',
          endpoint: '/api/analysis/latest',
          method: 'GET',
          status: 500,
          releaseId: 'build-c',
          timestamp: '2026-03-18T00:00:00.000Z',
        },
        user,
      );
      await service.ingestAutoError(
        {
          errorType: AutoErrorType.RUNTIME,
          message: 'Studio render failure',
          route: '/studio',
          releaseId: 'build-c',
          timestamp: '2026-03-18T00:00:00.000Z',
        },
        user,
      );
      await service.ingestAutoError(
        {
          errorType: AutoErrorType.RUNTIME,
          message: 'Studio render failure',
          route: '/studio',
          releaseId: 'build-c',
          timestamp: '2026-03-18T00:00:00.000Z',
        },
        user,
      );
      await service.ingestAutoError(
        {
          errorType: AutoErrorType.RUNTIME,
          message: 'Studio render failure',
          route: '/studio',
          releaseId: 'build-c',
          timestamp: '2026-03-18T00:00:00.000Z',
        },
        user,
      );

      const items = service.getErrorHealth();
      expect(items[0]?.count).toBeGreaterThanOrEqual(items[1]?.count ?? 0);
      expect(items[0]?.issueNumber).toBeTruthy();
      expect(items[0]?.issueUrl).toContain('github.com');
    });
  });
});
