import { Buffer } from 'buffer';
import { createHash } from 'crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { captureSupportEvent, isSentryEnabled } from '../common/sentry';
import { AutoErrorDto, AutoErrorType } from './dto/auto-error.dto';
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
const AUTO_ERROR_WINDOW_MS = 45 * 60 * 1000;
const AUTO_ERROR_FREQUENCY_THRESHOLD = 3;
const AUTO_ERROR_MAX_PAYLOAD_BYTES = 24 * 1024;
const AUTO_ERROR_PER_USER_LIMIT = 40;
const AUTO_ERROR_GLOBAL_LIMIT = 400;
const AUTO_ERROR_RATE_WINDOW_MS = 5 * 60 * 1000;
const ERROR_HEALTH_NEW_WINDOW_MS = 10 * 60 * 1000;
const ERROR_HEALTH_ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const ERROR_HEALTH_QUIET_WINDOW_MS = 60 * 60 * 1000;

type AutoErrorFingerprintInput = {
  errorType: AutoErrorType;
  message: string;
  route?: string;
  endpoint?: string;
};

type AutoErrorIssueBucket = {
  fingerprint: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastEscalatedAt: number | null;
  issueNumber: number | null;
  issueUrl: string | null;
  lastMessage: string;
  errorType: AutoErrorType;
  route: string | null;
  endpoint: string | null;
  areaLabel: string | null;
  releaseId: string | null;
  regressedInReleaseId: string | null;
};

export type AutoErrorIngestResult = {
  accepted: true;
  fingerprint: string;
  deduped: boolean;
  escalated: boolean;
  count: number;
  sentryEventId: string | null;
};

export type ErrorHealthStatus = 'New' | 'Active' | 'Quiet' | 'Regressed';

export type ErrorHealthSummary = {
  fingerprint: string;
  summary: string;
  sourceType: AutoErrorType;
  areaOrRoute: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  releaseId: string | null;
  escalated: boolean;
  issueNumber: number | null;
  issueUrl: string | null;
  statusHint: ErrorHealthStatus;
};


export type FormatIssueBodyParams = {
  report: ReportBugDto;
  user: AuthUserDto;
  environment: string;
  timestamp: string;
  sessionId: string | null;
  appVersion: string | null;
  userAgent: string | null;
};

export type ReportBugResult = {
  issueNumber?: number;
  issueUrl?: string;
  sentryEventId: string | null;
};

const SUPPORT_CONFIG_UNAVAILABLE_CODE = 'support_config_unavailable';
const BUG_REPORT_FAILED_CODE = 'bug_report_failed';

