import { Buffer } from 'buffer';
import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { captureSupportEvent, isSentryEnabled } from '../common/sentry';
import type { ReportBugDto } from './dto/report-bug.dto';

const AREA_DEFINITIONS = [
  { label: 'area:baseline', display: 'Baseline Library', keywords: ['baseline'] },
  { label: 'area:results', display: 'Results', keywords: ['results', 'analysis', 'job-tracker'] },
  {
    label: 'area:studio',
    display: 'Studio / Interview Toolkit',
    keywords: ['studio', 'interview', 'fit-review', 'interview-toolkit'],
  },
  { label: 'area:auth', display: 'Auth', keywords: ['auth', 'login', 'signup', 'logout'] },
  { label: 'area:upload', display: 'Upload', keywords: ['upload', 'import', 'resume', 'files'] },
  { label: 'area:scoring', display: 'Scoring', keywords: ['score', 'scoring', 'fit-score'] },
  { label: 'area:compliance', display: 'Compliance', keywords: ['compliance'] },
] as const;

const SEVERITY_KEYWORDS: Record<'high' | 'medium', string[]> = {
  high: ['crash', 'data loss', 'blocked', 'fatal', 'security', 'panic', 'unable to continue'],
  medium: ['error', 'not working', 'fails', 'failure', 'broken', 'mismatch', 'incorrect', 'unstable'],
};

type SeverityLevel = 'high' | 'medium';

type DerivedArea = {
  label: string;
  display: string;
  reason: string;
} | null;

const RATE_LIMIT_WINDOW_MS = 30_000;

export type FormatIssueBodyParams = {
  report: ReportBugDto;
  user: AuthUserDto;
  environment: string;
  timestamp: string;
  sentryEventId: string | null;
  severity: SeverityLevel | null;
  suggestedArea: DerivedArea;
};

export type ReportBugResult = {
  issueNumber?: number;
  issueUrl?: string;
  sentryEventId: string | null;
};

export function buildIssueTitle(message: string, severity?: SeverityLevel | null): string {
  const tidy = message.trim();
  const snippet = tidy.split(/\r?\n/)[0] ?? tidy;
  const summary = snippet.split(/[\.\?\!]/)[0] ?? snippet;
  const candidate = summary.trim() || 'Bug report';
  const truncated = candidate.length > 70 ? `${candidate.slice(0, 67).trim()}...` : candidate;
  const severityHint = severity ? ` (${severity === 'high' ? 'High' : 'Medium'} severity)` : '';
  return `[BUG] ${truncated}${severityHint}`;
}

function sanitizeLine(value?: string, fallback = 'Not provided.'): string {
  if (!value) return fallback;
  return value.replace(/\r?\n/g, ' ').trim();
}

export function deriveSeverity(report: ReportBugDto): SeverityLevel | null {
  const aggregated = `${report.message} ${report.tryingToDo ?? ''} ${report.expected ?? ''}`.toLowerCase();

  for (const keyword of SEVERITY_KEYWORDS.high) {
    if (aggregated.includes(keyword)) {
      return 'high';
    }
  }

  for (const keyword of SEVERITY_KEYWORDS.medium) {
    if (aggregated.includes(keyword)) {
      return 'medium';
    }
  }

  return null;
}

export function deriveArea(report: ReportBugDto): DerivedArea {
  const route = (report.route ?? '').toLowerCase();

  for (const def of AREA_DEFINITIONS) {
    if (def.keywords.some((keyword) => route.includes(keyword))) {
      return { ...def, reason: `Route includes "${def.keywords[0]}"` };
    }
  }

  if (report.baselineId) {
    const baselineArea = AREA_DEFINITIONS.find((area) => area.label === 'area:baseline');
    if (baselineArea) {
      return { ...baselineArea, reason: 'Baseline reference provided' };
    }
  }

  if (report.jobId) {
    const resultsArea = AREA_DEFINITIONS.find((area) => area.label === 'area:results');
    if (resultsArea) {
      return { ...resultsArea, reason: 'Job reference provided' };
    }
  }

  return null;
}

function formatAnalysisSnapshot(context?: Record<string, unknown>): string | null {
  if (!context || Object.keys(context).length === 0) {
    return null;
  }

  try {
    return JSON.stringify(context, null, 2);
  } catch (error) {
    return null;
  }
}

function listEntitlements(entitlements: Record<string, unknown> | undefined): string {
  if (!entitlements) {
    return 'None';
  }
  const granted = Object.entries(entitlements)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
  return granted.length > 0 ? granted.join(', ') : 'None';
}

