import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessCode } from '../access-codes/access-code.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Application } from '../applications/application.entity';
import { BetaFeedback } from '../beta-feedback/beta-feedback.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import {
  ProductSignalSnapshot,
  ProductSignalPrimaryFocus,
  ProductSignalSnapshotReviewStatus,
  ProductSignalSnapshotReviewStatusValue,
  ProductSignalTone,
} from './product-signal-snapshot.entity';
import { User } from '../users/user.entity';
import { AnalyticsEvent } from './analytics-event.entity';
import type { TrackAnalyticsEventDto } from './dto/track-analytics-event.dto';
import {
  ANALYTICS_SCORE_BUCKETS,
  ANALYTICS_SCROLL_DEPTHS,
  resolveScoreBucket,
  type AnalyticsScoreBucket,
} from './analytics.constants';

type AnalyticsSummaryStep =
  | 'landing_viewed'
  | 'role_analysis_started'
  | 'role_analysis_completed'
  | 'opportunity_saved'
  | 'resume_studio_opened';

type AnalyticsSummaryResponse = {
  visitors: number;
  analysisStarts: number;
  analysisCompletions: number;
  opportunitiesSaved: number;
  resumeStudioOpens: number;
  heroDemoCompletions: number;
  resultsImprovementModuleViews: number;
  resultsImprovementCtaClicks: number;
  artifactUsedIntents: number;
  artifactRefineIntents: number;
  opportunityCommitIntents: number;
  resultsImprovementCtaRate: number;
  artifactToOpportunityCommitRate: number;
  refineIntentShare: number;
  trendContext: {
    resultsImprovementCtaRate: TrendComparison;
    artifactToOpportunityCommitRate: TrendComparison;
    refineIntentShare: TrendComparison;
  };
  weakestStep: {
    weakestStepKey: "moduleViewToCtaRate" | "ctaToArtifactRate" | "artifactToRefineRate" | "artifactToCommitRate" | null;
    weakestStepLabel: string | null;
    weakestStepRate: number;
    weakestStepPreviousRate: number;
    weakestStepDelta: number;
    weakestStepDirection: "improving" | "worsening" | "flat" | "none";
    weakestStepPreviousNumerator: number;
    weakestStepPreviousDenominator: number;
    weakestStepTrendReason: string;
    benchmarkStepRate: number;
    relativeDrop: number;
    weakestStepNumerator: number;
    weakestStepDenominator: number;
    severity: "High" | "Medium" | "Low" | "None";
    confidence: "High" | "Medium" | "Low" | "None";
    confidenceReason: string;
    watchlistStatus: "stable" | "monitor" | "action_needed";
    watchlistPriority: "none" | "low" | "medium" | "high";
    watchlistReason: string;
    recommendationTitle: string;
    recommendationBody: string;
  };
  releaseAnnotations: ReleaseAnnotation[];
  weakestStepReleaseContext: WeakestStepReleaseContext;
  operatorSummary: OperatorSummary;
  recommendedNextAction: RecommendedNextAction;
  adminSummaryExport: AdminSummaryExport;
  exportMetadata: {
    exportedAt: string;
    selectedWindowDays: number | null;
  };
  formattedExports: {
    plainTextBrief: string;
    jsonPayload: string;
  };
  startRate: number;
  completionRate: number;
  opportunitySaveRate: number;
  resumeOpenRate: number;
  scoreDistribution: Record<AnalyticsScoreBucket, number>;
  funnel: Array<{ eventName: AnalyticsSummaryStep; count: number }>;
};

type TrendComparison = {
  current: number;
  previous: number;
  delta: number;
  direction: "up" | "down" | "flat";
};

type WeakestStepKey =
  | "moduleViewToCtaRate"
  | "ctaToArtifactRate"
  | "artifactToRefineRate"
  | "artifactToCommitRate"
  | null;

type ReleaseAnnotation = {
  id: string;
  label: string;
  date: string;
  type: "feature" | "experiment" | "fix" | "content";
  notes: string;
  isInCurrentWindow: boolean;
  isInPreviousWindow: boolean;
};

type WeakestStepReleaseContext = {
  relevantCurrentWindowReleases: ReleaseAnnotation[];
  relevantPreviousWindowReleases: ReleaseAnnotation[];
  releaseContextSummary: string;
};

type OperatorSummary = {
  headline: string;
  subheadline: string;
  tone: ProductSignalTone;
  primaryFocus: ProductSignalPrimaryFocus;
  supportingReason: string;
  recommendedActionTitle: string | null;
};

type RecommendedNextAction = {
  actionTitle: string;
  actionBody: string;
  actionFocus: "results_cta" | "studio_entry" | "refine_flow" | "opportunity_capture" | "none";
  actionSource: "weakest_step" | "weakest_step_with_release_context" | "none";
};

type AdminSummaryExport = {
  headline: string;
  tone: OperatorSummary["tone"];
  primaryFocus: OperatorSummary["primaryFocus"];
  weakestStepLabel: string | null;
  weakestStepRate: number;
  weakestStepDirection: "improving" | "worsening" | "flat" | "none";
  watchlistStatus: "stable" | "monitor" | "action_needed";
  watchlistPriority: "none" | "low" | "medium" | "high";
  severity: "High" | "Medium" | "Low" | "None";
  confidence: "High" | "Medium" | "Low" | "None";
  recommendedActionTitle: string | null;
  recommendedActionBody: string;
  releaseContextSummary: string;
};

type ProductSignalSnapshotRecord = {
  id: string;
  createdAt: Date | string;
  selectedWindowDays: number;
  headline: string;
  tone: ProductSignalTone;
  primaryFocus: ProductSignalPrimaryFocus;
  weakestStepLabel: string | null;
  weakestStepRate: number | string;
  weakestStepDirection: "improving" | "worsening" | "flat" | "none";
  watchlistStatus: "stable" | "monitor" | "action_needed";
  watchlistPriority: "none" | "low" | "medium" | "high";
  severity: "High" | "Medium" | "Low" | "None";
  confidence: "High" | "Medium" | "Low" | "None";
  recommendedActionTitle: string | null;
  recommendedActionBody: string;
  releaseContextSummary: string;
  exportPayloadJson: string;
  reviewStatus: ProductSignalSnapshotReviewStatusValue;
  reviewNote: string;
  reviewedAt: Date | string | null;
};

type ProductSignalCompareFieldKey =
  | "headline"
  | "tone"
  | "primaryFocus"
  | "weakestStepLabel"
  | "weakestStepRate"
  | "weakestStepDirection"
  | "watchlistStatus"
  | "watchlistPriority"
  | "severity"
  | "confidence"
  | "recommendedActionTitle"
  | "releaseContextSummary";

type ProductSignalCompareField = {
  field: ProductSignalCompareFieldKey;
  previousValue: string | number | null;
  currentValue: string | number | null;
};

type ProductSignalSnapshotCompareResponse = {
  hasSnapshot: boolean;
  latestSnapshotCreatedAt: string | null;
  latestSnapshotReviewStatus: ProductSignalSnapshotReviewStatusValue | null;
  latestSnapshotReviewNote: string | null;
  latestSnapshotReviewedAt: string | null;
  comparisonSummary: string;
  changedFields: ProductSignalCompareField[];
};

const RELEASE_ANNOTATIONS: Array<Omit<ReleaseAnnotation, "isInCurrentWindow" | "isInPreviousWindow">> = [
  {
    id: "results-improvement-copy-update",
    label: "Results improvement module copy update",
    date: "2026-03-30",
    type: "content",
    notes: "Clarified the Results improvement module CTA and reduced competing action copy.",
  },
  {
    id: "results-action-grouping-cleanup",
    label: "Results page action grouping cleanup",
    date: "2026-03-26",
    type: "fix",
    notes: "Grouped the primary Results actions to keep the next step more obvious.",
  },
  {
    id: "studio-first-screen-simplification",
    label: "Studio first screen simplification",
    date: "2026-03-22",
    type: "feature",
    notes: "Simplified the first Studio screen so the generation path reads more clearly.",
  },
  {
    id: "artifact-refine-prompt-update",
    label: "Artifact refine prompt update",
    date: "2026-02-26",
    type: "experiment",
    notes: "Tested a sharper refine prompt to encourage stronger artifact improvement.",
  },
  {
    id: "opportunity-save-cta-placement",
    label: "Opportunity save CTA placement change",
    date: "2026-02-20",
    type: "feature",
    notes: "Moved the opportunity save CTA closer to artifact completion.",
  },
  {
    id: "studio-completion-copy-tune",
    label: "Studio completion copy tune",
    date: "2026-02-14",
    type: "content",
    notes: "Adjusted completion copy to better reinforce export value and next steps.",
  },
];

type FounderFunnelStage = {
  label: 'Visitors' | 'Analyses Started' | 'Analyses Completed' | 'Accounts Created';
  count: number;
  conversionFromPrevious: number | null;
};

