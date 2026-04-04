import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const FLOW_HEALTH_WINDOW_MS = 60 * 60 * 1000;
const FLOW_HEALTH_DEGRADED_MULTIPLIER = 1.0;
const FLOW_HEALTH_CRITICAL_MULTIPLIER = 2.0;
const FLOW_HEALTH_ESCALATION_WINDOW_MS = 60 * 60 * 1000;

export enum CriticalFlowEventType {
  SCORE_GENERATED_SUCCESS = 'score_generated_success',
  SCORE_GENERATED_FAILURE = 'score_generated_failure',
  RESUME_GENERATED_SUCCESS = 'resume_generated_success',
  RESUME_GENERATED_FAILURE = 'resume_generated_failure',
  BASELINE_PARSED_SUCCESS = 'baseline_parsed_success',
  BASELINE_PARSED_FAILURE = 'baseline_parsed_failure',
}

type CriticalFlowKey = 'score_generated' | 'resume_generated' | 'baseline_parsed';
type CriticalFlowStatus = 'Healthy' | 'Degraded' | 'Critical';

const FLOW_THRESHOLDS: Record<CriticalFlowKey, number> = {
  score_generated: 10,
  resume_generated: 5,
  baseline_parsed: 10,
};

type CriticalFlowEvent = {
  flow: CriticalFlowEventType;
  timestamp: number;
  areaOrRoute: string | null;
};

type CriticalFlowEscalationState = {
  lastStatus: CriticalFlowStatus;
  lastEscalatedAt: number | null;
  issueNumber: number | null;
  issueUrl: string | null;
};

export type CriticalFlowHealthSummary = {
  flowName: CriticalFlowKey;
  successRatePct: number;
  totalAttempts: number;
  totalFailures: number;
  thresholdPct: number;
  status: CriticalFlowStatus;
  lastEventAt: string | null;
  escalated: boolean;
  issueNumber: number | null;
  issueUrl: string | null;
};

function classifyCriticalFlowStatus(failureRatePct: number, thresholdPct: number): CriticalFlowStatus {
  if (failureRatePct > thresholdPct * FLOW_HEALTH_CRITICAL_MULTIPLIER) {
    return 'Critical';
  }
  if (failureRatePct > thresholdPct * FLOW_HEALTH_DEGRADED_MULTIPLIER) {
    return 'Degraded';
  }
  return 'Healthy';
}

function mapEventToFlowKey(eventType: CriticalFlowEventType): CriticalFlowKey {
  if (
    eventType === CriticalFlowEventType.SCORE_GENERATED_SUCCESS ||
    eventType === CriticalFlowEventType.SCORE_GENERATED_FAILURE
  ) {
    return 'score_generated';
  }
  if (
    eventType === CriticalFlowEventType.RESUME_GENERATED_SUCCESS ||
    eventType === CriticalFlowEventType.RESUME_GENERATED_FAILURE
  ) {
    return 'resume_generated';
  }
  return 'baseline_parsed';
}

function isFailureEvent(eventType: CriticalFlowEventType): boolean {
  return (
    eventType === CriticalFlowEventType.SCORE_GENERATED_FAILURE ||
    eventType === CriticalFlowEventType.RESUME_GENERATED_FAILURE ||
    eventType === CriticalFlowEventType.BASELINE_PARSED_FAILURE
  );
}

@Injectable()
export class CriticalFlowTrackerService {
  private readonly logger = new Logger(CriticalFlowTrackerService.name);
  private readonly criticalFlowEvents: CriticalFlowEvent[] = [];
  private readonly criticalFlowEscalations = new Map<CriticalFlowKey, CriticalFlowEscalationState>();

  constructor(private readonly configService: ConfigService) {}

  async recordCriticalFlowEvent(input: {
    flow: CriticalFlowEventType;
    areaOrRoute?: string | null;
  }): Promise<void> {
    const now = Date.now();
    this.criticalFlowEvents.push({
      flow: input.flow,
      timestamp: now,
      areaOrRoute: input.areaOrRoute?.trim() || null,
    });
    this.pruneCriticalFlowEvents(now);
    await this.maybeEscalateCriticalFlow(mapEventToFlowKey(input.flow), now);
  }

