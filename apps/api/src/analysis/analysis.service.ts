// apps/api/src/analysis/analysis.service.ts
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineSchema, BaselineSchemaCoreShape } from '../baseline/baseline-schema';
import { ComplianceService } from '../compliance/compliance.service';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceFlagSeverity,
  ComplianceDebugTrace,
} from '../compliance/compliance.types';
import {
  getInsufficientExtractedTextDetails,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
} from '../compliance/extracted-text.utils';
import { Interview } from '../interviews/interview.entity';
import { RecommendedAddition } from '../interviews/interview-types';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import {
  sanitizeLinkedInJobText,
  shouldApplyLinkedInSanitizer,
} from '../jobs/linkedin-sanitize';
import { CalibrationWeights, User } from '../users/user.entity';
import { ExpandedFitAssessment } from './expanded-fit-assessment.entity';
import {
  FitAssessment,
  FitAssessmentVerdict,
  FitDimensionScores,
} from './fit-assessment.entity';
import type { RunFitAssessmentDto } from './dto/run-fit-assessment.dto';
import type { RunExpandedFitAssessmentDto } from './dto/run-expanded-fit-assessment.dto';
import { CalibrationDto } from './dto/calibration.dto';
import {
  DimensionWeightOverrides,
  FitScoringService,
} from './fit-scoring.service';
import {
  scoreCxFitV2,
  computeConfidenceScore,
} from './cx-fit-scoring-v2';
import { buildResultsNarrative } from './results-narrative.builder';
import { selectBaselineTextForScoring } from './baseline-selection';
import type {
  BaselineCoverageDetails,
  CxFitV2Result,
  FitScoreDebugBundle,
} from './cx-fit-scoring-v2';

import {
  DEFAULT_LEGACY_CALIBRATION_WEIGHTS,
  isCalibrationWeights,
  isLegacyCalibrationWeights,
  mapLegacyToCalibrationWeights,
  type LegacyCalibrationWeights,
} from './calibration-weights';

import { countWords, getCharCount, sha256 } from '../common/text-metrics';
import { buildJobPromptText, normalizeText } from '../scoring/fit-score/fit-score.utils';
import { evaluateToolCoverage } from '../scoring/fit-score/tool-extractor';
import type { FitScoreInput } from '../scoring/fit-score/fit-score.types';
import type { FitScoreVerdictLabel } from '../scoring/fit-score/fit-verdict';
import type { FitScoreRubricJson } from './prompts/fit-score-rubric.v1';
import { normalizeJobDescription } from './job-normalizer';
import {
  CriticalGap,
  GapAnalysisResult,
  GapAnalysisService,
} from './gap-analysis.service';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';
import { applySyntheticMetadata } from '../synthetic/synthetic-metadata.util';

export type AnalysisRequest = {
  baselineId: string;
  jobId?: string;
  jobDescription?: string;
  debugCompliance?: boolean;
  debugMatching?: boolean;
};

export type AnalysisResult = {
  ok: boolean;
  baselineId: string;
  score: number;
  strengths: string[];
  gaps: string[];
  summary: string;
  compliance_flags?: Array<{ code: string; message?: string }>;
  compliance_debug?: ComplianceDebugTrace;
  audit_id?: string | null;
  auditId?: string | null;
  baseline_version_hash?: string | null;
};

type FitScoreJobInput = {
  id?: string;
  raw_jd_text?: string;
  raw_jd?: string;
  parsed_jd?: {
    responsibilities?: string[];
    requirements?: string[];
  };
};

export type DebugSource = 'header' | 'query' | 'body' | 'none';

export type FitScoreRequest = {
  job?: FitScoreJobInput;
  baseline_version_id?: string;
  debug?: boolean;
  debugCompliance?: boolean;
  debugSource?: DebugSource;
  selected_block_ids?: string[];
};

export type JobTextSource =
  | 'raw'
  | 'raw+normalized'
  | 'normalized_fallback'
  | 'normalized';

export type JobTextInput = {
  rawDescription?: string | null;
  normalizedResponsibilities?: string[] | null;
  normalizedRequirements?: string[] | null;
};

export type JobTextForScoring = {
  jobText: string;
  jobTextSource: JobTextSource;
  jobRawTextCharCount: number;
  jobRawTextSha256: string;
  jobRawTextTooShort: boolean;
  jobRawTextWarning?: string;
};

const RAW_TEXT_WARNING_THRESHOLD = 3000;
const BASELINE_INVALID_MESSAGE =
  'Baseline content is missing in this environment. Please re upload or select a valid baseline.';

export function buildJobTextForScoring(job: JobTextInput): JobTextForScoring {
  const rawDescription = (job.rawDescription ?? '').trim();
  const normalizedResponsibilities = (
    job.normalizedResponsibilities ?? []
  ).filter(Boolean);
  const normalizedRequirements = (job.normalizedRequirements ?? []).filter(
    Boolean,
  );
  const normalizedText = [
    ...normalizedResponsibilities,
    ...normalizedRequirements,
  ].join('\n');
  const jobPrompt = buildJobPromptText({
    rawDescription,
    normalizedResponsibilities,
    normalizedRequirements,
  });

  const hasRaw = rawDescription.length > 0;
  const hasNormalized = Boolean(
    normalizedResponsibilities.length || normalizedRequirements.length,
  );

  if (!hasRaw && !hasNormalized) {
    throw new BadRequestException(
      'Job description text is required for scoring.',
    );
  }

  const jobTextSource: JobTextSource = hasRaw ? 'raw' : 'normalized_fallback';
  const jobText = hasRaw ? rawDescription : jobPrompt.text || normalizedText;

  const jobRawTextCharCount = getCharCount(rawDescription);
  const jobRawTextSha256 = sha256(rawDescription);
  const jobRawTextTooShort =
    jobRawTextCharCount > 0 && jobRawTextCharCount < RAW_TEXT_WARNING_THRESHOLD;
  const jobRawTextWarning = jobRawTextTooShort
    ? `Raw job description is only ${jobRawTextCharCount.toLocaleString()} characters (<${RAW_TEXT_WARNING_THRESHOLD.toLocaleString()}); scoring may be less reliable.`
    : undefined;

  return {
    jobText,
    jobTextSource,
    jobRawTextCharCount,
    jobRawTextSha256,
    jobRawTextTooShort,
    jobRawTextWarning,
  };
}

type ScoringProofSnapshot = {
  assessmentId: string | null;
  baselineTextCharsScored: number;
  jobTextCharsScored: number;
  truncationAppliedBaseline: boolean;
  truncationAppliedJob: boolean;
  normalizedResponsibilitiesCount: number;
  normalizedRequirementsCount: number;
  jobRawTextCharCount: number;
  jobRawTextSha256: string;
  jobRawTextTooShort: boolean;
  jobRawTextWarning?: string | null;
  jobTextSource: JobTextSource;
};

type CompatibilityRunDebugPayload = {
  baselineId: string;
  baselineVersionHash: string | null;
  baselineSelectedSectionCount: number;
  baselineTotalChars: number;
  jobId: string | null;
  jobRawChars: number;
  normalizedResponsibilitiesCount: number;
  normalizedResponsibilitiesChars: number;
  normalizedRequirementsCount: number;
  normalizedRequirementsChars: number;
  dimensionScores: FitDimensionScores;
  totalScore: number;
  jobRawTextCharCount: number;
  jobRawTextSha256: string;
  jobRawTextTooShort: boolean;
  jobRawTextWarning?: string | null;
  jobTextSource: JobTextSource;
  jobNormalization?: {
    headingsDetected: string[];
    bulletsDetected: number;
    fallbackSentenceSplitUsed: boolean;
  };
  jobSanitization?: {
    applied: boolean;
    removedMarkers: string[];
  };
};

type FitScoreResponse = {
  fit_score: number;
  overall_score: number;
  verdict: FitScoreVerdictLabel | FitScoreRubricJson['verdict'];
  breakdown: {
    experience_alignment: number;
    leadership_level: number;
    technical_platform_fit: number;
    industry_context: number;
    strategic_vs_tactical: number;
  };
  strengths?: string[];
  gaps?: string[];
  criticalGaps?: CriticalGap[];
  recommendedActions?: string[];
  compliance_flags?: Array<{ code: string; message?: string }>;
  audit_id?: string | null;
  auditId?: string | null;
  assessmentId?: string;
  jobId?: string;
  baselineId?: string;
  baselineVersion?: number | null;
  createdAt?: Date;
  score?: number;
  overallScore?: number;
  dimensionScores?: FitAssessment['dimensionScores'];
  complianceFlags?: FitAssessment['complianceFlags'];
  compliance_debug?: ComplianceDebugTrace;
  summary?: string;
  fit_score_debug?: FitScoreDebugBundle;
  debug?: CompatibilityRunDebugPayload;
  scoringProof?: ScoringProofSnapshot;
  baseline_version_hash?: string | null;
  confidenceScore?: number;
  confidenceReasons?: string[];

  scoring_v2?: CxFitV2Result;
  verification_coverage?: {
    totalClaims: number;
    verifiedClaims: number;
    inferredClaims: number;
    unverifiedClaims: number;
    unverifiedRequirements: string[];
  };
  status?: 'ok' | 'compliance_blocked' | 'error';
};

type ScoreBreakdownDimension = {
  key:
    | 'role_scope_and_seniority'
    | 'support_operations_and_process_rigor'
    | 'tooling_and_platform_experience'
    | 'domain_and_business_context'
    | 'change_leadership_and_customer_advocacy';
  label: string;
  score: number;
  weight: number;
};

type ScoreBreakdown = {
  total_score: number;
  dimensions: ScoreBreakdownDimension[];
};

type RunFitAssessmentOkResponse = FitScoreResponse & {
  status: 'ok';
};

/**
 * IMPORTANT CHANGE:
 * Even when compliance blocks, we still return the computed score and breakdown.
 * Blocked means "cannot proceed to generation", not "cannot see the score".
 */
type RunFitAssessmentComplianceBlockedResponse = {
  status: 'compliance_blocked';
  fit_score: number;
  score: number;
  overall_score: number;
  overallScore: number;
  verdict: 'blocked';
  breakdown: {
    experience_alignment: number;
    leadership_level: number;
    technical_platform_fit: number;
    industry_context: number;
    strategic_vs_tactical: number;
  };
  dimensionScores?: FitAssessment['dimensionScores'];
  strengths?: string[];
  gaps?: string[];
  criticalGaps?: CriticalGap[];
  recommendedActions?: string[];
  scoring_v2?: CxFitV2Result;
  scoringProof?: ScoringProofSnapshot;
  debug?: CompatibilityRunDebugPayload;
  summary?: string;
  fit_score_debug?: FitScoreDebugBundle;
  compliance: {
    blocked: true;
    flags: ComplianceFlag[];
    message: string;
  };
  complianceFlags?: ComplianceFlag[];
  compliance_debug?: ComplianceDebugTrace;
  compliance_flags?: Array<{ code: string; message?: string }>;
  audit_id?: string | null;
  auditId?: string | null;
  baseline_version_hash?: string | null;
  confidenceScore?: number;
  confidenceReasons?: string[];
  assessmentId?: string;
  jobId?: string;
  baselineId?: string;
  baselineVersion?: number | null;
  createdAt?: Date;
};

export type RunAssessmentResult =
  | RunFitAssessmentOkResponse
  | RunFitAssessmentComplianceBlockedResponse;

type RunFitAssessmentPayload = RunFitAssessmentDto & {
  job?: { id?: string; jobId?: string };
  job_id?: string;
  baseline_id?: string;
  baseline_version_id?: number | string;
  debugCompliance?: boolean;
  debugMatching?: boolean;
};

@Injectable()
export class AnalysisService {
  constructor(
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(ExpandedFitAssessment)
    private readonly expandedFitAssessmentRepository: Repository<ExpandedFitAssessment>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly fitScoringService: FitScoringService,
    private readonly complianceService: ComplianceService,
    private readonly gapAnalysisService: GapAnalysisService,
  ) {}

  private readonly logger = new Logger(AnalysisService.name);
  private readonly shortTextWarningKeys = new Set<string>();
  private shortTextWarningRequestCounter = 0;

  private nextShortTextWarningRequestRunId() {
    return this.shortTextWarningRequestCounter++;
  }

  private buildShortTextWarningKey(jobKey: string, runId: number) {
    return `${jobKey}:${runId}`;
  }

