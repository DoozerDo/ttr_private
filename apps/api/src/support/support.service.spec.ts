import type { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { captureSupportEvent } from '../common/sentry';
import type { ReportBugDto } from './dto/report-bug.dto';
import {
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
      sentryEventId: 'event-id',
      severity: 'high',
      suggestedArea: deriveArea(report),
    });

    expect(body).toContain('### Reproducibility hint');
    expect(body).toContain('### Suggested area');
    expect(body).toContain('### Severity');
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

    await expect(service.reportBug(report, user)).rejects.toThrow(ServiceUnavailableException);
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

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(issues),
      });

      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const [historyItem] = await service.getUserHistory(user.id);

      expect(historyItem.issueNumber).toBe(101);
      expect(historyItem.state).toBe('open');
      expect(historyItem.severity).toBe('high');
      expect(historyItem.area).toContain('Results');
      expect(historyItem.reporterMessagePreview).toContain('App crashed once while loading results.');
      expect(historyItem.sentryEventId).toBe('sentry-abc');
      expect(historyItem.labels).toEqual(expect.arrayContaining(['area:results', 'severity:high']));
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

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(issues),
      });

      (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;

      const service = new SupportService(configService);
      const history = await service.getUserHistory(user.id);

      expect(history).toHaveLength(0);
    });

    it('returns an empty list when GitHub has no entries', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

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
});