function describeScreenshot(report: ReportBugDto): string {
  if (!report.screenshotBase64) {
    return 'Not provided.';
  }

  // TODO: persist screenshot artifacts to secure storage and attach links in the issue body.

  const sizeBytes = Buffer.byteLength(report.screenshotBase64, 'base64');
  return `Provided (~${Math.round(sizeBytes / 1024)} KiB). TODO: persist screenshot artifacts to durable storage once available.`;
}

export function formatIssueBody({
  report,
  user,
  environment,
  timestamp,
  sentryEventId,
  severity,
  suggestedArea,
}: FormatIssueBodyParams): string {
  const reporterEmail = report.email?.trim() || user.email || 'Not provided.';
  const analysisSnapshot = formatAnalysisSnapshot(report.analysisContext);

  const reproducibilityLines = [
    `- Route: ${report.route ?? 'Not provided.'}`,
    `- Context: ${sanitizeLine(report.tryingToDo, 'Not provided.')}`,
    `- Baseline ID: ${report.baselineId ?? 'Not provided.'}`,
    `- Job ID: ${report.jobId ?? 'Not provided.'}`,
  ];

  const userContext = [
    `- User ID: ${user.id}`,
    `- Reporter email: ${reporterEmail}`,
    `- Role: ${user.role ?? 'unknown'}`,
    `- Subscription tier: ${user.subscriptionTier ?? 'unknown'}`,
    `- Entitlements: ${listEntitlements(user.entitlements)}`,
  ].join('\n');

  const productLines = [
    `- Environment: ${environment}`,
    `- Route: ${report.route ?? 'Not provided.'}`,
    `- Page URL: ${report.pageUrl ?? 'Not provided.'}`,
    `- Baseline ID: ${report.baselineId ?? 'Not provided.'}`,
    `- Job ID: ${report.jobId ?? 'Not provided.'}`,
    `- Score: ${report.score ?? 'Not provided.'}`,
  ];

  if (analysisSnapshot) {
    productLines.push('', 'Analysis snapshot:', '```json', analysisSnapshot, '```');
  }

  const technicalLines = [
    `- Timestamp: ${timestamp}`,
    `- Browser / user agent: ${report.userAgent ?? 'Not provided.'}`,
    `- Reporter message length: ${report.message.length} characters`,
  ];

  const severityLines = severity
    ? [`- Severity estimate: ${severity === 'high' ? 'High' : 'Medium'}`]
    : ['- Severity estimate: Not determined'];

  const sections = [
    `### Reporter message`,
    report.message,
    '',
    `### Reproducibility hint`,
    ...reproducibilityLines,
    '',
    `### Trying to do`,
    report.tryingToDo ?? 'Not provided.',
    '',
    `### Expected behavior`,
    report.expected ?? 'Not provided.',
    '',
    `### Suggested area`,
    suggestedArea
      ? `${suggestedArea.display} (${suggestedArea.reason})`
      : 'Unable to identify a suggested area from the provided context.',
    '',
    `### Severity`,
    ...severityLines,
    '',
    `### User context`,
    userContext,
    '',
    `### Product context`,
    productLines.join('\n'),
    '',
    `### Technical context`,
    technicalLines.join('\n'),
    '',
    `### Sentry`,
    sentryEventId
      ? `- Event ID: ${sentryEventId}`
      : '- Event ID: Not recorded (Sentry is not configured or capture failed).',
    '',
    `### Notes`,
    describeScreenshot(report),
  ];

  return sections.join('\n');
}

const HISTORY_PAGE_SIZE = 25;

const AREA_LABEL_DISPLAY: Record<string, string> = AREA_DEFINITIONS.reduce<Record<string, string>>(
  (acc, def) => {
    acc[def.label] = def.display;
    return acc;
  },
  {},
);

type GitHubIssueLabel = { name?: string } | string;

type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed' | string;
  body?: string | null;
  created_at: string;
  updated_at: string;
  labels?: GitHubIssueLabel[];
};

export type SupportHistoryItem = {
  issueNumber: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  createdAt: string;
  updatedAt: string;
  severity: SeverityLevel | null;
  area: string | null;
  reporterMessagePreview: string;
  sentryEventId: string | null;
};

function normalizeGitHubLabels(labels?: GitHubIssueLabel[]): string[] {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels
    .map((label) => {
      if (typeof label === 'string') {
        return label;
      }
      return label?.name ?? '';
    })
    .map((value) => value.trim())
    .filter((value): value is string => value.length > 0);
}

function normalizeBody(body?: string | null): string {
  if (!body) {
    return '';
  }

  return body.replace(/\r\n/g, '\n');
}

