// apps/api/src/analysis/analysis.service.ts
/**
 * AUTHORITY: Authenticated scoring + compliance orchestration.
 *
 * Canonical chain (authenticated user flows):
 * `AnalysisController` → `AnalysisService` → (scoring + persistence + audit) → `ComplianceService.validateAndAudit`.
 *
 * Notes:
 * - The canonical CX Fit v2 scoring implementation lives in `cx-fit-scoring-v2.ts`.
 * - Public preview scoring is an intentional constrained bypass and must not be expanded into an
 *   authenticated scoring path.
 * - Some endpoints request a “canonical-truth lane” recompute via `forceFreshRecompute`; this is
 *   used to guarantee current claim-status truth for Studio consumers.
 */
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineSchema, BaselineSchemaCoreShape } from '../baseline/baseline-schema';
import {
  assertUsableResumeV2,
  evaluateResumeV2Usability,
} from '../baseline/baseline-resume-v2';
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
import { buildResultsNarrative } from './results-narrative.builder';
import { selectBaselineTextForScoring } from './baseline-selection';
import type {
  BaselineCoverageDetails,
  FitScoreDebugBundle,
} from './cx-fit-scoring-v2';
import { CX_FIT_SCORER_VERSION } from './cx-fit-scoring-v2';
import type { CxFitV2Result } from './fit-scoring.service';

import {
  DEFAULT_LEGACY_CALIBRATION_WEIGHTS,
  isCalibrationWeights,
  isLegacyCalibrationWeights,
  mapLegacyToCalibrationWeights,
  type LegacyCalibrationWeights,
} from './calibration-weights';
import {
  CALIBRATION_PROFILES,
  type CalibrationProfile,
} from './calibration-profiles';

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
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';
import { findUserByIdSchemaSafe } from '../users/beta-access-schema-compat';
import { ResumeService } from '../resume/resume.service';
import {
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from '../resume/resume-normalization';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import { VERIFIED_ONLY_GENERATION_THRESHOLD } from '../config/verifiedOnlyGenerationThreshold';
import { StudioArtifact, StudioArtifactLifecycleStatus } from '../studio-artifacts/studio-artifact.entity';
import { loadPersistedFitAssessmentReadModel } from '../common/analysis-context-binding';

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
  jobAnalysis: JobAnalysis;
  fitScore: FitScore;
  scoringReliability?: 'ok' | 'unreliable';
  scoringReliabilityReason?: 'job_description_terms_empty' | 'job_description_empty' | 'unknown';
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

export type JobAnalysis = {
  jobText: string;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
  sourceEvidence: string[];
};

export type FitScore = {
  score: number;
  verdict: 'skip' | 'consider' | 'apply';
  matchedSignals: string[];
  gapSignals: string[];
  sourceEvidence: string[];
};

const RAW_TEXT_WARNING_THRESHOLD = 3000;
const PROMPT_LIKE_FLAG_MESSAGE = 'Job description contains prompt-like content';
const BASELINE_INVALID_MESSAGE =
  'Baseline content is missing in this environment. Please re upload or select a valid baseline.';
const SCORING_V2_INPUTS_VERSION = 'cx-fit-v2-heuristics-2026-04-06';
const JOB_NORMALIZATION_VERSION = 'job-normalization-sanitization-2026-04-06';

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
  jobAnalysis?: JobAnalysis | null;
  fitScore?: FitScore | null;
  compliance_debug?: ComplianceDebugTrace;
  summary?: string;
  fit_score_debug?: FitScoreDebugBundle;
  debug?: CompatibilityRunDebugPayload;
  scoringProof?: ScoringProofSnapshot;
  baseline_version_hash?: string | null;
  confidenceScore?: number;
  confidenceReasons?: string[];
  scoreConfidence?: 'high' | 'medium' | 'low';
  scoreConfidenceReasons?: string[];
  scoreSanityFlags?: string[];
  likelyUnderestimatedFit?: boolean;
  scorePresentationMode?: 'normal' | 'caution' | 'fix_first';
  scoringReliability?: 'ok' | 'unreliable';
  scoringReliabilityReason?: 'job_description_terms_empty' | 'job_description_empty' | 'unknown';

  scoring_v2?: CxFitV2Result;
  supportingSignals?: string[];
  baselineEvidence?: string[];
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
  latestAssessmentSummary?: {
    latestAssessmentId: string;
    latestAssessmentCreatedAt: Date;
    latestFitScore: number;
    hasCompletedAssessment: true;
  };
  idempotency?: {
    status:
      | 'accepted_new'
      | 'existing_in_flight'
      | 'existing_completed'
      | 'rejected_stale'
      | 'persistence_conflict';
    runId: string;
    dedupeKey: string;
    reused: boolean;
  };
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
  scoreConfidence?: 'high' | 'medium' | 'low';
  scoreConfidenceReasons?: string[];
  scoreSanityFlags?: string[];
  likelyUnderestimatedFit?: boolean;
  scorePresentationMode?: 'normal' | 'caution' | 'fix_first';
  scoringReliability?: 'ok' | 'unreliable';
  scoringReliabilityReason?: 'job_description_terms_empty' | 'job_description_empty' | 'unknown';
  assessmentId?: string;
  jobId?: string;
  baselineId?: string;
  baselineVersion?: number | null;
  createdAt?: Date;
  idempotency?: {
    status:
      | 'accepted_new'
      | 'existing_in_flight'
      | 'existing_completed'
      | 'rejected_stale'
      | 'persistence_conflict';
    runId: string;
    dedupeKey: string;
    reused: boolean;
  };
};

export type RunAssessmentResult =
  | RunFitAssessmentOkResponse
  | RunFitAssessmentComplianceBlockedResponse;

type TriggerType = "manual" | "retry" | "autorun";

type FailureCategory =
  | "input_missing_or_invalid"
  | "generation_failed"
  | "parse_or_schema_failed"
  | "compliance_or_validation_rejected"
  | "persistence_failed"
  | "pair_mismatch_rejected"
  | "unknown_runtime_error";

type PipelineStage =
  | "input_validation"
  | "parsing"
  | "generation"
  | "compliance"
  | "persistence";

type CanonicalBaselineResult = {
  canonical: BaselineSchemaCoreShape;
  fallbackUsed: boolean;
};