function createSupportConfigUnavailableException() {
  return new HttpException(
    {
      code: SUPPORT_CONFIG_UNAVAILABLE_CODE,
      message: 'Bug reporting is temporarily unavailable due to server configuration.',
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

function createBugReportFailedException() {
  return new HttpException(
    {
      code: BUG_REPORT_FAILED_CODE,
      message: 'Bug report failed to send',
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

export function buildIssueTitle(message: string): string {
  const tidy = message.trim().replace(/\s+/g, ' ');
  const title = tidy.slice(0, 80).trim();
  return `[Bug] ${title || 'Bug report'}`;
}

function normalizeMessageForFingerprint(message: string): string {
  const collapsed = message
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b\d+\b/g, '#')
    .trim();
  return collapsed.slice(0, 280) || 'unknown error';
}

function normalizeRouteForFingerprint(route?: string): string {
  if (!route) return 'unknown-route';
  const sanitized = route
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, ':id')
    .replace(/\d+/g, ':n')
    .replace(/\?.*$/, '')
    .trim();
  return sanitized || 'unknown-route';
}

function normalizeEndpointForFingerprint(endpoint?: string): string {
  if (!endpoint) return 'none';
  return normalizeRouteForFingerprint(endpoint);
}

export function buildAutoErrorFingerprint(input: AutoErrorFingerprintInput): string {
  const message = normalizeMessageForFingerprint(input.message);
  const route = normalizeRouteForFingerprint(input.route);
  const endpoint =
    input.errorType === AutoErrorType.API
      ? normalizeEndpointForFingerprint(input.endpoint)
      : 'none';
  const raw = [input.errorType, message, route, endpoint].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function summarizeAutoErrorTitle(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '[AUTO][BUG] Unknown runtime failure';
  }
  const snippet = normalized.slice(0, 82);
  return `[AUTO][BUG] ${snippet}${normalized.length > 82 ? '…' : ''}`;
}

export function classifyErrorHealthStatus(input: {
  now: number;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  regressedInReleaseId: string | null;
  releaseId: string | null;
}): ErrorHealthStatus {
  const firstSeenAge = input.now - input.firstSeenAt;
  const lastSeenAge = input.now - input.lastSeenAt;
  const isRegressed =
    Boolean(input.regressedInReleaseId) &&
    input.regressedInReleaseId === input.releaseId &&
    lastSeenAge <= ERROR_HEALTH_ACTIVE_WINDOW_MS;

  if (isRegressed) {
    return 'Regressed';
  }
  if (lastSeenAge > ERROR_HEALTH_QUIET_WINDOW_MS) {
    return 'Quiet';
  }
  if (firstSeenAge <= ERROR_HEALTH_NEW_WINDOW_MS && input.count <= 2) {
    return 'New';
  }
  return 'Active';
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

export function formatIssueBody({ report, user, environment, timestamp, sessionId, appVersion, userAgent }: FormatIssueBodyParams): string {
  return [
    'User Report:',
    report.message,
    '',
    'Context:',
    `- route: ${report.route ?? 'unknown'}`,
    `- page url: ${report.pageUrl ?? 'unknown'}`,
    `- user: ${user.id || 'anonymous'}`,
    `- session id: ${sessionId ?? 'unknown'}`,
    `- timestamp: ${timestamp}`,
    `- client timestamp: ${report.timestamp ?? 'unknown'}`,
    `- app version: ${appVersion ?? 'unknown'}`,
    `- baseline id: ${report.baselineId ?? 'unknown'}`,
    `- job id: ${report.jobId ?? 'unknown'}`,
    `- last user action: ${report.lastUserAction ?? 'unknown'}`,
    '',
    'Environment:',
    `- user agent: ${userAgent ?? 'unknown'}`,
    `- environment: ${environment}`,
  ].join('\n');
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
  status: 'Investigating' | 'Fix in progress' | 'Resolved';
  labels: string[];
  createdAt: string;
  updatedAt: string;
  severity: SeverityLevel | null;
  area: string | null;
  reporterMessagePreview: string;
  sentryEventId: string | null;
  resolutionNote: string | null;
};


type GitHubIssueComment = {
  body?: string | null;
  user?: {
    login?: string | null;
    type?: string | null;
  } | null;
  created_at?: string;
  updated_at?: string;
};

type StillSeeingSignalRecord = {
  issueNumber: number;
  fingerprint: string | null;
  count: number;
  lastSeenAt: number;
};

export type StillSeeingSignalResult = {
  issueNumber: number;
  fingerprint: string | null;
  count: number;
  lastSeenAt: string;
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

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFingerprint(body?: string | null): string | null {
  const summary = extractSection(body, 'Auto error summary');
  if (!summary) {
    return null;
  }
  const match = /fingerprint:\s*([a-z0-9_-]{6,})/i.exec(summary);
  return match?.[1]?.trim() ?? null;
}

function mapHistoryStatus(state: 'open' | 'closed', labels: string[]): SupportHistoryItem['status'] {
  if (state === 'closed') {
    return 'Resolved';
  }
  const lower = labels.map((label) => label.toLowerCase());
  const inProgress = lower.some((label) =>
    [
      'in-progress',
      'in progress',
      'status:in-progress',
      'status:in progress',
      'status:working',
      'status:fix-in-progress',
      'fix-in-progress',
      'fix in progress',
      'wip',
    ].includes(label),
  );
  return inProgress ? 'Fix in progress' : 'Investigating';
}

function isBotComment(comment: GitHubIssueComment): boolean {
  const userType = comment.user?.type?.toLowerCase() ?? '';
  const login = comment.user?.login?.toLowerCase() ?? '';
  return userType === 'bot' || login.endsWith('[bot]');
}

function isInternalOnlyComment(commentBody: string): boolean {
  const lower = commentBody.toLowerCase();
  return (
    lower.includes('[internal]') ||
    lower.includes('internal only') ||
    lower.includes('[admin-only]') ||
    lower.includes('triage note:')
  );
}

function sanitizeResolutionNote(value: string): string | null {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return null;
  }
  return collapsed.length > 220 ? `${collapsed.slice(0, 220).trim()}...` : collapsed;
}

function issueBelongsToUser(body: string | null | undefined, userId: string): boolean {
  if (!body || !userId) {
    return false;
  }

  const escapedUserId = escapeRegexLiteral(userId.trim());
  if (!escapedUserId) {
    return false;
  }

  const pattern = new RegExp(`^\\s*-\\s*user id\\s*:\\s*${escapedUserId}\\s*$`, 'im');
  return pattern.test(normalizeBody(body));
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly bugReportingEnabled: boolean;
  private readonly reportTimestamps = new Map<string, number>();
  private readonly autoErrorBuckets = new Map<string, AutoErrorIssueBucket>();
  private readonly autoErrorUserHits = new Map<string, number[]>();
  private readonly autoErrorGlobalHits: number[] = [];
  private readonly stillSeeingSignals = new Map<number, StillSeeingSignalRecord>();

  constructor(private readonly configService: ConfigService) {
    const owner = this.configService.get<string>('GITHUB_BUG_REPORT_OWNER');
    const repo = this.configService.get<string>('GITHUB_BUG_REPORT_REPO');
    const token = this.configService.get<string>('GITHUB_BUG_REPORT_TOKEN');
    this.bugReportingEnabled = Boolean(owner && repo && token);

    if (!this.bugReportingEnabled) {
      this.logger.error('Bug reporting misconfigured: missing GitHub credentials');
    }
  }

  async reportBug(report: ReportBugDto, user: AuthUserDto): Promise<ReportBugResult> {
    if (!this.bugReportingEnabled) {
      throw createSupportConfigUnavailableException();
    }

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
    if (suggestedArea) labels.push(suggestedArea.label);
    if (severity) labels.push(`severity:${severity}`);

    const title = buildIssueTitle(report.message);
    const userAgent = report.userAgent?.trim() || null;
    const sessionId = report.sessionId?.trim() || null;
    const appVersion = report.appVersion?.trim() || null;
    const body = formatIssueBody({
      report,
      user,
      environment,
      timestamp,
      sessionId,
      appVersion,
      userAgent,
    });

    const issue = await this.createGitHubIssue({ title, body, labels });
    await this.assignIssueToProject(issue.id);

    return {
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      sentryEventId,
    };
  }

  getSupportStatus() {
    return {
      bugReporting: this.bugReportingEnabled ? 'READY' : 'MISCONFIGURED',
    } as const;
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
      const userIssues = issues
        .filter((issue) => issueBelongsToUser(issue.body, userId))
        .map((issue) => issue);

      const items = await Promise.all(
        userIssues.map(async (issue) => {
          const resolutionNote = await this.fetchLatestRelevantComment(owner, repo, token, issue.number);
          return this.buildHistoryItem(issue, resolutionNote);
        }),
      );
      return items;
    } catch (error) {
      this.logger.warn('Unable to fetch bug report history from GitHub.', error ?? 'unknown error');
      throw new ServiceUnavailableException(
        'Unable to retrieve your support history right now. Please try again later.',
      );
    }
  }

  async recordStillSeeingIssue(userId: string, issueNumber: number): Promise<StillSeeingSignalResult> {
    const { owner, repo, token } = this.ensureGitHubConfig();

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (response.status === 404) {
      throw new HttpException('Issue not found.', HttpStatus.NOT_FOUND);
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to record this signal right now.');
    }

    const issue = (await response.json()) as GitHubIssue;
    if (!issueBelongsToUser(issue.body, userId)) {
      throw new HttpException('Issue does not belong to current user.', HttpStatus.FORBIDDEN);
    }

    const fingerprint = extractFingerprint(issue.body);
    const now = Date.now();
    const current = this.stillSeeingSignals.get(issueNumber);
    const next: StillSeeingSignalRecord = {
      issueNumber,
      fingerprint,
      count: (current?.count ?? 0) + 1,
      lastSeenAt: now,
    };
    this.stillSeeingSignals.set(issueNumber, next);

    return {
      issueNumber,
      fingerprint,
      count: next.count,
      lastSeenAt: new Date(next.lastSeenAt).toISOString(),
    };
  }

  async ingestAutoError(payload: AutoErrorDto, user: AuthUserDto): Promise<AutoErrorIngestResult> {
    this.enforceAutoErrorRateLimit(user.id);

    const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (payloadBytes > AUTO_ERROR_MAX_PAYLOAD_BYTES) {
      throw new HttpException('Auto error payload is too large.', HttpStatus.PAYLOAD_TOO_LARGE);
    }

    const now = Date.now();
    const fingerprint = buildAutoErrorFingerprint({
      errorType: payload.errorType,
      message: payload.message,
      route: payload.route,
      endpoint: payload.endpoint,
    });
    const bucket = this.getOrInitAutoErrorBucket(fingerprint, now);
    const previousLastSeenAt = bucket.lastSeenAt;
    const area = this.deriveAutoArea(
      payload.route,
      payload.endpoint,
      payload.baselineId,
      payload.jobId,
    );
    bucket.count += 1;
    bucket.lastSeenAt = now;
    bucket.lastMessage = payload.message;
    bucket.errorType = payload.errorType;
    bucket.route = payload.route ?? null;
    bucket.endpoint = payload.endpoint ?? null;
    bucket.areaLabel = area?.display ?? null;

    const normalizedReleaseId = payload.releaseId?.trim() || null;
    if (
      normalizedReleaseId &&
      bucket.releaseId &&
      bucket.releaseId !== normalizedReleaseId &&
      now - previousLastSeenAt > ERROR_HEALTH_QUIET_WINDOW_MS
    ) {
      bucket.regressedInReleaseId = normalizedReleaseId;
    }
    if (normalizedReleaseId) {
      bucket.releaseId = normalizedReleaseId;
    }

    const dedupeWindowActive =
      bucket.lastEscalatedAt !== null && now - bucket.lastEscalatedAt < AUTO_ERROR_WINDOW_MS;
    const shouldEscalate = !dedupeWindowActive || bucket.count >= AUTO_ERROR_FREQUENCY_THRESHOLD;

    const environment =
      this.configService.get<string>('APP_ENV') ??
      this.configService.get<string>('ENVIRONMENT') ??
      this.configService.get<string>('NODE_ENV') ??
      'unknown';

    const sentryEventId = await this.safeCaptureAutoErrorEvent(
      payload,
      user,
      environment,
      fingerprint,
      bucket.count,
    );

    let escalated = false;
    if (shouldEscalate) {
      const labels = ['bug', 'auto'];
      if (area) {
        labels.push(area.label);
      }

      const issue = await this.tryCreateGitHubIssue({
        title: summarizeAutoErrorTitle(payload.message),
        body: this.formatAutoErrorIssueBody({
          payload,
          user,
          fingerprint,
          bucket,
          sentryEventId,
          area,
          environment,
        }),
        labels,
      });
      if (issue) {
        bucket.lastEscalatedAt = now;
        bucket.issueNumber = issue.number;
        bucket.issueUrl = issue.html_url;
      }
      escalated = Boolean(issue);
    }

    this.autoErrorBuckets.set(fingerprint, bucket);
    this.pruneAutoErrorBuckets(now);

    return {
      accepted: true,
      fingerprint,
      deduped: dedupeWindowActive,
      escalated,
      count: bucket.count,
      sentryEventId,
    };
  }

  getErrorHealth(options?: { limit?: number }): ErrorHealthSummary[] {
    const now = Date.now();
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
    const activeWindow = ERROR_HEALTH_ACTIVE_WINDOW_MS;

    return Array.from(this.autoErrorBuckets.values())
      .map((bucket) => {
        const statusHint = classifyErrorHealthStatus({
          now,
          firstSeenAt: bucket.firstSeenAt,
          lastSeenAt: bucket.lastSeenAt,
          count: bucket.count,
          regressedInReleaseId: bucket.regressedInReleaseId,
          releaseId: bucket.releaseId,
        });
        const isActive = now - bucket.lastSeenAt <= activeWindow;
        return {
          fingerprint: bucket.fingerprint,
          summary: sanitizeLine(bucket.lastMessage || 'Unknown error', 'Unknown error'),
          sourceType: bucket.errorType,
          areaOrRoute: bucket.areaLabel ?? bucket.route ?? bucket.endpoint ?? null,
          count: bucket.count,
          firstSeenAt: new Date(bucket.firstSeenAt).toISOString(),
          lastSeenAt: new Date(bucket.lastSeenAt).toISOString(),
          releaseId: bucket.releaseId,
          escalated: bucket.lastEscalatedAt !== null,
          issueNumber: bucket.issueNumber,
          issueUrl: bucket.issueUrl,
          statusHint,
          signalScore:
            (isActive ? 10_000 : 0) +
            bucket.count * 100 +
            Math.max(0, 100_000 - Math.floor((now - bucket.lastSeenAt) / 1000)),
        };
      })
      .sort((a, b) => b.signalScore - a.signalScore)
      .slice(0, limit)
      .map(({ signalScore: _signalScore, ...item }) => item);
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

  private enforceAutoErrorRateLimit(userId: string) {
    const now = Date.now();

    const userHits = this.autoErrorUserHits.get(userId) ?? [];
    const recentUserHits = userHits.filter(
      (timestamp) => now - timestamp < AUTO_ERROR_RATE_WINDOW_MS,
    );
    if (recentUserHits.length >= AUTO_ERROR_PER_USER_LIMIT) {
      throw new HttpException(
        'Too many auto error reports. Please slow down.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recentUserHits.push(now);
    this.autoErrorUserHits.set(userId, recentUserHits);

    const recentGlobalHits = this.autoErrorGlobalHits.filter(
      (timestamp) => now - timestamp < AUTO_ERROR_RATE_WINDOW_MS,
    );
    if (recentGlobalHits.length >= AUTO_ERROR_GLOBAL_LIMIT) {
      throw new HttpException(
        'Auto error ingestion is temporarily rate limited.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recentGlobalHits.push(now);
    this.autoErrorGlobalHits.length = 0;
    this.autoErrorGlobalHits.push(...recentGlobalHits);
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

  private async safeCaptureAutoErrorEvent(
    payload: AutoErrorDto,
    user: AuthUserDto,
    environment: string,
    fingerprint: string,
    count: number,
  ): Promise<string | null> {
    try {
      return await captureSupportEvent('Auto error', {
        user: { id: user.id, email: user.email },
        environment,
        extra: {
          type: payload.errorType,
          message: payload.message,
          route: payload.route,
          endpoint: payload.endpoint,
          method: payload.method,
          status: payload.status,
          baselineId: payload.baselineId,
          jobId: payload.jobId,
          analysisId: payload.analysisId,
          fingerprint,
          count,
        },
      });
    } catch (error) {
      this.logger.warn('Sentry capture failed for auto error', error as Error);
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
        this.logger.error('GitHub API responded with an error while creating bug report issue.', {
          status: response.status,
          message: errorPayload?.message,
        });
        throw createBugReportFailedException();
      }

      return (await response.json()) as { number: number; html_url: string; id: number };
    } catch (error) {
      this.logger.error('Unable to create GitHub issue for bug report.', error ?? 'unknown error');
      if (error instanceof HttpException) {
        throw error;
      }
      throw createBugReportFailedException();
    }
  }

  private async tryCreateGitHubIssue(payload: { title: string; body: string; labels: string[] }) {
    try {
      return await this.createGitHubIssue(payload);
    } catch (error) {
      this.logger.warn(
        'Auto escalation GitHub issue creation failed; ingestion continues.',
        error ?? 'unknown error',
      );
      return null;
    }
  }

  async getConfiguration() {
    const projectColumnId = this.configService.get<string>('GITHUB_BUG_REPORT_PROJECT_COLUMN_ID');
    return {
      githubConfigured: this.bugReportingEnabled,
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

  private buildHistoryItem(issue: GitHubIssue, resolutionNote: string | null): SupportHistoryItem {
    const labels = normalizeGitHubLabels(issue.labels);
    const severity = deriveSeverityFromIssue(labels, issue.body);
    const area = deriveAreaFromIssue(labels, issue.body);
    const preview = describeReporterPreview(issue.body, issue.title, issue.number);
    const sentryEventId = extractSentryEventId(issue.body);
    const state = issue.state === 'closed' ? 'closed' : 'open';
    const status = mapHistoryStatus(state, labels);

    return {
      issueNumber: issue.number,
      title: issue.title,
      state,
      status,
      labels,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at ?? issue.created_at,
      severity,
      area,
      reporterMessagePreview: preview,
      sentryEventId,
      resolutionNote,
    };
  }

  private async fetchLatestRelevantComment(
    owner: string,
    repo: string,
    token: string,
    issueNumber: number,
  ): Promise<string | null> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=20`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        },
      );
      if (!response.ok) {
        return null;
      }
      const comments = (await response.json()) as GitHubIssueComment[];
      for (let index = comments.length - 1; index >= 0; index -= 1) {
        const comment = comments[index];
        if (!comment || isBotComment(comment)) {
          continue;
        }
        const body = comment.body?.trim() ?? '';
        if (!body || isInternalOnlyComment(body)) {
          continue;
        }
        const note = sanitizeResolutionNote(body);
        if (note) {
          return note;
        }
      }
      return null;
    } catch (_error) {
      return null;
    }
  }

  private getOrInitAutoErrorBucket(
    fingerprint: string,
    now: number,
  ): AutoErrorIssueBucket {
    const existing = this.autoErrorBuckets.get(fingerprint);
    if (existing) {
      return existing;
    }

    const bucket: AutoErrorIssueBucket = {
      fingerprint,
      count: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      lastEscalatedAt: null,
      issueNumber: null,
      issueUrl: null,
      lastMessage: 'Unknown error',
      errorType: AutoErrorType.RUNTIME,
      route: null,
      endpoint: null,
      areaLabel: null,
      releaseId: null,
      regressedInReleaseId: null,
    };
    this.autoErrorBuckets.set(fingerprint, bucket);
    return bucket;
  }

  private pruneAutoErrorBuckets(now: number) {
    for (const [key, bucket] of this.autoErrorBuckets.entries()) {
      if (now - bucket.lastSeenAt > AUTO_ERROR_WINDOW_MS * 2) {
        this.autoErrorBuckets.delete(key);
      }
    }
  }


  private deriveAutoArea(
    route?: string,
    endpoint?: string,
    baselineId?: string,
    jobId?: string,
  ): DerivedArea {
    const candidateRoute = (route ?? endpoint ?? '').toLowerCase();
    for (const definition of AREA_DEFINITIONS) {
      if (definition.keywords.some((keyword) => candidateRoute.includes(keyword))) {
        return { ...definition, reason: `Route includes "${definition.keywords[0]}"` };
      }
    }

    if (baselineId) {
      const baselineArea = AREA_DEFINITIONS.find((area) => area.label === 'area:baseline');
      if (baselineArea) {
        return { ...baselineArea, reason: 'Baseline reference provided' };
      }
    }

    if (jobId) {
      const resultsArea = AREA_DEFINITIONS.find((area) => area.label === 'area:results');
      if (resultsArea) {
        return { ...resultsArea, reason: 'Job reference provided' };
      }
    }

    return null;
  }

  private formatAutoErrorIssueBody(params: {
    payload: AutoErrorDto;
    user: AuthUserDto;
    fingerprint: string;
    bucket: AutoErrorIssueBucket;
    sentryEventId: string | null;
    area: DerivedArea;
    environment: string;
  }): string {
    const { payload, user, fingerprint, bucket, sentryEventId, area, environment } = params;
    const diagnosticsJson =
      payload.diagnostics && Object.keys(payload.diagnostics).length > 0
        ? JSON.stringify(payload.diagnostics, null, 2).slice(0, 6000)
        : null;

    return [
      '### Auto error summary',
      `- Type: ${payload.errorType}`,
      `- Message: ${sanitizeLine(payload.message, 'Unknown error')}`,
      `- Fingerprint: ${fingerprint}`,
      `- Frequency count: ${bucket.count}`,
      `- First seen timestamp: ${new Date(bucket.firstSeenAt).toISOString()}`,
      `- Last seen timestamp: ${new Date(bucket.lastSeenAt).toISOString()}`,
      '',
      '### Route and context',
      `- Route: ${payload.route ?? 'Not provided.'}`,
      `- Endpoint: ${payload.endpoint ?? 'Not provided.'}`,
      `- Method: ${payload.method ?? 'Not provided.'}`,
      `- Status: ${payload.status ?? 'Not provided.'}`,
      `- Baseline ID: ${payload.baselineId ?? 'Not provided.'}`,
      `- Job ID: ${payload.jobId ?? 'Not provided.'}`,
      `- Analysis ID: ${payload.analysisId ?? 'Not provided.'}`,
      `- Release ID: ${payload.releaseId ?? 'Not provided.'}`,
      `- Suggested area: ${area ? area.display : 'Unknown'}`,
      '',
      '### Source',
      `- User ID: ${user.id}`,
      `- Timestamp: ${payload.timestamp}`,
      `- Environment: ${environment}`,
      `- Sentry Event ID: ${sentryEventId ?? 'Not recorded'}`,
      '',
      diagnosticsJson
        ? ['### Diagnostics snapshot (sanitized)', '```json', diagnosticsJson, '```'].join('\n')
        : '### Diagnostics snapshot (sanitized)\nNot provided.',
      '',
      payload.stack
        ? ['### Stack trace', '```', payload.stack.slice(0, 6000), '```'].join('\n')
        : '### Stack trace\nNot provided.',
    ].join('\n');
  }

  private ensureGitHubConfig() {
    if (!this.bugReportingEnabled) {
      throw createSupportConfigUnavailableException();
    }

    const owner = this.configService.get<string>('GITHUB_BUG_REPORT_OWNER');
    const repo = this.configService.get<string>('GITHUB_BUG_REPORT_REPO');
    const token = this.configService.get<string>('GITHUB_BUG_REPORT_TOKEN');

    if (!owner || !repo || !token) {
      this.logger.warn('GitHub bug reporting is not configured.');
      throw createSupportConfigUnavailableException();
    }

    return { owner, repo, token };
  }
}