type FounderMetricsResponse = {
  range: {
    key: '7d' | '14d' | '30d' | 'all';
    days: number | null;
    granularity: 'day' | 'week';
    startAt: string;
    endAt: string;
  };
  lastUpdatedAt: string;
  funnel: FounderFunnelStage[];
  metrics: {
    visitorToAnalysisConversion: number;
    analysisCompletionRate: number;
    resultToAccountConversion: number;
    secondAnalysisRate: number;
    visitors: number;
    analysesStarted: number;
    analysesCompleted: number;
    accountsCreated: number;
    usersWithAtLeastOneAnalysis: number;
    usersWithTwoOrMoreAnalyses: number;
    averageAnalysesPerActiveUser: number;
  };
  previousPeriod: {
    visitorToAnalysisConversion: number;
    analysisCompletionRate: number;
    resultToAccountConversion: number;
    secondAnalysisRate: number;
    visitors: number;
    analysesStarted: number;
    analysesCompleted: number;
    accountsCreated: number;
  } | null;
  trends: {
    volume: Array<{
      bucketStart: string;
      bucketLabel: string;
      visitors: number;
      analysesStarted: number;
      analysesCompleted: number;
      accountsCreated: number;
    }>;
    conversion: Array<{
      bucketStart: string;
      bucketLabel: string;
      visitorToAnalysisConversion: number;
      analysisCompletionRate: number;
      resultToAccountConversion: number;
      secondAnalysisRate: number;
    }>;
  };
  supportingSignals: {
    resumeUploadRate: number;
    resumeUploads: number;
    sampleRoleUsage: number;
    averageTimeToFirstAnalysisSeconds: number;
  };
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function getWeakestStepRecommendation(
  weakestStepKey: WeakestStepKey,
): { title: string; body: string; label: string | null } {
  switch (weakestStepKey) {
    case "moduleViewToCtaRate":
      return {
        title: "Improve Results CTA conversion",
        body: "Users are seeing the Results improvement module but not clicking through. Tighten CTA copy, reduce competing actions, and test stronger benefit framing.",
        label: "Results improvement module to CTA",
      };
    case "ctaToArtifactRate":
      return {
        title: "Reduce Studio entry friction",
        body: "Users click the Results CTA but do not continue into artifact intent. Review routing, load time, and first screen clarity in Studio.",
        label: "Results CTA to artifact intent",
      };
    case "artifactToRefineRate":
      return {
        title: "Strengthen refine value",
        body: "Users enter artifact flow but are not choosing refinement often. Rework refine prompts and make improvement outcomes clearer.",
        label: "Artifact intent to refine intent",
      };
    case "artifactToCommitRate":
      return {
        title: "Improve opportunity capture",
        body: "Users use artifacts but are not committing opportunities. Make the opportunity action more visible and connect it more directly to artifact completion.",
        label: "Artifact intent to opportunity commit",
      };
    default:
      return {
        title: "Not enough signal yet",
        body: "There is not enough current period funnel activity to identify a weak point.",
        label: null,
      };
  }
}

function getWeakestStepSeverity(relativeDrop: number, weakestStepKey: WeakestStepKey): "High" | "Medium" | "Low" | "None" {
  if (weakestStepKey === null || relativeDrop === 0) return "None";
  if (relativeDrop >= 0.25) return "High";
  if (relativeDrop >= 0.12) return "Medium";
  return "Low";
}

function getWeakestStepConfidence(denominator: number, weakestStepKey: WeakestStepKey): "High" | "Medium" | "Low" | "None" {
  if (weakestStepKey === null || denominator === 0) return "None";
  if (denominator >= 50) return "High";
  if (denominator >= 20) return "Medium";
  return "Low";
}

function getWeakestStepConfidenceReason(confidence: "High" | "Medium" | "Low" | "None"): string {
  switch (confidence) {
    case "High":
      return "Based on strong current-period volume";
    case "Medium":
      return "Based on moderate current-period volume";
    case "Low":
      return "Based on limited current-period volume";
    default:
      return "Not enough current-period volume to trust this signal yet";
  }
}

function getWeakestStepDirection(
  currentRate: number,
  previousRate: number,
  weakestStepKey: WeakestStepKey,
): "improving" | "worsening" | "flat" | "none" {
  if (weakestStepKey === null) return "none";
  const delta = currentRate - previousRate;
  if (delta > 0.01) return "improving";
  if (delta < -0.01) return "worsening";
  return "flat";
}

function getWeakestStepTrendReason(direction: "improving" | "worsening" | "flat" | "none"): string {
  switch (direction) {
    case "improving":
      return "This weakest step is performing better than in the prior period.";
    case "worsening":
      return "This weakest step is performing worse than in the prior period.";
    case "flat":
      return "This weakest step is materially unchanged versus the prior period.";
    default:
      return "No prior-period comparison is available for this weakest step.";
  }
}

function getReleaseAnnotationKeywords(stepKey: WeakestStepKey): string[] {
  switch (stepKey) {
    case "moduleViewToCtaRate":
      return ["Results", "CTA", "copy", "action grouping"];
    case "ctaToArtifactRate":
      return ["Studio", "routing", "first screen", "entry"];
    case "artifactToRefineRate":
      return ["refine", "prompt", "artifact"];
    case "artifactToCommitRate":
      return ["opportunity", "save", "commit", "artifact completion"];
    default:
      return [];
  }
}

function isReleaseRelevant(annotation: ReleaseAnnotation, stepKey: WeakestStepKey): boolean {
  if (stepKey === null) return false;
  const keywords = getReleaseAnnotationKeywords(stepKey);
  const haystack = `${annotation.label} ${annotation.notes}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function getReleaseContextSummary(
  weakestStepKey: WeakestStepKey,
  current: ReleaseAnnotation[],
  previous: ReleaseAnnotation[],
): string {
  if (weakestStepKey === null) {
    return "No weakest-step release context is available yet.";
  }
  if (current.length === 0 && previous.length === 0) {
    return "No directly relevant release annotations were found in the current or prior comparison windows.";
  }
  if (current.length > 0) {
    return "Recent relevant product changes exist in the current comparison window.";
  }
  if (previous.length > 0) {
    return "Relevant product changes were shipped in the prior comparison window.";
  }
  return "No directly relevant release annotations were found in the current or prior comparison windows.";
}

function getOperatorSummary(input: {
  weakestStepKey: WeakestStepKey;
  weakestStepLabel: string | null;
  weakestStepDirection: "improving" | "worsening" | "flat" | "none";
  watchlistStatus: "stable" | "monitor" | "action_needed";
  releaseContextSummary: string;
  recommendedActionTitle: string | null;
}): OperatorSummary {
  if (input.weakestStepKey === null) {
    return {
      tone: "neutral",
      primaryFocus: "no_signal",
      headline: "Not enough signal yet to identify a funnel risk.",
      subheadline:
        "Product Signal does not yet have enough current-period activity to surface a trustworthy weakest step.",
      supportingReason: "No active weakest-step signal is available yet.",
      recommendedActionTitle: null,
    };
  }
  if (input.watchlistStatus === "action_needed") {
    return {
      tone: "urgent",
      primaryFocus: "weak_step_action",
      headline: `Action needed: ${input.weakestStepLabel} is the main funnel bottleneck right now.`,
      subheadline: "The current weakest step is severe, supported by meaningful volume, and is not improving.",
      supportingReason: "Combine the weakest-step recommendation with release context to investigate likely causes.",
      recommendedActionTitle: input.recommendedActionTitle,
    };
  }
  if (
    input.watchlistStatus === "monitor" &&
    (input.weakestStepDirection === "worsening" || input.weakestStepDirection === "flat")
  ) {
    return {
      tone: "caution",
      primaryFocus: "weak_step_monitor",
      headline: `Monitor closely: ${input.weakestStepLabel} is the current funnel constraint.`,
      subheadline:
        "The weakest step is showing enough risk to watch, even if immediate intervention is not yet mandatory.",
      supportingReason: "Review severity, confidence, and recent release context before making changes.",
      recommendedActionTitle: input.recommendedActionTitle,
    };
  }
  if (input.weakestStepDirection === "improving") {
    return {
      tone: "informative",
      primaryFocus: "positive_recovery",
      headline: "The current weakest step is improving, but it remains the main funnel constraint.",
      subheadline:
        "The bottleneck is recovering relative to the prior period, which lowers urgency but does not remove the constraint.",
      supportingReason: "Keep monitoring the weakest step until the gap versus stronger steps narrows further.",
      recommendedActionTitle: input.recommendedActionTitle,
    };
  }
  return {
    tone: "informative",
    primaryFocus: "stable_funnel",
    headline: "The funnel has a weakest step, but current conditions do not suggest elevated risk.",
    subheadline:
      "The current constraint is present, but severity, confidence, and trend do not point to urgent action.",
    supportingReason: "Continue monitoring for movement in watchlist status, severity, or trend.",
    recommendedActionTitle: input.recommendedActionTitle,
  };
}

function getRecommendedNextAction(input: {
  weakestStepKey: WeakestStepKey;
  weakestStepLabel: string | null;
  watchlistStatus: "stable" | "monitor" | "action_needed";
  releaseContext: WeakestStepReleaseContext;
}): RecommendedNextAction {
  let actionTitle = "No action recommended yet";
  let actionBody =
    "There is not enough current-period signal to determine a meaningful next action.";
  let actionFocus: RecommendedNextAction["actionFocus"] = "none";
  let actionSource: RecommendedNextAction["actionSource"] = "none";

  switch (input.weakestStepKey) {
    case "moduleViewToCtaRate":
      actionTitle = "Improve Results CTA clarity";
      actionBody =
        "Simplify CTA copy, reduce competing actions, and test a single clear next step from Results.";
      actionFocus = "results_cta";
      break;
    case "ctaToArtifactRate":
      actionTitle = "Reduce Studio entry friction";
      actionBody =
        "Review routing, load time, and first screen clarity to ensure users who click through can continue immediately.";
      actionFocus = "studio_entry";
      break;
    case "artifactToRefineRate":
      actionTitle = "Strengthen refine flow value";
      actionBody =
        "Make refinement outcomes clearer and improve prompt guidance so users understand why to refine.";
      actionFocus = "refine_flow";
      break;
    case "artifactToCommitRate":
      actionTitle = "Improve opportunity capture visibility";
      actionBody =
        "Make the opportunity action more prominent and tie it directly to artifact completion moments.";
      actionFocus = "opportunity_capture";
      break;
    default:
      return {
        actionTitle,
        actionBody,
        actionFocus,
        actionSource,
      };
  }

  actionSource = "weakest_step";
  if (
    input.watchlistStatus === "action_needed" &&
    input.releaseContext.relevantCurrentWindowReleases.length > 0
  ) {
    actionSource = "weakest_step_with_release_context";
    actionBody +=
      " Recent product changes in this area may be contributing. Review recent releases before making additional changes.";
  }

  return {
    actionTitle,
    actionBody,
    actionFocus,
    actionSource,
  };
}

function getWeakestStepWatchlist(
  weakestStepKey: WeakestStepKey,
  severity: "High" | "Medium" | "Low" | "None",
  confidence: "High" | "Medium" | "Low" | "None",
  weakestStepDirection: "improving" | "worsening" | "flat" | "none",
): {
  watchlistStatus: "stable" | "monitor" | "action_needed";
  watchlistPriority: "none" | "low" | "medium" | "high";
  watchlistReason: string;
} {
  if (weakestStepKey === null) {
    return {
      watchlistStatus: "stable",
      watchlistPriority: "none",
      watchlistReason: "No active weakest-step signal is available yet.",
    };
  }

  if (
    severity === "High" &&
    (confidence === "High" || confidence === "Medium") &&
    (weakestStepDirection === "worsening" || weakestStepDirection === "flat")
  ) {
    return {
      watchlistStatus: "action_needed",
      watchlistPriority: "high",
      watchlistReason: "This bottleneck is severe, supported by meaningful volume, and is not improving.",
    };
  }

  if (
    (severity === "High" && confidence === "Low") ||
    (severity === "Medium" && (confidence === "High" || confidence === "Medium")) ||
    (severity === "Medium" && weakestStepDirection === "worsening") ||
    (severity === "Low" && confidence === "High" && weakestStepDirection === "worsening")
  ) {
    return {
      watchlistStatus: "monitor",
      watchlistPriority: "medium",
      watchlistReason: "This bottleneck shows enough risk to monitor closely.",
    };
  }

  if (severity === "Low" || confidence === "Low" || weakestStepDirection === "improving") {
    return {
      watchlistStatus: "monitor",
      watchlistPriority: "low",
      watchlistReason: "This bottleneck exists, but the current signal suggests lower urgency.",
    };
  }

  return {
    watchlistStatus: "stable",
    watchlistPriority: "none",
    watchlistReason: "Current weakest-step conditions do not suggest elevated risk.",
  };
}

function normalizeScoreBucket(value: unknown): AnalyticsScoreBucket | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim() as AnalyticsScoreBucket;
  return ANALYTICS_SCORE_BUCKETS.includes(normalized) ? normalized : null;
}

function normalizeAllowedString(
  value: unknown,
  allowed: readonly string[],
): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : null;
}

type FounderEventRow = {
  sessionId: string;
  userId: string | null;
  eventName: string;
  createdAtMs: number;
  analysisNumber: number | null;
};

type FounderWindowMetrics = {
  visitors: number;
  analysesStarted: number;
  analysesCompleted: number;
  accountsCreated: number;
  resumeUploads: number;
  sampleRoleUsage: number;
  averageTimeToFirstAnalysisSeconds: number;
  resumeUploadRate: number;
  usersWithAtLeastOneAnalysis: number;
  usersWithTwoOrMoreAnalyses: number;
  visitorToAnalysisConversion: number;
  analysisCompletionRate: number;
  resultToAccountConversion: number;
  secondAnalysisRate: number;
  averageAnalysesPerActiveUser: number;
};

type BetaUserStateSummary =
  | 'Invited, not activated'
  | 'Logged in, no analysis'
  | 'Analysis complete, no generation'
  | 'Limited generation, unresolved'
  | 'Generated docs'
  | 'Submitted bug report';

type BetaUserRosterRow = {
  userId: string;
  email: string;
  accessCodeStatus: 'none' | 'assigned' | 'redeemed' | 'revoked';
  firstLoginAt: string | null;
  lastActiveAt: string | null;
  analysesRun: number;
  studioVisits: number;
  documentGenerations: number;
  bugReportsSubmitted: number;
  currentStateSummary: BetaUserStateSummary;
};

type CommandCenterSummary = {
  invited: number;
  activated: number;
  loggedIn: number;
  ranFirstAnalysis: number;
  reachedResults: number;
  openedStudio: number;
  generatedResume: number;
  generatedCoverLetter: number;
  submittedBug: number;
  trackedApplication: number;
};

type CommandCenterHotspot = {
  key: string;
  label: string;
  count: number;
  examples: string[];
};

type CommandCenterActionItem = {
  key: string;
  label: string;
  count: number;
  users: string[];
};

type BetaCommandCenterResponse = {
  generatedAt: string;
  roster: BetaUserRosterRow[];
  funnel: CommandCenterSummary;
  frictionHotspots: CommandCenterHotspot[];
  bugFeed: Array<{
    id: string;
    title: string;
    severity: string;
    category: string;
    where: string;
    createdAt: string;
    userEmail: string | null;
    status: 'open';
    issueUrl: string | null;
  }>;
  actionNeededQueue: CommandCenterActionItem[];
};

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(AccessCode)
    private readonly accessCodeRepository: Repository<AccessCode>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
  @InjectRepository(BetaFeedback)
  private readonly betaFeedbackRepository: Repository<BetaFeedback>,
  @InjectRepository(ProductSignalSnapshot)
  private readonly productSignalSnapshotRepository: Repository<ProductSignalSnapshot>,
  ) {}

  async getBetaCommandCenter(input?: {
    includeSynthetic?: boolean;
  }): Promise<BetaCommandCenterResponse> {
    const includeSynthetic = input?.includeSynthetic ?? false;
    const [users, accessCodes, events, assessments, opportunities, applications, feedback] =
      await Promise.all([
        this.usersRepository.find({
          where: includeSynthetic
            ? { role: 'user' }
            : { role: 'user', isSynthetic: false },
          select: ['id', 'email', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
        this.accessCodeRepository.find({
          select: ['assignedUserId', 'redeemedByUserId', 'redeemedAt', 'revokedAt', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
        this.analyticsEventRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['userId', 'eventName', 'createdAt', 'properties'],
          order: { createdAt: 'DESC' },
          take: 5000,
        }),
        this.fitAssessmentRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['id', 'userId', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
        this.opportunityRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['id', 'userId', 'status', 'updatedAt'],
          order: { updatedAt: 'DESC' },
        }),
        this.applicationRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['id', 'userId', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
        this.betaFeedbackRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['id', 'title', 'severity', 'category', 'where', 'createdAt', 'userId'],
          order: { createdAt: 'DESC' },
          take: 200,
        }),
      ]);

    const userEmailById = new Map(users.map((user) => [user.id, user.email]));

    const accessStatusByUser = new Map<string, BetaUserRosterRow['accessCodeStatus']>();
    for (const code of accessCodes) {
      const assigned = code.assignedUserId ?? null;
      const redeemed = code.redeemedByUserId ?? null;
      if (assigned) {
        const current = accessStatusByUser.get(assigned) ?? 'none';
        if (code.revokedAt) accessStatusByUser.set(assigned, 'revoked');
        else if (current !== 'redeemed') accessStatusByUser.set(assigned, 'assigned');
      }
      if (redeemed) {
        accessStatusByUser.set(redeemed, 'redeemed');
      }
    }

    const byUser = new Map<
      string,
      {
        firstLoginAt: Date | null;
        lastActiveAt: Date | null;
        studioVisits: number;
        resumeGenerated: number;
        coverGenerated: number;
        limitedGeneration: number;
        analysisReachedResults: number;
      }
    >();
    const ensureUser = (userId: string) => {
      const existing = byUser.get(userId);
      if (existing) return existing;
      const seed = {
        firstLoginAt: null,
        lastActiveAt: null,
        studioVisits: 0,
        resumeGenerated: 0,
        coverGenerated: 0,
        limitedGeneration: 0,
        analysisReachedResults: 0,
      };
      byUser.set(userId, seed);
      return seed;
    };

    for (const event of events) {
      const userId = event.userId?.trim();
      if (!userId) continue;
      const bucket = ensureUser(userId);
      if (!bucket.firstLoginAt || event.createdAt < bucket.firstLoginAt) {
        bucket.firstLoginAt = event.createdAt;
      }
      if (!bucket.lastActiveAt || event.createdAt > bucket.lastActiveAt) {
        bucket.lastActiveAt = event.createdAt;
      }
      if (event.eventName === 'resume_studio_opened') bucket.studioVisits += 1;
      if (event.eventName === 'resume_generation_succeeded') bucket.resumeGenerated += 1;
      if (event.eventName === 'cover_letter_generation_succeeded') bucket.coverGenerated += 1;
      if (
        event.eventName === 'resume_generation_limited' ||
        event.eventName === 'cover_letter_generation_limited' ||
        event.eventName === 'resume_generation_blocked_compliance' ||
        event.eventName === 'cover_letter_generation_blocked_compliance'
      ) {
        bucket.limitedGeneration += 1;
      }
      if (event.eventName === 'role_analysis_completed') {
        bucket.analysisReachedResults += 1;
      }
    }

    const analysisCountByUser = new Map<string, number>();
    for (const assessment of assessments) {
      analysisCountByUser.set(
        assessment.userId,
        (analysisCountByUser.get(assessment.userId) ?? 0) + 1,
      );
    }

    const appCountByUser = new Map<string, number>();
    for (const application of applications) {
      appCountByUser.set(
        application.userId,
        (appCountByUser.get(application.userId) ?? 0) + 1,
      );
    }

    const bugCountByUser = new Map<string, number>();
    for (const bug of feedback) {
      const userId = bug.userId?.trim();
      if (!userId) continue;
      bugCountByUser.set(userId, (bugCountByUser.get(userId) ?? 0) + 1);
    }

    const roster: BetaUserRosterRow[] = users.map((user) => {
      const telemetry = byUser.get(user.id);
      const analysesRun = analysisCountByUser.get(user.id) ?? 0;
      const studioVisits = telemetry?.studioVisits ?? 0;
      const generatedResume = telemetry?.resumeGenerated ?? 0;
      const generatedCover = telemetry?.coverGenerated ?? 0;
      const bugReportsSubmitted = bugCountByUser.get(user.id) ?? 0;
      const documentGenerations = generatedResume + generatedCover;
      const limitedGeneration = telemetry?.limitedGeneration ?? 0;
      let currentStateSummary: BetaUserStateSummary = 'Invited, not activated';
      if ((telemetry?.firstLoginAt ?? null) && analysesRun === 0) {
        currentStateSummary = 'Logged in, no analysis';
      } else if (analysesRun > 0 && documentGenerations === 0 && limitedGeneration > 0) {
        currentStateSummary = 'Limited generation, unresolved';
      } else if (analysesRun > 0 && documentGenerations === 0) {
        currentStateSummary = 'Analysis complete, no generation';
      } else if (documentGenerations > 0) {
        currentStateSummary = 'Generated docs';
      }
      if (bugReportsSubmitted > 0) {
        currentStateSummary = 'Submitted bug report';
      }
      return {
        userId: user.id,
        email: user.email ?? 'Unknown',
        accessCodeStatus: accessStatusByUser.get(user.id) ?? 'none',
        firstLoginAt: telemetry?.firstLoginAt?.toISOString() ?? null,
        lastActiveAt: telemetry?.lastActiveAt?.toISOString() ?? null,
        analysesRun,
        studioVisits,
        documentGenerations,
        bugReportsSubmitted,
        currentStateSummary,
      };
    });

    const uniqueInvitedUsers = new Set<string>();
    accessCodes.forEach((code) => {
      if (code.assignedUserId) uniqueInvitedUsers.add(code.assignedUserId);
      if (code.redeemedByUserId) uniqueInvitedUsers.add(code.redeemedByUserId);
    });

    const funnel: CommandCenterSummary = {
      invited: Math.max(uniqueInvitedUsers.size, roster.length),
      activated: roster.filter((row) => row.accessCodeStatus === 'redeemed').length,
      loggedIn: roster.filter((row) => row.firstLoginAt !== null).length,
      ranFirstAnalysis: roster.filter((row) => row.analysesRun > 0).length,
      reachedResults: roster.filter((row) => (byUser.get(row.userId)?.analysisReachedResults ?? 0) > 0).length,
      openedStudio: roster.filter((row) => row.studioVisits > 0).length,
      generatedResume: roster.filter((row) => (byUser.get(row.userId)?.resumeGenerated ?? 0) > 0).length,
      generatedCoverLetter: roster.filter((row) => (byUser.get(row.userId)?.coverGenerated ?? 0) > 0).length,
      submittedBug: roster.filter((row) => row.bugReportsSubmitted > 0).length,
      trackedApplication: roster.filter((row) => (appCountByUser.get(row.userId) ?? 0) > 0).length,
    };

    const limitedUsers = roster.filter((row) => (byUser.get(row.userId)?.limitedGeneration ?? 0) > 0);
    const missingCoverageFeedback = feedback.filter((item) =>
      item.title.toLowerCase().includes('missing') ||
      item.category === 'data_missing' ||
      item.category === 'ux_confusion',
    );
    const complianceBlockedUsers = events.filter(
      (event) =>
        event.eventName === 'resume_generation_blocked_compliance' ||
        event.eventName === 'cover_letter_generation_blocked_compliance',
    );
    const analysisLoadFailures = events.filter((event) => event.eventName === 'analysis_load_failed');
    const loginFailuresFromFeedback = feedback.filter((item) =>
      item.title.toLowerCase().includes('login') || item.where.toLowerCase().includes('login'),
    );

    const frictionHotspots: CommandCenterHotspot[] = [
      {
        key: 'login_failures',
        label: 'Login failures',
        count: loginFailuresFromFeedback.length,
        examples: loginFailuresFromFeedback.slice(0, 3).map((item) => item.title),
      },
      {
        key: 'limited_generation',
        label: 'Limited generation counts',
        count: limitedUsers.length,
        examples: limitedUsers.slice(0, 3).map((row) => row.email),
      },
      {
        key: 'missing_verification_coverage',
        label: 'Missing verification coverage',
        count: missingCoverageFeedback.length,
        examples: missingCoverageFeedback.slice(0, 3).map((item) => item.title),
      },
      {
        key: 'generation_blocked_compliance',
        label: 'Generation blocked by compliance',
        count: complianceBlockedUsers.length,
        examples: complianceBlockedUsers.slice(0, 3).map((event) => event.userId ?? 'unknown user'),
      },
      {
        key: 'source_resume_or_version_issues',
        label: 'Source resume/version issues',
        count: feedback.filter((item) => item.category === 'formatting_resume').length,
        examples: feedback
          .filter((item) => item.category === 'formatting_resume')
          .slice(0, 3)
          .map((item) => item.title),
      },
      {
        key: 'analysis_load_failures',
        label: 'Analysis load failures',
        count: analysisLoadFailures.length,
        examples: analysisLoadFailures.slice(0, 3).map((event) => event.userId ?? 'unknown user'),
      },
    ];

    const actionNeededQueue: CommandCenterActionItem[] = [
      {
        key: 'never_activated_after_invite',
        label: 'Users who never activated after invite',
        count: roster.filter((row) => row.accessCodeStatus === 'assigned').length,
        users: roster
          .filter((row) => row.accessCodeStatus === 'assigned')
          .slice(0, 8)
          .map((row) => row.email),
      },
      {
        key: 'limited_generation_and_stopped',
        label: 'Users who hit limited generation and stopped',
        count: roster.filter(
          (row) =>
            (byUser.get(row.userId)?.limitedGeneration ?? 0) > 0 &&
            row.documentGenerations === 0,
        ).length,
        users: roster
          .filter(
            (row) =>
              (byUser.get(row.userId)?.limitedGeneration ?? 0) > 0 &&
              row.documentGenerations === 0,
          )
          .slice(0, 8)
          .map((row) => row.email),
      },
      {
        key: 'multiple_bug_reports',
        label: 'Users who submitted multiple bug reports',
        count: roster.filter((row) => row.bugReportsSubmitted >= 2).length,
        users: roster
          .filter((row) => row.bugReportsSubmitted >= 2)
          .slice(0, 8)
          .map((row) => row.email),
      },
      {
        key: 'generated_but_not_tracked_application',
        label: 'Users who generated docs but never tracked an application',
        count: roster.filter(
          (row) => row.documentGenerations > 0 && (appCountByUser.get(row.userId) ?? 0) === 0,
        ).length,
        users: roster
          .filter(
            (row) => row.documentGenerations > 0 && (appCountByUser.get(row.userId) ?? 0) === 0,
          )
          .slice(0, 8)
          .map((row) => row.email),
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      roster,
      funnel,
      frictionHotspots,
      bugFeed: feedback.slice(0, 40).map((item) => ({
        id: item.id,
        title: item.title,
        severity: item.severity,
        category: item.category,
        where: item.where,
        createdAt: item.createdAt.toISOString(),
        userEmail: item.userId ? userEmailById.get(item.userId) ?? null : null,
        status: 'open',
        issueUrl: null,
      })),
      actionNeededQueue,
    };
  }

  async ingestEvent(dto: TrackAnalyticsEventDto) {
    const properties = this.normalizeProperties(dto.eventName, dto.properties);
    const createdAt = this.resolveCreatedAt(dto.createdAt);

    const event = this.analyticsEventRepository.create({
      eventName: dto.eventName,
      sessionId: dto.sessionId.trim(),
      userId: dto.userId?.trim() || null,
      path: dto.path?.trim() || null,
      properties,
      isSynthetic: dto.isSynthetic ?? false,
      syntheticScenarioKey: dto.syntheticScenarioKey?.trim() || null,
      syntheticRunId: dto.syntheticRunId?.trim() || null,
      createdAt,
    });

    return this.analyticsEventRepository.save(event);
  }

  async getSummary(
    days = 30,
    options?: { includeSynthetic?: boolean },
  ): Promise<AnalyticsSummaryResponse> {
    const now = new Date();
    const normalizedDays = Number.isFinite(days)
      ? Math.max(1, Math.min(365, Math.floor(days)))
      : 30;
    const since = new Date(now.getTime() - normalizedDays * 24 * 60 * 60 * 1000);
    const previousSince = new Date(now.getTime() - normalizedDays * 2 * 24 * 60 * 60 * 1000);
    const includeSynthetic = options?.includeSynthetic ?? false;

    const countEventBetween = async (eventName: string, windowStart: Date, windowEnd?: Date) => {
      const query = this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', { eventName })
        .andWhere('event.createdAt >= :since', { since: windowStart })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false');
      if (windowEnd) {
        query.andWhere('event.createdAt < :until', { until: windowEnd });
      }
      const row = await query.getRawOne<{ count: string }>();
      return Number(row?.count ?? 0);
    };

    const [
      visitorRow,
      startsRow,
      completionsRow,
      opportunitiesRow,
      resumeOpensRow,
      heroDemoCompletionsRow,
      resultsImprovementModuleViewsRow,
      resultsImprovementCtaClicksRow,
      artifactUsedIntentsRow,
      artifactRefineIntentsRow,
      opportunityCommitIntentsRow,
      scoreRows,
    ] = await Promise.all([
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(DISTINCT event.sessionId)', 'count')
        .where('event.eventName = :eventName', { eventName: 'landing_viewed' })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(DISTINCT event.sessionId)', 'count')
        .where('event.eventName IN (:...eventNames)', {
          eventNames: ['compatibility_analysis_started', 'role_analysis_started'],
        })
        .andWhere("event.properties ->> 'source' = :source", {
          source: 'landing',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'role_analysis_completed',
        })
        .andWhere(
          "(event.properties ->> 'source' = :resultsSource OR event.properties ->> 'source' = :unknownSource)",
          {
            resultsSource: 'results',
            unknownSource: 'unknown',
          },
        )
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', { eventName: 'opportunity_saved' })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'resume_studio_opened',
        })
        .andWhere("event.properties ->> 'entrySource' = :entrySource", {
          entrySource: 'results',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'results_improvement_module_viewed',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'results_improvement_cta_clicked',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'artifact_used_intent',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'artifact_refine_intent',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'opportunity_commit_intent',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'compatibility_analysis_completed',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('event.properties', 'properties')
        .where('event.eventName = :eventName', {
          eventName: 'role_analysis_completed',
        })
        .andWhere(
          "(event.properties ->> 'source' = :resultsSource OR event.properties ->> 'source' = :unknownSource)",
          {
            resultsSource: 'results',
            unknownSource: 'unknown',
          },
        )
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawMany<{ properties: Record<string, unknown> | string }>(),
    ]);

    const visitors = Number(visitorRow?.count ?? 0);
    const analysisStarts = Number(startsRow?.count ?? 0);
    const analysisCompletions = Number(completionsRow?.count ?? 0);
    const opportunitiesSaved = Number(opportunitiesRow?.count ?? 0);
    const resumeStudioOpens = Number(resumeOpensRow?.count ?? 0);
    const heroDemoCompletions = Number(heroDemoCompletionsRow?.count ?? 0);
    const resultsImprovementModuleViews = Number(resultsImprovementModuleViewsRow?.count ?? 0);
    const resultsImprovementCtaClicks = Number(resultsImprovementCtaClicksRow?.count ?? 0);
    const artifactUsedIntents = Number(artifactUsedIntentsRow?.count ?? 0);
    const artifactRefineIntents = Number(artifactRefineIntentsRow?.count ?? 0);
    const opportunityCommitIntents = Number(opportunityCommitIntentsRow?.count ?? 0);

    const scoreDistribution: Record<AnalyticsScoreBucket, number> = {
      under_60: 0,
      '60s': 0,
      '70s': 0,
      '80s': 0,
      '90_plus': 0,
    };

    for (const row of scoreRows) {
      let rawProperties: Record<string, unknown> | null = null;
      if (typeof row.properties === 'string') {
        try {
          rawProperties = JSON.parse(row.properties) as Record<string, unknown>;
        } catch {
          rawProperties = null;
        }
      } else if (row.properties && typeof row.properties === 'object') {
        rawProperties = row.properties as Record<string, unknown>;
      }
      if (!rawProperties || typeof rawProperties !== 'object') {
        continue;
      }

      const bucketFromPayload = normalizeScoreBucket(rawProperties.scoreBucket);
      const score = toFiniteNumber(rawProperties.score);
      const bucket = bucketFromPayload ?? (score !== null ? resolveScoreBucket(score) : null);
      if (!bucket) continue;
      scoreDistribution[bucket] += 1;
    }

    const startRate = toRate(analysisStarts, visitors);
    const completionRate = toRate(analysisCompletions, analysisStarts);
    const opportunitySaveRate = toRate(opportunitiesSaved, analysisCompletions);
    const resumeOpenRate = toRate(resumeStudioOpens, analysisCompletions);
    const resultsImprovementCtaRate = toRate(resultsImprovementCtaClicks, resultsImprovementModuleViews);
    const artifactToOpportunityCommitRate = toRate(opportunityCommitIntents, artifactUsedIntents);
    const refineIntentShare = toRate(
      artifactRefineIntents,
      artifactRefineIntents + opportunityCommitIntents,
    );
    const previousResultsImprovementModuleViews = await countEventBetween(
      'results_improvement_module_viewed',
      previousSince,
      since,
    );
    const previousResultsImprovementCtaClicks = await countEventBetween(
      'results_improvement_cta_clicked',
      previousSince,
      since,
    );
    const previousArtifactUsedIntents = await countEventBetween(
      'artifact_used_intent',
      previousSince,
      since,
    );
    const previousArtifactRefineIntents = await countEventBetween(
      'artifact_refine_intent',
      previousSince,
      since,
    );
    const previousOpportunityCommitIntents = await countEventBetween(
      'opportunity_commit_intent',
      previousSince,
      since,
    );
    const previousResultsImprovementCtaRate = toRate(
      previousResultsImprovementCtaClicks,
      previousResultsImprovementModuleViews,
    );
    const previousArtifactToOpportunityCommitRate = toRate(
      previousOpportunityCommitIntents,
      previousArtifactUsedIntents,
    );
    const previousRefineIntentShare = toRate(
      previousArtifactRefineIntents,
      previousArtifactRefineIntents + previousOpportunityCommitIntents,
    );
    const buildComparison = (current: number, previous: number): TrendComparison => {
      const delta = current - previous;
      return {
        current,
        previous,
        delta,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      };
    };
    const currentStepRates = [
      {
        key: "moduleViewToCtaRate" as const,
        value: toRate(resultsImprovementCtaClicks, resultsImprovementModuleViews),
        numerator: resultsImprovementCtaClicks,
        denominator: resultsImprovementModuleViews,
        previousNumerator: previousResultsImprovementCtaClicks,
        previousDenominator: previousResultsImprovementModuleViews,
      },
      {
        key: "ctaToArtifactRate" as const,
        value: toRate(artifactUsedIntents, resultsImprovementCtaClicks),
        numerator: artifactUsedIntents,
        denominator: resultsImprovementCtaClicks,
        previousNumerator: previousArtifactUsedIntents,
        previousDenominator: previousResultsImprovementCtaClicks,
      },
      {
        key: "artifactToRefineRate" as const,
        value: toRate(artifactRefineIntents, artifactUsedIntents),
        numerator: artifactRefineIntents,
        denominator: artifactUsedIntents,
        previousNumerator: previousArtifactRefineIntents,
        previousDenominator: previousArtifactUsedIntents,
      },
      {
        key: "artifactToCommitRate" as const,
        value: toRate(opportunityCommitIntents, artifactUsedIntents),
        numerator: opportunityCommitIntents,
        denominator: artifactUsedIntents,
        previousNumerator: previousOpportunityCommitIntents,
        previousDenominator: previousArtifactUsedIntents,
      },
    ];
    const allZeroRates = currentStepRates.every((item) => item.value === 0);
    const weakestStep = allZeroRates
      ? null
      : currentStepRates.reduce((lowest, item) => (item.value < lowest.value ? item : lowest));
    const benchmarkStepRate = allZeroRates
      ? 0
      : Math.max(...currentStepRates.map((item) => item.value).filter((value) => value > 0));
    const weakestStepRecommendation = getWeakestStepRecommendation(weakestStep?.key ?? null);
    const weakestStepRate = weakestStep?.value ?? 0;
    const weakestStepDenominator = weakestStep?.denominator ?? 0;
    const weakestStepNumerator = weakestStep?.numerator ?? 0;
    const weakestStepPreviousNumerator = weakestStep?.previousNumerator ?? 0;
    const weakestStepPreviousDenominator = weakestStep?.previousDenominator ?? 0;
    const weakestStepPreviousRate =
      weakestStep === null || weakestStepPreviousDenominator === 0
        ? 0
        : toRate(weakestStepPreviousNumerator, weakestStepPreviousDenominator);
    const weakestStepDelta = weakestStepRate - weakestStepPreviousRate;
    const weakestStepDirection =
      weakestStep === null || weakestStepPreviousDenominator === 0
        ? "none"
        : getWeakestStepDirection(weakestStepRate, weakestStepPreviousRate, weakestStep.key);
    const severity = getWeakestStepSeverity(benchmarkStepRate - weakestStepRate, weakestStep?.key ?? null);
    const confidence = getWeakestStepConfidence(weakestStepDenominator, weakestStep?.key ?? null);
    const watchlist = getWeakestStepWatchlist(
      weakestStep?.key ?? null,
      severity,
      confidence,
      weakestStepDirection,
    );
    const currentWindowReleases = RELEASE_ANNOTATIONS.map((annotation) => ({
      ...annotation,
      isInCurrentWindow: false,
      isInPreviousWindow: false,
    })).map((annotation) => ({
      ...annotation,
      isInCurrentWindow:
        new Date(annotation.date).getTime() >= since.getTime() &&
        new Date(annotation.date).getTime() < now.getTime(),
      isInPreviousWindow:
        new Date(annotation.date).getTime() >= previousSince.getTime() &&
        new Date(annotation.date).getTime() < since.getTime(),
    }));
    const relevantCurrentWindowReleases = currentWindowReleases.filter((annotation) =>
      annotation.isInCurrentWindow && isReleaseRelevant(annotation, weakestStep?.key ?? null),
    );
    const relevantPreviousWindowReleases = currentWindowReleases.filter((annotation) =>
      annotation.isInPreviousWindow && isReleaseRelevant(annotation, weakestStep?.key ?? null),
    );
    const releaseContextSummary = getReleaseContextSummary(
      weakestStep?.key ?? null,
      relevantCurrentWindowReleases,
      relevantPreviousWindowReleases,
    );
    const weakestStepReleaseContext = {
      relevantCurrentWindowReleases,
      relevantPreviousWindowReleases,
      releaseContextSummary,
    };
    const recommendedNextAction = getRecommendedNextAction({
      weakestStepKey: weakestStep?.key ?? null,
      weakestStepLabel: weakestStepRecommendation.label,
      watchlistStatus: watchlist.watchlistStatus,
      releaseContext: weakestStepReleaseContext,
    });
    const operatorSummary = getOperatorSummary({
      weakestStepKey: weakestStep?.key ?? null,
      weakestStepLabel: weakestStepRecommendation.label,
      weakestStepDirection,
      watchlistStatus: watchlist.watchlistStatus,
      releaseContextSummary,
      recommendedActionTitle:
        recommendedNextAction.actionFocus === "none" ? null : recommendedNextAction.actionTitle,
    });
    const exportMetadata = {
      exportedAt: now.toISOString(),
      selectedWindowDays: days ?? null,
    };
    const adminSummaryExport = {
      headline: operatorSummary.headline,
      tone: operatorSummary.tone,
      primaryFocus: operatorSummary.primaryFocus,
      weakestStepLabel: weakestStepRecommendation.label,
      weakestStepRate,
      weakestStepDirection,
      watchlistStatus: watchlist.watchlistStatus,
      watchlistPriority: watchlist.watchlistPriority,
      severity,
      confidence,
      recommendedActionTitle:
        recommendedNextAction.actionFocus === "none" ? null : recommendedNextAction.actionTitle,
      recommendedActionBody: recommendedNextAction.actionBody,
      releaseContextSummary,
    };
    const plainTextBrief = [
      "Product Signal Summary",
      `Window: last ${exportMetadata.selectedWindowDays === null ? "all" : exportMetadata.selectedWindowDays} days`,
      `Exported: ${exportMetadata.exportedAt}`,
      "",
      `Headline: ${adminSummaryExport.headline}`,
      `Tone: ${adminSummaryExport.tone}`,
      `Primary focus: ${adminSummaryExport.primaryFocus}`,
      "",
      `Weakest step: ${adminSummaryExport.weakestStepLabel ?? "None"}`,
      `Weakest step rate: ${(adminSummaryExport.weakestStepRate * 100).toFixed(1)}%`,
      `Trend: ${adminSummaryExport.weakestStepDirection}`,
      `Watchlist: ${adminSummaryExport.watchlistStatus} (${adminSummaryExport.watchlistPriority})`,
      `Severity: ${adminSummaryExport.severity}`,
      `Confidence: ${adminSummaryExport.confidence}`,
      "",
      `Recommended action: ${adminSummaryExport.recommendedActionTitle ?? "No action recommended yet"}`,
      `Action detail: ${adminSummaryExport.recommendedActionBody}`,
      "",
      `Release context: ${adminSummaryExport.releaseContextSummary}`,
    ].join("\n");
    const jsonPayload = JSON.stringify(
      {
        ...exportMetadata,
        headline: adminSummaryExport.headline,
        tone: adminSummaryExport.tone,
        primaryFocus: adminSummaryExport.primaryFocus,
        weakestStepLabel: adminSummaryExport.weakestStepLabel,
        weakestStepRate: adminSummaryExport.weakestStepRate,
        weakestStepDirection: adminSummaryExport.weakestStepDirection,
        watchlistStatus: adminSummaryExport.watchlistStatus,
        watchlistPriority: adminSummaryExport.watchlistPriority,
        severity: adminSummaryExport.severity,
        confidence: adminSummaryExport.confidence,
        recommendedActionTitle: adminSummaryExport.recommendedActionTitle,
        recommendedActionBody: adminSummaryExport.recommendedActionBody,
        releaseContextSummary: adminSummaryExport.releaseContextSummary,
      },
      null,
      2,
    );

    return {
      visitors,
      analysisStarts,
      analysisCompletions,
      opportunitiesSaved,
      resumeStudioOpens,
      heroDemoCompletions,
      resultsImprovementModuleViews,
      resultsImprovementCtaClicks,
      artifactUsedIntents,
      artifactRefineIntents,
      opportunityCommitIntents,
      resultsImprovementCtaRate,
      artifactToOpportunityCommitRate,
      refineIntentShare,
      trendContext: {
        resultsImprovementCtaRate: buildComparison(
          resultsImprovementCtaRate,
          previousResultsImprovementCtaRate,
        ),
        artifactToOpportunityCommitRate: buildComparison(
          artifactToOpportunityCommitRate,
          previousArtifactToOpportunityCommitRate,
        ),
        refineIntentShare: buildComparison(refineIntentShare, previousRefineIntentShare),
      },
      weakestStep: {
        weakestStepKey: weakestStep?.key ?? null,
        weakestStepLabel: weakestStepRecommendation.label,
        weakestStepRate,
        weakestStepPreviousRate,
        weakestStepDelta,
        weakestStepDirection,
        weakestStepPreviousNumerator: weakestStepPreviousNumerator,
        weakestStepPreviousDenominator: weakestStepPreviousDenominator,
        weakestStepTrendReason: getWeakestStepTrendReason(weakestStepDirection),
        benchmarkStepRate,
        relativeDrop: weakestStep ? Math.max(0, benchmarkStepRate - weakestStep.value) : 0,
        weakestStepNumerator,
        weakestStepDenominator,
        severity,
        confidence,
        confidenceReason: getWeakestStepConfidenceReason(confidence),
        watchlistStatus: watchlist.watchlistStatus,
        watchlistPriority: watchlist.watchlistPriority,
        watchlistReason: watchlist.watchlistReason,
        recommendationTitle: weakestStepRecommendation.title,
        recommendationBody: weakestStepRecommendation.body,
      },
      releaseAnnotations: currentWindowReleases,
      weakestStepReleaseContext,
      operatorSummary,
      recommendedNextAction,
      adminSummaryExport,
      exportMetadata,
      formattedExports: {
        plainTextBrief,
        jsonPayload,
      },
      startRate,
      completionRate,
      opportunitySaveRate,
      resumeOpenRate,
      scoreDistribution,
      funnel: [
        { eventName: 'landing_viewed', count: visitors },
        { eventName: 'role_analysis_started', count: analysisStarts },
        { eventName: 'role_analysis_completed', count: analysisCompletions },
        { eventName: 'opportunity_saved', count: opportunitiesSaved },
        { eventName: 'resume_studio_opened', count: resumeStudioOpens },
      ],
    };
  }

  async saveProductSignalSnapshot(days: number): Promise<ProductSignalSnapshotRecord> {
    const summary = await this.getSummary(days);
    const snapshot = this.productSignalSnapshotRepository.create({
      selectedWindowDays: days,
      headline: summary.adminSummaryExport.headline,
      tone: summary.adminSummaryExport.tone,
      primaryFocus: summary.adminSummaryExport.primaryFocus,
      weakestStepLabel: summary.adminSummaryExport.weakestStepLabel,
      weakestStepRate: summary.adminSummaryExport.weakestStepRate.toFixed(8),
      weakestStepDirection: summary.adminSummaryExport.weakestStepDirection,
      watchlistStatus: summary.adminSummaryExport.watchlistStatus,
      watchlistPriority: summary.adminSummaryExport.watchlistPriority,
      severity: summary.adminSummaryExport.severity,
      confidence: summary.adminSummaryExport.confidence,
      recommendedActionTitle: summary.adminSummaryExport.recommendedActionTitle,
      recommendedActionBody: summary.adminSummaryExport.recommendedActionBody,
      releaseContextSummary: summary.adminSummaryExport.releaseContextSummary,
      exportPayloadJson: JSON.stringify(
        {
          ...summary.adminSummaryExport,
          ...summary.exportMetadata,
        },
        null,
        2,
      ),
      reviewStatus: ProductSignalSnapshotReviewStatus.OPEN,
      reviewNote: "",
      reviewedAt: null,
    });
    const savedSnapshot = await this.productSignalSnapshotRepository.save(snapshot);
    return this.mapProductSignalSnapshot(savedSnapshot);
  }

  async listProductSignalSnapshots(limit = 10): Promise<ProductSignalSnapshotRecord[]> {
    const snapshots = await this.productSignalSnapshotRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return snapshots.map((snapshot) => this.mapProductSignalSnapshot(snapshot));
  }

  async compareProductSignalSnapshot(
    days: number,
    input?: { includeSynthetic?: boolean },
  ): Promise<ProductSignalSnapshotCompareResponse> {
    const summary = await this.getSummary(days, input);
    const latestSnapshot = await this.productSignalSnapshotRepository.findOne({
      order: { createdAt: 'DESC' },
    });

    if (!latestSnapshot) {
      return {
        hasSnapshot: false,
        latestSnapshotCreatedAt: null,
        latestSnapshotReviewStatus: null,
        latestSnapshotReviewNote: null,
        latestSnapshotReviewedAt: null,
        comparisonSummary: 'No saved Product Signal snapshot exists yet.',
        changedFields: [],
      };
    }

    const changedFields = (
      [
        {
          field: 'headline',
          previousValue: latestSnapshot.headline,
          currentValue: summary.adminSummaryExport.headline,
        },
        {
          field: 'tone',
          previousValue: latestSnapshot.tone,
          currentValue: summary.operatorSummary.tone,
        },
        {
          field: 'primaryFocus',
          previousValue: latestSnapshot.primaryFocus,
          currentValue: summary.operatorSummary.primaryFocus,
        },
        {
          field: 'weakestStepLabel',
          previousValue: latestSnapshot.weakestStepLabel,
          currentValue: summary.adminSummaryExport.weakestStepLabel,
        },
        {
          field: 'weakestStepRate',
          previousValue: this.roundProductSignalRate(latestSnapshot.weakestStepRate),
          currentValue: this.roundProductSignalRate(summary.adminSummaryExport.weakestStepRate),
        },
        {
          field: 'weakestStepDirection',
          previousValue: latestSnapshot.weakestStepDirection,
          currentValue: summary.adminSummaryExport.weakestStepDirection,
        },
        {
          field: 'watchlistStatus',
          previousValue: latestSnapshot.watchlistStatus,
          currentValue: summary.adminSummaryExport.watchlistStatus,
        },
        {
          field: 'watchlistPriority',
          previousValue: latestSnapshot.watchlistPriority,
          currentValue: summary.adminSummaryExport.watchlistPriority,
        },
        {
          field: 'severity',
          previousValue: latestSnapshot.severity,
          currentValue: summary.adminSummaryExport.severity,
        },
        {
          field: 'confidence',
          previousValue: latestSnapshot.confidence,
          currentValue: summary.adminSummaryExport.confidence,
        },
        {
          field: 'recommendedActionTitle',
          previousValue: latestSnapshot.recommendedActionTitle,
          currentValue: summary.adminSummaryExport.recommendedActionTitle,
        },
        {
          field: 'releaseContextSummary',
          previousValue: latestSnapshot.releaseContextSummary,
          currentValue: summary.adminSummaryExport.releaseContextSummary,
        },
      ] satisfies ProductSignalCompareField[]
    ).filter((field) => field.previousValue !== field.currentValue);

    return {
      hasSnapshot: true,
      latestSnapshotCreatedAt:
        typeof latestSnapshot.createdAt === 'string'
          ? latestSnapshot.createdAt
          : latestSnapshot.createdAt.toISOString(),
      latestSnapshotReviewStatus: latestSnapshot.reviewStatus ?? null,
      latestSnapshotReviewNote: latestSnapshot.reviewNote ?? '',
      latestSnapshotReviewedAt:
        latestSnapshot.reviewedAt === null || latestSnapshot.reviewedAt === undefined
          ? null
          : typeof latestSnapshot.reviewedAt === 'string'
            ? latestSnapshot.reviewedAt
            : latestSnapshot.reviewedAt.toISOString(),
      comparisonSummary:
        changedFields.length === 0
          ? 'Current Product Signal summary is materially unchanged from the latest saved snapshot.'
          : `Current Product Signal summary differs from the latest saved snapshot in ${changedFields.length} key field(s).`,
      changedFields,
    };
  }

  async updateProductSignalSnapshot(
    snapshotId: string,
    input: { reviewStatus?: ProductSignalSnapshotReviewStatusValue; reviewNote?: string },
  ): Promise<ProductSignalSnapshotRecord> {
    if (
      input.reviewStatus !== undefined &&
      !Object.values(ProductSignalSnapshotReviewStatus).includes(input.reviewStatus)
    ) {
      throw new BadRequestException('reviewStatus must be open, monitoring, or resolved');
    }
    const snapshot = await this.productSignalSnapshotRepository.findOne({ where: { id: snapshotId } });
    if (!snapshot) {
      throw new BadRequestException('Product Signal snapshot not found');
    }
    let changed = false;
    if (input.reviewStatus !== undefined && snapshot.reviewStatus !== input.reviewStatus) {
      snapshot.reviewStatus = input.reviewStatus;
      changed = true;
    }
    if (input.reviewNote !== undefined && snapshot.reviewNote !== input.reviewNote) {
      snapshot.reviewNote = input.reviewNote;
      changed = true;
    }
    if (changed) {
      snapshot.reviewedAt = new Date();
    }
    const updatedSnapshot = changed
      ? await this.productSignalSnapshotRepository.save(snapshot)
      : snapshot;
    return this.mapProductSignalSnapshot(updatedSnapshot);
  }

  private mapProductSignalSnapshot(snapshot: ProductSignalSnapshot): ProductSignalSnapshotRecord {
    return {
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      selectedWindowDays: snapshot.selectedWindowDays,
      headline: snapshot.headline,
      tone: snapshot.tone,
      primaryFocus: snapshot.primaryFocus,
      weakestStepLabel: snapshot.weakestStepLabel,
      weakestStepRate: snapshot.weakestStepRate,
      weakestStepDirection: snapshot.weakestStepDirection as ProductSignalSnapshotRecord['weakestStepDirection'],
      watchlistStatus: snapshot.watchlistStatus as ProductSignalSnapshotRecord['watchlistStatus'],
      watchlistPriority: snapshot.watchlistPriority as ProductSignalSnapshotRecord['watchlistPriority'],
      severity: snapshot.severity as ProductSignalSnapshotRecord['severity'],
      confidence: snapshot.confidence as ProductSignalSnapshotRecord['confidence'],
      recommendedActionTitle: snapshot.recommendedActionTitle,
      recommendedActionBody: snapshot.recommendedActionBody,
      releaseContextSummary: snapshot.releaseContextSummary,
      exportPayloadJson: snapshot.exportPayloadJson,
      reviewStatus: snapshot.reviewStatus,
      reviewNote: snapshot.reviewNote,
      reviewedAt: snapshot.reviewedAt,
    };
  }

  async getFounderMetrics(input?: {
    rangeKey?: '7d' | '14d' | '30d' | 'all';
    includeSynthetic?: boolean;
  }): Promise<FounderMetricsResponse> {
    const now = new Date();
    const rangeKey = input?.rangeKey ?? '7d';
    const includeSynthetic = input?.includeSynthetic ?? false;
    const daysByRange: Record<'7d' | '14d' | '30d', number> = {
      '7d': 7,
      '14d': 14,
      '30d': 30,
    };

    let startAt: Date;
    if (rangeKey === 'all') {
      const [eventMinRow, userMinRow] = await Promise.all([
        this.analyticsEventRepository
          .createQueryBuilder('event')
          .select('MIN(event.createdAt)', 'minCreatedAt')
          .where(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
          .getRawOne<{ minCreatedAt: Date | string | null }>(),
        this.usersRepository
          .createQueryBuilder('user')
          .select('MIN(user.createdAt)', 'minCreatedAt')
          .where(includeSynthetic ? '1=1' : 'user.isSynthetic = false')
          .getRawOne<{ minCreatedAt: Date | string | null }>(),
      ]);
      const minEventDate = eventMinRow?.minCreatedAt
        ? new Date(eventMinRow.minCreatedAt)
        : null;
      const minUserDate = userMinRow?.minCreatedAt
        ? new Date(userMinRow.minCreatedAt)
        : null;
      if (minEventDate && minUserDate) {
        startAt =
          minEventDate.getTime() <= minUserDate.getTime() ? minEventDate : minUserDate;
      } else if (minEventDate) {
        startAt = minEventDate;
      } else if (minUserDate) {
        startAt = minUserDate;
      } else {
        startAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
    } else {
      const days = daysByRange[rangeKey];
      startAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    const previousStartAt =
      rangeKey === 'all'
        ? null
        : new Date(startAt.getTime() - (now.getTime() - startAt.getTime()));

    const analyticsSince = previousStartAt ?? startAt;

    const trackedEventNames = [
      'landing_viewed',
      'landing_page_view',
      'compatibility_analysis_started',
      'role_analysis_started',
      'analysis_started',
      'compatibility_analysis_completed',
      'role_analysis_completed',
      'analysis_completed',
      'resume_upload_completed',
      'sample_role_clicked',
      'hero_example_chip_clicked',
    ] as const;

    const rawEvents = await this.analyticsEventRepository
      .createQueryBuilder('event')
      .select('event.sessionId', 'sessionId')
      .addSelect('event.userId', 'userId')
      .addSelect('event.eventName', 'eventName')
      .addSelect('event.createdAt', 'createdAt')
      .addSelect('event.properties', 'properties')
      .where('event.createdAt >= :since', { since: analyticsSince })
      .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
      .andWhere('event.eventName IN (:...eventNames)', {
        eventNames: trackedEventNames,
      })
      .getRawMany<{
        sessionId: string;
        userId: string | null;
        eventName: string;
        createdAt: Date | string;
        properties: Record<string, unknown> | string | null;
      }>();

    const normalizedEvents: FounderEventRow[] = [];
    for (const row of rawEvents) {
      const sessionId = row.sessionId?.trim();
      if (!sessionId) continue;

      const createdAtMs =
        row.createdAt instanceof Date
          ? row.createdAt.getTime()
          : new Date(row.createdAt).getTime();
      if (!Number.isFinite(createdAtMs)) continue;

      let analysisNumber: number | null = null;
      if (row.properties && typeof row.properties === 'object') {
        const maybeAnalysisNumber = toFiniteNumber(
          (row.properties as Record<string, unknown>).analysisNumber,
        );
        analysisNumber = maybeAnalysisNumber !== null ? Math.floor(maybeAnalysisNumber) : null;
      } else if (typeof row.properties === 'string') {
        try {
          const parsed = JSON.parse(row.properties) as Record<string, unknown>;
          const maybeAnalysisNumber = toFiniteNumber(parsed.analysisNumber);
          analysisNumber = maybeAnalysisNumber !== null ? Math.floor(maybeAnalysisNumber) : null;
        } catch {
          analysisNumber = null;
        }
      }

      normalizedEvents.push({
        sessionId,
        userId: row.userId?.trim() || null,
        eventName: row.eventName,
        createdAtMs,
        analysisNumber,
      });
    }

    const rawUsers = await this.usersRepository
      .createQueryBuilder('user')
      .select('user.createdAt', 'createdAt')
      .where('user.createdAt >= :since', { since: analyticsSince })
      .andWhere(includeSynthetic ? '1=1' : 'user.isSynthetic = false')
      .getRawMany<{ createdAt: Date | string }>();

    const userCreatedAtMs = rawUsers
      .map((row) =>
        row.createdAt instanceof Date
          ? row.createdAt.getTime()
          : new Date(row.createdAt).getTime(),
      )
      .filter((value) => Number.isFinite(value));

    const currentMetrics = this.computeFounderWindowMetrics(
      normalizedEvents,
      userCreatedAtMs,
      startAt.getTime(),
      now.getTime(),
    );

    const previousMetrics =
      previousStartAt !== null
        ? this.computeFounderWindowMetrics(
            normalizedEvents,
            userCreatedAtMs,
            previousStartAt.getTime(),
            startAt.getTime(),
          )
        : null;

    const granularity: 'day' | 'week' = rangeKey === 'all' ? 'week' : 'day';
    const trendWindows = this.buildTrendWindows(
      startAt.getTime(),
      now.getTime(),
      granularity,
    );

    const volumeTrend = trendWindows.map((window) => {
      const metrics = this.computeFounderWindowMetrics(
        normalizedEvents,
        userCreatedAtMs,
        window.startMs,
        window.endMs,
      );
      return {
        bucketStart: new Date(window.startMs).toISOString(),
        bucketLabel: window.label,
        visitors: metrics.visitors,
        analysesStarted: metrics.analysesStarted,
        analysesCompleted: metrics.analysesCompleted,
        accountsCreated: metrics.accountsCreated,
      };
    });

    const conversionTrend = trendWindows.map((window) => {
      const metrics = this.computeFounderWindowMetrics(
        normalizedEvents,
        userCreatedAtMs,
        window.startMs,
        window.endMs,
      );
      return {
        bucketStart: new Date(window.startMs).toISOString(),
        bucketLabel: window.label,
        visitorToAnalysisConversion: metrics.visitorToAnalysisConversion,
        analysisCompletionRate: metrics.analysisCompletionRate,
        resultToAccountConversion: metrics.resultToAccountConversion,
        secondAnalysisRate: metrics.secondAnalysisRate,
      };
    });

    const funnel: FounderFunnelStage[] = [
      {
        label: 'Visitors',
        count: currentMetrics.visitors,
        conversionFromPrevious: null,
      },
      {
        label: 'Analyses Started',
        count: currentMetrics.analysesStarted,
        conversionFromPrevious: currentMetrics.visitorToAnalysisConversion,
      },
      {
        label: 'Analyses Completed',
        count: currentMetrics.analysesCompleted,
        conversionFromPrevious: currentMetrics.analysisCompletionRate,
      },
      {
        label: 'Accounts Created',
        count: currentMetrics.accountsCreated,
        conversionFromPrevious: currentMetrics.resultToAccountConversion,
      },
    ];

    return {
      range: {
        key: rangeKey,
        days: rangeKey === 'all' ? null : daysByRange[rangeKey],
        granularity,
        startAt: startAt.toISOString(),
        endAt: now.toISOString(),
      },
      lastUpdatedAt: now.toISOString(),
      funnel,
      metrics: {
        visitorToAnalysisConversion: currentMetrics.visitorToAnalysisConversion,
        analysisCompletionRate: currentMetrics.analysisCompletionRate,
        resultToAccountConversion: currentMetrics.resultToAccountConversion,
        secondAnalysisRate: currentMetrics.secondAnalysisRate,
        visitors: currentMetrics.visitors,
        analysesStarted: currentMetrics.analysesStarted,
        analysesCompleted: currentMetrics.analysesCompleted,
        accountsCreated: currentMetrics.accountsCreated,
        usersWithAtLeastOneAnalysis: currentMetrics.usersWithAtLeastOneAnalysis,
        usersWithTwoOrMoreAnalyses: currentMetrics.usersWithTwoOrMoreAnalyses,
        averageAnalysesPerActiveUser: currentMetrics.averageAnalysesPerActiveUser,
      },
      previousPeriod:
        previousMetrics === null
          ? null
          : {
              visitorToAnalysisConversion: previousMetrics.visitorToAnalysisConversion,
              analysisCompletionRate: previousMetrics.analysisCompletionRate,
              resultToAccountConversion: previousMetrics.resultToAccountConversion,
              secondAnalysisRate: previousMetrics.secondAnalysisRate,
              visitors: previousMetrics.visitors,
              analysesStarted: previousMetrics.analysesStarted,
              analysesCompleted: previousMetrics.analysesCompleted,
              accountsCreated: previousMetrics.accountsCreated,
            },
      trends: {
        volume: volumeTrend,
        conversion: conversionTrend,
      },
      supportingSignals: {
        resumeUploadRate: currentMetrics.resumeUploadRate,
        resumeUploads: currentMetrics.resumeUploads,
        sampleRoleUsage: currentMetrics.sampleRoleUsage,
        averageTimeToFirstAnalysisSeconds:
          currentMetrics.averageTimeToFirstAnalysisSeconds,
      },
    };
  }

  private computeFounderWindowMetrics(
    events: FounderEventRow[],
    userCreatedAtMs: number[],
    startMs: number,
    endMs: number,
  ): FounderWindowMetrics {
    const landingEventNames = new Set(['landing_viewed', 'landing_page_view']);
    const analysisStartedEventNames = new Set([
      'compatibility_analysis_started',
      'role_analysis_started',
      'analysis_started',
    ]);
    const analysisCompletedEventNames = new Set([
      'compatibility_analysis_completed',
      'role_analysis_completed',
      'analysis_completed',
    ]);

    const visitorSessions = new Set<string>();
    const analysisStartedSessions = new Set<string>();
    const analysisCompletedSessions = new Set<string>();
    const resumeUploadSessions = new Set<string>();
    const analysisCountByActor = new Map<string, number>();

    const firstLandingAtBySession = new Map<string, number>();
    const firstAnalysisStartAtBySession = new Map<string, number>();
    let sampleRoleUsage = 0;

    for (const row of events) {
      if (row.createdAtMs < startMs || row.createdAtMs >= endMs) {
        continue;
      }
      if (landingEventNames.has(row.eventName)) {
        visitorSessions.add(row.sessionId);
        const previous = firstLandingAtBySession.get(row.sessionId);
        if (previous === undefined || row.createdAtMs < previous) {
          firstLandingAtBySession.set(row.sessionId, row.createdAtMs);
        }
      }
      if (analysisStartedEventNames.has(row.eventName)) {
        analysisStartedSessions.add(row.sessionId);
        const previous = firstAnalysisStartAtBySession.get(row.sessionId);
        if (previous === undefined || row.createdAtMs < previous) {
          firstAnalysisStartAtBySession.set(row.sessionId, row.createdAtMs);
        }
        const actorId = row.userId || row.sessionId;
        analysisCountByActor.set(actorId, (analysisCountByActor.get(actorId) ?? 0) + 1);
      }
      if (analysisCompletedEventNames.has(row.eventName)) {
        analysisCompletedSessions.add(row.sessionId);
      }
      if (row.eventName === 'resume_upload_completed') {
        resumeUploadSessions.add(row.sessionId);
      }
      if (
        row.eventName === 'sample_role_clicked' ||
        row.eventName === 'hero_example_chip_clicked'
      ) {
        sampleRoleUsage += 1;
      }
      if (
        row.eventName === 'compatibility_analysis_started' &&
        (row.analysisNumber ?? 0) > 1
      ) {
        sampleRoleUsage += 1;
      }
    }

    let totalTimeToFirstAnalysisSeconds = 0;
    let sessionsWithTiming = 0;
    for (const [sessionId, landingMs] of firstLandingAtBySession.entries()) {
      const analysisMs = firstAnalysisStartAtBySession.get(sessionId);
      if (analysisMs === undefined || analysisMs < landingMs) {
        continue;
      }
      totalTimeToFirstAnalysisSeconds += (analysisMs - landingMs) / 1000;
      sessionsWithTiming += 1;
    }

    const accountsCreated = userCreatedAtMs.filter(
      (value) => value >= startMs && value < endMs,
    ).length;
    const visitors = visitorSessions.size;
    const analysesStarted = analysisStartedSessions.size;
    const analysesCompleted = analysisCompletedSessions.size;
    const resumeUploads = resumeUploadSessions.size;
    const usersWithAtLeastOneAnalysis = analysisCountByActor.size;
    const usersWithTwoOrMoreAnalyses = Array.from(
      analysisCountByActor.values(),
    ).filter((count) => count >= 2).length;

    const visitorToAnalysisConversion = toRate(analysesStarted, visitors);
    const analysisCompletionRate = toRate(analysesCompleted, analysesStarted);
    const resultToAccountConversion = toRate(accountsCreated, analysesCompleted);
    const resumeUploadRate = toRate(resumeUploads, analysesStarted);
    const secondAnalysisRate = toRate(
      usersWithTwoOrMoreAnalyses,
      usersWithAtLeastOneAnalysis,
    );
    const averageAnalysesPerActiveUser =
      usersWithAtLeastOneAnalysis > 0
        ? Array.from(analysisCountByActor.values()).reduce(
            (sum, count) => sum + count,
            0,
          ) / usersWithAtLeastOneAnalysis
        : 0;

    return {
      visitors,
      analysesStarted,
      analysesCompleted,
      accountsCreated,
      resumeUploads,
      sampleRoleUsage,
      averageTimeToFirstAnalysisSeconds:
        sessionsWithTiming > 0
          ? totalTimeToFirstAnalysisSeconds / sessionsWithTiming
          : 0,
      resumeUploadRate,
      usersWithAtLeastOneAnalysis,
      usersWithTwoOrMoreAnalyses,
      visitorToAnalysisConversion,
      analysisCompletionRate,
      resultToAccountConversion,
      secondAnalysisRate,
      averageAnalysesPerActiveUser,
    };
  }

  private buildTrendWindows(
    startMs: number,
    endMs: number,
    granularity: 'day' | 'week',
  ): Array<{ startMs: number; endMs: number; label: string }> {
    const windows: Array<{ startMs: number; endMs: number; label: string }> = [];
    const stepMs = granularity === 'day'
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    let cursor = startMs;
    while (cursor < endMs) {
      const next = Math.min(endMs, cursor + stepMs);
      const date = new Date(cursor);
      const label =
        granularity === 'day'
          ? date.toISOString().slice(5, 10)
          : `${date.toISOString().slice(5, 10)} wk`;
      windows.push({ startMs: cursor, endMs: next, label });
      cursor = next;
    }

    return windows;
  }

  private roundProductSignalRate(value: number | string | null): number | null {
    if (value === null) {
      return null;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return Math.round(numeric * 1000) / 1000;
  }

  private resolveCreatedAt(value?: string): Date | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('createdAt must be a valid ISO timestamp');
    }
    return date;
  }

  private normalizeProperties(
    eventName: string,
    input?: Record<string, unknown>,
  ): Record<string, unknown> {
    const properties: Record<string, unknown> = { ...(input ?? {}) };

    if (eventName === 'scroll_depth_reached') {
      const depth = toFiniteNumber(properties.depthPercent);
      if (depth === null) {
        throw new BadRequestException(
          'scroll_depth_reached requires numeric depthPercent',
        );
      }
      const rounded = Math.round(depth);
      if (!ANALYTICS_SCROLL_DEPTHS.includes(rounded as 25 | 50 | 75 | 100)) {
        throw new BadRequestException(
          'depthPercent must be one of 25, 50, 75, or 100',
        );
      }
      properties.depthPercent = rounded;
    }

    if (
      eventName === 'resume_upload_initiated' ||
      eventName === 'resume_upload_completed' ||
      eventName === 'job_description_focused'
    ) {
      const source = normalizeAllowedString(properties.source, ['landing', 'unknown']);
      if (!source) {
        throw new BadRequestException(
          `${eventName} requires source: landing|unknown`,
        );
      }
      properties.source = source;
    }

    if (eventName === 'role_analysis_started' || eventName === 'compatibility_analysis_started') {
      const source = normalizeAllowedString(properties.source, [
        'landing',
        'app',
        'unknown',
      ]);
      if (!source) {
        throw new BadRequestException(
          `${eventName} requires source: landing|app|unknown`,
        );
      }
      properties.source = source;
      if (eventName === 'compatibility_analysis_started') {
        const analysisNumber = toFiniteNumber(properties.analysisNumber);
        if (analysisNumber === null || analysisNumber < 1) {
          throw new BadRequestException(
            'compatibility_analysis_started requires numeric analysisNumber >= 1',
          );
        }
        properties.analysisNumber = Math.floor(analysisNumber);
      }
    }

    if (eventName === 'compatibility_analysis_completed') {
      const source = normalizeAllowedString(properties.source, [
        'landing',
        'unknown',
      ]);
      if (!source) {
        throw new BadRequestException(
          'compatibility_analysis_completed requires source: landing|unknown',
        );
      }
      properties.source = source;
    }

    if (eventName === 'role_analysis_completed') {
      const source = normalizeAllowedString(properties.source, [
        'results',
        'unknown',
      ]);
      if (!source) {
        throw new BadRequestException(
          'role_analysis_completed requires source: results|unknown',
        );
      }
      properties.source = source;
    }

    if (eventName === 'opportunity_saved') {
      const source = normalizeAllowedString(properties.source, [
        'results',
        'workspace',
        'unknown',
      ]);
      if (!source) {
        throw new BadRequestException(
          'opportunity_saved requires source: results|workspace|unknown',
        );
      }
      properties.source = source;
    }

    if (eventName === 'resume_studio_opened') {
      const entrySource = normalizeAllowedString(properties.entrySource, [
        'results',
        'nav',
        'direct',
        'unknown',
      ]);
      if (!entrySource) {
        throw new BadRequestException(
          'resume_studio_opened requires entrySource: results|nav|direct|unknown',
        );
      }
      properties.entrySource = entrySource;
    }

    const score = toFiniteNumber(properties.score);
    const bucket = normalizeScoreBucket(properties.scoreBucket);
    if (score !== null && !bucket) {
      properties.scoreBucket = resolveScoreBucket(score);
    }

    return properties;
  }
}