  private logShortTextWarningOnce(key: string, message: string) {
    if (this.shortTextWarningKeys.has(key)) return;
    this.shortTextWarningKeys.add(key);
    this.logger.debug(message);
  }

  private clearShortTextWarningKey(key: string) {
    this.shortTextWarningKeys.delete(key);
  }

  private readonly defaultCalibration = {
    profileName: 'default',
    weights: mapLegacyToCalibrationWeights(DEFAULT_LEGACY_CALIBRATION_WEIGHTS),
  };

  private clampPercent(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private normalizeCanonicalClaimStatus(
    status: unknown,
  ): 'VERIFIED' | 'INFERRED' | 'UNVERIFIED' | null {
    if (typeof status !== 'string') return null;
    const normalized = status.trim().toUpperCase();
    if (normalized === 'VERIFIED') return 'VERIFIED';
    if (
      normalized === 'INFERRED' ||
      normalized === 'EQUIVALENT' ||
      normalized === 'ADJACENT'
    ) {
      return 'INFERRED';
    }
    if (normalized === 'UNVERIFIED') return 'UNVERIFIED';
    return null;
  }

  private normalizeCanonicalClaimLabel(claim: Record<string, unknown>): string | null {
    const candidates = [
      claim.label,
      claim.name,
      claim.requirement,
      claim.claim,
      claim.key,
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }

  private normalizeCanonicalClaimStatusFromEntry(
    claim: Record<string, unknown>,
  ): 'VERIFIED' | 'INFERRED' | 'UNVERIFIED' | null {
    const candidates = [claim.status, claim.claimStatus, claim.verificationStatus];
    for (const value of candidates) {
      const normalized = this.normalizeCanonicalClaimStatus(value);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  private buildVerificationCoverageFromCanonicalClaims(
    claims: unknown[],
  ): {
    totalClaims: number;
    verifiedClaims: number;
    inferredClaims: number;
    unverifiedClaims: number;
    unverifiedRequirements: string[];
  } {
    const normalizedClaims = (Array.isArray(claims) ? claims : [])
      .map((claim) => {
        if (!claim || typeof claim !== 'object') return null;
        const typed = claim as Record<string, unknown>;
        const mappedStatus = this.normalizeCanonicalClaimStatusFromEntry(typed);
        if (!mappedStatus) return null;
        const rawLabel = this.normalizeCanonicalClaimLabel(typed);
        if (!rawLabel) return null;
        return {
          label: rawLabel,
          status: mappedStatus,
        };
      })
      .filter(
        (claim): claim is { label: string; status: 'VERIFIED' | 'INFERRED' | 'UNVERIFIED' } =>
          Boolean(claim),
      );

    const verifiedClaims = normalizedClaims.filter(
      (claim) => claim.status === 'VERIFIED',
    ).length;
    const inferredClaims = normalizedClaims.filter(
      (claim) => claim.status === 'INFERRED',
    ).length;
    const unverifiedRequirements = normalizedClaims
      .filter((claim) => claim.status === 'UNVERIFIED')
      .map((claim) => claim.label);

    const normalizedStatuses = normalizedClaims.map((claim) => claim.status);
    const hasVerifiedStatus = normalizedStatuses.includes('VERIFIED');
    if (hasVerifiedStatus && verifiedClaims === 0) {
      this.logger.warn(
        'Canonical claim coverage invariant mismatch: VERIFIED claim present but verifiedClaims computed as zero.',
      );
    }

    return {
      totalClaims: normalizedClaims.length,
      verifiedClaims,
      inferredClaims,
      unverifiedClaims: unverifiedRequirements.length,
      unverifiedRequirements,
    };
  }

  private readonly scoreBreakdownMeta: Array<{
    key: ScoreBreakdownDimension['key'];
    label: ScoreBreakdownDimension['label'];
    weight: number;
  }> = [
    {
      key: 'role_scope_and_seniority',
      label: 'Role Scope and Seniority',
      weight: 25,
    },
    {
      key: 'support_operations_and_process_rigor',
      label: 'Support Operations and Process Rigor',
      weight: 25,
    },
    {
      key: 'tooling_and_platform_experience',
      label: 'Tooling and Platform Experience',
      weight: 20,
    },
    {
      key: 'domain_and_business_context',
      label: 'Domain and Business Context',
      weight: 15,
    },
    {
      key: 'change_leadership_and_customer_advocacy',
      label: 'Change Leadership and Customer Advocacy',
      weight: 15,
    },
  ];

  private roundToTenth(value: number) {
    return Math.round(value * 10) / 10;
  }

  private buildScoreBreakdown(assessment: FitAssessment): ScoreBreakdown {
    const dimensionPoints = assessment.scoringV2?.rubric?.dimensionPoints;
    if (dimensionPoints) {
      const dimensions = this.scoreBreakdownMeta.map((entry) => {
        const raw = dimensionPoints[entry.key];
        const score = this.roundToTenth(typeof raw === 'number' ? raw : 0);
        return {
          key: entry.key,
          label: entry.label,
          score: Math.max(0, Math.min(entry.weight, score)),
          weight: entry.weight,
        };
      });
      const total_score = this.roundToTenth(
        dimensions.reduce((sum, dimension) => sum + dimension.score, 0),
      );
      return { total_score, dimensions };
    }

    const legacyPercents = {
      role_scope_and_seniority:
        assessment.dimensionScores?.experienceAlignment ?? 0,
      support_operations_and_process_rigor:
        assessment.dimensionScores?.leadershipLevel ?? 0,
      tooling_and_platform_experience:
        assessment.dimensionScores?.technicalPlatformFit ?? 0,
      domain_and_business_context:
        assessment.dimensionScores?.industryContext ?? 0,
      change_leadership_and_customer_advocacy:
        assessment.dimensionScores?.strategicTacticalFit ?? 0,
    };

    const dimensions = this.scoreBreakdownMeta.map((entry) => {
      const percent = legacyPercents[entry.key];
      const score = this.roundToTenth((Math.max(0, Math.min(100, percent)) / 100) * entry.weight);
      return {
        key: entry.key,
        label: entry.label,
        score,
        weight: entry.weight,
      };
    });

    const total_score = this.roundToTenth(
      dimensions.reduce((sum, dimension) => sum + dimension.score, 0),
    );
    return { total_score, dimensions };
  }

  private leadershipLevelFromBandDelta(bandDelta: number) {
    const absoluteGap = Math.abs(bandDelta);
    const raw = 100 - Math.min(100, absoluteGap * 15);
    return this.clampPercent(raw);
  }

  private mapCxFitV2ToLegacyDimensionScores(
    cxFit: CxFitV2Result,
  ): FitDimensionScores {
    return {
      experienceAlignment: this.clampPercent(
        cxFit.rubric.dimensionPercents.role_scope_and_seniority,
      ),
      leadershipLevel: this.leadershipLevelFromBandDelta(cxFit.debug.bandDelta),
      technicalPlatformFit: this.clampPercent(
        cxFit.rubric.dimensionPercents.tooling_and_platform_experience,
      ),
      industryContext: this.clampPercent(
        cxFit.rubric.dimensionPercents.domain_and_business_context,
      ),
      strategicTacticalFit: this.clampPercent(
        cxFit.rubric.dimensionPercents.change_leadership_and_customer_advocacy,
      ),
    };
  }

  private deriveFitAssessmentVerdictFromScore(score: number) {
    if (score >= 85) return FitAssessmentVerdict.APPLY;
    if (score >= 70) return FitAssessmentVerdict.CONSIDER;
    return FitAssessmentVerdict.SKIP;
  }

  private deriveFitScoreVerdictLabelFromScore(score: number) {
    if (score >= 85) return 'Apply';
    if (score >= 70) return 'Consider';
    return 'Skip';
  }

  private mapAssessmentDimensionPercents(
    assessment: FitAssessment,
  ): Record<string, number> {
    const fromV2 = assessment.scoringV2?.rubric?.dimensionPercents;
    if (fromV2) {
      return {
        role_scope_and_seniority: fromV2.role_scope_and_seniority ?? 0,
        support_operations_and_process_rigor:
          fromV2.support_operations_and_process_rigor ?? 0,
        tooling_and_platform_experience:
          fromV2.tooling_and_platform_experience ?? 0,
        domain_and_business_context: fromV2.domain_and_business_context ?? 0,
        change_leadership_and_customer_advocacy:
          fromV2.change_leadership_and_customer_advocacy ?? 0,
      };
    }

    return {
      role_scope_and_seniority: assessment.dimensionScores?.experienceAlignment ?? 0,
      support_operations_and_process_rigor:
        assessment.dimensionScores?.leadershipLevel ?? 0,
      tooling_and_platform_experience:
        assessment.dimensionScores?.technicalPlatformFit ?? 0,
      domain_and_business_context: assessment.dimensionScores?.industryContext ?? 0,
      change_leadership_and_customer_advocacy:
        assessment.dimensionScores?.strategicTacticalFit ?? 0,
    };
  }

  private async buildGapInsightsForAssessment(
    assessment: FitAssessment,
  ): Promise<GapAnalysisResult> {
    const job = await this.jobRepository.findOne({
      where: { id: assessment.jobId, userId: assessment.userId },
    });

    if (!job) {
      return {
        strengths: assessment.strengths ?? [],
        criticalGaps: (assessment.gaps ?? []).map((gap, index) => ({
          gapId: `legacy_gap_${index + 1}`,
          title: gap,
          description: `Coverage is limited for ${gap}.`,
          severityScore: 0.5,
          requirementEvidence: gap,
          baselineEvidence: null,
          reasoning: 'Derived from previously stored fit assessment gap output.',
        })),
        recommendedActions: [],
        positioningSuggestions: [],
        interviewRisks: [],
      };
    }

    const baselineSections = await this.baselineSectionRepository.find({
      where: { baselineId: assessment.baselineId },
      order: { order: 'ASC' },
    });

    const allowedSections = baselineSections.filter(
      (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
    );

    return this.gapAnalysisService.analyze({
      baselineSections: allowedSections.map((section) => ({
        content: section.content ?? '',
      })),
      jobRequirements: job.normalizedRequirements ?? [],
      jobResponsibilities: job.normalizedResponsibilities ?? [],
      dimensionPercents: this.mapAssessmentDimensionPercents(assessment),
      debugMatching: false,
    });
  }

  private normalizeKeywords(text: string) {
    const tokens =
      text
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((token) => token.length >= 3) ?? [];

    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }

    return frequencies;
  }

  private sortByFrequency(values: Map<string, number>, items: string[]) {
    return [...items].sort((a, b) => {
      const delta = (values.get(b) ?? 0) - (values.get(a) ?? 0);
      if (delta !== 0) return delta;
      return a.localeCompare(b);
    });
  }

  private normalizeSelectedBlockIds(ids?: string[] | null): string[] | undefined {
    if (!ids) {
      return undefined;
    }
    const normalized = ids
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0);
    return normalized.length ? normalized : undefined;
  }

  private async ensureBaselineHasContent(baselineId: string) {
    const stats = await this.baselineSectionRepository
      .createQueryBuilder('section')
      .select('COUNT(section.id)', 'sectionCount')
      .addSelect("SUM(LENGTH(COALESCE(section.content, '')))", 'totalChars')
      .where('section."baselineId" = :baselineId', { baselineId })
      .getRawOne<{ sectionCount?: string; totalChars?: string | null }>();

    const sectionCount = Number(stats?.sectionCount ?? 0);
    const totalChars = Number(stats?.totalChars ?? 0);

    if (
      sectionCount === 0 ||
      !Number.isFinite(totalChars) ||
      totalChars < 500
    ) {
      throw new BadRequestException({
        status: 'baseline_invalid',
        code: 'BASELINE_EMPTY',
        message: BASELINE_INVALID_MESSAGE,
        error: {
          code: 'BASELINE_EMPTY',
          message: BASELINE_INVALID_MESSAGE,
        },
      });
    }
  }

  private buildBaselineText(sections: BaselineSection[]) {
    return sections
      .filter(
        (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
      )
      .map((section) => section.content)
      .join('\n');
  }

  private buildSummaryFromTerms(strengths: string[], gaps: string[]) {
    if (!strengths.length && !gaps.length) {
      return 'No keywords found in the job description.';
    }
    const total = strengths.length + gaps.length;
    return `Matched ${strengths.length} of ${total} key terms from the job description.`;
  }

  private buildCanonicalJobInputs(jobProps: {
    rawDescription?: string | null;
    normalizedResponsibilities?: string[] | null;
    normalizedRequirements?: string[] | null;
  }) {
    const rawDescription = (jobProps.rawDescription ?? '').trim();
    const providedResponsibilities = (jobProps.normalizedResponsibilities ?? [])
      .map((entry) => entry?.trim() ?? '')
      .filter(Boolean);
    const providedRequirements = (jobProps.normalizedRequirements ?? [])
      .map((entry) => entry?.trim() ?? '')
      .filter(Boolean);

    const shouldParse =
      rawDescription.length > 0 &&
      (!providedResponsibilities.length || !providedRequirements.length);
    const parsedSegments = shouldParse
      ? normalizeJobDescription(rawDescription)
      : null;
    const normalizedResponsibilities =
      providedResponsibilities.length || !shouldParse
        ? providedResponsibilities
        : parsedSegments?.normalized.responsibilities ?? [];
    const normalizedRequirements =
      providedRequirements.length || !shouldParse
        ? providedRequirements
        : parsedSegments?.normalized.requirements ?? [];

    return {
      rawDescription,
      normalizedResponsibilities,
      normalizedRequirements,
      jobNormalization: parsedSegments?.debug,
    };
  }

  private buildCanonicalJobAssets(jobProps: {
    rawDescription?: string | null;
    normalizedResponsibilities?: string[] | null;
    normalizedRequirements?: string[] | null;
    title?: string | null;
    company?: string | null;
    sourceUrl?: string | null;
  }) {
    const canonicalInputs = this.buildCanonicalJobInputs(jobProps);
    const jobTextForScoring = buildJobTextForScoring({
      rawDescription: canonicalInputs.rawDescription,
      normalizedResponsibilities: canonicalInputs.normalizedResponsibilities,
      normalizedRequirements: canonicalInputs.normalizedRequirements,
    });

    const canonicalJobForHash: FitScoreInput['job'] = {
      rawDescription: canonicalInputs.rawDescription,
      normalizedResponsibilities: canonicalInputs.normalizedResponsibilities,
      normalizedRequirements: canonicalInputs.normalizedRequirements,
      title: jobProps.title ?? null,
      company: jobProps.company ?? null,
    };

    const canonicalJobForScoring: FitScoreInput['job'] = {
      ...canonicalJobForHash,
      sourceUrl: jobProps.sourceUrl ?? null,
      jobTextOverride: jobTextForScoring.jobText,
    };

    return {
      canonicalJobForScoring,
      canonicalJobForHash,
      jobTextForScoring,
    };
  }

  private getIncludedSections(
    sections: BaselineSection[] | undefined,
    selectedBlockIds?: string[] | null,
  ) {
    return (sections ?? []).filter((section) => {
      if (section.includePolicy === BaselineIncludePolicy.NEVER) {
        return false;
      }
      if (selectedBlockIds && !selectedBlockIds.includes(section.id)) {
        return false;
      }
      return true;
    });
  }

  private buildBaselineCoverageDetails(
    baseline: Baseline,
    sectionPayload: Array<{ type?: string; content: string }>,
    selectedSectionIds?: string[] | null,
    coverageSource?: string,
    originalBaselineChars?: number,
  ): BaselineCoverageDetails {
    const availableBaselineText = (baseline.sections ?? [])
      .map((section) => section.content ?? '')
      .join('\n');
    const includedBaselineText = sectionPayload
      .map((section) => section.content ?? '')
      .join('\n');
    const normalizedBaselineChars = getCharCount(
      normalizeText(includedBaselineText),
    );
    const selectedSectionGateActive = Boolean(selectedSectionIds?.length);
    const selectedSectionCount = selectedSectionGateActive
      ? selectedSectionIds!.length
      : 0;
    const source =
      coverageSource ??
      (selectedSectionGateActive
        ? 'selectedBaselineSections'
        : 'baselineVersion.canonicalSections');
    const originalChars =
      typeof originalBaselineChars === 'number'
        ? originalBaselineChars
        : getCharCount(availableBaselineText);

    return {
      originalBaselineChars: originalChars,
      includedBaselineChars: getCharCount(includedBaselineText),
      coverageFormula: 'includedBaselineChars / originalBaselineChars',
      source,
      selectedSectionGateActive,
      selectedSectionCount,
      normalizedBaselineChars,
    };
  }

  private applyBaselineCoverageDetails(
    scoringV2: CxFitV2Result,
    baseline: Baseline,
    sectionPayload: Array<{ type?: string; content: string }>,
    selectedSectionIds?: string[] | null,
    coverageSource?: string,
    originalBaselineChars?: number,
  ) {
    const coverageDetails = this.buildBaselineCoverageDetails(
      baseline,
      sectionPayload,
      selectedSectionIds,
      coverageSource,
      originalBaselineChars,
    );
    scoringV2.debug.baselineCoverageDetails = coverageDetails;
    if (scoringV2.debug.bundle) {
      scoringV2.debug.bundle.inputs.normalizedBaseline.coverageDetails =
        coverageDetails;
    }
  }

  private buildSectionPayload(sections: BaselineSection[]) {
    return sections.map((section) => ({
      type: section.sectionType ?? section.type,
      content: section.content ?? '',
    }));
  }

  private buildCanonicalSectionPayload(
    canonical: BaselineSchemaCoreShape,
  ): Array<{ type?: string; content: string }> {
    const sections: Array<{ type?: string; content: string }> = [];

    const identityParts = [
      canonical.identity.full_name?.trim(),
      canonical.identity.current_title?.trim(),
      canonical.identity.current_company?.trim(),
      canonical.identity.location?.trim(),
    ].filter((part): part is string => Boolean(part));

    if (identityParts.length) {
      sections.push({
        type: BaselineSectionType.SUMMARY,
        content: identityParts.join(' | '),
      });
    }

    for (const entry of canonical.experience) {
      const lines: string[] = [];
      if (entry.company_name?.trim()) {
        lines.push(entry.company_name.trim());
      }
      if (entry.role_title?.trim()) {
        lines.push(entry.role_title.trim());
      }
      const dateRangeParts: string[] = [];
      if (entry.start_date) {
        dateRangeParts.push(entry.start_date);
      }
      if (entry.end_date) {
        dateRangeParts.push(entry.end_date);
      }
      if (dateRangeParts.length) {
        lines.push(dateRangeParts.join(' to '));
      }
      if (entry.scope_summary?.trim()) {
        lines.push(entry.scope_summary.trim());
      }
      if (entry.details_text?.trim()) {
        lines.push('');
        lines.push(entry.details_text.trim());
      }

      const content = lines.join('\n').trim();
      if (content) {
        sections.push({
          type: BaselineSectionType.EXPERIENCE,
          content,
        });
      }
    }

    const skillLines: string[] = [];
    if (canonical.skills_and_tools.tools.length) {
      skillLines.push(`Tools: ${canonical.skills_and_tools.tools.join(', ')}`);
    }
    if (canonical.skills_and_tools.methodologies.length) {
      skillLines.push(
        `Methodologies: ${canonical.skills_and_tools.methodologies.join(', ')}`,
      );
    }
    if (canonical.skills_and_tools.domains.length) {
      skillLines.push(`Domains: ${canonical.skills_and_tools.domains.join(', ')}`);
    }

    if (skillLines.length) {
      sections.push({
        type: BaselineSectionType.SKILLS,
        content: skillLines.join('\n'),
      });
    }

    return sections;
  }

  private getCanonicalBaselineForScoring(
    baseline: Baseline,
  ): BaselineSchemaCoreShape {
    const records = baseline.parsedRecords ?? [];
    const latest = records
      .slice()
      .sort(
        (a, b) =>
          (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      )[0];

    if (!latest) {
      throw new BadRequestException({
        error: {
          code: 'baseline_canonical_missing',
          message:
            'Baseline is missing canonical data. Please re-ingest the baseline document before scoring.',
        },
      });
    }

    try {
      const canonical = BaselineSchema.parse(latest.parsedJson);
      return canonical;
    } catch (error) {
      this.logger.warn(
        `Canonical baseline validation failed for ${baseline.id}: ${error}`,
      );
      throw new BadRequestException({
        error: {
          code: 'baseline_canonical_invalid',
          message:
            'Baseline canonical data is invalid. Please re-ingest the baseline document before scoring.',
        },
      });
    }
  }

  private buildInputsHash(
    job: FitScoreInput['job'],
    baseline: Baseline,
    sections: Array<{ type?: string; content: string }>,
    dimensionWeights: DimensionWeightOverrides,
  ) {
    const payload = {
      job: {
        rawDescription: job.rawDescription,
        normalizedResponsibilities: job.normalizedResponsibilities,
        normalizedRequirements: job.normalizedRequirements,
        title: job.title ?? null,
        company: job.company ?? null,
      },
      baseline: {
        id: baseline.id,
        version: baseline.version ?? null,
        sections,
      },
      calibration: dimensionWeights,
    };

    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async loadBaselineWithSections(userId: string, baselineId: string) {
    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections', 'parsedRecords'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId: baseline.id },
        order: { order: 'ASC' },
      });
    }

    return baseline;
  }

  private async fetchJobForUser(jobId: string, userId: string) {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, userId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  private async computeExpectedInputsHashForJobBaseline(
    userId: string,
    job: Job,
    baseline: Baseline,
  ) {
      const canonicalBaseline = this.getCanonicalBaselineForScoring(baseline);
    const canonicalSections = this.buildCanonicalSectionPayload(
      canonicalBaseline,
    );
    const calibration = await this.getCalibration(userId);
    const dimensionWeights = this.mapCalibrationToDimensionWeights(
      calibration.weights,
    );
    const { canonicalJobForHash } = this.buildCanonicalJobAssets({
      rawDescription: job.rawDescription,
      normalizedResponsibilities: job.normalizedResponsibilities ?? [],
      normalizedRequirements: job.normalizedRequirements ?? [],
      title: job.title ?? null,
      company: job.company ?? null,
      sourceUrl: job.sourceUrl ?? null,
    });
    const baselineForHash: Baseline = {
      ...baseline,
      version: baseline.version ?? 0,
    };
    return this.buildInputsHash(
      canonicalJobForHash,
      baselineForHash,
      canonicalSections,
      dimensionWeights,
    );
  }

  private async runAndPersistFitAssessment(
    userId: string,
    jobId: string,
    baselineId: string,
    baselineVersion?: number,
  ) {
    const payload: RunFitAssessmentDto = { jobId, baselineId };
    if (baselineVersion !== undefined) {
      payload.baselineVersion = baselineVersion;
    }

    const result = await this.runFitAssessment(userId, payload);
    if (result.status !== 'ok') {
      return result;
    }

    if (!result.assessmentId) {
      throw new InternalServerErrorException(
        'Fit assessment run succeeded but assessmentId is missing',
      );
    }

    return this.getFitAssessmentById(userId, result.assessmentId, {
      skipFreshRecompute: true,
    });
  }

  private buildCompatibilityDebugPayload({
    baselineId,
    baselineVersionHash,
    baselineSelectedSectionCount,
    baselineTotalChars,
    jobId,
    jobRawChars,
    normalizedResponsibilitiesCount,
    normalizedResponsibilitiesChars,
    normalizedRequirementsCount,
    normalizedRequirementsChars,
    dimensionScores,
    totalScore,
    jobRawTextCharCount,
    jobRawTextSha256,
    jobRawTextTooShort,
    jobRawTextWarning,
    jobTextSource,
    jobNormalization,
    jobSanitization,
  }: {
    baselineId: string;
    baselineVersionHash: string | null;
    baselineSelectedSectionCount: number;
    baselineTotalChars: number;
    jobId: string | null;
    jobRawChars: number;
    normalizedResponsibilitiesCount: number;
    normalizedResponsibilitiesChars: number;
    normalizedRequirementsCount: number;
    normalizedRequirementsChars: number;
    dimensionScores: FitDimensionScores;
    totalScore: number;
    jobRawTextCharCount: number;
    jobRawTextSha256: string;
    jobRawTextTooShort: boolean;
    jobRawTextWarning?: string | null;
    jobTextSource: JobTextSource;
    jobNormalization?: CompatibilityRunDebugPayload['jobNormalization'];
    jobSanitization?: CompatibilityRunDebugPayload['jobSanitization'];
  }): CompatibilityRunDebugPayload {
    return {
      baselineId,
      baselineVersionHash,
      baselineSelectedSectionCount,
      baselineTotalChars,
      jobId,
      jobRawChars,
      normalizedResponsibilitiesCount,
      normalizedResponsibilitiesChars,
      normalizedRequirementsCount,
      normalizedRequirementsChars,
      dimensionScores,
      totalScore,
      jobRawTextCharCount,
      jobRawTextSha256,
      jobRawTextTooShort,
      jobRawTextWarning,
      jobTextSource,
      jobNormalization,
      jobSanitization,
    };
  }

  private buildJobSanitizationDebug(job?: {
    rawDescription?: string | null;
    sourceUrl?: string | null;
  }) {
    if (!job) return undefined;
    const shouldSanitize = shouldApplyLinkedInSanitizer({
      sourceUrl: job.sourceUrl,
      rawText: job.rawDescription ?? '',
    });
    if (!shouldSanitize) {
      return undefined;
    }
    const sanitized = sanitizeLinkedInJobText(job.rawDescription ?? '');
    return {
      applied: true,
      removedMarkers: sanitized.removed,
    };
  }

  private buildNormalizedSegmentStats(segments: string[]) {
    const text = segments.join('\n');
    return {
      count: segments.length,
      chars: getCharCount(text),
    };
  }

  private coerceComplianceFlags(flags?: ComplianceFlag[] | string[] | null) {
    if (!flags?.length) return undefined;
    return flags.map((flag) => {
      if (typeof flag === 'string') {
        return { code: flag, message: flag };
      }
      return { code: flag.code, message: flag.message };
    });
  }

  private mapComplianceStringsToFlags(
    flags?: string[] | null,
  ): ComplianceFlag[] | undefined {
    if (!flags?.length) return undefined;
    return flags.map((flag) => ({
      code: flag as any,
      message: flag,
      severity: ComplianceFlagSeverity.BLOCK,
    }));
  }

  private normalizeAdditions(
    additions?: (string | RecommendedAddition)[] | null,
  ) {
    if (!additions?.length) return [];
    return additions
      .map((entry) => (typeof entry === 'string' ? entry : entry?.text)?.trim())
      .filter((entry): entry is string => Boolean(entry));
  }

  private assertJobInput(job?: FitScoreJobInput) {
    const rawText = job?.raw_jd_text ?? job?.raw_jd;
    const hasRaw = Boolean(rawText?.trim());
    const parsed = job?.parsed_jd;
    const hasParsed = Boolean(
      parsed &&
        ((parsed.responsibilities && parsed.responsibilities.length > 0) ||
          (parsed.requirements && parsed.requirements.length > 0)),
    );
    const hasId = Boolean(job?.id?.trim());
    const providedCount = Number(hasRaw) + Number(hasParsed);

    if (hasId && providedCount > 0) {
      throw new BadRequestException({
        error: {
          code: 'JD_INPUT_AMBIGUOUS',
          message: 'Provide either job.id or JD content, not both.',
        },
      });
    }

    if (!hasId && providedCount === 0) {
      throw new BadRequestException({
        error: {
          code: 'JD_INPUT_MISSING',
          message:
            'Provide exactly one of raw_jd_text (or raw_jd) or parsed_jd.',
        },
      });
    }

    if (providedCount > 1) {
      throw new BadRequestException({
        error: {
          code: 'JD_INPUT_AMBIGUOUS',
          message:
            'Provide exactly one of raw_jd_text (or raw_jd) or parsed_jd.',
        },
      });
    }
  }

  async getCalibration(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profileName =
      user.calibrationProfileName ?? this.defaultCalibration.profileName;
    const weights =
      user.calibrationWeights ??
      ({ ...this.defaultCalibration.weights } as CalibrationWeights);

    return { ok: true, profileName, weights };
  }

  async saveCalibration(userId: string, payload: CalibrationDto) {
    const profileName = payload.profileName?.trim();

    if (!profileName) {
      throw new BadRequestException('profileName is required');
    }

    if (!payload.weights) {
      throw new BadRequestException('weights are required');
    }

    const { legacy: legacyWeights, normalized: normalizedWeights } =
      this.normalizeIncomingWeights(payload.weights);

    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.calibrationProfileName = profileName;
    user.calibrationWeights = normalizedWeights;

    await this.usersRepository.save(user);

    const baseResponse = {
      ok: true,
      profileName,
      weights: legacyWeights,
    };

    const assessmentId = payload.assessmentId?.trim();
    if (!assessmentId) {
      return baseResponse;
    }

    const calibrated = await this.calibrateAssessment(
      userId,
      assessmentId,
      legacyWeights,
      profileName,
    );

    return {
      ...baseResponse,
      ...calibrated,
    };
  }

  private normalizeIncomingWeights(
    weights: LegacyCalibrationWeights | CalibrationWeights,
  ) {
    let legacy: LegacyCalibrationWeights;

    if (isLegacyCalibrationWeights(weights)) {
      legacy = weights;
    } else if (isCalibrationWeights(weights)) {
      legacy = {
        experienceAlignment: weights.dimensionA,
        leadershipLevel: weights.dimensionC,
        technicalPlatformFit: weights.dimensionB,
        industryContext: weights.dimensionE,
        strategicTacticalFit: weights.dimensionD,
      };
    } else {
      throw new BadRequestException(
        'weights must include the five calibration dimensions',
      );
    }

    this.ensurePositiveLegacyWeights(legacy);

    return {
      legacy,
      normalized: mapLegacyToCalibrationWeights(legacy),
    };
  }

  private ensurePositiveLegacyWeights(weights: LegacyCalibrationWeights) {
    (Object.entries(weights) as [keyof LegacyCalibrationWeights, number][]).forEach(
      ([key, value]) => {
        if (!Number.isFinite(value) || value <= 0) {
          throw new BadRequestException(
            'weights must be finite numbers greater than 0',
          );
        }
      },
    );
  }

  private computeCalibratedScore(
    dimensionScores: FitDimensionScores | null | undefined,
    weights: LegacyCalibrationWeights,
    baselineScore?: number | null,
  ) {
    const experienceAlignment = dimensionScores?.experienceAlignment ?? 0;
    const leadershipLevel = dimensionScores?.leadershipLevel ?? 0;
    const technicalPlatformFit = dimensionScores?.technicalPlatformFit ?? 0;
    const industryContext = dimensionScores?.industryContext ?? 0;
    const strategicTacticalFit = dimensionScores?.strategicTacticalFit ?? 0;

    const totalWeight =
      weights.experienceAlignment +
      weights.leadershipLevel +
      weights.technicalPlatformFit +
      weights.industryContext +
      weights.strategicTacticalFit;

    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      return { overallScore: 0, delta: 0 };
    }

    const weightedSum =
      experienceAlignment * weights.experienceAlignment +
      leadershipLevel * weights.leadershipLevel +
      technicalPlatformFit * weights.technicalPlatformFit +
      industryContext * weights.industryContext +
      strategicTacticalFit * weights.strategicTacticalFit;

    const rawScore = weightedSum / totalWeight;
    const clampedScore = Math.min(100, Math.max(0, rawScore));
    const roundedScore = Math.round(clampedScore * 10) / 10;
    const baseline = typeof baselineScore === 'number' ? baselineScore : 0;
    let delta = Math.round((roundedScore - baseline) * 10) / 10;
    if (Object.is(delta, -0)) {
      delta = 0;
    }

    return { overallScore: roundedScore, delta };
  }

  private formatProfileLabel(profileName: string) {
    return profileName
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map(
        (segment) =>
          `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}`,
      )
      .join(' ');
  }

  async calibrateAssessment(
    userId: string,
    assessmentId: string,
    legacyWeights: LegacyCalibrationWeights,
    profileName: string,
  ) {
    const assessment = await this.fitAssessmentRepository.findOne({
      where: { id: assessmentId, userId },
    });

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    const payload = await this.buildLatestAssessmentPayload(assessment);
    const calibrated = this.computeCalibratedScore(
      assessment.dimensionScores,
      legacyWeights,
      assessment.overallScore,
    );

    return {
      ...payload,
      overallScore: calibrated.overallScore,
      score: calibrated.overallScore,
      calibration: {
        profile: profileName,
        label: this.formatProfileLabel(profileName),
        delta: calibrated.delta,
      },
    };
  }

  private buildJobPayloadFromParsed(job: FitScoreJobInput) {
    const parsed = job.parsed_jd ?? {};
    const responsibilities = parsed.responsibilities ?? [];
    const requirements = parsed.requirements ?? [];
    const synthesizedRaw = [...responsibilities, ...requirements]
      .join('\n')
      .trim();

    return {
      title: null,
      company: null,
      rawDescription: job.raw_jd_text ?? job.raw_jd ?? synthesizedRaw,
      normalizedResponsibilities: responsibilities,
      normalizedRequirements: requirements,
      sourceUrl: null,
    };
  }

  private mapCalibrationToDimensionWeights(
    weights?: CalibrationWeights | null,
  ) {
    return {
      experienceAlignment: weights?.dimensionA ?? 1,
      technicalPlatformFit: weights?.dimensionB ?? 1,
      leadershipLevel: weights?.dimensionC ?? 1,
      strategicTacticalFit: weights?.dimensionD ?? 1,
      industryContext: weights?.dimensionE ?? 1,
    } satisfies DimensionWeightOverrides;
  }

  private applyPoliciesToSections(
    sections: BaselineSection[],
    policies: BaselineBlockPolicy[],
  ) {
    if (!policies.length) {
      return [...sections].sort((a, b) => a.order - b.order);
    }

    const policyMap = new Map<string, BaselineBlockPolicy>(
      policies.map((policy) => [policy.baselineSectionId, policy]),
    );

    return [...sections]
      .map((section) => {
        const policy = policyMap.get(section.id);
        return {
          ...section,
          includePolicy: policy?.includePolicy ?? section.includePolicy,
          order: policy?.order ?? section.order,
          sectionType: section.sectionType ?? section.type,
        } as BaselineSection;
      })
      .sort((a, b) => a.order - b.order);
  }

  private async loadBaselineForVersion(
    userId: string,
    baselineVersionId?: string,
  ) {
    if (!baselineVersionId?.trim()) {
      throw new BadRequestException('baseline_version_id is required');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId },
      relations: ['baseline', 'baseline.parsedRecords'],
    });

    if (!baselineVersion || !baselineVersion.baseline) {
      throw new NotFoundException('Baseline version not found');
    }

    if (baselineVersion.baseline.userId !== userId) {
      throw new NotFoundException('Baseline version not found');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineVersion.baselineId, userId },
      relations: ['sections', 'parsedRecords'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const policies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: baselineVersion.id },
      relations: ['baselineSection'],
      order: { order: 'ASC' },
    });