type RunFitAssessmentAttemptContext = {
  attemptId: string;
  baselineId: string;
  jobId: string;
  triggerType: TriggerType;
  baselineLabel?: string | null;
  jobTitle?: string | null;
};

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
    @InjectRepository(BaselineParsed)
    private readonly baselineParsedRepository: Repository<BaselineParsed>,
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
    private readonly workflowIdempotencyService: WorkflowIdempotencyService,
    private readonly resumeService: ResumeService,
    private readonly coverLettersService: CoverLettersService,
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

  private async triggerDownstreamDocumentGeneration(
    userId: string,
    assessment: FitAssessment,
  ) {
    const persistedScore = assessment.overallScore ?? null;
    if (
      typeof persistedScore !== 'number' ||
      persistedScore < VERIFIED_ONLY_GENERATION_THRESHOLD
    ) {
      return;
    }

    const studioArtifactRepository = this.fitAssessmentRepository.manager.getRepository(StudioArtifact);
    const artifactRecord = await studioArtifactRepository.findOne({
      where: {
        userId,
        baselineId: assessment.baselineId,
        jobId: assessment.jobId,
      },
    });
    const baseline = await this.baselineRepository.findOne({
      where: { id: assessment.baselineId, userId },
      relations: ['parsedRecords'],
    });
    const baselineVersionRecord = assessment.baselineVersion
      ? await this.baselineVersionRepository.findOne({
          where: {
            baselineId: assessment.baselineId,
            versionNumber: assessment.baselineVersion,
          },
        })
      : null;
    const generationBaselineVersionId = baselineVersionRecord?.id ?? null;
    const latestParsedRecord = [...(baseline?.parsedRecords ?? [])]
      .sort((a: any, b: any) => {
        const aTime = new Date(a?.createdAt ?? 0).getTime();
        const bTime = new Date(b?.createdAt ?? 0).getTime();
        return bTime - aTime;
      })[0] ?? null;
    const persistedResumeV2Json = (latestParsedRecord as any)?.resumeV2Json ?? null;
    const baselineFileUsable = Boolean(
      persistedResumeV2Json &&
        typeof persistedResumeV2Json === 'object' &&
        !Array.isArray(persistedResumeV2Json),
    );
    const latestFlagsJson = (latestParsedRecord as any)?.flagsJson ?? null;
    const baselineVerified = Boolean(
      latestFlagsJson?.reviewState?.verified,
    );
    const shouldRepairBaselineVerification =
      baselineFileUsable && !baselineVerified && Boolean(latestParsedRecord?.id);
    let repairUpdateAffected: number | null = null;
    if (shouldRepairBaselineVerification && latestParsedRecord?.id) {
      const repairedFlagsJson = {
        ...(latestFlagsJson ?? {}),
        reviewState: {
          ...(latestFlagsJson?.reviewState ?? {}),
          verified: true,
        },
      };
      const repairResult = await this.baselineParsedRepository.update(
        { id: latestParsedRecord.id },
        { flagsJson: repairedFlagsJson },
      );
      repairUpdateAffected = repairResult.affected ?? 0;
      if (baseline?.parsedRecords?.length) {
        baseline.parsedRecords[0] = {
          ...latestParsedRecord,
          flagsJson: repairedFlagsJson,
        } as any;
      }
    }
    const verifiedUsableBaselineFileExists =
      baselineFileUsable && (baselineVerified || shouldRepairBaselineVerification);
    const resumeAlreadyExists =
      artifactRecord?.resumeStatus === StudioArtifactLifecycleStatus.COMPLETED &&
      (artifactRecord.resumeMetadata as any)?.analysisId === assessment.id;
    const coverLetterAlreadyExists =
      artifactRecord?.coverLetterStatus === StudioArtifactLifecycleStatus.COMPLETED &&
      (artifactRecord.coverLetterMetadata as any)?.analysisId === assessment.id;

    if (resumeAlreadyExists && coverLetterAlreadyExists) {
      return;
    }

    const generationRequest = {
      baselineId: assessment.baselineId,
      baselineVersionId: generationBaselineVersionId,
      jobId: assessment.jobId,
      analysisId: assessment.id,
      oneTap: verifiedUsableBaselineFileExists,
    };
    this.logger.log(
      JSON.stringify({
        marker: 'ANALYSIS_DOWNSTREAM_BASELINE_VERIFICATION_HANDOFF',
        baselineId: assessment.baselineId,
        baselineVersionId: generationBaselineVersionId,
        latestParsedRecordId: latestParsedRecord?.id ?? null,
        latestParsedRecordBaselineId: latestParsedRecord?.baselineId ?? null,
        latestParsedRecordBaselineVersionId:
          generationBaselineVersionId,
        resumeV2Usable: baselineFileUsable,
        verifiedBeforeRepair: baselineVerified,
        repairAttempted: shouldRepairBaselineVerification,
        repairUpdateAffected,
        verifiedAfterRepairInMemory:
          Boolean(
            (baseline?.parsedRecords?.[0] as any)?.flagsJson?.reviewState?.verified,
          ),
        verifiedUsableBaselineFileExists,
        oneTapToGenerateResume: generationRequest.oneTap,
        oneTapToGenerateCoverLetter: generationRequest.oneTap,
      }),
    );

    await Promise.all([
      this.resumeService.generateResume(userId, generationRequest),
      this.coverLettersService.generateCoverLetter(userId, generationRequest),
    ]);
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
      label: 'Experience Alignment',
      weight: 30,
    },
    {
      key: 'support_operations_and_process_rigor',
      label: 'Leadership Level',
      weight: 20,
    },
    {
      key: 'tooling_and_platform_experience',
      label: 'Technical and Platform Fit',
      weight: 20,
    },
    {
      key: 'domain_and_business_context',
      label: 'Industry and Context Fit',
      weight: 15,
    },
    {
      key: 'change_leadership_and_customer_advocacy',
      label: 'Strategic versus Tactical Balance',
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

  private getAuthoritativeResumeProjectScore(
    scoringV2?: CxFitV2Result | null,
  ): number | null {
    const resumeProject = scoringV2?.rubric?.resumeProject;
    if (resumeProject) {
      if (typeof resumeProject.totalScore === 'number' && !Number.isNaN(resumeProject.totalScore)) {
        return resumeProject.totalScore;
      }
      if (typeof resumeProject.finalScore === 'number' && !Number.isNaN(resumeProject.finalScore)) {
        return resumeProject.finalScore;
      }
      const categories = resumeProject.categories ?? resumeProject.categoryPoints;
      if (categories) {
        const categoryTotal = Object.values(categories).reduce(
          (sum, value) => sum + (typeof value === 'number' && !Number.isNaN(value) ? value : 0),
          0,
        );
        return categoryTotal;
      }
    }

    if (typeof scoringV2?.score === 'number' && !Number.isNaN(scoringV2.score)) {
      return scoringV2.score;
    }

    return null;
  }

  private alignCxFitScoreToResumeProject(
    scoringV2?: CxFitV2Result | null,
  ): CxFitV2Result | null {
    if (!scoringV2) return null;

    const authoritativeScore = this.getAuthoritativeResumeProjectScore(scoringV2);
    if (authoritativeScore === null) {
      return scoringV2;
    }

    if (scoringV2.score !== authoritativeScore) {
      scoringV2.score = authoritativeScore;
    }

    if (scoringV2.rubric?.resumeProject) {
      scoringV2.rubric.resumeProject.totalScore = authoritativeScore;
      scoringV2.rubric.resumeProject.finalScore = authoritativeScore;
    }

    return scoringV2;
  }

  private buildResumeProjectInvariantDetails(
    scoringV2?: CxFitV2Result | null,
  ): Record<string, unknown> | null {
    const resumeProject = scoringV2?.rubric?.resumeProject;
    if (!resumeProject) return null;

    return {
      id: resumeProject.id,
      totalScore: resumeProject.totalScore ?? resumeProject.finalScore ?? null,
      weights: resumeProject.weights,
      categories: resumeProject.categories ?? resumeProject.categoryPoints,
      categoryPercents: resumeProject.categoryPercents,
      subtotal: resumeProject.subtotal,
      rounding: resumeProject.rounding,
    };
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
    if (score >= 75) return FitAssessmentVerdict.CONSIDER;
    return FitAssessmentVerdict.SKIP;
  }

  private deriveFitScoreVerdictLabelFromScore(score: number) {
    // Contract uses uppercase verdict labels (mirrors FitAssessmentVerdict).
    if (score >= 85) return 'APPLY';
    if (score >= 75) return 'CONSIDER';
    return 'SKIP';
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
      validatedRequirements: this.gapAnalysisService.validateRequirements(
        job.normalizedRequirements ?? [],
      ),
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

    const parsedSegments = rawDescription.length > 0
      ? normalizeJobDescription(rawDescription)
      : null;
    const normalizedResponsibilities =
      rawDescription.length > 0
        ? parsedSegments?.normalized.responsibilities ?? []
        : providedResponsibilities.length
          ? providedResponsibilities
          : parsedSegments?.normalized.responsibilities ?? [];
    const normalizedRequirements =
      rawDescription.length > 0
        ? parsedSegments?.normalized.requirements ?? []
        : providedRequirements.length
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

  private buildJobAnalysis(jobProps: {
    rawDescription?: string | null;
    normalizedResponsibilities?: string[] | null;
    normalizedRequirements?: string[] | null;
  }): JobAnalysis {
    const canonicalInputs = this.buildCanonicalJobInputs(jobProps);
    const jobTextForScoring = buildJobTextForScoring({
      rawDescription: canonicalInputs.rawDescription,
      normalizedResponsibilities: canonicalInputs.normalizedResponsibilities,
      normalizedRequirements: canonicalInputs.normalizedRequirements,
    });
    const normalizedJob = normalizeJobDescription(jobTextForScoring.jobText).normalized;
    const skills = Array.from(
      new Set([
        ...normalizedJob.signals.leadership,
        ...normalizedJob.signals.strategic,
        ...normalizedJob.signals.tactical,
        ...normalizedJob.signals.technical,
        ...normalizedJob.signals.domain,
      ]),
    );
    const sourceEvidence =
      canonicalInputs.normalizedResponsibilities.length ||
      canonicalInputs.normalizedRequirements.length
        ? [
            ...canonicalInputs.normalizedResponsibilities,
            ...canonicalInputs.normalizedRequirements,
          ]
        : [jobTextForScoring.jobText].filter(Boolean);

    return {
      jobText: jobTextForScoring.jobText,
      responsibilities: canonicalInputs.normalizedResponsibilities,
      requirements: canonicalInputs.normalizedRequirements,
      skills,
      sourceEvidence,
    };
  }

  private buildFitScore(input: {
    score: number;
    matchedSignals: string[];
    gapSignals: string[];
    sourceEvidence: string[];
  }): FitScore {
    return {
      score: input.score,
      verdict:
        input.score >= 80
          ? 'apply'
          : input.score >= 60
            ? 'consider'
            : 'skip',
      matchedSignals: input.matchedSignals,
      gapSignals: input.gapSignals,
      sourceEvidence: input.sourceEvidence,
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

    const identitySummary = canonical.identity.summary?.trim();
    const identityParts = [
      canonical.identity.full_name?.trim(),
      canonical.identity.current_title?.trim(),
      canonical.identity.current_company?.trim(),
      canonical.identity.location?.trim(),
    ].filter((part): part is string => Boolean(part));

    if (identitySummary) {
      sections.push({
        type: BaselineSectionType.SUMMARY,
        content: identitySummary,
      });
    } else if (identityParts.length) {
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

  private buildCanonicalBaselineFromResumeV2(
    resumeV2Json: unknown,
  ): BaselineSchemaCoreShape {
    const normalized = normalizeNormalizedResumeDocument(
      resumeV2Json as Parameters<typeof normalizeNormalizedResumeDocument>[0],
    );
    const validation = validateNormalizedResumeDocument(normalized);
    if (!validation.valid) {
      throw new UnprocessableEntityException({
        error: {
          code: 'baseline_resume_v2_invalid',
          message:
            'Persisted Resume V2 is invalid for canonical scoring. Please re-upload your baseline and try again.',
          details: {
            reasons: validation.reasons,
          },
        },
      });
    }

    const currentExperience = normalized.experience?.[0] ?? null;
    return {
      schema_version: 'baseline_schema_v1',
      user_verified: true,
      identity: {
        full_name: normalized.heading.name.trim(),
        summary: normalized.summary?.trim() ?? null,
        current_title: currentExperience?.roleTitle?.trim() ?? null,
        current_company: currentExperience?.company?.trim() ?? null,
        location: normalized.heading.contactLine?.trim() ?? null,
      },
      experience: (normalized.experience ?? []).map((entry) => ({
        company: entry.company.trim(),
        role: entry.roleTitle.trim(),
        start_date: entry.startDate?.trim() ?? null,
        end_date: entry.endDate?.trim() ?? null,
        evidence: [],
        company_name: entry.company.trim(),
        role_title: entry.roleTitle.trim(),
        scope_summary: entry.dateRange?.trim() ?? undefined,
        details_text: (entry.bullets ?? []).join('\n').trim(),
      })),
      education: (normalized.education ?? []).map((entry) => ({
        school: entry.institution.trim(),
        degree: entry.degree?.trim() ?? null,
        startDate: null,
        endDate: null,
        evidence: [],
      })),
      skills: [
        ...(normalized.competencies ?? []),
        ...(normalized.coreCompetencies ?? []),
      ]
        .map((name) => String(name ?? '').trim())
        .filter(Boolean)
        .map((name) => ({ name, category: null })),
      people_leadership: {
        direct_reports: null,
        managers_led: null,
        global_teams: null,
      },
      operational_ownership: {
        functions_owned: [],
        process_design: null,
        process_scaling: null,
      },
      tooling_and_platforms: {
        tools: [],
        ownership_level: 'unknown',
      },
      cross_functional_partnership: {
        product: null,
        engineering: null,
        sales_cs: null,
        executive: null,
      },
      customer_advocacy: {
        executive_escalations: null,
        voice_of_customer: null,
        post_incident_rca: null,
      },
      scale_and_scope: {
        customer_segment: 'unknown',
        geo_scope: 'unknown',
        org_stage: 'unknown',
      },
      metrics_and_outcomes: {
        metrics_present: false,
        metrics: [],
      },
      skills_and_tools: {
        tools: [
          ...(normalized.competencies ?? []),
          ...(normalized.coreCompetencies ?? []),
        ]
          .map((name) => String(name ?? '').trim())
          .filter(Boolean),
        methodologies: [],
        domains: [],
      },
      system_generated_read_only: {
        missing_fields: [],
        ambiguity_flags: [],
        low_confidence_extractions: [],
      },
    };
  }

  private buildCanonicalScoringBaseline(baseline: Baseline): Baseline {
    return {
      ...baseline,
      sections: [],
    };
  }

  private getCanonicalBaselineForScoring(
    baseline: Baseline,
    options?: { requireResumeV2Authority?: boolean },
  ): CanonicalBaselineResult {
    const records = baseline.parsedRecords ?? [];
    const latest = records
      .slice()
      .sort(
        (a, b) =>
          (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
        )[0];

    if (!latest) {
      if (options?.requireResumeV2Authority) {
        throw new UnprocessableEntityException({
          error: {
            code: 'baseline_resume_v2_missing',
            message:
              'Persisted Resume V2 is missing. Please re-upload your baseline before scoring.',
          },
        });
      }
      return {
        canonical: this.buildFallbackCanonicalBaseline(baseline),
        fallbackUsed: true,
      };
    }

    const resumeV2 = (latest as any).resumeV2Json ?? null;
    if (options?.requireResumeV2Authority) {
      assertUsableResumeV2(resumeV2);
      const canonical = this.buildCanonicalBaselineFromResumeV2(resumeV2);
      return { canonical, fallbackUsed: false };
    }

    const resumeV2Usability = evaluateResumeV2Usability(resumeV2);
    if (!resumeV2Usability.usable) {
      this.logger.warn(
        `Canonical Resume V2 is unusable for scoring on baseline ${baseline.id}; proceeding with canonical baseline parsed JSON for score consistency.`,
      );
    }

    try {
      const canonical = BaselineSchema.parse(latest.parsedJson);
      return { canonical, fallbackUsed: false };
    } catch (error) {
      this.logger.warn(
        `Canonical baseline validation failed for ${baseline.id}: ${error}`,
      );
      return {
        canonical: this.buildFallbackCanonicalBaseline(baseline),
        fallbackUsed: true,
      };
    }
  }

  private buildFallbackCanonicalBaseline(
    baseline: Baseline,
  ): BaselineSchemaCoreShape {
    const sections = baseline.sections ?? [];
    if (!sections.length) {
      throw new BadRequestException({
        error: {
          code: 'baseline_canonical_missing',
          message:
            'Baseline is missing canonical data. Please re-ingest the baseline document before scoring.',
        },
      });
    }

    const summarySection = sections.find(
      (section) => section.sectionType === BaselineSectionType.SUMMARY,
    );
    const summaryContent =
      summarySection?.content?.trim() ||
      sections[0]?.content?.trim() ||
      null;

    const experienceEntries: BaselineSchemaCoreShape['experience'] = sections
      .filter(
        (section) =>
          section.sectionType === BaselineSectionType.EXPERIENCE ||
          section.sectionType === BaselineSectionType.PROJECT,
      )
      .map((section, index) => {
        const title = section.title?.trim() ?? `Experience ${index + 1}`;
        return {
          company: title,
          role: title,
          start_date: null,
          end_date: null,
          evidence: [],
          company_name: title,
          role_title: title,
          // There is no scope_summary on BaselineSection; leave undefined for canonical fallback.
          details_text: section.content?.trim() ?? '',
        };
      });

    if (!experienceEntries.length) {
      experienceEntries.push({
        company: baseline.originalFilename ?? 'Baseline experience',
        role: baseline.originalFilename ?? 'Baseline experience',
        start_date: null,
        end_date: null,
        evidence: [],
        company_name: baseline.originalFilename ?? 'Baseline',
        role_title: 'Experience',
        scope_summary: undefined,
        details_text:
          sections.map((block) => block.content ?? '').join('\n').trim() ||
          'Baseline resume content',
      });
    }

    return {
      schema_version: 'baseline_schema_v1',
      user_verified: false,
      identity: {
        full_name: null,
        summary: summaryContent,
        current_title: null,
        current_company: null,
        location: null,
      },
      experience: experienceEntries,
      education: [],
      skills: [],
      people_leadership: {
        direct_reports: null,
        managers_led: null,
        global_teams: null,
      },
      operational_ownership: {
        functions_owned: [],
        process_design: null,
        process_scaling: null,
      },
      tooling_and_platforms: {
        tools: [],
        ownership_level: 'unknown',
      },
      cross_functional_partnership: {
        product: null,
        engineering: null,
        sales_cs: null,
        executive: null,
      },
      customer_advocacy: {
        executive_escalations: null,
        voice_of_customer: null,
        post_incident_rca: null,
      },
      scale_and_scope: {
        customer_segment: 'unknown',
        geo_scope: 'unknown',
        org_stage: 'unknown',
      },
      metrics_and_outcomes: {
        metrics_present: false,
        metrics: [],
      },
      skills_and_tools: {
        tools: [],
        methodologies: [],
        domains: [],
      },
      system_generated_read_only: {
        missing_fields: [],
        ambiguity_flags: [],
        low_confidence_extractions: [],
      },
    };
  }

  private buildInputsHash(
    job: FitScoreInput['job'],
    baseline: Baseline,
    sections: Array<{ type?: string; content: string }>,
    dimensionWeights: DimensionWeightOverrides,
  ) {
    const payload = {
      scoringVersion: SCORING_V2_INPUTS_VERSION,
      normalizationVersion: JOB_NORMALIZATION_VERSION,
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

  private async loadCanonicalBaselineForRun(userId: string, baselineId: string) {
    const baseline = await this.baselineRepository
      .createQueryBuilder('baseline')
      .leftJoinAndSelect('baseline.sections', 'sections')
      .leftJoinAndSelect('baseline.parsedRecords', 'parsedRecords')
      .select([
        'baseline.id',
        'baseline.userId',
        'baseline.version',
        'baseline.versionNumber',
        'baseline.originalFilename',
        'baseline.mimeType',
        'baseline.storagePath',
        'baseline.hash',
        'baseline.status',
        'baseline.isActive',
        'baseline.archivedAt',
        'baseline.originalBaselineScore',
        'baseline.latestBaselineScore',
        'baseline.latestAssessmentId',
        'baseline.firstAnalyzedAt',
        'baseline.lastAnalyzedAt',
        'baseline.isSynthetic',
        'baseline.syntheticScenarioKey',
        'baseline.syntheticRunId',
        'baseline.syntheticCreatedAt',
        'baseline.preserveFromCleanup',
        'baseline.createdAt',
        'baseline.updatedAt',
        'sections',
        'parsedRecords',
      ])
      .where('baseline.id = :baselineId', { baselineId })
      .andWhere('baseline.userId = :userId', { userId })
      .orderBy('sections.order', 'ASC')
      .getOne();

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

  private assertUuidOrUndefined(
    value: unknown,
    fieldName: string,
  ): string | undefined {
    if (value == null) {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a UUID`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        trimmed,
      );
    if (!isUuid) {
      throw new BadRequestException(`${fieldName} must be a UUID`);
    }
    return trimmed;
  }

  private async computeExpectedInputsHashForJobBaseline(
    userId: string,
    job: Job,
    baseline: Baseline,
    baselineVersion?: number | null,
  ) {
    const { canonical: canonicalBaseline } =
      this.getCanonicalBaselineForScoring(baseline, {
        requireResumeV2Authority: true,
      });
    const canonicalSections = this.buildCanonicalSectionPayload(
      canonicalBaseline,
    );
    const scoringBaseline = this.buildCanonicalScoringBaseline(baseline);
    const baselineSelection = selectBaselineTextForScoring({
      baseline: scoringBaseline,
      canonicalSections,
    });
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
    const jobTextForScoring = buildJobTextForScoring({
      rawDescription: canonicalJobForHash.rawDescription,
      normalizedResponsibilities: canonicalJobForHash.normalizedResponsibilities,
      normalizedRequirements: canonicalJobForHash.normalizedRequirements,
    });
    const normalizedJob = normalizeJobDescription(jobTextForScoring.jobText);
    const validatedRequirements = this.gapAnalysisService.validateRequirements(
      normalizedJob.normalized.requirements,
    );
    const baselineVersionValue = baselineVersion ?? baseline.version ?? 0;
    const canonicalJobForHashWithValidation: FitScoreInput['job'] = {
      ...canonicalJobForHash,
      normalizedRequirements: validatedRequirements,
    };
    const baselineForHash: Baseline = {
      ...baseline,
      sections: baselineSelection.selectedSections,
      version: baselineVersionValue,
    };
    return this.buildInputsHash(
      canonicalJobForHashWithValidation,
      baselineForHash,
      baselineSelection.sectionsForScoring,
      dimensionWeights,
    );
  }

  private buildAnalysisDedupeKey(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    inputsHash: string;
  }) {
    return sha256(
      [
        'analysis.run',
        input.userId,
        input.baselineId,
        input.jobId,
        input.inputsHash,
        SCORING_V2_INPUTS_VERSION,
      ].join('|'),
    );
  }

  private buildExpandedFitDedupeKey(input: {
    userId: string;
    interviewId: string;
    baselineId: string;
    baselineVersion: number;
    jobId: string;
    answerHash: string;
    decisionHash: string;
  }) {
    return sha256(
      [
        'analysis.expanded_fit',
        input.userId,
        input.interviewId,
        input.baselineId,
        String(input.baselineVersion),
        input.jobId,
        input.answerHash,
        input.decisionHash,
      ].join('|'),
    );
  }

  private isUniqueConflictError(error: unknown) {
    if (error instanceof QueryFailedError) return true;
    if (!error || typeof error !== 'object') return false;
    const record = error as Record<string, unknown>;
    return String(record.code ?? '').trim() === '23505';
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

    return this.getFitAssessmentById(userId, result.assessmentId);
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
      severity:
        flag === PROMPT_LIKE_FLAG_MESSAGE
          ? ComplianceFlagSeverity.WARN
          : ComplianceFlagSeverity.BLOCK,
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
    const user = await findUserByIdSchemaSafe({
      repo: this.usersRepository,
      logger: this.logger,
      userId,
      operation: 'AnalysisService.getCalibration',
      select: [
        'user.id',
        'user.calibrationProfileName',
        'user.calibrationWeights',
      ],
    });

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
    const normalized = String(profileName ?? '').trim();
    if (!normalized) return '';
    return normalized
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
    legacyWeightsOrProfile: LegacyCalibrationWeights | CalibrationProfile,
    profileName?: string,
  ) {
    // Support the external signature: (userId, assessmentId, profileName).
    // And the internal signature from saveCalibration: (userId, assessmentId, legacyWeights, profileName).
    const resolved = (() => {
      if (typeof legacyWeightsOrProfile === 'string') {
        const profile = legacyWeightsOrProfile.trim() as CalibrationProfile;
        const preset = CALIBRATION_PROFILES[profile];
        if (!preset) {
          throw new BadRequestException('Unsupported calibration profile');
        }
        const { legacy } = this.normalizeIncomingWeights(preset.weights);
        return {
          legacyWeights: legacy,
          profileName: profile,
          presetWeights: preset.weights,
        };
      }

      const name = String(profileName ?? '').trim();
      if (!name) {
        throw new BadRequestException('profileName is required');
      }
      return { legacyWeights: legacyWeightsOrProfile, profileName: name };
    })();

    const assessment = await this.fitAssessmentRepository.findOne({
      where: { id: assessmentId, userId },
    });

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    const payload = await this.buildLatestAssessmentPayload(assessment);

    // When calibrating via a named profile, prefer re-running the legacy scorer with the
    // corresponding dimension weights so callers get a realistic calibrated score.
    // (computeCalibratedScore is a lightweight fallback used for saved custom weights.)
    let calibrated = this.computeCalibratedScore(
      assessment.dimensionScores,
      resolved.legacyWeights,
      assessment.overallScore,
    );
    if (
      typeof legacyWeightsOrProfile === 'string' &&
      'presetWeights' in resolved &&
      resolved.presetWeights
    ) {
      const job = assessment.jobId
        ? await this.jobRepository.findOne({
            where: { id: assessment.jobId, userId },
          })
        : null;
      const baseline = assessment.baselineId
        ? await this.baselineRepository.findOne({
            where: { id: assessment.baselineId, userId },
            relations: ['sections'],
            order: { sections: { order: 'ASC' } },
          })
        : null;

      if (job && baseline) {
        const dimensionWeights = this.mapCalibrationToDimensionWeights(
          resolved.presetWeights,
        );
        const scoring = await this.fitScoringService.score(
          {
            job,
            baseline: {
              version: assessment.baselineVersion ?? baseline.version ?? null,
              sections: this.buildSectionPayload(baseline.sections ?? []),
            },
          },
          dimensionWeights,
          { debug: false },
        );
        const overall = Math.round(Number(scoring.overallScore) * 10) / 10;
        if (Number.isFinite(overall)) {
          calibrated = {
            overallScore: overall,
            delta:
              Math.round((overall - (assessment.overallScore ?? 0)) * 10) / 10,
          };
        }
      }
    }

    return {
      ...payload,
      overallScore: calibrated.overallScore,
      score: calibrated.overallScore,
      calibration: {
        profile: resolved.profileName,
        label: this.formatProfileLabel(resolved.profileName),
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

    let currentStage: PipelineStage | null = null;
    const attemptContext = {
      baselineId: baseline.id,
      jobId: payload.job?.id?.trim() ?? 'ad-hoc',
      triggerType: 'manual' as TriggerType,
    };
    const logAttemptEvent = (
      event: string,
      details: Record<string, unknown> = {},
    ) => {
      if (!this.isDevMode()) return;
      this.logPipelineEvent(event, {
        ...attemptContext,
        stage: currentStage ?? 'input_validation',
        ...details,
      });
    };

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId: baseline.id },
        order: { order: 'ASC' },
      });
    }

    const normalizedSelectedBlockIds = this.normalizeSelectedBlockIds(
      payload.selected_block_ids,
    );
    const { canonical: canonicalBaseline } =
      this.getCanonicalBaselineForScoring(baseline, {
        requireResumeV2Authority: true,
      });
    const canonicalSections = this.buildCanonicalSectionPayload(
      canonicalBaseline,
    );
    const scoringBaseline = this.buildCanonicalScoringBaseline(baseline);
    const baselineSelection = selectBaselineTextForScoring({
      baseline: scoringBaseline,
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
    const validatedRequirements =
      this.gapAnalysisService.validateRequirements(normalizedJobRequirements);
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
      {
        ...canonicalJobForHash,
        normalizedRequirements: validatedRequirements,
      },
      baselineForHash,
      sectionPayload,
      dimensionWeights,
    );

      let scoringV2 = this.fitScoringService.scoreCxFitV2Authenticated(
        {
          job: {
            rawDescription: canonicalJobForHash.rawDescription,
            normalizedResponsibilities: normalizedJobResponsibilities,
            normalizedRequirements: validatedRequirements,
          },
          normalizedJobResponsibilities,
          normalizedJobRequirements: validatedRequirements,
          baselineSections: sectionPayload,
          metadata: {
            jobId: job?.id ?? jobId ?? undefined,
            baselineId: baseline.id,
            baselineVersionId: baselineVersion.id,
          },
          jobTitle: jobPayload.title ?? undefined,
        },
        { debugBundle: allowDebug },
      );
      scoringV2 = this.alignCxFitScoreToResumeProject(scoringV2) ?? scoringV2;
      const authoritativeScore = scoringV2.score;

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

    const confidenceResult =
      this.fitScoringService.computeCxFitV2ConfidenceScore(scoringV2.debug);

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
        validatedRequirements: this.gapAnalysisService.validateRequirements(
          validatedRequirements,
        ),
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
      currentStage = "persistence";
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

    const computedSummary =
      scoring?.summary ?? this.buildSummaryFromTerms(strengths, gaps);
    const jobDescriptionNonEmpty = jobTextForScoring.jobRawTextCharCount > 0;
    const jobDescriptionTermsEmpty =
      jobNormDebug.responsibilitiesCount === 0 &&
      jobNormDebug.requirementsCount === 0;
    const scoringReliability: AnalysisResult['scoringReliability'] =
      jobDescriptionNonEmpty && jobDescriptionTermsEmpty ? 'unreliable' : 'ok';
    const scoringReliabilityReason: AnalysisResult['scoringReliabilityReason'] =
      jobDescriptionNonEmpty && jobDescriptionTermsEmpty
        ? 'job_description_terms_empty'
        : jobDescriptionNonEmpty
          ? undefined
          : 'job_description_empty';

    return {
      status: 'ok',
      fit_score: finalScore,
      overall_score: finalScore,
      verdict:
        responseVerdict === "APPLY"
          ? "Apply"
          : responseVerdict === "CONSIDER"
          ? "Consider"
          : "Skip",
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
      summary: computedSummary,
      scoringReliability,
      ...(scoringReliabilityReason ? { scoringReliabilityReason } : {}),
      ...(debugInfo ? { debug: debugInfo } : {}),
      ...(fitScoreDebug ? { fit_score_debug: fitScoreDebug } : {}),
      scoringProof,
      confidenceScore: confidenceResult.confidenceScore,
      confidenceReasons: confidenceResult.confidenceReasons,
      scoreConfidence: scoringV2.scoreConfidence,
      scoreConfidenceReasons: scoringV2.scoreConfidenceReasons,
      scoreSanityFlags: scoringV2.scoreSanityFlags,
      likelyUnderestimatedFit: scoringV2.likelyUnderestimatedFit,
      scorePresentationMode: scoringV2.scorePresentationMode,
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

      const { canonical: canonicalBaseline } =
        this.getCanonicalBaselineForScoring(baseline, {
          requireResumeV2Authority: true,
        });
      const canonicalSections = this.buildCanonicalSectionPayload(
        canonicalBaseline,
      );
      const scoringBaseline = this.buildCanonicalScoringBaseline(baseline);
      const baselineSelection = selectBaselineTextForScoring({
        baseline: scoringBaseline,
        canonicalSections,
      });
      const baselineText = baselineSelection.normalizedBaselineText;
      if (baselineSelection.source !== 'baseline_parsed') {
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
      }
      const sectionPayload = baselineSelection.sectionsForScoring;
      const complianceBaselineSections =
        this.complianceService.normalizeSectionsForOutput(sectionPayload);
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

      const jobAnalysis = this.buildJobAnalysis({
        rawDescription: jobDescription,
        normalizedResponsibilities: job?.normalizedResponsibilities ?? [],
        normalizedRequirements: job?.normalizedRequirements ?? [],
      });
      const fitScore = this.buildFitScore({
        score,
        matchedSignals: strengths,
        gapSignals: gapList,
        sourceEvidence: [
          ...jobAnalysis.sourceEvidence,
          ...strengths,
          ...gapList,
        ],
      });

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
        jobAnalysis,
        fitScore,
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
    let analysisDedupeKey: string | undefined;
    let baselineForLog: string | null = null;
    let jobForLog: string | null = null;
    let triggerTypeForLog: TriggerType = "manual";
    let currentStage: PipelineStage = "input_validation";
    let attemptContext: RunFitAssessmentAttemptContext | null = null;
    let logAttemptEvent:
      | ((event: string, details?: Record<string, unknown>) => void)
      | null = null;
    const logStageLifecycle = (
      event: string,
      pipelineStage: PipelineStage | 'run',
      details: Record<string, unknown> = {},
    ) => {
      if (!this.isDevMode() || !attemptContext) return;
      const payload = {
        area: 'analysis',
        operation: 'run',
        status: event,
        code: event,
        runId: attemptContext.attemptId,
        baselineId: attemptContext.baselineId,
        jobId: attemptContext.jobId,
        pipelineStage,
        ...details,
      };
      this.logger.debug(JSON.stringify(payload));
    };
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
      const baselineVersionId = this.assertUuidOrUndefined(
        normalizedPayload.baseline_version_id,
        'baselineVersionId',
      );

      const resolvedBaselineId = baselineId!;
      const resolvedJobId = jobId!;
      const triggerType = (payload.triggerType ?? "manual") as TriggerType;
      baselineForLog = resolvedBaselineId;
      jobForLog = resolvedJobId;
      triggerTypeForLog = triggerType;
      const attemptId = randomUUID();
      attemptContext = {
        attemptId,
        baselineId: resolvedBaselineId,
        jobId: resolvedJobId,
        triggerType,
      };
      logAttemptEvent = (event, details = {}) => {
        if (!attemptContext) return;
        this.logPipelineEvent(event, { ...attemptContext, ...details });
      };
      currentStage = "input_validation";
      logAttemptEvent("scoring_attempt_started", {
        stage: currentStage,
      });
      logStageLifecycle("run_started", currentStage, {
        triggerType,
      });

      const baseline = await this.loadCanonicalBaselineForRun(
        userId,
        resolvedBaselineId,
      );
      await this.ensureBaselineHasContent(baseline.id);

      const job = await this.jobRepository.findOne({
        where: { id: resolvedJobId, userId },
      });

      if (!job) {
        throw new NotFoundException('Job not found');
      }

      if (attemptContext) {
        attemptContext.baselineLabel =
          baseline.originalFilename ?? baseline.id ?? resolvedBaselineId;
        attemptContext.jobTitle =
          job.title ?? job.company ?? resolvedJobId;
      }

      const jobKey = job.id;
      const requestRunId = this.nextShortTextWarningRequestRunId();
      shortTextWarningKey = this.buildShortTextWarningKey(jobKey, requestRunId);

      const {
        canonical: canonicalBaseline,
        fallbackUsed: baselineFallbackUsed,
      } = this.getCanonicalBaselineForScoring(baseline, {
        requireResumeV2Authority: true,
      });
      const canonicalSections = this.buildCanonicalSectionPayload(
        canonicalBaseline,
      );
      const scoringBaseline = this.buildCanonicalScoringBaseline(baseline);
      currentStage = "parsing";
      logStageLifecycle("parse_started", currentStage);
      logAttemptEvent?.("baseline_parsing_started", {
        stage: currentStage,
      });
      const baselineSelection = selectBaselineTextForScoring({
        baseline: scoringBaseline,
        canonicalSections,
      });
      if (baselineFallbackUsed) {
        logAttemptEvent?.("canonical_baseline_fallback", {
          stage: currentStage,
          fallbackReason: 'missing_or_invalid_canonical',
        });
      }
      logAttemptEvent?.("canonical_baseline_parsed", {
        stage: currentStage,
      });
      logStageLifecycle("parse_completed", currentStage, {
        fallbackUsed: baselineFallbackUsed,
      });
      const baselineText = baselineSelection.normalizedBaselineText;
      if (baselineSelection.source !== 'baseline_parsed') {
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
      const validatedRequirements =
        this.gapAnalysisService.validateRequirements(normalizedJobRequirements);
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
        {
          ...canonicalJobForHash,
          normalizedRequirements: validatedRequirements,
        },
        baselineForHash,
        sectionPayload,
        dimensionWeights,
      );

      analysisDedupeKey = this.buildAnalysisDedupeKey({
        userId,
        baselineId: baseline.id,
        jobId: job.id,
        inputsHash,
      });

      this.logger.log(
        `[fit-score] analysis.run request runId=${attemptContext.attemptId} userId=${userId} baselineId=${baseline.id} jobId=${job.id} inputsHash=${inputsHash} dedupeKey=${analysisDedupeKey}`,
      );

      const reservation = await this.workflowIdempotencyService.reserve<RunAssessmentResult>({
        userId,
        operationName: 'analysis.run',
        dedupeKey: analysisDedupeKey,
        runId: attemptContext.attemptId,
      });

      this.logger.log(
        `[fit-score] analysis.run idempotency_decision runId=${reservation.runId} status=${reservation.status} userId=${userId} baselineId=${baseline.id} jobId=${job.id} dedupeKey=${analysisDedupeKey}`,
      );

      if (reservation.status === 'existing_completed' && reservation.responseBody) {
        if (this.isDevMode()) {
          this.logger.log(
            `[fit-score] duplicate_request_reused operation=analysis.run runId=${reservation.runId} dedupeKey=${analysisDedupeKey} assessmentId=${(reservation.responseBody as { assessmentId?: string }).assessmentId ?? 'missing'}`,
          );
        }
        return {
          ...(reservation.responseBody as RunAssessmentResult),
          idempotency: {
            status: reservation.status,
            runId: reservation.runId,
            dedupeKey: analysisDedupeKey,
            reused: true,
          },
        } as RunAssessmentResult;
      }

      if (reservation.status === 'existing_in_flight') {
        throw new ConflictException({
          error: {
            code: 'analysis_in_flight',
            message:
              'An analysis is already running for this baseline and job. Please wait for it to finish.',
            retryable: true,
            nextAction: 'retry_later',
            runId: reservation.runId,
            dedupeKey: analysisDedupeKey,
          },
        });
      }

      const idempotencyMeta = {
        status: reservation.status,
        runId: reservation.runId,
        dedupeKey: analysisDedupeKey,
        reused: reservation.status === 'existing_completed',
      } as const;
      const dedupeKey = analysisDedupeKey ?? `${baseline.id}:${resolvedJobId}`;

      const allowDebug = Boolean(payload.debug);

      currentStage = "generation";
      logStageLifecycle("generation_started", currentStage);
      this.logger.log(
        `[fit-score] analysis.run scoring_started runId=${attemptContext.attemptId} userId=${userId} baselineId=${baseline.id} jobId=${resolvedJobId} dedupeKey=${analysisDedupeKey}`,
      );
      const promptFlags = this.fitScoringService.buildComplianceFlags(
        jobText,
        baselineText,
        job.sourceUrl ?? null,
      );
      if (promptFlags.includes(PROMPT_LIKE_FLAG_MESSAGE)) {
        logStageLifecycle("prompt_like_job_detected", currentStage, {
          warning: true,
          message: PROMPT_LIKE_FLAG_MESSAGE,
        });
      }
      let scoringV2 = this.fitScoringService.scoreCxFitV2Authenticated(
        {
          job: {
            rawDescription: canonicalJobForHash.rawDescription,
            normalizedResponsibilities: normalizedJobResponsibilities,
            normalizedRequirements: validatedRequirements,
          },
          normalizedJobResponsibilities,
          normalizedJobRequirements: validatedRequirements,
          baselineSections: sectionPayload,
          metadata: {
            jobId: job?.id ?? resolvedJobId ?? null,
            baselineId: baseline.id,
            baselineVersionId,
          },
          jobTitle: job?.title ?? undefined,
        },
        { debugBundle: allowDebug },
      );
      scoringV2 = this.alignCxFitScoreToResumeProject(scoringV2) ?? scoringV2;
      const authoritativeScore = scoringV2.score;

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
      if (authoritativeScore === 0) {
        this.assertNoImpossibleZeroScore({
          baselineId: baseline.id,
          jobId: job.id,
          baselineSectionCount: sectionPayload.length,
          baselineTextLength: baselineTextCharsScored,
          jobTextLength: jobTextCharsScored,
          scorerVersion: scoringV2.scorerVersion ?? null,
          categoryBreakdown: scoringV2.rubric.dimensionPercents,
          resumeProjectBreakdown: this.buildResumeProjectInvariantDetails(scoringV2),
        });
      }
      logStageLifecycle("generation_completed", currentStage, {
        score: authoritativeScore,
      });
      if (this.isDevMode()) {
        this.logger.log(
          `[fit-score] scoring_v2_completed baselineId=${baseline.id} jobId=${resolvedJobId} score=${authoritativeScore} heuristicUsed=${scoringV2.debug.heuristicInference.usedHeuristicInference} heuristicLiftTotal=${scoringV2.debug.heuristicInference.heuristicLiftTotal} scoreConfidence=${scoringV2.scoreConfidence} scorePresentationMode=${scoringV2.scorePresentationMode}`,
        );
      }
      this.logger.log(
        `[fit-score] analysis.run scoring_completed runId=${attemptContext.attemptId} userId=${userId} baselineId=${baseline.id} jobId=${resolvedJobId} dedupeKey=${analysisDedupeKey} score=${authoritativeScore}`,
      );

      this.applyBaselineCoverageDetails(
        scoringV2,
        baseline,
        sectionPayload,
        baselineSelection.selectedSectionIds,
        baselineSelection.source,
        baselineSelection.originalBaselineChars,
      );

      const confidenceResult =
        this.fitScoringService.computeCxFitV2ConfidenceScore(scoringV2.debug);

      const legacyDimensionScores =
        this.mapCxFitV2ToLegacyDimensionScores(scoringV2);
      const responseVerdict =
        this.deriveFitScoreVerdictLabelFromScore(authoritativeScore);
      const persistenceVerdict =
        this.deriveFitAssessmentVerdictFromScore(authoritativeScore);

      const gapInsights = this.gapAnalysisService.analyze({
        baselineSections: sectionPayload,
        validatedRequirements: this.gapAnalysisService.validateRequirements(
          validatedRequirements,
        ),
        dimensionPercents: scoringV2.rubric.dimensionPercents,
        debugMatching: Boolean(
          (normalizedPayload as RunFitAssessmentPayload).debugMatching,
        ),
      });
      const strengths = gapInsights.strengths;
      const gaps = gapInsights.criticalGaps.map((gap) => gap.title);
      const finalScore = authoritativeScore;
      const jobAnalysis = this.buildJobAnalysis({
        rawDescription: job?.rawDescription ?? '',
        normalizedResponsibilities: job?.normalizedResponsibilities ?? [],
        normalizedRequirements: job?.normalizedRequirements ?? [],
      });
      const fitScore = this.buildFitScore({
        score: finalScore,
        matchedSignals: strengths,
        gapSignals: gaps,
        sourceEvidence:
          strengths.length || gaps.length
            ? [...strengths, ...gaps]
            : [job?.rawDescription ?? ''],
      });
      const scoringReliability =
        jobTextForScoring.jobRawTextCharCount > 0 &&
        jobNormDebug.responsibilitiesCount === 0 &&
        jobNormDebug.requirementsCount === 0
          ? ('unreliable' as const)
          : ('ok' as const);
      const scoringReliabilityReason =
        scoringReliability === 'unreliable'
          ? ('job_description_terms_empty' as const)
          : undefined;

      const breakdown = {
        experience_alignment: legacyDimensionScores.experienceAlignment,
        leadership_level: legacyDimensionScores.leadershipLevel,
        technical_platform_fit: legacyDimensionScores.technicalPlatformFit,
        industry_context: legacyDimensionScores.industryContext,
        strategic_vs_tactical: legacyDimensionScores.strategicTacticalFit,
      };

      const baselineVersionHashForDebug = baseline.hash ?? null;
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
              baselineVersionHash: baselineVersionHashForDebug,
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

      const baselineHashSource = baseline.hash ? 'stored' : 'derived';
      const baselineVersionHash =
        (baseline.hash ?? this.buildBaselineFallbackHash(canonicalBaseline));

      currentStage = "compliance";
      logStageLifecycle("validation_started", currentStage);
      logAttemptEvent?.("compliance_started", {
        stage: currentStage,
      });
      const compliance = await this.complianceService.validateAndAudit({
        action: ComplianceAction.FIT_SCORE,
        actorId: userId,
        baselineVersion: { hash: baselineVersionHash } as BaselineVersion,
        job,
        outputHash: inputsHash,
        baselineSections: complianceBaselineSections,
        generatedSections: generatedSectionsForCompliance,
        debugCompliance: Boolean(normalizedPayload.debugCompliance),
        extraFlags: undefined,
      });

      logAttemptEvent?.("compliance_checked", {
        stage: currentStage,
        blocked: compliance.blocked,
        baselineHashSource,
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

        logAttemptEvent?.("scoring_attempt_blocked", {
          stage: currentStage,
          failureCategory: "compliance_or_validation_rejected",
        });
        logStageLifecycle("validation_rejected", currentStage, {
          reason: 'compliance_blocked',
          blockedFlags: normalizedFlags.map((flag) => flag.code ?? flag.message),
        });

      const blockedSummary =
        this.buildSummaryFromTerms(strengths, gaps);
      const blockedJobDescriptionNonEmpty =
        jobTextForScoring.jobRawTextCharCount > 0;
      const blockedJobDescriptionTermsEmpty =
        jobNormDebug.responsibilitiesCount === 0 &&
        jobNormDebug.requirementsCount === 0;
      const blockedScoringReliability: AnalysisResult['scoringReliability'] =
        blockedJobDescriptionNonEmpty && blockedJobDescriptionTermsEmpty
          ? 'unreliable'
          : 'ok';
      const blockedScoringReliabilityReason: AnalysisResult['scoringReliabilityReason'] | undefined =
        blockedJobDescriptionNonEmpty && blockedJobDescriptionTermsEmpty
          ? 'job_description_terms_empty'
          : undefined;

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
        summary: blockedSummary,
        scoringReliability: blockedScoringReliability,
        ...(blockedScoringReliabilityReason
          ? { scoringReliabilityReason: blockedScoringReliabilityReason }
          : {}),
        confidenceScore: confidenceResult.confidenceScore,
        confidenceReasons: confidenceResult.confidenceReasons,
        scoreConfidence: scoringV2.scoreConfidence,
        scoreConfidenceReasons: scoringV2.scoreConfidenceReasons,
        scoreSanityFlags: scoringV2.scoreSanityFlags,
        likelyUnderestimatedFit: scoringV2.likelyUnderestimatedFit,
        scorePresentationMode: scoringV2.scorePresentationMode,
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
            compliance.audit.baselineVersionHash ?? baselineVersionHash,
          jobId: resolvedJobId,
          baselineId: baseline.id,
          baselineVersion: baselineVersion ?? baseline.version ?? null,
          idempotency: idempotencyMeta,
        };
        await this.workflowIdempotencyService.complete({
          userId,
          operationName: 'analysis.run',
          dedupeKey: analysisDedupeKey,
          runId: attemptContext.attemptId,
          responseBody: blockedResponse,
        });
        return blockedResponse;
      }

      logStageLifecycle("validation_passed", currentStage, {
        blocked: false,
        baselineHashSource,
      });

      const freshBaseline = await this.loadBaselineWithSections(userId, baseline.id);
      const freshJob = await this.fetchJobForUser(resolvedJobId, userId);
      const freshInputsHash = await this.computeExpectedInputsHashForJobBaseline(
        userId,
        freshJob,
        freshBaseline,
        baselineVersion ?? baseline.version ?? null,
      );

      if (freshInputsHash !== inputsHash) {
        if (process.env.NODE_ENV !== 'production') {
          const freshCanonicalBaseline =
            this.getCanonicalBaselineForScoring(freshBaseline, {
              requireResumeV2Authority: true,
            });
          const freshCanonicalSections = this.buildCanonicalSectionPayload(
            freshCanonicalBaseline.canonical,
          );
          const freshScoringBaseline =
            this.buildCanonicalScoringBaseline(freshBaseline);
          const freshBaselineSelection = selectBaselineTextForScoring({
            baseline: freshScoringBaseline,
            canonicalSections: freshCanonicalSections,
          });
          const freshJobTextForScoring = buildJobTextForScoring({
            rawDescription: freshJob.rawDescription,
            normalizedResponsibilities: freshJob.normalizedResponsibilities ?? [],
            normalizedRequirements: freshJob.normalizedRequirements ?? [],
          });
          const freshNormalizedJob = normalizeJobDescription(
            freshJobTextForScoring.jobText,
          );
          const freshValidatedRequirements =
            this.gapAnalysisService.validateRequirements(
              freshNormalizedJob.normalized.requirements,
            );
          const freshBaselineVersionValue =
            baselineVersion ?? freshBaseline.version ?? 0;
          const freshInputsHashDebug = this.buildInputsHash(
            {
              ...canonicalJobForHash,
              normalizedRequirements: freshValidatedRequirements,
            },
            {
              ...freshBaseline,
              sections: freshBaselineSelection.selectedSections,
              version: freshBaselineVersionValue,
            },
            freshBaselineSelection.sectionsForScoring,
            dimensionWeights,
          );
          this.logger.warn(
            `[fit-score] analysis.run stale_recheck_mismatch runId=${attemptContext.attemptId} userId=${userId} baselineId=${baseline.id} jobId=${resolvedJobId} initialInputsHash=${inputsHash} freshInputsHash=${freshInputsHashDebug} initialBaselineSelectionSource=${baselineSelection.source} freshBaselineSelectionSource=${freshBaselineSelection.source} initialBaselineSelectionCount=${baselineSelection.selectedSectionCount} freshBaselineSelectionCount=${freshBaselineSelection.selectedSectionCount} initialBaselineVersion=${baselineForHash.version} freshBaselineVersion=${freshBaselineVersionValue} initialValidatedRequirementsCount=${validatedRequirements.length} freshValidatedRequirementsCount=${freshValidatedRequirements.length}`,
          );
        }
        await this.workflowIdempotencyService.markFailure({
          userId,
          operationName: 'analysis.run',
          dedupeKey: analysisDedupeKey,
          runId: attemptContext.attemptId,
          status: 'STALE',
          errorCode: 'stale_request_ignored',
          errorMessage:
            'The analysis inputs changed while this request was running. Re-run the current baseline and job pair.',
        });
        throw new ConflictException({
          error: {
            code: 'stale_request_ignored',
            message:
              'The analysis inputs changed while this request was running. Re-run the current baseline and job pair.',
            retryable: true,
            nextAction: 'retry_later',
            runId: attemptContext.attemptId,
            dedupeKey: analysisDedupeKey,
          },
        });
      }

      const complianceFlags = (compliance.complianceFlags ?? []).map((flag) =>
        typeof flag === 'string' ? flag : flag.code,
      );
      if (baselineVersionId !== undefined) {
        this.assertUuidOrUndefined(
          baselineVersionId,
          'metadata.baselineVersionId',
        );
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
        scoringReliability,
        ...(scoringReliabilityReason ? { scoringReliabilityReason } : {}),
      });
      if (syntheticMetadata?.isSynthetic) {
        applySyntheticMetadata(assessment, syntheticMetadata);
      }

      currentStage = 'persistence';
      logStageLifecycle('persistence_started', currentStage);
      logAttemptEvent?.('persistence_started', {
        stage: currentStage,
      });

      let savedAssessment: FitAssessment;
      try {
        savedAssessment = await this.fitAssessmentRepository.save(assessment);
      } catch (error) {
        if (!this.isUniqueConflictError(error)) {
          throw error;
        }

        const existingAssessment = await this.fitAssessmentRepository.findOne({
          where: {
            userId,
            jobId: resolvedJobId,
            baselineId: baseline.id,
            inputsHash,
          },
        });

        if (!existingAssessment) {
            await this.workflowIdempotencyService.markFailure({
              userId,
              operationName: 'analysis.run',
              dedupeKey: analysisDedupeKey,
              runId: attemptContext.attemptId,
              status: 'PERSISTENCE_CONFLICT',
              errorCode: 'artifact_write_conflict',
            errorMessage:
              'A concurrent analysis write conflicted with this request.',
          });
          throw new ConflictException({
            error: {
              code: 'artifact_write_conflict',
              message:
                'A concurrent analysis write conflicted with this request.',
              retryable: true,
              nextAction: 'retry_later',
              runId: attemptContext.attemptId,
              dedupeKey: analysisDedupeKey,
            },
          });
        }

        savedAssessment = existingAssessment;
      }

      if (
        savedAssessment.userId !== userId ||
        savedAssessment.baselineId !== baseline.id
      ) {
        throw new InternalServerErrorException(
          'Persisted assessment linkage does not match requested user/baseline',
        );
      }

      await this.triggerDownstreamDocumentGeneration(userId, savedAssessment);

      const lastAnalyzedAt = new Date();
      try {
        await this.baselineRepository.update(
          { id: baseline.id, userId },
          {
            latestAssessmentId: savedAssessment.id,
            latestBaselineScore: finalScore,
            lastAnalyzedAt,
          },
        );
        this.logger.log(
          JSON.stringify({
            area: 'analysis',
            operation: 'run',
            status: 'completed',
            code: 'result_persisted',
            runId: attemptContext.attemptId,
            userId,
            baselineId: baseline.id,
            jobId: resolvedJobId,
            assessmentId: savedAssessment.id,
            dedupeKey: analysisDedupeKey,
            score: finalScore,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          JSON.stringify({
            area: 'analysis',
            operation: 'run',
            status: 'error',
            code: 'artifact_write_conflict',
            runId: attemptContext.attemptId,
            baselineId: baseline.id,
            jobId: resolvedJobId,
            assessmentId: savedAssessment.id,
            message,
          }),
          error instanceof Error ? error.stack : undefined,
        );
        await this.workflowIdempotencyService.markFailure({
          userId,
          operationName: 'analysis.run',
          dedupeKey: analysisDedupeKey ?? `${baseline.id}:${resolvedJobId}`,
          runId: attemptContext.attemptId,
          status: 'PERSISTENCE_CONFLICT',
          errorCode: 'artifact_write_conflict',
          errorMessage: message,
        });
        throw new InternalServerErrorException(
          'Unable to persist baseline assessment linkage',
        );
      }

      const successScoringProof: ScoringProofSnapshot = {
        ...scoringProof,
        assessmentId: savedAssessment.id,
      };

      logAttemptEvent?.("persistence_completed", {
        stage: currentStage,
        assessmentId: savedAssessment.id,
      });
      logStageLifecycle("persistence_completed", currentStage, {
        assessmentId: savedAssessment.id,
        score: finalScore,
      });
      logAttemptEvent?.("scoring_attempt_success", {
        stage: currentStage,
        score: finalScore,
      });

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
        verdict:
          responseVerdict === "APPLY"
            ? "Apply"
            : responseVerdict === "CONSIDER"
            ? "Consider"
            : "Skip",
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
          this.buildSummaryFromTerms(strengths, gaps),
        scoringReliability:
          jobTextForScoring.jobRawTextCharCount > 0 &&
          jobNormDebug.responsibilitiesCount === 0 &&
          jobNormDebug.requirementsCount === 0
            ? 'unreliable'
            : 'ok',
        ...(jobTextForScoring.jobRawTextCharCount > 0 &&
        jobNormDebug.responsibilitiesCount === 0 &&
        jobNormDebug.requirementsCount === 0
          ? { scoringReliabilityReason: 'job_description_terms_empty' as const }
          : {}),
        ...(debugInfo ? { debug: debugInfo } : {}),
        scoringProof: successScoringProof,
        confidenceScore: confidenceResult.confidenceScore,
        confidenceReasons: confidenceResult.confidenceReasons,
        scoreConfidence: scoringV2.scoreConfidence,
        scoreConfidenceReasons: scoringV2.scoreConfidenceReasons,
        scoreSanityFlags: scoringV2.scoreSanityFlags,
        likelyUnderestimatedFit: scoringV2.likelyUnderestimatedFit,
        scorePresentationMode: scoringV2.scorePresentationMode,
        jobAnalysis: null,
        fitScore,
        baseline_version_hash:
          compliance.audit.baselineVersionHash ?? baselineVersionHash,
        latestAssessmentSummary: {
          latestAssessmentId: savedAssessment.id,
          latestAssessmentCreatedAt: savedAssessment.createdAt,
          latestFitScore: finalScore,
          hasCompletedAssessment: true,
        },
        idempotency: idempotencyMeta,
      };
      await this.workflowIdempotencyService.complete({
          userId,
          operationName: 'analysis.run',
          dedupeKey: analysisDedupeKey,
          runId: attemptContext.attemptId,
          responseBody: successResponse,
        });
      return successResponse;
    } catch (error) {
      const context =
        attemptContext ??
        {
          baselineId: baselineForLog ?? 'unknown',
          jobId: jobForLog ?? 'unknown',
          triggerType: triggerTypeForLog,
        };
      const failureCategory = this.classifyPipelineFailure(error, currentStage);
      const failureEvent =
        currentStage === "parsing"
          ? "parse_failed"
          : currentStage === "generation"
          ? "generation_failed"
          : currentStage === "compliance"
          ? "validation_rejected"
          : currentStage === "persistence"
          ? "persistence_failed"
          : "run_failed";
      logStageLifecycle(failureEvent, currentStage, {
        failureCategory,
        reason: this.simplifyErrorMessage(error),
      });
      this.logPipelineEvent("scoring_attempt_failed", {
        ...context,
        stage: currentStage,
        failureCategory,
        error: this.simplifyErrorMessage(error),
      });
      if (attemptContext) {
        await this.workflowIdempotencyService.markFailure({
          userId,
          operationName: 'analysis.run',
          dedupeKey: analysisDedupeKey ?? `${baselineForLog ?? 'unknown'}:${jobForLog ?? 'unknown'}`,
          runId: attemptContext.attemptId,
          status: 'FAILED',
          errorCode: failureCategory,
          errorMessage: this.simplifyErrorMessage(error),
        });
      }
      if (error instanceof HttpException) {
        throw error;
      }

      const exceptionName =
        error instanceof Error ? error.name : 'Error';
      const exceptionMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[fit-score] analysis.run unhandled_exception stage=${currentStage} baselineId=${context.baselineId} jobId=${context.jobId} triggerType=${context.triggerType} exceptionName=${exceptionName} exceptionMessage=${exceptionMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException({
        error: {
          code: 'analysis_run_unhandled_exception',
          message: 'Analysis run failed unexpectedly.',
          exceptionName,
          exceptionMessage,
          failingFunction: 'AnalysisService.runFitAssessment',
          baselineId: context.baselineId,
          jobId: context.jobId,
        },
      });
    } finally {
      if (shortTextWarningKey) {
        this.clearShortTextWarningKey(shortTextWarningKey);
      }
    }
  }

  private isDevMode() {
    return process.env.NODE_ENV !== 'production';
  }

  private logPipelineEvent(event: string, details: Record<string, unknown>) {
    if (!this.isDevMode()) return;
    this.logger.debug(`[fit-score-pipeline] ${event}`, {
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  private classifyPipelineFailure(
    error: unknown,
    stage: PipelineStage,
  ): FailureCategory {
    if (error instanceof BadRequestException || error instanceof NotFoundException) {
      const response =
        error instanceof HttpException && typeof error.getResponse === 'function'
          ? error.getResponse()
          : null;
      const errorCode =
        response && typeof response === 'object'
          ? (response as any).error?.code ?? (response as any).errorCode
          : null;
      if (errorCode === 'analysis_context_mismatch') {
        return 'pair_mismatch_rejected';
      }
      return 'input_missing_or_invalid';
    }
    if (stage === 'parsing') {
      return 'parse_or_schema_failed';
    }
    if (stage === 'generation') {
      return 'generation_failed';
    }
    if (stage === 'compliance') {
      return 'compliance_or_validation_rejected';
    }
    if (stage === 'persistence') {
      return 'persistence_failed';
    }
    return 'unknown_runtime_error';
  }

  private simplifyErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  private buildBaselineFallbackHash(
    canonicalBaseline: BaselineSchemaCoreShape,
  ): string {
    const payload = JSON.stringify(canonicalBaseline);
    return createHash('sha256').update(payload).digest('hex');
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
      throw new BadRequestException({
        error: {
          code: 'target_context_missing',
          message: 'baselineId and jobId are required',
        },
      });
    }

    if (payload.baselineVersion !== undefined) {
      const version = Number(payload.baselineVersion);
      if (!Number.isInteger(version) || version < 1) {
        throw new BadRequestException({
          error: {
            code: 'baseline_version_mismatch',
            message: 'baselineVersion must be a positive integer',
          },
        });
      }
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException({
        error: {
          code: 'baseline_not_found',
          message: 'Baseline not found',
        },
      });
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
      throw new NotFoundException({
        error: {
          code: 'target_context_missing',
          message: 'Job not found',
        },
      });
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
      throw new NotFoundException({
        error: {
          code: 'interview_not_found',
          message: 'Interview not found',
        },
      });
    }

    const additionsFromPayload = this.normalizeAdditions(
      payload.verifiedAdditions,
    );
    const additions = additionsFromPayload.length
      ? additionsFromPayload
      : this.normalizeAdditions(interview?.recommendedAdditions);

    if (!additions.length) {
      throw new BadRequestException({
        error: {
          code: 'insufficient_answers',
          message: 'verified additions are required for expanded scoring',
        },
      });
    }

    const baselineVersionValue = payload.baselineVersion ?? baseline.version ?? 0;
    const scoringBaseline = this.buildCanonicalScoringBaseline(baseline);
    const baselineForHash: Baseline = {
      ...scoringBaseline,
      version: baselineVersionValue,
    };

    const calibration = await this.getCalibration(userId);
    const dimensionWeights = this.mapCalibrationToDimensionWeights(
      calibration.weights,
    );

    const { canonical: canonicalBaseline } =
      this.getCanonicalBaselineForScoring(baseline, {
        requireResumeV2Authority: true,
      });
    const canonicalSections = this.buildCanonicalSectionPayload(
      canonicalBaseline,
    );
    const sectionPayload = canonicalSections;
    const complianceBaselineSections =
      this.complianceService.normalizeSectionsForOutput(sectionPayload);

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
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const runId = shortTextWarningKey ?? this.nextShortTextWarningRequestRunId();
      this.logger.error(
        JSON.stringify({
          area: 'analysis',
          operation: 'expanded_fit',
          status: 'error',
          code: 'computation_failed',
          runId,
          userId,
          baselineId: payload.baselineId ?? 'unknown',
          jobId: payload.jobId ?? 'unknown',
          message: error instanceof Error ? error.message : String(error),
        }),
        error instanceof Error ? error.stack ?? error.message : String(error),
      );

      throw new ServiceUnavailableException({
        error: {
          code: 'computation_failed',
          message:
            'Expanded fit could not be computed right now. Save your answers and try again.',
          runId,
        },
      });
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
    const scoringV2 = this.alignCxFitScoreToResumeProject(assessment.scoringV2);
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

    const scoringV2DimensionScores = scoringV2?.rubric?.dimensionPercents ?? null;
    const fallbackDimensionScores = {
      role_scope_and_seniority: assessment.dimensionScores?.experienceAlignment ?? 0,
      support_operations_and_process_rigor: assessment.dimensionScores?.leadershipLevel ?? 0,
      tooling_and_platform_experience: assessment.dimensionScores?.technicalPlatformFit ?? 0,
      domain_and_business_context: assessment.dimensionScores?.industryContext ?? 0,
      change_leadership_and_customer_advocacy:
        assessment.dimensionScores?.strategicTacticalFit ?? 0,
    };
    const latestScore = scoringV2?.score ?? assessment.overallScore;
    const latestLegacyDimensionScores = scoringV2
      ? this.mapCxFitV2ToLegacyDimensionScores(scoringV2)
      : assessment.dimensionScores;
    const narrative = buildResultsNarrative({
      overallScore: latestScore,
      dimensionScores: scoringV2DimensionScores ?? fallbackDimensionScores,
    });
    const scoreBreakdown = this.buildScoreBreakdown(assessment);
    const refreshedScoringV2 = this.alignCxFitScoreToResumeProject(
      await this.refreshToolingCoverageForAssessment(assessment),
    );
    const canonicalClaims = refreshedScoringV2?.debug?.toolingCoverage?.claims ?? [];
    const supportedClaims = canonicalClaims.filter(
      (claim) => claim.status === 'VERIFIED' || claim.status === 'INFERRED',
    );
    const supportingSignals = Array.from(
      new Set(
        supportedClaims
          .map((claim) => claim.label?.trim())
          .filter((label): label is string => Boolean(label)),
      ),
    );
    const baselineEvidence = Array.from(
      new Set(
        supportedClaims
          .flatMap((claim) => claim.evidenceRefs ?? [])
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    );
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
      scoringReliability: assessment.scoringReliability ?? 'ok',
      ...(assessment.scoringReliabilityReason
        ? { scoringReliabilityReason: assessment.scoringReliabilityReason }
        : {}),
      confidenceScore: assessment.confidenceScore ?? null,
      confidenceReasons: assessment.confidenceReasons ?? [],
      createdAt: assessment.createdAt,
      jobAnalysis: null,
      fitScore: latestScore,
      scoring_v2: refreshedScoringV2,
      supportingSignals,
      baselineEvidence,
      verification_coverage: verificationCoverage,
      score_breakdown: scoreBreakdown,
      narrative,
    };
  }

  private shouldRecomputeLatestAssessment(
    assessment: FitAssessment,
    expectedHash: string,
  ) {
    if (assessment.inputsHash !== expectedHash) {
      return true;
    }

    if (!assessment.scoringV2) {
      return true;
    }

    const scorerVersion =
      typeof assessment.scoringV2?.scorerVersion === 'string'
        ? assessment.scoringV2.scorerVersion.trim()
        : null;
    if (scorerVersion !== CX_FIT_SCORER_VERSION) {
      return true;
    }

    return typeof assessment.scoringV2.score !== 'number' || Number.isNaN(assessment.scoringV2.score);
  }

  private assertNoImpossibleZeroScore(params: {
    baselineId: string | null;
    jobId: string | null;
    baselineSectionCount: number;
    baselineTextLength: number;
    jobTextLength: number;
    scorerVersion: string | null;
    categoryBreakdown?: Record<string, number> | null;
    resumeProjectBreakdown?: Record<string, unknown> | null;
  }) {
    if (params.baselineSectionCount <= 0) {
      return;
    }
    if (params.baselineTextLength <= 0 || params.jobTextLength <= 0) {
      return;
    }

    throw new InternalServerErrorException({
      error: {
        code: 'cx_fit_zero_score_invariant_failed',
        message:
          'CX Fit scoring returned an impossible zero score for non-empty baseline and job inputs.',
        details: {
          baselineId: params.baselineId,
          jobId: params.jobId,
          baselineSectionCount: params.baselineSectionCount,
          baselineTextLength: params.baselineTextLength,
          jobTextLength: params.jobTextLength,
          scorerVersion: params.scorerVersion,
          ...(params.categoryBreakdown
            ? { categoryBreakdown: params.categoryBreakdown }
            : {}),
          ...(params.resumeProjectBreakdown
            ? { resumeProjectBreakdown: params.resumeProjectBreakdown }
            : {}),
        },
      },
    });
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
        const { canonical: canonicalBaseline } =
          this.getCanonicalBaselineForScoring({
            ...baseline,
            sections,
          } as Baseline);
        return this.buildCanonicalSectionPayload(canonicalBaseline);
      } catch {
        return [] as Array<{ type?: string; content: string }>;
      }
    })();
    const scoringBaseline = this.buildCanonicalScoringBaseline({
      ...baseline,
      sections,
    } as Baseline);
    const baselineSelection = selectBaselineTextForScoring({
      baseline: scoringBaseline,
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
      baseline.version ?? null,
    );

    if (this.shouldRecomputeLatestAssessment(assessment, expectedHash)) {
      if (this.isDevMode()) {
        this.logger.log(
          `[fit-score] latest_assessment_stale_recompute jobId=${jobId} baselineId=${assessment.baselineId} persistedAssessmentId=${assessment.id} persistedInputsHash=${assessment.inputsHash} expectedInputsHash=${expectedHash}`,
        );
      }
      const baselineVersion =
        assessment.baselineVersion ?? baseline.version ?? undefined;
      return this.runAndPersistFitAssessment(
        userId,
        jobId,
        assessment.baselineId,
        baselineVersion,
      );
    }

    const authoritativeScoringV2 = this.alignCxFitScoreToResumeProject(
      assessment.scoringV2,
    );
    if (authoritativeScoringV2?.score === 0) {
      const baselineTextLength = getCharCount(
        (baseline.sections ?? [])
          .map((section) => section.content ?? '')
          .join('\n'),
      );
      const jobTextLength = getCharCount(job.rawDescription ?? '');
      this.assertNoImpossibleZeroScore({
        baselineId: assessment.baselineId,
        jobId: job.id,
        baselineSectionCount: baseline.sections?.length ?? 0,
        baselineTextLength,
        jobTextLength,
        scorerVersion: authoritativeScoringV2.scorerVersion ?? null,
        categoryBreakdown: authoritativeScoringV2.rubric?.dimensionPercents ?? null,
        resumeProjectBreakdown: this.buildResumeProjectInvariantDetails(authoritativeScoringV2),
      });
    }

    if (this.isDevMode()) {
      this.logger.log(
        `[fit-score] latest_assessment_reused jobId=${jobId} baselineId=${assessment.baselineId} assessmentId=${assessment.id} score=${assessment.overallScore}`,
      );
    }
    return this.buildLatestAssessmentPayload({
      ...assessment,
      scoringV2: authoritativeScoringV2 ?? assessment.scoringV2,
    });
  }

  async getFitAssessmentById(
    userId: string,
    assessmentId: string,
  ) {
    const assessment = await loadPersistedFitAssessmentReadModel(
      this.fitAssessmentRepository,
      assessmentId,
      userId,
    );

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    const requiredFields: Array<[keyof FitAssessment, string]> = [
      ['jobId', 'jobId'],
      ['baselineId', 'baselineId'],
      ['overallScore', 'overallScore'],
      ['verdict', 'verdict'],
      ['dimensionScores', 'dimensionScores'],
      ['strengths', 'strengths'],
      ['gaps', 'gaps'],
      ['complianceFlags', 'complianceFlags'],
      ['createdAt', 'createdAt'],
    ];

    const missingField = requiredFields.find(([property]) => {
      const value = assessment[property];
      return value === null || value === undefined;
    });

    if (missingField) {
      throw new ConflictException({
        message: 'Persisted fit assessment is missing a required field',
        missingField: missingField[1],
        assessmentId,
      });
    }

    if (this.isDevMode()) {
      this.logger.log(
        `[fit-score] assessment_rehydrated assessmentId=${assessmentId} score=${assessment.overallScore}`,
      );
    }
    const scoringV2 = this.alignCxFitScoreToResumeProject(assessment.scoringV2);
    const fallbackDimensionScores = {
      role_scope_and_seniority: assessment.dimensionScores?.experienceAlignment ?? 0,
      support_operations_and_process_rigor: assessment.dimensionScores?.leadershipLevel ?? 0,
      tooling_and_platform_experience: assessment.dimensionScores?.technicalPlatformFit ?? 0,
      domain_and_business_context: assessment.dimensionScores?.industryContext ?? 0,
      change_leadership_and_customer_advocacy:
        assessment.dimensionScores?.strategicTacticalFit ?? 0,
    };
    const latestScore = scoringV2?.score ?? null;
    return {
      ok: true,
      assessmentId: assessment.id,
      jobId: assessment.jobId,
      baselineId: assessment.baselineId,
      baselineVersionId: null,
      baselineVersion: assessment.baselineVersion,
      fit_score: latestScore,
      overall_score: latestScore,
      overallScore: latestScore,
      score: latestScore,
      verdict: assessment.verdict,
      dimensionScores: scoringV2
        ? this.mapCxFitV2ToLegacyDimensionScores(scoringV2)
        : assessment.dimensionScores,
      strengths: assessment.strengths ?? [],
      gaps: assessment.gaps ?? [],
      criticalGaps: (assessment.gaps ?? []).map((gap, index) => ({
        gapId: `persisted_gap_${index + 1}`,
        title: gap,
        description: `Coverage is limited for ${gap}.`,
        severityScore: 0.5,
        requirementEvidence: gap,
        baselineEvidence: null,
        reasoning: 'Derived from persisted fit assessment.',
      })),
      recommendedActions: [],
      complianceFlags: assessment.complianceFlags ?? [],
      summary: null,
      scoringReliability: assessment.scoringReliability ?? 'ok',
      ...(assessment.scoringReliabilityReason
        ? { scoringReliabilityReason: assessment.scoringReliabilityReason }
        : {}),
      confidenceScore: assessment.confidenceScore ?? null,
      confidenceReasons: assessment.confidenceReasons ?? [],
      createdAt: assessment.createdAt,
      jobAnalysis: null,
      fitScore: latestScore,
      scoring_v2: scoringV2,
      supportingSignals: [],
      baselineEvidence: [],
      verification_coverage: null,
      score_breakdown: this.buildScoreBreakdown(assessment as unknown as FitAssessment),
      narrative: null,
    };
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
      baseline.version ?? null,
    );

    if (this.shouldRecomputeLatestAssessment(assessment, expectedHash)) {
      if (this.isDevMode()) {
        this.logger.log(
          `[fit-score] latest_assessment_for_baseline_stale_recompute jobId=${jobId} baselineId=${baselineId} persistedAssessmentId=${assessment.id} persistedInputsHash=${assessment.inputsHash} expectedInputsHash=${expectedHash}`,
        );
      }
      const baselineVersion =
        assessment.baselineVersion ?? baseline.version ?? undefined;
      return this.runAndPersistFitAssessment(
        userId,
        jobId,
        baselineId,
        baselineVersion,
      );
    }

    const authoritativeScoringV2 = this.alignCxFitScoreToResumeProject(
      assessment.scoringV2,
    );
    if (authoritativeScoringV2?.score === 0) {
      const baselineTextLength = getCharCount(
        (baseline.sections ?? [])
          .map((section) => section.content ?? '')
          .join('\n'),
      );
      const jobTextLength = getCharCount(job.rawDescription ?? '');
      this.assertNoImpossibleZeroScore({
        baselineId: assessment.baselineId,
        jobId: job.id,
        baselineSectionCount: baseline.sections?.length ?? 0,
        baselineTextLength,
        jobTextLength,
        scorerVersion: authoritativeScoringV2.scorerVersion ?? null,
        categoryBreakdown: authoritativeScoringV2.rubric?.dimensionPercents ?? null,
        resumeProjectBreakdown: this.buildResumeProjectInvariantDetails(authoritativeScoringV2),
      });
    }

    if (this.isDevMode()) {
      this.logger.log(
        `[fit-score] latest_assessment_for_baseline_reused jobId=${jobId} baselineId=${baselineId} assessmentId=${assessment.id} score=${assessment.overallScore}`,
      );
    }
    return this.buildLatestAssessmentPayload({
      ...assessment,
      scoringV2: authoritativeScoringV2 ?? assessment.scoringV2,
    });
  }
}