function extractSection(body?: string | null, heading?: string): string | null {
  if (!body || !heading) {
    return null;
  }

  const normalizedBody = normalizeBody(body);
  const normalizedHeading = `### ${heading.toLowerCase()}`;
  const lowerBody = normalizedBody.toLowerCase();
  const headingIndex = lowerBody.indexOf(normalizedHeading);

  if (headingIndex < 0) {
    return null;
  }

  const scanStart = headingIndex + normalizedHeading.length;
  const newlineIndex = normalizedBody.indexOf('\n', scanStart);
  const contentStart = newlineIndex >= 0 ? newlineIndex + 1 : scanStart;
  let section = normalizedBody.slice(contentStart);
  const nextHeadingMatch = section.search(/###\s+/);

  if (nextHeadingMatch >= 0) {
    section = section.slice(0, nextHeadingMatch);
  }

  return section.trim();
}

function describeReporterPreview(body: string | null | undefined, title: string, issueNumber: number) {
  const reporterSection = extractSection(body, 'Reporter message');
  const candidate = reporterSection || title || `Issue #${issueNumber}`;
  const normalized = candidate.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return `Issue #${issueNumber}`;
  }

  return normalized.length > 220 ? `${normalized.slice(0, 220).trim()}…` : normalized;
}

function deriveSeverityFromIssue(labels: string[], body?: string | null): SeverityLevel | null {
  const lower = labels.map((label) => label.toLowerCase());
  if (lower.includes('severity:high')) {
    return 'high';
  }
  if (lower.includes('severity:medium')) {
    return 'medium';
  }

  const severitySection = extractSection(body, 'Severity');
  if (!severitySection) {
    return null;
  }

  const severityMatch = /severity estimate:\s*(high|medium)/i.exec(severitySection);
  return (severityMatch?.[1]?.toLowerCase() as SeverityLevel) ?? null;
}

function deriveAreaFromIssue(labels: string[], body?: string | null): string | null {
  const lowerLabels = labels.map((label) => label.toLowerCase());
  const areaLabel = lowerLabels.find((label) => label.startsWith('area:'));

  if (areaLabel) {
    return AREA_LABEL_DISPLAY[areaLabel] ?? areaLabel.replace(/^area:/, '').replace(/_/g, ' ');
  }

  const suggestedAreaSection = extractSection(body, 'Suggested area');
  if (!suggestedAreaSection) {
    return null;
  }

  return suggestedAreaSection.split('\n')[0].trim() || null;
}

function extractSentryEventId(body?: string | null): string | null {
  const sentrySection = extractSection(body, 'Sentry');
  if (!sentrySection) {
    return null;
  }

  const match = /event id:\s*([^\s]+)/i.exec(sentrySection);
  if (!match || !match[1]) {
    return null;
  }

  const value = match[1].trim();
  if (!value || value.toLowerCase().includes('not')) {
    return null;
  }

  return value;
}