    baseline.sections = this.applyPoliciesToSections(
      baseline.sections ?? [],
      policies,
    );

    const additionSections =
      (baselineVersion.verifiedAdditions ?? []).map((content, index) => {
        const section: Partial<BaselineSection> = {
          id: `addition-${index}`,
          baselineId: baseline.id,
          sectionType: BaselineSectionType.OTHER,
          title: 'Verified addition',
          content,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: (baseline.sections?.length ?? 0) + index,
        };
        return section as BaselineSection;
      }) ?? [];

    baseline.sections = [...(baseline.sections ?? []), ...additionSections];

    await this.ensureBaselineHasContent(baseline.id);

    return { baseline, baselineVersion };
  }

  async scoreCompatibility(
    userId: string,
    payload: FitScoreRequest,
  ): Promise<FitScoreResponse> {
    this.assertJobInput(payload.job);

    const { baseline, baselineVersion } = await this.loadBaselineForVersion(
      userId,
      payload.baseline_version_id,
    );

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId: baseline.id },
        order: { order: 'ASC' },
      });
    }

    const normalizedSelectedBlockIds = this.normalizeSelectedBlockIds(
      payload.selected_block_ids,
    );
    const canonicalBaseline = this.getCanonicalBaselineForScoring(baseline);
    const canonicalSections = this.buildCanonicalSectionPayload(
      canonicalBaseline,
    );
    const baselineSelection = selectBaselineTextForScoring({
      baseline,
      normalizedSelectedBlockIds,
      canonicalSections,
    });
    const sectionPayload = baselineSelection.sectionsForScoring;

    const complianceBaselineSections =
      this.complianceService.normalizeSectionsForOutput(sectionPayload);

    const baselineTextCharsScored = baselineSelection.includedBaselineChars;
    const baselineExtractedTextChars = baselineSelection.includedBaselineChars;

    const calibration = await this.getCalibration(userId);
    const dimensionWeights = this.mapCalibrationToDimensionWeights(
      calibration.weights,
    );

    const jobInput = payload.job ?? {};
    const jobId = jobInput.id?.trim();
    const baselineVersionHash = baseline.hash ?? null;
    const allowDebug = Boolean(payload.debug);

    let job: Job | null = null;
    let jobPayload: {
      title: string | null;
      company: string | null;
      rawDescription: string;
      normalizedResponsibilities: string[];
      normalizedRequirements: string[];
      sourceUrl: string | null;
    };

    if (jobId) {
      job = await this.jobRepository.findOne({
        where: { id: jobId, userId },
      });

      if (!job) {
        throw new NotFoundException('Job not found');
      }

      jobPayload = {
        title: job.title ?? null,
        company: job.company ?? null,
        rawDescription: job.rawDescription,
        normalizedResponsibilities: job.normalizedResponsibilities ?? [],
        normalizedRequirements: job.normalizedRequirements ?? [],
        sourceUrl: job.sourceUrl ?? null,
      };
    } else {
      const rawText = jobInput.raw_jd_text ?? jobInput.raw_jd;
      const hasParsed = jobInput.parsed_jd !== undefined;
      jobPayload = hasParsed
        ? this.buildJobPayloadFromParsed(jobInput)
        : {
            title: null,
            company: null,
            rawDescription: rawText ?? '',
            normalizedResponsibilities: [],
            normalizedRequirements: [],
            sourceUrl: null,
          };
    }

    const jobKey = job?.id ?? jobId ?? 'ad-hoc';
    const requestRunId = this.nextShortTextWarningRequestRunId();
    const shortTextWarningKey = this.buildShortTextWarningKey(jobKey, requestRunId);
    try {
      const { canonicalJobForScoring, canonicalJobForHash, jobTextForScoring } =
        this.buildCanonicalJobAssets(jobPayload);

    const jobText = jobTextForScoring.jobText;
    const {
      normalized: normalizedJob,
      debug: jobNormDebug,
    } = normalizeJobDescription(jobText);
    const normalizedJobResponsibilities = normalizedJob.responsibilities;
    const normalizedJobRequirements = normalizedJob.requirements;
    const jobTextSource: JobTextSource =
      normalizedJob.meta.source === 'normalized' ? 'normalized' : 'raw';
    const normalizedJobDescription = this.complianceService.normalizeText(
      canonicalJobForHash.rawDescription,
    );

    if (jobTextForScoring.jobRawTextTooShort) {
      const warningMessage = `Raw job description for job ${jobKey} is only ${jobTextForScoring.jobRawTextCharCount} characters (<${RAW_TEXT_WARNING_THRESHOLD.toLocaleString()}).`;
      this.logShortTextWarningOnce(shortTextWarningKey, warningMessage);
    }

    const chosenText = jobText;
    const chosenTextChars = getCharCount(chosenText);

    const baselineForHash: Baseline = {
      ...baseline,
      version: baselineVersion.versionNumber ?? baseline.version,
    };
    const inputsHash = this.buildInputsHash(
      canonicalJobForHash,
      baselineForHash,
      sectionPayload,
      dimensionWeights,
    );

      const scoringV2 = scoreCxFitV2(
        {
          job: {
            rawDescription: canonicalJobForHash.rawDescription,
            normalizedResponsibilities: normalizedJobResponsibilities,
            normalizedRequirements: normalizedJobRequirements,
          },
          normalizedJobResponsibilities,
          normalizedJobRequirements,
          baselineSections: sectionPayload,
          metadata: {
            jobId: job?.id ?? jobId ?? undefined,
            baselineId: baseline.id,
            baselineVersionId:
              baselineVersion.versionNumber ?? baseline.version ?? null,
          },
          jobTitle: jobPayload.title ?? undefined,
        },
        { debugBundle: allowDebug },
      );

      if (
        !scoringV2 ||
        !scoringV2.rubric ||
        !scoringV2.rubric.dimensionPercents ||
        typeof scoringV2.score !== 'number' ||
        !scoringV2.debug
      ) {
        throw new InternalServerErrorException(
          'CX Fit v2 scoring produced incomplete results',
        );
      }

      this.applyBaselineCoverageDetails(
        scoringV2,
        baseline,
        sectionPayload,
        baselineSelection.selectedSectionIds,
        baselineSelection.source,
        baselineSelection.originalBaselineChars,
      );

      const confidenceResult = computeConfidenceScore(scoringV2.debug);

    const legacyDimensionScores =
      this.mapCxFitV2ToLegacyDimensionScores(scoringV2);
    const responseVerdict =
      this.deriveFitScoreVerdictLabelFromScore(scoringV2.score);
    const persistenceVerdict =
      this.deriveFitAssessmentVerdictFromScore(scoringV2.score);

    const scoring =
      allowDebug
        ? await this.fitScoringService.score(
            {
              job: canonicalJobForScoring,
              baseline: {
                version:
                  baselineVersion.versionNumber ?? baseline.version ?? null,
                sections: sectionPayload,
              },
            },
            dimensionWeights,
            { debug: allowDebug },
          )
        : undefined;

    const gapInsights = this.gapAnalysisService.analyze({
      baselineSections: sectionPayload,
      jobRequirements: normalizedJobRequirements,
      jobResponsibilities: normalizedJobResponsibilities,
      dimensionPercents: scoringV2.rubric.dimensionPercents,
      debugMatching: false,
    });
    const strengths = gapInsights.strengths;
    const gaps = gapInsights.criticalGaps.map((gap) => gap.title);
    const complianceFlags = scoring?.complianceFlags ?? [];
    const finalScore = scoringV2.score;

    const generatedSectionsForCompliance = normalizedJobDescription
      ? [{ title: 'Job Description', content: normalizedJobDescription }]
      : undefined;

    const compliance = await this.complianceService.validateAndAudit({
      action: ComplianceAction.FIT_SCORE,
      actorId: userId,
      baselineVersion,
      job: job ?? null,
      outputHash: inputsHash,
      baselineSections: complianceBaselineSections,
      generatedSections: generatedSectionsForCompliance,
      debugCompliance: Boolean(payload.debugCompliance),
      extraFlags: scoring
        ? this.mapComplianceStringsToFlags(scoring.complianceFlags)
        : undefined,
    });

    if (compliance.blocked) {
      throw new BadRequestException({
        error: {
          code: 'compliance_blocked',
          message: 'Compliance validation failed.',
          details: { compliance_flags: compliance.complianceFlags },
        },
      });
    }

    let savedAssessment: FitAssessment | null = null;
    if (job) {
      const assessment = this.fitAssessmentRepository.create({
        userId,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion:
          baselineVersion.versionNumber ?? baseline.version ?? null,
        overallScore: finalScore,
        verdict: persistenceVerdict,
        dimensionScores: legacyDimensionScores,
        strengths,
        gaps,
        complianceFlags,
        inputsHash,
        confidenceScore: confidenceResult.confidenceScore,
        confidenceReasons: confidenceResult.confidenceReasons,
      });

      savedAssessment = await this.fitAssessmentRepository.save(assessment);
    }

      const jobNormalizationPayload = {
        headingsDetected: jobNormDebug.headingsDetected.slice(0, 10),
        bulletsDetected: jobNormDebug.bulletsDetected,
        fallbackSentenceSplitUsed: jobNormDebug.fallbackSentenceSplitUsed,
      };
      const jobSanitizationDebug = allowDebug
        ? this.buildJobSanitizationDebug({
            rawDescription: canonicalJobForHash.rawDescription,
            sourceUrl: job?.sourceUrl ?? canonicalJobForScoring.sourceUrl ?? null,
          })
        : undefined;

      const debugInfo: CompatibilityRunDebugPayload | undefined = allowDebug
        ? this.buildCompatibilityDebugPayload({
          baselineId: baseline.id,
          baselineVersionHash,
          baselineSelectedSectionCount: baselineSelection.selectedSectionCount,
          baselineTotalChars: baselineTextCharsScored,
          jobId: job?.id ?? jobId ?? null,
          jobRawChars: jobTextForScoring.jobRawTextCharCount,
          normalizedResponsibilitiesCount: jobNormDebug.responsibilitiesCount,
          normalizedResponsibilitiesChars: jobNormDebug.responsibilitiesChars,
          normalizedRequirementsCount: jobNormDebug.requirementsCount,
          normalizedRequirementsChars: jobNormDebug.requirementsChars,
          dimensionScores: legacyDimensionScores,
          totalScore: finalScore,
          jobRawTextCharCount: jobTextForScoring.jobRawTextCharCount,
          jobRawTextSha256: jobTextForScoring.jobRawTextSha256,
          jobRawTextTooShort: jobTextForScoring.jobRawTextTooShort,
            jobRawTextWarning: jobTextForScoring.jobRawTextWarning,
            jobTextSource,
            jobNormalization: jobNormalizationPayload,
            jobSanitization: jobSanitizationDebug,
          })
        : undefined;

    const fitScoreDebug: FitScoreDebugBundle | undefined = allowDebug
      ? scoringV2.debug?.bundle
      : undefined;

    const breakdown = {
      experience_alignment: legacyDimensionScores.experienceAlignment,
      leadership_level: legacyDimensionScores.leadershipLevel,
      technical_platform_fit: legacyDimensionScores.technicalPlatformFit,
      industry_context: legacyDimensionScores.industryContext,
      strategic_vs_tactical: legacyDimensionScores.strategicTacticalFit,
    };

    const scoringProof: ScoringProofSnapshot = {
      assessmentId: null,
      baselineTextCharsScored: baselineExtractedTextChars,
      jobTextCharsScored: chosenTextChars,
      truncationAppliedBaseline: false,
      truncationAppliedJob: false,
      normalizedResponsibilitiesCount: jobNormDebug.responsibilitiesCount,
      normalizedRequirementsCount: jobNormDebug.requirementsCount,
      jobRawTextCharCount: jobTextForScoring.jobRawTextCharCount,
      jobRawTextSha256: jobTextForScoring.jobRawTextSha256,
      jobRawTextTooShort: jobTextForScoring.jobRawTextTooShort,
      jobRawTextWarning: jobTextForScoring.jobRawTextWarning,
      jobTextSource,
    };

    return {
      status: 'ok',
      fit_score: finalScore,
      overall_score: finalScore,
      verdict: responseVerdict,
      breakdown,
      strengths,
      gaps,
      criticalGaps: gapInsights.criticalGaps,
      recommendedActions: gapInsights.recommendedActions,
      compliance_flags: this.coerceComplianceFlags(compliance.complianceFlags),
      ...(compliance.debugTrace ? { compliance_debug: compliance.debugTrace } : {}),
      audit_id: compliance.audit.id,
      auditId: compliance.audit.id,
      assessmentId: savedAssessment?.id,
      jobId: savedAssessment?.jobId,
      baselineId: savedAssessment?.baselineId,
      baselineVersion: savedAssessment?.baselineVersion,
      createdAt: savedAssessment?.createdAt,
      scoring_v2: scoringV2,
      score: finalScore,
      overallScore: finalScore,
      dimensionScores: legacyDimensionScores,
      complianceFlags,
      summary: scoring?.summary ?? this.buildSummaryFromTerms(strengths, gaps),
      ...(debugInfo ? { debug: debugInfo } : {}),
      ...(fitScoreDebug ? { fit_score_debug: fitScoreDebug } : {}),
      scoringProof,
      confidenceScore: confidenceResult.confidenceScore,
      confidenceReasons: confidenceResult.confidenceReasons,
    };
    } finally {
      this.clearShortTextWarningKey(shortTextWarningKey);
    }
  }

  async analyzeForUser(
    userId: string,
    payload: AnalysisRequest,
  ): Promise<AnalysisResult> {
    const baselineId = payload.baselineId?.trim();
    if (!baselineId) {
      throw new BadRequestException('baselineId is required');
    }

    const hasJobId = Boolean(payload.jobId?.trim());
    const hasJobDescription = Boolean(payload.jobDescription?.trim());

    if (!hasJobId && !hasJobDescription) {
      throw new BadRequestException('jobId or jobDescription is required');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections', 'parsedRecords'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId: baseline.id },
        order: { order: 'ASC' },
      });
    }

    const includedSections =
      baseline.sections?.filter(
        (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
      ) ?? [];

    const complianceBaselineSections =
      this.complianceService.normalizeSectionsForOutput(includedSections);

    const jobId = payload.jobId?.trim();
    const job = jobId
      ? await this.jobRepository.findOne({
          where: { id: jobId, userId },
        })
      : null;

    const jobKey = job?.id ?? jobId ?? baselineId ?? 'ad-hoc';
    const shortTextWarningKey = this.buildShortTextWarningKey(
      jobKey,
      this.nextShortTextWarningRequestRunId(),
    );

    try {
      const jobDescription = job
        ? job.rawDescription
        : payload.jobDescription?.trim();

      if (!jobDescription) {
        throw new NotFoundException('Job not found');
      }

      const normalizedJobDescription =
        this.complianceService.normalizeText(jobDescription);
      const jobRawChars = getCharCount(jobDescription);
      const jobRawTextTooShort = jobRawChars > 0 && jobRawChars < 3000;
      if (jobRawTextTooShort) {
        const warningMessage = `Raw job description for baseline ${baselineId} is only ${jobRawChars} characters (<3,000).`;
        this.logShortTextWarningOnce(shortTextWarningKey, warningMessage);
      }

      const baselineText = this.buildBaselineText(includedSections);
      const insufficientBaselineDetails =
        getInsufficientExtractedTextDetails(baselineText);
      if (insufficientBaselineDetails) {
        const payload = {
          errorCode: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
          code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
          message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
          details: insufficientBaselineDetails,
          error: {
            code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
            message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
            details: insufficientBaselineDetails,
          },
        };
        throw new UnprocessableEntityException(payload);
      }
      const baselineKeywords = this.normalizeKeywords(baselineText);
      const jobKeywords = this.normalizeKeywords(jobDescription);

      const baselineSet = new Set(baselineKeywords.keys());
      const jobSet = new Set(jobKeywords.keys());

      const overlap = [...jobSet].filter((keyword) => baselineSet.has(keyword));
      const gaps = [...jobSet].filter((keyword) => !baselineSet.has(keyword));

      const overlapSorted = this.sortByFrequency(jobKeywords, overlap);
      const gapsSorted = this.sortByFrequency(jobKeywords, gaps);

      const total = jobSet.size;
      const matched = overlap.length;
      const score = total === 0 ? 0 : Math.round((matched / total) * 100);

      const strengths = overlapSorted.slice(0, 8);
      const gapList = gapsSorted.slice(0, 8);

      const summary =
        total === 0
          ? 'No keywords found in the job description.'
          : `Matched ${matched} of ${total} key terms from the job description.`;

      const generatedSectionsForCompliance = normalizedJobDescription
        ? [{ title: 'Job Description', content: normalizedJobDescription }]
        : undefined;

      const outputHash = sha256(
        `${baseline.hash ?? ''}:${normalizedJobDescription}`,
      );

      const compliance = await this.complianceService.validateAndAudit({
        action: ComplianceAction.FIT_SCORE,
        actorId: userId,
        baselineVersion: { hash: baseline.hash } as BaselineVersion,
        job,
        outputHash,
        baselineSections: complianceBaselineSections,
        generatedSections: generatedSectionsForCompliance,
        debugCompliance: Boolean(payload.debugCompliance),
      });

      if (compliance.blocked) {
        throw new BadRequestException({
          error: {
            code: 'compliance_blocked',
            message: 'Compliance validation failed.',
            details: { compliance_flags: compliance.complianceFlags },
          },
        });
      }

      return {
        ok: true,
        baselineId: baseline.id,
        score,
        strengths,
        gaps: gapList,
        summary,
        compliance_flags: this.coerceComplianceFlags(compliance.complianceFlags),
        ...(compliance.debugTrace ? { compliance_debug: compliance.debugTrace } : {}),
        audit_id: compliance.audit.id,
        auditId: compliance.audit.id,
        baseline_version_hash:
          compliance.audit.baselineVersionHash ?? baseline.hash ?? null,
      };
    } finally {
      this.clearShortTextWarningKey(shortTextWarningKey);
    }
  }

  async runFitAssessment(
    userId: string,
    payload: RunFitAssessmentDto,
    syntheticMetadata?: SyntheticMetadataInput,
  ): Promise<RunAssessmentResult> {
    let shortTextWarningKey: string | undefined;
    try {
      const normalizedPayload = payload as RunFitAssessmentPayload;
      const baselineCandidate =
        normalizedPayload.baselineId ?? normalizedPayload.baseline_id;
      const jobCandidate =
        normalizedPayload.jobId ??
        normalizedPayload.job?.id ??
        normalizedPayload.job?.jobId ??
        normalizedPayload.job_id;

      const baselineId = baselineCandidate?.trim();
      const jobId = jobCandidate?.trim();

      const missingFields: string[] = [];
      if (!baselineId) missingFields.push('baselineId');
      if (!jobId) missingFields.push('jobId');
      if (missingFields.length) {
        const message =
          missingFields.length === 1
            ? `${missingFields[0]} is required`
            : `${missingFields.join(' and ')} are required`;
        throw new BadRequestException(message);
      }

      const baselineVersion =
        payload.baselineVersion ??
        (normalizedPayload.baseline_version_id !== undefined
          ? Number(normalizedPayload.baseline_version_id)
          : undefined);

      if (baselineVersion !== undefined) {
        const version = Number(baselineVersion);
        if (!Number.isInteger(version) || version < 1) {
          throw new BadRequestException(
            'baselineVersion must be a positive integer',
          );
        }
      }

      const resolvedBaselineId = baselineId!;
      const resolvedJobId = jobId!;

      const baseline = await this.baselineRepository.findOne({
        where: { id: resolvedBaselineId, userId },
        relations: ['sections', 'parsedRecords'],
        order: { sections: { order: 'ASC' } },
      });

      if (!baseline) {
        throw new NotFoundException('Baseline not found');
      }

      if (!baseline.sections?.length) {
        baseline.sections = await this.baselineSectionRepository.find({
          where: { baselineId: baseline.id },
          order: { order: 'ASC' },
        });
      }
      await this.ensureBaselineHasContent(baseline.id);

      const job = await this.jobRepository.findOne({
        where: { id: resolvedJobId, userId },
      });

      if (!job) {
        throw new NotFoundException('Job not found');
      }

      const jobKey = job.id;
      const requestRunId = this.nextShortTextWarningRequestRunId();
      shortTextWarningKey = this.buildShortTextWarningKey(jobKey, requestRunId);

      const canonicalBaseline = this.getCanonicalBaselineForScoring(baseline);
      const canonicalSections = this.buildCanonicalSectionPayload(
        canonicalBaseline,
      );
      const baselineSelection = selectBaselineTextForScoring({
        baseline,
        canonicalSections,
      });
      const baselineText = baselineSelection.normalizedBaselineText;
      const insufficientBaselineDetails =
        getInsufficientExtractedTextDetails(baselineText);
      if (insufficientBaselineDetails) {
        const payload = {
          errorCode: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
          code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
          message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
          details: insufficientBaselineDetails,
          error: {
            code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
            message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
            details: insufficientBaselineDetails,
          },
        };
        throw new UnprocessableEntityException(payload);
      }
      const sectionPayload = baselineSelection.sectionsForScoring;

      const baselineVersionValue = baselineVersion ?? baseline.version ?? 0;
      const baselineForHash: Baseline = {
        ...baseline,
        sections: baselineSelection.selectedSections,
        version: baselineVersionValue,
      };

      const complianceBaselineSections =
        this.complianceService.normalizeSectionsForOutput(sectionPayload);

      const baselineTextCharsScored = baselineSelection.includedBaselineChars;

      const { canonicalJobForScoring, canonicalJobForHash, jobTextForScoring } =
        this.buildCanonicalJobAssets({
          rawDescription: job.rawDescription,
          normalizedResponsibilities: job.normalizedResponsibilities ?? [],
          normalizedRequirements: job.normalizedRequirements ?? [],
          title: job.title ?? null,
          company: job.company ?? null,
          sourceUrl: job.sourceUrl ?? null,
        });

      const jobText = jobTextForScoring.jobText;
      const {
        normalized: normalizedJob,
        debug: jobNormDebug,
      } = normalizeJobDescription(jobText);
      const normalizedJobResponsibilities = normalizedJob.responsibilities;
      const normalizedJobRequirements = normalizedJob.requirements;
      const jobTextSource: JobTextSource =
        normalizedJob.meta.source === 'normalized' ? 'normalized' : 'raw';
      const normalizedJobDescription = this.complianceService.normalizeText(
        canonicalJobForHash.rawDescription,
      );

      if (jobTextForScoring.jobRawTextTooShort && shortTextWarningKey) {
        const warningMessage = `Raw job description for job ${job.id} is only ${jobTextForScoring.jobRawTextCharCount} characters (<${RAW_TEXT_WARNING_THRESHOLD.toLocaleString()}).`;
        this.logShortTextWarningOnce(shortTextWarningKey, warningMessage);
      }

      const jobTextCharsScored = getCharCount(jobTextForScoring.jobText);

      const calibration = await this.getCalibration(userId);

      const dimensionWeights = this.mapCalibrationToDimensionWeights(
        calibration.weights,
      );
      const inputsHash = this.buildInputsHash(
        canonicalJobForHash,
        baselineForHash,
        sectionPayload,
        dimensionWeights,
      );

      const allowDebug = Boolean(payload.debug);

      const scoringV2 = scoreCxFitV2(
        {
          job: {
            rawDescription: canonicalJobForHash.rawDescription,
            normalizedResponsibilities: normalizedJobResponsibilities,
            normalizedRequirements: normalizedJobRequirements,
          },
          normalizedJobResponsibilities,
          normalizedJobRequirements,
          baselineSections: sectionPayload,
          metadata: {
            jobId: job?.id ?? resolvedJobId ?? null,
            baselineId: baseline.id,
            baselineVersionId: baseline.version ?? null,
          },
          jobTitle: job?.title ?? undefined,
        },
        { debugBundle: allowDebug },
      );

      if (
        !scoringV2 ||
        !scoringV2.rubric ||
        !scoringV2.rubric.dimensionPercents ||
        typeof scoringV2.score !== 'number' ||
        !scoringV2.debug
      ) {
        throw new InternalServerErrorException(
          'CX Fit v2 scoring produced incomplete results',
        );
      }

      this.applyBaselineCoverageDetails(
        scoringV2,
        baseline,
        sectionPayload,
        baselineSelection.selectedSectionIds,
        baselineSelection.source,
        baselineSelection.originalBaselineChars,
      );

      const confidenceResult = computeConfidenceScore(scoringV2.debug);

      const legacyDimensionScores =
        this.mapCxFitV2ToLegacyDimensionScores(scoringV2);
      const responseVerdict =
        this.deriveFitScoreVerdictLabelFromScore(scoringV2.score);
      const persistenceVerdict =
        this.deriveFitAssessmentVerdictFromScore(scoringV2.score);

      const debugScoring =
        allowDebug
          ? await this.fitScoringService.score(
              {
                job: canonicalJobForScoring,
              baseline: {
                version: baseline.version ?? null,
                sections: sectionPayload,
              },
              },
              dimensionWeights,
              { debug: allowDebug },
            )
          : undefined;

      const gapInsights = this.gapAnalysisService.analyze({
        baselineSections: sectionPayload,
        jobRequirements: normalizedJobRequirements,
        jobResponsibilities: normalizedJobResponsibilities,
        dimensionPercents: scoringV2.rubric.dimensionPercents,
        debugMatching: Boolean(
          (normalizedPayload as RunFitAssessmentPayload).debugMatching,
        ),
      });
      const strengths = gapInsights.strengths;
      const gaps = gapInsights.criticalGaps.map((gap) => gap.title);
      const complianceFlags = debugScoring?.complianceFlags ?? [];
      const finalScore = scoringV2.score;

      const breakdown = {
        experience_alignment: legacyDimensionScores.experienceAlignment,
        leadership_level: legacyDimensionScores.leadershipLevel,
        technical_platform_fit: legacyDimensionScores.technicalPlatformFit,
        industry_context: legacyDimensionScores.industryContext,
        strategic_vs_tactical: legacyDimensionScores.strategicTacticalFit,
      };

      const baselineVersionHash = baseline.hash ?? null;
      const jobIdentifier = job?.id ?? resolvedJobId ?? null;

      const jobNormalizationPayload = {
        headingsDetected: jobNormDebug.headingsDetected.slice(0, 10),
        bulletsDetected: jobNormDebug.bulletsDetected,
        fallbackSentenceSplitUsed: jobNormDebug.fallbackSentenceSplitUsed,
      };
      const jobSanitizationDebug = allowDebug
        ? this.buildJobSanitizationDebug({
            rawDescription: canonicalJobForHash.rawDescription,
            sourceUrl: job?.sourceUrl ?? canonicalJobForScoring.sourceUrl ?? null,
          })
        : undefined;

      const debugInfo: CompatibilityRunDebugPayload | undefined = allowDebug
        ? this.buildCompatibilityDebugPayload({
            baselineId: baseline.id,
            baselineVersionHash,
            baselineSelectedSectionCount: baselineSelection.selectedSectionCount,
            baselineTotalChars: baselineTextCharsScored,
            jobId: jobIdentifier,
            jobRawChars: jobTextForScoring.jobRawTextCharCount,
            normalizedResponsibilitiesCount: jobNormDebug.responsibilitiesCount,
            normalizedResponsibilitiesChars: jobNormDebug.responsibilitiesChars,
            normalizedRequirementsCount: jobNormDebug.requirementsCount,
            normalizedRequirementsChars: jobNormDebug.requirementsChars,
            dimensionScores: legacyDimensionScores,
            totalScore: finalScore,
            jobRawTextCharCount: jobTextForScoring.jobRawTextCharCount,
            jobRawTextSha256: jobTextForScoring.jobRawTextSha256,
            jobRawTextTooShort: jobTextForScoring.jobRawTextTooShort,
            jobRawTextWarning: jobTextForScoring.jobRawTextWarning,
            jobTextSource,
            jobNormalization: jobNormalizationPayload,
            jobSanitization: jobSanitizationDebug,
          })
        : undefined;

      const fitScoreDebug: FitScoreDebugBundle | undefined = allowDebug
        ? scoringV2.debug?.bundle
        : undefined;

      const scoringProof: ScoringProofSnapshot = {
        assessmentId: null,
        baselineTextCharsScored: baselineTextCharsScored,
        jobTextCharsScored: jobTextCharsScored,
        truncationAppliedBaseline: false,
        truncationAppliedJob: false,
        normalizedResponsibilitiesCount: jobNormDebug.responsibilitiesCount,
        normalizedRequirementsCount: jobNormDebug.requirementsCount,
        jobRawTextCharCount: jobTextForScoring.jobRawTextCharCount,
        jobRawTextSha256: jobTextForScoring.jobRawTextSha256,
        jobRawTextTooShort: jobTextForScoring.jobRawTextTooShort,
        jobRawTextWarning: jobTextForScoring.jobRawTextWarning,
        jobTextSource,
      };

      const generatedSectionsForCompliance = normalizedJobDescription
        ? [{ title: 'Job Description', content: normalizedJobDescription }]
        : undefined;

      const compliance = await this.complianceService.validateAndAudit({
        action: ComplianceAction.FIT_SCORE,
        actorId: userId,
        baselineVersion: { hash: baseline.hash } as BaselineVersion,
        job,
        outputHash: inputsHash,
        baselineSections: complianceBaselineSections,
        generatedSections: generatedSectionsForCompliance,
        debugCompliance: Boolean(normalizedPayload.debugCompliance),
        extraFlags: debugScoring
          ? this.mapComplianceStringsToFlags(debugScoring.complianceFlags)
          : undefined,
      });

      if (compliance.blocked) {
        const normalizedFlags = (compliance.complianceFlags ?? []).map((flag) =>
          typeof flag === 'string'
            ? {
                code: flag,
                message: flag,
                severity: ComplianceFlagSeverity.BLOCK,
              }
            : flag,
        );

      const blockedResponse: RunFitAssessmentComplianceBlockedResponse = {
        status: 'compliance_blocked',
        fit_score: finalScore,
        score: finalScore,
        overall_score: finalScore,
        overallScore: finalScore,
        verdict: 'blocked',
        breakdown,
        dimensionScores: legacyDimensionScores,
        strengths,
        gaps,
        criticalGaps: gapInsights.criticalGaps,
        recommendedActions: gapInsights.recommendedActions,
        scoring_v2: scoringV2,
        ...(debugInfo ? { debug: debugInfo } : {}),
        ...(fitScoreDebug ? { fit_score_debug: fitScoreDebug } : {}),
        scoringProof,
        summary:
          debugScoring?.summary ??
          this.buildSummaryFromTerms(strengths, gaps),
        confidenceScore: confidenceResult.confidenceScore,
        confidenceReasons: confidenceResult.confidenceReasons,
        ...(compliance.debugTrace ? { compliance_debug: compliance.debugTrace } : {}),
        compliance: {
          blocked: true,
          flags: normalizedFlags,
          message: 'Compliance validation failed.',
          },
          complianceFlags: normalizedFlags,
          compliance_flags: this.coerceComplianceFlags(normalizedFlags),
          audit_id: compliance.audit.id,
          auditId: compliance.audit.id,
          baseline_version_hash:
            compliance.audit.baselineVersionHash ?? baseline.hash ?? null,
          jobId: resolvedJobId,
          baselineId: baseline.id,
          baselineVersion: baselineVersion ?? baseline.version ?? null,
        };

        return blockedResponse;
      }

    const assessment = this.fitAssessmentRepository.create({
      userId,
      jobId: resolvedJobId,
      baselineId: baseline.id,
      baselineVersion: baselineVersion ?? baseline.version ?? null,
      overallScore: finalScore,
      verdict: persistenceVerdict,
      dimensionScores: legacyDimensionScores,
      strengths,
      gaps,
      complianceFlags,
      scoringV2: scoringV2,
      inputsHash,
      confidenceScore: confidenceResult.confidenceScore,
      confidenceReasons: confidenceResult.confidenceReasons,
    });
      if (syntheticMetadata?.isSynthetic) {
        applySyntheticMetadata(assessment, syntheticMetadata);
      }

      const savedAssessment = await this.fitAssessmentRepository.save(assessment);
      if (
        savedAssessment.userId !== userId ||
        savedAssessment.baselineId !== baseline.id
      ) {
        throw new InternalServerErrorException(
          'Persisted assessment linkage does not match requested user/baseline',
        );
      }

      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(
          `runFitAssessment persisted assessment id=${savedAssessment.id} userId=${savedAssessment.userId} baselineId=${savedAssessment.baselineId} createdAt=${savedAssessment.createdAt.toISOString()} score=${savedAssessment.overallScore}`,
        );
      }

      const successScoringProof: ScoringProofSnapshot = {
        ...scoringProof,
        assessmentId: savedAssessment.id,
      };

      try {
        await this.usersRepository.update(
          { id: userId },
          { lastAssessmentId: savedAssessment.id },
        );
      } catch (updateError) {
        this.logger.warn(
          'Unable to persist last assessment reference',
          updateError,
        );
      }

      const successResponse: RunFitAssessmentOkResponse = {
        status: 'ok',
        fit_score: finalScore,
        overall_score: finalScore,
        verdict: responseVerdict,
        breakdown,
        strengths,
        gaps,
        criticalGaps: gapInsights.criticalGaps,
        recommendedActions: gapInsights.recommendedActions,
        compliance_flags: this.coerceComplianceFlags(compliance.complianceFlags),
        audit_id: compliance.audit.id,
        auditId: compliance.audit.id,
        assessmentId: savedAssessment.id,
        jobId: savedAssessment.jobId,
        baselineId: savedAssessment.baselineId,
        baselineVersion: savedAssessment.baselineVersion,
        createdAt: savedAssessment.createdAt,
        scoring_v2: scoringV2,
        score: finalScore,
        overallScore: finalScore,
        dimensionScores: legacyDimensionScores,
        complianceFlags,
        summary:
          debugScoring?.summary ??
          this.buildSummaryFromTerms(strengths, gaps),
        ...(debugInfo ? { debug: debugInfo } : {}),
        scoringProof: successScoringProof,
        confidenceScore: confidenceResult.confidenceScore,
        confidenceReasons: confidenceResult.confidenceReasons,
        baseline_version_hash:
          compliance.audit.baselineVersionHash ?? baseline.hash ?? null,
      };

      return successResponse;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Unexpected error while running fit assessment',
      );
    } finally {
      if (shortTextWarningKey) {
        this.clearShortTextWarningKey(shortTextWarningKey);
      }
    }
  }

  async runExpandedFitAssessment(
    userId: string,
    payload: RunExpandedFitAssessmentDto,
  ) {
    let shortTextWarningKey: string | undefined;
    try {
    const baselineId = payload.baselineId?.trim();
    const jobId = payload.jobId?.trim();

    if (!baselineId || !jobId) {
      throw new BadRequestException('baselineId and jobId are required');
    }

    if (payload.baselineVersion !== undefined) {
      const version = Number(payload.baselineVersion);
      if (!Number.isInteger(version) || version < 1) {
        throw new BadRequestException(
          'baselineVersion must be a positive integer',
        );
      }
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId: baseline.id },
        order: { order: 'ASC' },
      });
    }

    const job = await this.jobRepository.findOne({
      where: { id: jobId, userId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const jobKey = job.id;
    const requestRunId = this.nextShortTextWarningRequestRunId();
    shortTextWarningKey = this.buildShortTextWarningKey(jobKey, requestRunId);

    const interviewId = payload.interviewId?.trim();
    const interview = interviewId
      ? await this.interviewRepository.findOne({
          where: { id: interviewId, userId },
        })
      : null;

    if (interviewId && !interview) {
      throw new NotFoundException('Interview not found');
    }

    const additionsFromPayload = this.normalizeAdditions(
      payload.verifiedAdditions,
    );
    const additions = additionsFromPayload.length
      ? additionsFromPayload
      : this.normalizeAdditions(interview?.recommendedAdditions);

    if (!additions.length) {
      throw new BadRequestException(
        'verified additions are required for expanded scoring',
      );
    }

    const includedSections =
      baseline.sections?.filter(
        (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
      ) ?? [];

    const baselineVersionValue = payload.baselineVersion ?? baseline.version ?? 0;
    const baselineForHash: Baseline = {
      ...baseline,
      sections: includedSections,
      version: baselineVersionValue,
    };

    const complianceBaselineSections =
      this.complianceService.normalizeSectionsForOutput(includedSections);

    const calibration = await this.getCalibration(userId);
    const dimensionWeights = this.mapCalibrationToDimensionWeights(
      calibration.weights,
    );

    const canonicalBaseline = this.getCanonicalBaselineForScoring(baseline);
    const canonicalSections = this.buildCanonicalSectionPayload(
      canonicalBaseline,
    );
    const sectionPayload = canonicalSections;

    const { canonicalJobForScoring, canonicalJobForHash, jobTextForScoring } =
      this.buildCanonicalJobAssets({
        rawDescription: job.rawDescription,
        normalizedResponsibilities: job.normalizedResponsibilities ?? [],
        normalizedRequirements: job.normalizedRequirements ?? [],
        title: job.title ?? null,
        company: job.company ?? null,
        sourceUrl: job.sourceUrl ?? null,
      });

    if (jobTextForScoring.jobRawTextTooShort && shortTextWarningKey) {
      const warningMessage = `Raw job description for job ${jobKey} is only ${jobTextForScoring.jobRawTextCharCount} characters (<${RAW_TEXT_WARNING_THRESHOLD.toLocaleString()}).`;
      this.logShortTextWarningOnce(shortTextWarningKey, warningMessage);
    }

    const inputsHash = this.buildInputsHash(
      canonicalJobForHash,
      baselineForHash,
      sectionPayload,
      dimensionWeights,
    );

    const scoring = await this.fitScoringService.score(
      {
        job: canonicalJobForScoring,
        baseline: {
          version: payload.baselineVersion ?? baseline.version ?? null,
          sections: sectionPayload,
        },
        verifiedAdditions: additions,
      },
      dimensionWeights,
    );

    const additionsForCompliance = additions.map((addition, index) => ({
      title: `Verified addition ${index + 1}`,
      content: this.complianceService.normalizeText(addition),
    }));

    const generatedSectionsForCompliance = additionsForCompliance.length
      ? additionsForCompliance
      : undefined;

    const compliance = await this.complianceService.validateAndAudit({
      action: ComplianceAction.FIT_SCORE,
      actorId: userId,
      baselineVersion: { hash: baseline.hash } as BaselineVersion,
      job,
      outputHash: inputsHash,
      baselineSections: complianceBaselineSections,
      generatedSections: generatedSectionsForCompliance,
      debugCompliance: false,
      extraFlags: this.mapComplianceStringsToFlags(scoring.complianceFlags),
    });

    if (compliance.blocked) {
      throw new BadRequestException({
        error: {
          code: 'compliance_blocked',
          message: 'Compliance validation failed.',
          details: { compliance_flags: compliance.complianceFlags },
        },
      });
    }

    const linkedAssessment = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId, baselineId },
      order: { createdAt: 'DESC' },
    });

    const expansion = this.expandedFitAssessmentRepository.create({
      userId,
      jobId,
      baselineId,
      baselineVersion: payload.baselineVersion ?? baseline.version ?? null,
      fitAssessmentId: linkedAssessment?.id ?? undefined,
      interviewId: interview?.id ?? undefined,
      originalScore: scoring.originalScore,
      expandedScore: scoring.expandedScore,
      delta: scoring.delta,
      additions,
      expandedDimensionScores:
        scoring.expandedDimensionScores ?? scoring.dimensionScores,
    });

    const savedExpansion =
      await this.expandedFitAssessmentRepository.save(expansion);

    return {
      ok: true,
      expansionId: savedExpansion.id,
      fitAssessmentId: linkedAssessment?.id ?? null,
      interviewId: interview?.id ?? null,
      baselineId,
      baselineVersion: payload.baselineVersion ?? baseline.version ?? null,
      jobId,
      originalScore: scoring.originalScore,
      expandedScore: scoring.expandedScore,
      delta: scoring.delta,
      expandedDimensionScores:
        scoring.expandedDimensionScores ?? scoring.dimensionScores,
      dimensionScores: scoring.dimensionScores,
      strengths: scoring.strengths,
      gaps: scoring.gaps,
      complianceFlags: scoring.complianceFlags,
      appliedAdditions: scoring.appliedAdditions,
      summary: scoring.summary,
      audit_id: compliance.audit.id,
      auditId: compliance.audit.id,
      baseline_version_hash:
        compliance.audit.baselineVersionHash ?? baseline.hash ?? null,
    };
    } finally {
      if (shortTextWarningKey) {
        this.clearShortTextWarningKey(shortTextWarningKey);
      }
    }
  }

  async getFitAssessments(userId: string, jobId?: string) {
    const where = jobId?.trim() ? { userId, jobId: jobId.trim() } : { userId };

    return this.fitAssessmentRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async getFitScores(userId: string, jobId?: string) {
    const assessments = await this.getFitAssessments(userId, jobId);

    return assessments.map((assessment) => ({
      id: assessment.id,
      jobId: assessment.jobId,
      fitScore: assessment.overallScore,
      createdAt: assessment.createdAt,
    }));
  }

  private async buildLatestAssessmentPayload(assessment: FitAssessment) {
    const gapInsights = await this.buildGapInsightsForAssessment(assessment);
    const summary = this.buildSummaryFromTerms(
      gapInsights.strengths ?? [],
      gapInsights.criticalGaps.map((gap) => gap.title),
    );

    const baselineVersionRecord = assessment.baselineVersion
      ? await this.baselineVersionRepository.findOne({
          where: {
            baselineId: assessment.baselineId,
            versionNumber: assessment.baselineVersion,
          },
      order: { createdAt: 'DESC' },
    })
      : null;

    const scoringV2DimensionScores = assessment.scoringV2?.rubric?.dimensionPercents ?? null;
    const fallbackDimensionScores = {
      role_scope_and_seniority: assessment.dimensionScores?.experienceAlignment ?? 0,
      support_operations_and_process_rigor: assessment.dimensionScores?.leadershipLevel ?? 0,
      tooling_and_platform_experience: assessment.dimensionScores?.technicalPlatformFit ?? 0,
      domain_and_business_context: assessment.dimensionScores?.industryContext ?? 0,
      change_leadership_and_customer_advocacy:
        assessment.dimensionScores?.strategicTacticalFit ?? 0,
    };
    const latestScore = assessment.scoringV2?.score ?? assessment.overallScore;
    const latestLegacyDimensionScores = assessment.scoringV2
      ? this.mapCxFitV2ToLegacyDimensionScores(assessment.scoringV2)
      : assessment.dimensionScores;
    const narrative = buildResultsNarrative({
      overallScore: latestScore,
      dimensionScores: scoringV2DimensionScores ?? fallbackDimensionScores,
    });
    const scoreBreakdown = this.buildScoreBreakdown(assessment);
    const refreshedScoringV2 = await this.refreshToolingCoverageForAssessment(
      assessment,
    );
    const canonicalClaims = refreshedScoringV2?.debug?.toolingCoverage?.claims ?? [];
    const verificationCoverage =
      this.buildVerificationCoverageFromCanonicalClaims(canonicalClaims);

    return {
      ok: true,
      assessmentId: assessment.id,
      jobId: assessment.jobId,
      baselineId: assessment.baselineId,
      baselineVersionId: baselineVersionRecord?.id ?? null,
      baselineVersion: assessment.baselineVersion,
      fit_score: latestScore,
      overall_score: latestScore,
      overallScore: latestScore,
      score: latestScore,
      verdict: assessment.verdict,
      dimensionScores: latestLegacyDimensionScores,
      strengths: gapInsights.strengths,
      gaps: gapInsights.criticalGaps.map((gap) => gap.title),
      criticalGaps: gapInsights.criticalGaps,
      recommendedActions: gapInsights.recommendedActions,
      complianceFlags: assessment.complianceFlags,
      summary,
      confidenceScore: assessment.confidenceScore ?? null,
      confidenceReasons: assessment.confidenceReasons ?? [],
      createdAt: assessment.createdAt,
      scoring_v2: refreshedScoringV2,
      verification_coverage: verificationCoverage,
      score_breakdown: scoreBreakdown,
      narrative,
    };
  }

  private async refreshToolingCoverageForAssessment(
    assessment: FitAssessment,
  ): Promise<CxFitV2Result | null> {
    if (!assessment.scoringV2) return null;

    const job = await this.jobRepository.findOne({
      where: { id: assessment.jobId, userId: assessment.userId },
    });
    if (!job) return assessment.scoringV2;

    const baseline = await this.loadBaselineWithSections(
      assessment.userId,
      assessment.baselineId,
    );

    let sections = baseline.sections ?? [];
    if (assessment.baselineVersion) {
      const baselineVersion = await this.baselineVersionRepository.findOne({
        where: {
          baselineId: assessment.baselineId,
          versionNumber: assessment.baselineVersion,
        },
      });
      if (baselineVersion) {
        const policies = await this.baselineBlockPolicyRepository.find({
          where: { baselineVersionId: baselineVersion.id },
          relations: ['baselineSection'],
          order: { order: 'ASC' },
        });
        sections = this.applyPoliciesToSections(sections, policies);

        const additionSections =
          (baselineVersion.verifiedAdditions ?? []).map((content, index) => {
            const section: Partial<BaselineSection> = {
              id: `addition-${index}`,
              baselineId: assessment.baselineId,
              sectionType: BaselineSectionType.OTHER,
              title: 'Verified addition',
              content,
              includePolicy: BaselineIncludePolicy.ALWAYS,
              order: sections.length + index,
            };
            return section as BaselineSection;
          }) ?? [];
        sections = [...sections, ...additionSections];
      }
    }

    const selectedSections = sections.filter(
      (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
    );
    const baselinePayloadSections = selectedSections.map((section) => ({
      title: section.title ?? section.sectionType ?? section.type ?? null,
      type: section.sectionType ?? section.type ?? null,
      content: section.content ?? '',
    }));

    const canonicalSections = (() => {
      try {
        const canonicalBaseline = this.getCanonicalBaselineForScoring({
          ...baseline,
          sections,
        } as Baseline);
        return this.buildCanonicalSectionPayload(canonicalBaseline);
      } catch {
        return [] as Array<{ type?: string; content: string }>;
      }
    })();
    const baselineSelection = selectBaselineTextForScoring({
      baseline: { ...baseline, sections } as Baseline,
      canonicalSections,
    });
    const sectionsForScoring = baselineSelection.sectionsForScoring;

    const scoringBaselinePayloadSections = sectionsForScoring.map((section) => ({
      title: section.type ?? null,
      type: section.type ?? null,
      content: section.content ?? '',
    }));

    const baselineText = sectionsForScoring
      .map((section) => section.content)
      .filter((content) => content.trim().length > 0)
      .join('\n');
    const jobText = buildJobPromptText({
      rawDescription: job.rawDescription ?? '',
      normalizedResponsibilities: job.normalizedResponsibilities ?? [],
      normalizedRequirements: job.normalizedRequirements ?? [],
    }).text;

    const toolingCoverage = evaluateToolCoverage(jobText, baselineText, {
      baselineSections:
        scoringBaselinePayloadSections.length > 0
          ? scoringBaselinePayloadSections
          : baselinePayloadSections,
    });

    return {
      ...assessment.scoringV2,
      debug: {
        ...assessment.scoringV2.debug,
        toolingCoverage: {
          requiredCoverage: toolingCoverage.requiredCoverage,
          preferredCoverage: toolingCoverage.preferredCoverage,
          claims: toolingCoverage.claims,
        },
      },
    };
  }

  async getLatestAssessment(userId: string, jobId: string) {
    const assessment = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId },
      order: { createdAt: 'DESC' },
    });

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    const job = await this.fetchJobForUser(jobId, userId);

    if (!assessment.baselineId) {
      throw new NotFoundException('Baseline not found');
    }

    const baseline = await this.loadBaselineWithSections(
      userId,
      assessment.baselineId,
    );
    const expectedHash = await this.computeExpectedInputsHashForJobBaseline(
      userId,
      job,
      baseline,
    );

    if (assessment.inputsHash !== expectedHash) {
      const baselineVersion =
        assessment.baselineVersion ?? baseline.version ?? undefined;
      return this.runAndPersistFitAssessment(
        userId,
        jobId,
        assessment.baselineId,
        baselineVersion,
      );
    }

    return this.buildLatestAssessmentPayload(assessment);
  }

  async getFitAssessmentById(
    userId: string,
    assessmentId: string,
    options?: { forceFreshRecompute?: boolean; skipFreshRecompute?: boolean },
  ) {
    const assessment = await this.fitAssessmentRepository.findOne({
      where: { id: assessmentId, userId },
    });

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    if (options?.forceFreshRecompute && !options?.skipFreshRecompute) {
      // Intentional beta stabilization:
      // Studio fetches run a full live recompute to guarantee canonical, current claim status truth.
      // Reintroduce caching/persistence optimizations only after stale-read invalidation is proven reliable.
      const freshRun = await this.runFitAssessment(userId, {
        jobId: assessment.jobId,
        baselineId: assessment.baselineId,
        baselineVersion: assessment.baselineVersion ?? undefined,
      });

      if (freshRun.status === 'ok' && freshRun.assessmentId) {
        return this.getFitAssessmentById(userId, freshRun.assessmentId, {
          skipFreshRecompute: true,
        });
      }
    }

    return this.buildLatestAssessmentPayload(assessment);
  }

  async getLatestAssessmentForBaseline(
    userId: string,
    jobId: string,
    baselineId: string,
  ) {
    const assessment = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId, baselineId },
      order: { createdAt: 'DESC' },
    });

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    const job = await this.fetchJobForUser(jobId, userId);
    const baseline = await this.loadBaselineWithSections(userId, baselineId);
    const expectedHash = await this.computeExpectedInputsHashForJobBaseline(
      userId,
      job,
      baseline,
    );

    if (assessment.inputsHash !== expectedHash) {
      const baselineVersion =
        assessment.baselineVersion ?? baseline.version ?? undefined;
      return this.runAndPersistFitAssessment(
        userId,
        jobId,
        baselineId,
        baselineVersion,
      );
    }

    return this.buildLatestAssessmentPayload(assessment);
  }
}