  getCriticalFlowHealth(): CriticalFlowHealthSummary[] {
    const now = Date.now();
    this.pruneCriticalFlowEvents(now);
    const flows: CriticalFlowKey[] = ['score_generated', 'resume_generated', 'baseline_parsed'];

    return flows.map((flowName) => {
      const events = this.criticalFlowEvents.filter((event) => mapEventToFlowKey(event.flow) === flowName);
      const totalAttempts = events.length;
      const totalFailures = events.filter((event) => isFailureEvent(event.flow)).length;
      const successRatePct =
        totalAttempts > 0 ? Number((((totalAttempts - totalFailures) / totalAttempts) * 100).toFixed(1)) : 100;
      const failureRatePct = totalAttempts > 0 ? (totalFailures / totalAttempts) * 100 : 0;
      const thresholdPct = FLOW_THRESHOLDS[flowName];
      const status = classifyCriticalFlowStatus(failureRatePct, thresholdPct);
      const lastEventAt = events.length
        ? new Date(Math.max(...events.map((event) => event.timestamp))).toISOString()
        : null;
      const escalationState = this.criticalFlowEscalations.get(flowName);
      return {
        flowName,
        successRatePct,
        totalAttempts,
        totalFailures,
        thresholdPct,
        status,
        lastEventAt,
        escalated: Boolean(escalationState?.issueNumber),
        issueNumber: escalationState?.issueNumber ?? null,
        issueUrl: escalationState?.issueUrl ?? null,
      };
    });
  }

  private pruneCriticalFlowEvents(now: number) {
    while (this.criticalFlowEvents.length > 0) {
      const first = this.criticalFlowEvents[0];
      if (now - first.timestamp <= FLOW_HEALTH_WINDOW_MS) {
        break;
      }
      this.criticalFlowEvents.shift();
    }
  }

  private async maybeEscalateCriticalFlow(flowName: CriticalFlowKey, now: number) {
    const summary = this.getCriticalFlowHealth().find((entry) => entry.flowName === flowName);
    if (!summary) {
      return;
    }

    const current = this.criticalFlowEscalations.get(flowName) ?? {
      lastStatus: 'Healthy' as CriticalFlowStatus,
      lastEscalatedAt: null,
      issueNumber: null,
      issueUrl: null,
    };

    const statusChanged = current.lastStatus !== summary.status;
    if (summary.status !== 'Critical' || !statusChanged) {
      this.criticalFlowEscalations.set(flowName, { ...current, lastStatus: summary.status });
      return;
    }

    const withinDedupeWindow =
      current.lastEscalatedAt !== null && now - current.lastEscalatedAt < FLOW_HEALTH_ESCALATION_WINDOW_MS;
    if (withinDedupeWindow) {
      this.criticalFlowEscalations.set(flowName, { ...current, lastStatus: summary.status });
      return;
    }

    const failureRate = Number((100 - summary.successRatePct).toFixed(1));
    const issue = await this.tryCreateGitHubIssue({
      title: `[AUTO][CRITICAL] ${flowName} failure rate ${failureRate}% (threshold ${summary.thresholdPct}%)`,
      body: [
        '### Critical flow health alert',
        `- Flow: ${flowName}`,
        `- Failure rate: ${failureRate}%`,
        `- Success rate: ${summary.successRatePct}%`,
        `- Threshold: ${summary.thresholdPct}%`,
        `- Attempts in window: ${summary.totalAttempts}`,
        `- Failures in window: ${summary.totalFailures}`,
        `- Window: last ${Math.floor(FLOW_HEALTH_WINDOW_MS / 60000)} minutes`,
        `- Triggered at: ${new Date(now).toISOString()}`,
      ].join('\n'),
      labels: ['bug', 'auto', 'critical-flow'],
    });

    this.criticalFlowEscalations.set(flowName, {
      lastStatus: summary.status,
      lastEscalatedAt: issue ? now : current.lastEscalatedAt,
      issueNumber: issue?.number ?? current.issueNumber,
      issueUrl: issue?.html_url ?? current.issueUrl,
    });
  }

  private async createGitHubIssue(payload: { title: string; body: string; labels: string[] }) {
    const { owner, repo, token } = this.ensureGitHubConfig();
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
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
      });
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
        this.logger.warn('GitHub API responded with an error.', {
          status: response.status,
          message: errorPayload?.message,
        });
        throw new ServiceUnavailableException('Failed to create GitHub issue. Please try again later.');
      }
      return (await response.json()) as { number: number; html_url: string; id: number };
    } catch (error) {
      this.logger.error('Unable to create GitHub issue for critical flow alert.', error ?? 'unknown error');
      throw new ServiceUnavailableException('Failed to create GitHub issue. Please try again later.');
    }
  }

  private async tryCreateGitHubIssue(payload: { title: string; body: string; labels: string[] }) {
    try {
      return await this.createGitHubIssue(payload);
    } catch (error) {
      this.logger.warn('Critical flow escalation GitHub issue creation failed; ingestion continues.', error ?? 'unknown error');
      return null;
    }
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