function issueBelongsToUser(body: string | null | undefined, userId: string): boolean {
  if (!body || !userId) {
    return false;
  }

  return normalizeBody(body).toLowerCase().includes(`- user id: ${userId.toLowerCase()}`);
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly reportTimestamps = new Map<string, number>();

  constructor(private readonly configService: ConfigService) {}

  async reportBug(report: ReportBugDto, user: AuthUserDto): Promise<ReportBugResult> {
    this.enforceRateLimit(user.id);

    const environment =
      this.configService.get<string>('APP_ENV') ??
      this.configService.get<string>('ENVIRONMENT') ??
      this.configService.get<string>('NODE_ENV') ??
      'unknown';

    const timestamp = new Date().toISOString();
    const sentryEventId = await this.safeCaptureSupportEvent(report, user, environment);

    const severity = deriveSeverity(report);
    const suggestedArea = deriveArea(report);
    const labels = ['bug', 'beta'];
    if (suggestedArea) {
      labels.push(suggestedArea.label);
    }
    if (severity) {
      labels.push(`severity:${severity}`);
    }

    const title = buildIssueTitle(report.message, severity);
    const body = formatIssueBody({
      report,
      user,
      environment,
      timestamp,
      sentryEventId,
      severity,
      suggestedArea,
    });

    const issue = await this.createGitHubIssue({ title, body, labels });
    await this.assignIssueToProject(issue.id);

    return {
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      sentryEventId,
    };
  }

  async getUserHistory(userId: string, options?: { page?: number }): Promise<SupportHistoryItem[]> {
    const pageNumber = options?.page && options.page > 0 ? Math.floor(options.page) : 1;
    const { owner, repo, token } = this.ensureGitHubConfig();
    const params = new URLSearchParams({
      state: 'all',
      sort: 'created',
      direction: 'desc',
      labels: 'bug',
      per_page: HISTORY_PAGE_SIZE.toString(),
      page: pageNumber.toString(),
    });

    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });

      if (!response.ok) {
        const body = (await response.text().catch(() => null)) ?? '';
        this.logger.warn('GitHub history request failed.', {
          status: response.status,
          body,
        });
        throw new ServiceUnavailableException(
          'Unable to retrieve your support history right now. Please try again later.',
        );
      }

      const issues = (await response.json()) as GitHubIssue[];
      return issues
        .filter((issue) => issueBelongsToUser(issue.body, userId))
        .map((issue) => this.buildHistoryItem(issue));
    } catch (error) {
      this.logger.warn('Unable to fetch bug report history from GitHub.', error ?? 'unknown error');
      throw new ServiceUnavailableException(
        'Unable to retrieve your support history right now. Please try again later.',
      );
    }
  }

  private enforceRateLimit(userId: string) {
    const now = Date.now();
    const last = this.reportTimestamps.get(userId) ?? 0;

    if (now - last < RATE_LIMIT_WINDOW_MS) {
      throw new HttpException(
        'Please wait a moment before sending another bug report.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.reportTimestamps.set(userId, now);
  }

  private async safeCaptureSupportEvent(
    report: ReportBugDto,
    user: AuthUserDto,
    environment: string,
  ): Promise<string | null> {
    try {
      return await captureSupportEvent('Bug report', {
        user: { id: user.id, email: user.email },
        environment,
        extra: {
          route: report.route,
          pageUrl: report.pageUrl,
          baselineId: report.baselineId,
          jobId: report.jobId,
          score: report.score,
          hasScreenshot: Boolean(report.screenshotBase64),
        },
      });
    } catch (error) {
      this.logger.warn('Sentry capture failed for bug report', error as Error);
      return null;
    }
  }

  private async createGitHubIssue(payload: { title: string; body: string; labels: string[] }) {
    const { owner, repo, token } = this.ensureGitHubConfig();

    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: payload.title,
            body: payload.body,
            labels: payload.labels,
          }),
        },
      );

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        this.logger.warn('GitHub API responded with an error.', {
          status: response.status,
          message: errorPayload?.message,
        });
        throw new ServiceUnavailableException('Failed to create GitHub issue. Please try again later.');
      }

      return (await response.json()) as { number: number; html_url: string; id: number };
    } catch (error) {
      this.logger.error('Unable to create GitHub issue for bug report.', error ?? 'unknown error');
      throw new ServiceUnavailableException('Failed to create GitHub issue. Please try again later.');
    }
  }

  async getConfiguration() {
    const owner = this.configService.get<string>('GITHUB_BUG_REPORT_OWNER');
    const repo = this.configService.get<string>('GITHUB_BUG_REPORT_REPO');
    const token = this.configService.get<string>('GITHUB_BUG_REPORT_TOKEN');
    const githubConfigured = Boolean(owner && repo && token);
    const projectColumnId = this.configService.get<string>('GITHUB_BUG_REPORT_PROJECT_COLUMN_ID');
    return {
      githubConfigured,
      sentryConfigured: isSentryEnabled(),
      projectAssignmentEnabled: Boolean(projectColumnId),
    };
  }

  private async assignIssueToProject(issueId: number): Promise<boolean> {
    const columnId = this.configService.get<string>('GITHUB_BUG_REPORT_PROJECT_COLUMN_ID');
    const token = this.configService.get<string>('GITHUB_BUG_REPORT_TOKEN');

    if (!columnId || !token) {
      return false;
    }

    try {
      const response = await fetch(`https://api.github.com/projects/columns/${columnId}/cards`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content_id: issueId,
          content_type: 'Issue',
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        this.logger.warn('GitHub project assignment failed for bug report.', {
          status: response.status,
          message: errorPayload?.message,
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn('Unable to assign bug report to GitHub project.', error ?? 'unknown error');
      return false;
    }
  }

  private buildHistoryItem(issue: GitHubIssue): SupportHistoryItem {
    const labels = normalizeGitHubLabels(issue.labels);
    const severity = deriveSeverityFromIssue(labels, issue.body);
    const area = deriveAreaFromIssue(labels, issue.body);
    const preview = describeReporterPreview(issue.body, issue.title, issue.number);
    const sentryEventId = extractSentryEventId(issue.body);
    const state = issue.state === 'closed' ? 'closed' : 'open';

    return {
      issueNumber: issue.number,
      title: issue.title,
      state,
      labels,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at ?? issue.created_at,
      severity,
      area,
      reporterMessagePreview: preview,
      sentryEventId,
    };
  }

  private ensureGitHubConfig() {
    const owner = this.configService.get<string>('GITHUB_BUG_REPORT_OWNER');
    const repo = this.configService.get<string>('GITHUB_BUG_REPORT_REPO');
    const token = this.configService.get<string>('GITHUB_BUG_REPORT_TOKEN');

    if (!owner || !repo || !token) {
      this.logger.warn('GitHub bug reporting is not configured.');
      throw new InternalServerErrorException('Bug reporting is not configured.');
    }

    return { owner, repo, token };
  }
}
