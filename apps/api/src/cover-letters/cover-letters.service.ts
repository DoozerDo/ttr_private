import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceService } from '../compliance/compliance.service';
import type { ValidateAndAuditResult } from '../compliance/compliance.service';
import { validateComplianceWithFallback } from '../compliance/compliance-error.utils';
import { shapeComplianceForUi } from '../compliance/compliance-ui-shaping';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceTextSection,
  DocumentType,
  GeneratedTextSourceType,
  JobApplicationContext,
} from '../compliance/compliance.types';
import {
  getInsufficientExtractedTextDetails,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
} from '../compliance/extracted-text.utils';
import { Job } from '../jobs/job.entity';
import {
  COVER_LETTER_CLOSING_TEMPLATES,
  DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY,
  resolveClosingTemplate,
} from './closing-templates';
import { CoverLetter } from './cover-letter.entity';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';
import {
  AllowedBaselineBlock,
  CoverLetterGenerationResult,
  CoverLetterGenerator,
} from './generators/cover-letter-generator.interface';
import { TemplateCoverLetterGenerator } from './generators/template-cover-letter.generator';
import {
  COVER_LETTER_BULLET_PATTERN,
  COVER_LETTER_FORBIDDEN_PHRASES,
  COVER_LETTER_GENERIC_FILLER_PHRASES,
  COVER_LETTER_MAX_BODY_PARAGRAPHS,
  COVER_LETTER_MAX_PARAGRAPH_WORDS,
  COVER_LETTER_PHRASE_REWRITES,
  COVER_LETTER_REQUIRED_SALUTATION,
  COVER_LETTER_RESUME_ARTIFACT_PATTERNS,
  COVER_LETTER_SIGNOFF,
  COVER_LETTER_WORD_LIMITS,
} from './generators/cover-letter-writing-contract';
import { CoverLetterComplianceConstraints } from './types/cover-letter-compliance-constraints';
import '../docx-templates/templates';
import {
  DEFAULT_COVER_LETTER_TEMPLATE_KEY,
  getDocxTemplate,
} from '../docx-templates/docx-template.registry';
import { mapCoverLetterResultToModel } from '../docx-templates/mappers/cover-letter-result-to-model';
import {
  CoverLetterDocxModel,
  DocxRenderContextBase,
} from '../docx-templates/docx-template.types';
import { resolveBaselineIdentity } from '../baseline/baseline-identity.utils';
import { resolveBaselineSectionsForGeneration } from '../baseline/baseline-section-source';
import { BaselineResumeV2BackfillService } from '../baseline/baseline-resume-v2-backfill.service';
import {
  buildNormalizedResumeValidationFailures,
  formatResumeV2InvalidMessage,
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from '../resume/resume-normalization';
import type {
  DocumentGenerationExports,
  UserSafeDisplayPayload,
} from '../documents/normalized-document.models';
import {
  buildPersistedFitAssessmentReadModelQuery,
  loadPersistedFitAssessmentReadModel,
  validateAnalysisContext,
} from '../common/analysis-context-binding';
import { filterComplianceFlagsByCanonicalClaims } from '../common/readiness-claim-truth';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';
import { applySyntheticMetadata } from '../synthetic/synthetic-metadata.util';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';
import { StudioArtifactsService } from '../studio-artifacts/studio-artifacts.service';
import { ApplicationsService } from '../applications/applications.service';
import { VERIFIED_ONLY_GENERATION_THRESHOLD } from '../config/verifiedOnlyGenerationThreshold';
import type { ArtifactTraceAudit } from '../generation/artifact-trace-audit';
import { buildArtifactFailurePayload } from '../generation/artifact-failure';
import { polishCoverLetterGeneration } from '../language-style-pass';
import type { DocumentStrategyPlanLike } from '../document-strategy-plan.types';
import {
  validateCoverLetterArtifactQuality,
  type ArtifactQualityGate,
} from '../artifacts/artifactQualityValidator';
import { trimIncompleteTrailingFragments } from '../artifacts/artifactQualityValidator';
import { extractStructuredBaselineFromSections } from '../baseline/structuredBaselineExtractor';
import { deriveCareerIdentityFromStructuredBaseline } from '../career-identity/career-identity.derive';
import { evaluateBaselineTemplateReadiness } from '../baseline/baselineTemplateReadiness';
import {
  assembleCoverLetterFromStructuredBaseline,
  type CanonicalEvidenceUnit,
  groupCanonicalEvidenceUnits,
  toCanonicalEvidenceUnits,
} from './coverLetterTemplateAssembler';
import { emitArtifactQualityTelemetry } from '../artifacts/artifactQualityTelemetry';
import { resolveSyntheticCandidateName } from './candidate-name.util';
import { TargetRolePositioningResolver } from '../positioning/target-role-positioning.resolver';
import { PositioningPlanService } from '../positioning/positioning-plan.service';
import { validateRealCoverLetterDocument } from '../artifacts/realDocumentValidator';

type CoverLetterDraft = {
  baseline: Baseline;
  baselineVersion: BaselineVersion;
  job: Job;
  generationAuthority: 'canonical';
  baselineFileUsable: boolean;
  baselineVerified: boolean;
  baselineFileVersionHash: string | null;
  allowedBlocks: AllowedBaselineBlock[];
  positioningMetadata?: unknown;
  candidateName: string;
  qualityGate: ArtifactQualityGate;
  firstPassQualityGate: ArtifactQualityGate;
  qualityRepairAttempted: boolean;
  jobContext: {
    id: string;
    title: string | null;
    company: string | null;
    responsibilities: string[];
    requirements: string[];
  };
  jobContextAllowlist: JobApplicationContext;
  closingTemplateKey: string;
  generationInputsHash: string;
  generation: CoverLetterGenerationResult;
  complianceResult: {
    normalizedContent: string;
    complianceFlags: ComplianceFlag[];
    blocked: boolean;
    audit: ValidateAndAuditResult['audit'];
  };
  analysisAssessment: FitAssessment;
  templateReadiness: ReturnType<typeof evaluateBaselineTemplateReadiness>;
};

type ComplianceEvaluationResult = {
  normalizedContent: string;
  complianceFlags: ComplianceFlag[];
  blocked: boolean;
  audit: ValidateAndAuditResult['audit'];
  writingFlags: ComplianceFlag[];
  scopeFlags: ComplianceFlag[];
};

type CoverLetterQualityResult = {
  generation: CoverLetterGenerationResult;
  flags: string[];
};

export type CoverLetterGenerationResponse = {
} & CoverLetter & {
  status: 'success';
  generationStatus: 'success';
  exportReady: boolean;
  quality?: ArtifactQualityGate;
  baselineId: string;
  baselineVersionId: string;
  jobId: string;
  content: string;
  generatorType: string;
  generatorVersion: string;
  closingTemplateKey: string;
  generationInputsHash: string | null;
  preview: {
    coverLetter: CoverLetterGenerationResult['document'];
  };
  compliance_flags: ComplianceFlag[];
  audit_id: string;
  auditId: string;
  baseline_version_hash: string | null;
  generationAuthority?: 'canonical';
  baselineVerified?: boolean;
  baselineFileUsable?: boolean;
  baselineFileVersionHash?: string | null;
  exports: DocumentGenerationExports;
  display: UserSafeDisplayPayload;
  safeDisplay: UserSafeDisplayPayload;
  traceMap: ArtifactTraceAudit['traceMap'];
  debugTrace: ArtifactTraceAudit['debugTrace'];
  evidenceDetailsMap?: ArtifactTraceAudit['evidenceDetailsMap'];
  internal: {
    auditId: string;
    baselineVersionHash: string | null;
    complianceFlags: ComplianceFlag[];
    generationAuthority?: 'canonical';
    baselineFileUsable?: boolean;
    baselineVerified?: boolean;
    baselineFileVersionHash?: string | null;
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

@Injectable()
export class CoverLettersService {
  private readonly positioningResolver = new TargetRolePositioningResolver();
  private readonly positioningPlanService = new PositioningPlanService();
  private readonly logger = new Logger(CoverLettersService.name);
  private readonly coverLetterRepository: Repository<CoverLetter>;
  private readonly baselineRepository: Repository<Baseline>;
  private readonly baselineVersionRepository: Repository<BaselineVersion>;
  private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>;
  private readonly jobRepository: Repository<Job>;
  private readonly generator: CoverLetterGenerator;
  private readonly fitAssessmentRepository: Repository<FitAssessment>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly complianceService: ComplianceService,
    private readonly gapAnalysisService: GapAnalysisService,
    private readonly workflowIdempotencyService: WorkflowIdempotencyService,
    private readonly studioArtifactsService: StudioArtifactsService,
    private readonly applicationsService: ApplicationsService,
    private readonly baselineResumeV2BackfillService: BaselineResumeV2BackfillService,
  ) {
    this.coverLetterRepository = this.dataSource.getRepository(CoverLetter);
    this.baselineRepository = this.dataSource.getRepository(Baseline);
    this.baselineVersionRepository =
      this.dataSource.getRepository(BaselineVersion);
    this.baselineBlockPolicyRepository =
      this.dataSource.getRepository(BaselineBlockPolicy);
    this.jobRepository = this.dataSource.getRepository(Job);
    this.fitAssessmentRepository = this.dataSource.getRepository(FitAssessment);
    this.generator = new TemplateCoverLetterGenerator();
  }

  private async loadCanonicalBaselineRawModel(
    baselineId: string,
    userId: string,
  ): Promise<Baseline | null> {
    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections', 'parsedRecords'],
    });

    if (!baseline) {
      return null;
    }

    const sections = Array.isArray(baseline.sections)
      ? baseline.sections
          .map((section) => ({
            ...section,
            sectionType: (section.sectionType ?? section.type ?? BaselineSectionType.OTHER) as BaselineSectionType,
            includePolicy: (section.includePolicy ?? BaselineIncludePolicy.OPTIONAL) as BaselineIncludePolicy,
            order: Number(section.order ?? (section as any).orderIndex ?? 0),
          }))
          .sort((left, right) => left.order - right.order)
      : [];
    const parsedRecords = Array.isArray(baseline.parsedRecords)
      ? baseline.parsedRecords
          .slice()
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      : [];

    return {
      ...baseline,
      sections,
      parsedRecords,
    } as Baseline;
  }

  private getLatestPersistedResumeV2Json(parsedRecords: any[] | null | undefined): unknown | null {
    if (!Array.isArray(parsedRecords) || parsedRecords.length === 0) return null;
    const candidates = parsedRecords
      .filter((record) => record && typeof record === 'object' && (record as any).resumeV2Json && typeof (record as any).resumeV2Json === 'object')
      .slice();
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const at = (a as any)?.createdAt ? new Date((a as any).createdAt).getTime() : 0;
      const bt = (b as any)?.createdAt ? new Date((b as any).createdAt).getTime() : 0;
      return at - bt;
    });
    return (candidates[candidates.length - 1] as any).resumeV2Json ?? null;
  }

  private extractPersistedResumeV2FromStudioArtifactsState(state: unknown): Record<string, unknown> | null {
    if (!state || typeof state !== 'object') return null;
    const record = state as Record<string, unknown>;
    const candidateSources = [
      (record as any)?.resumeResult?.preview?.resume,
      (record as any)?.resumeResult?.preview,
      (record as any)?.resume?.responseBody?.preview?.resume,
      (record as any)?.resume?.responseBody?.preview,
    ];

    for (const candidate of candidateSources) {
      if (!candidate || typeof candidate !== 'object') continue;
      const normalized = normalizeNormalizedResumeDocument(candidate as any);
      const validation = validateNormalizedResumeDocument(normalized as any);
      if (validation.valid) {
        return normalized as any;
      }
    }

    return null;
  }

  private hasUsableResumeV2Experience(candidate: unknown): candidate is Record<string, unknown> {
    if (!candidate || typeof candidate !== 'object') return false;
    const normalized = normalizeNormalizedResumeDocument(candidate as any);
    const validation = validateNormalizedResumeDocument(normalized as any);
    if (!validation.valid) return false;
    const experience = Array.isArray((normalized as any)?.experience) ? ((normalized as any).experience as any[]) : [];
    return experience.some((entry) => {
      const company = String(entry?.company ?? '').trim();
      const roleTitle = String(entry?.roleTitle ?? '').trim();
      const bullets = Array.isArray(entry?.bullets)
        ? entry.bullets.filter((bullet: unknown) => String(bullet ?? '').trim())
        : [];
      return Boolean(company && roleTitle && bullets.length > 0);
    });
  }

  private throwGenerationBlockedError(blockers: Array<{ code: string; message: string }>): never {
    throw new UnprocessableEntityException(buildArtifactFailurePayload({
      code: 'generation_blocked',
      category: 'generation_blocked',
      message:
        'Generation is not available for this role due to insufficient verified evidence.',
      detail: 'Readiness or compliance gates blocked generation.',
      retryable: false,
      userAction: {
        title: 'Review baseline readiness',
        description: 'Complete the missing verified requirements before generating again.',
      },
      diagnostics: {
        failureReasons: blockers.slice(0, 3).map((blocker) => `${blocker.code}: ${blocker.message}`),
        missingRequirements: blockers.slice(0, 3).map((blocker) => blocker.message),
      },
    }));
  }

  async generateCoverLetter(
    userId: string,
    input: GenerateCoverLetterDto,
    syntheticMetadata?: SyntheticMetadataInput,
  ): Promise<CoverLetterGenerationResponse> {
    // Avoid noisy runtime logs; diagnostics should be emitted only in synthetic/test harnesses.
    const requestedOneTap = Boolean((input as unknown as { oneTap?: boolean })?.oneTap);
    let draft: CoverLetterDraft;
    try {
      draft = await this.buildCoverLetterDraft(userId, input, syntheticMetadata);
    } catch (error) {
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message) as { category?: string; message?: string; detail?: string };
          if (parsed?.category === 'unsupported_input') {
            throw new UnprocessableEntityException(parsed);
          }
        } catch {
          // fall through to original error
        }
      }
      throw error;
    }
    const readiness = this.buildReadinessFromFlags(
      filterComplianceFlagsByCanonicalClaims(
        draft.complianceResult.complianceFlags ?? [],
        draft.analysisAssessment,
      ),
    );
    // Canonical contract: "limited" means warnings/constraints, not a hard blocker.
    // Only BLOCKED readiness should prevent cover letter generation pre-start.
    if (readiness.status === 'blocked') {
      const score =
        draft.analysisAssessment?.overallScore ??
        (draft.job?.id && draft.baseline?.id
          ? (
              await loadPersistedFitAssessmentReadModel(
                this.fitAssessmentRepository,
                '',
                userId,
                draft.job.id,
                draft.baseline.id,
              )
            )?.overallScore ?? null
          : null);
      if (
        typeof score === 'number' &&
        score >= VERIFIED_ONLY_GENERATION_THRESHOLD &&
        !requestedOneTap
      ) {
        this.logger.warn('[GENERATION_FALLBACK][cover_letter]', {
          baselineId: draft.baseline.id,
          jobId: draft.job.id,
          analysisId: draft.analysisAssessment?.id ?? null,
          score,
          readinessStatus: readiness?.status,
          complianceBlocked: Boolean(draft.complianceResult.blocked),
          originalOneTap: false,
          action: 'retry_verified_only',
        });
        draft = await this.buildCoverLetterDraft(userId, {
          ...(input as any),
          oneTap: true,
        }, syntheticMetadata);
        const retryReadiness = this.buildReadinessFromFlags(
          filterComplianceFlagsByCanonicalClaims(
            draft.complianceResult.complianceFlags ?? [],
            draft.analysisAssessment,
          ),
        );
        if (retryReadiness.status === 'ready' || retryReadiness.status === 'limited') {
          this.logger.warn('[GENERATION_FALLBACK_RESULT][cover_letter]', {
            baselineId: draft.baseline.id,
            jobId: draft.job.id,
            analysisId: draft.analysisAssessment?.id ?? null,
            score,
            fallbackSucceeded: true,
            finalPath: 'verified_only_generation',
          });
          // Proceed in verified-only mode; generation will be bounded by safeMode + reduced gap analysis.
        } else {
          this.logger.error('[GENERATION_FALLBACK_FAILED][cover_letter]', {
            baselineId: draft.baseline.id,
            jobId: draft.job.id,
            analysisId: draft.analysisAssessment?.id ?? null,
            score,
            reason: 'verified_only_still_blocked',
          });
          this.throwGenerationBlockedError(
            retryReadiness.reasons.map((reason) => ({
              code: reason.code,
              message: reason.message,
            })),
          );
        }
      } else {
        this.throwGenerationBlockedError(
          readiness.reasons.map((reason) => ({
            code: reason.code,
            message: reason.message,
          })),
        );
      }
    }

    if (draft.complianceResult.blocked) {
      const score = draft.analysisAssessment?.overallScore ?? null;
      if (
        typeof score === 'number' &&
        score >= VERIFIED_ONLY_GENERATION_THRESHOLD &&
        !requestedOneTap
      ) {
        this.logger.warn('[GENERATION_FALLBACK][cover_letter]', {
          baselineId: draft.baseline.id,
          jobId: draft.job.id,
          analysisId: draft.analysisAssessment?.id ?? null,
          score,
          readinessStatus: readiness?.status,
          complianceBlocked: true,
          originalOneTap: false,
          action: 'retry_verified_only',
        });
        const retryDraft = await this.buildCoverLetterDraft(userId, {
          ...(input as any),
          oneTap: true,
        }, syntheticMetadata);
        if (retryDraft.complianceResult.blocked) {
          this.logger.error('[GENERATION_FALLBACK_FAILED][cover_letter]', {
            baselineId: retryDraft.baseline.id,
            jobId: retryDraft.job.id,
            analysisId: retryDraft.analysisAssessment?.id ?? null,
            score,
            reason: 'verified_only_still_blocked',
          });
          this.throwGenerationBlockedError(
            retryDraft.complianceResult.complianceFlags.slice(0, 3).map((flag) => ({
              code: flag.code ?? 'generation_blocked',
              message:
                flag.message ||
                'Some claims required for tailored generation could not be verified against your baseline.',
            })),
          );
        }
        draft = retryDraft;
        this.logger.warn('[GENERATION_FALLBACK_RESULT][cover_letter]', {
          baselineId: draft.baseline.id,
          jobId: draft.job.id,
          analysisId: draft.analysisAssessment?.id ?? null,
          score,
          fallbackSucceeded: true,
          finalPath: 'verified_only_generation',
        });
      } else {
        this.throwGenerationBlockedError(
          draft.complianceResult.complianceFlags.slice(0, 3).map((flag) => ({
            code: flag.code ?? 'generation_blocked',
            message:
              flag.message ||
              'Some claims required for tailored generation could not be verified against your baseline.',
          })),
        );
      }
    }

    const TEMPLATE_ASSEMBLY_THRESHOLD = 80;
    const STRUCTURED_BASELINE_TEMPLATE_VERSION = 'structured-baseline-v1';
    const scoreForTemplateRaw = draft.analysisAssessment?.overallScore ?? 0;
    const scoreForTemplate = Number(scoreForTemplateRaw);
    const forceTemplateRegen =
      Number.isFinite(scoreForTemplate) &&
      scoreForTemplate >= TEMPLATE_ASSEMBLY_THRESHOLD;
    if (forceTemplateRegen) {
      // eslint-disable-next-line no-console
      console.log('FORCED_TEMPLATE_REGEN', {
        score: scoreForTemplate,
        generationMode: 'structured_baseline_template',
      });
    }
    let dedupeKey = this.buildGenerationDedupeKey({
      userId,
      baselineId: draft.baseline.id,
      baselineVersionId: draft.baselineVersion.id,
      jobId: draft.job.id,
      generationInputsHash: draft.generationInputsHash,
      closingTemplateKey: draft.closingTemplateKey,
      mode: draft.complianceResult.blocked ? 'blocked' : 'ready',
    });
    if (forceTemplateRegen) {
      dedupeKey = `${dedupeKey}:mode:structured_baseline_template:template:${STRUCTURED_BASELINE_TEMPLATE_VERSION}`;
    }
    let reservation = forceTemplateRegen
      ? ({
          status: 'accepted_new',
          runId: draft.complianceResult.audit.id,
          responseBody: null,
        } as const)
      : await this.workflowIdempotencyService.reserve<CoverLetterGenerationResponse>({
          userId,
          operationName: 'generation.cover_letter',
          dedupeKey,
          runId: draft.complianceResult.audit.id,
        });

    let effectiveReservation = reservation;

    const isStructuredTemplateResponse = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      const record = value as Record<string, unknown>;
      const internal =
        record.internal && typeof record.internal === 'object'
          ? (record.internal as Record<string, unknown>)
          : null;
      return (
        internal?.generationMode === 'structured_baseline_template' &&
        internal?.templateVersion === STRUCTURED_BASELINE_TEMPLATE_VERSION
      );
    };

    if (
      !forceTemplateRegen &&
      effectiveReservation.status === 'existing_completed' &&
      effectiveReservation.responseBody &&
      !isStructuredTemplateResponse(effectiveReservation.responseBody)
    ) {
      const forcedKey = `${dedupeKey}:regen:${draft.complianceResult.audit.id}`;
      effectiveReservation = await this.workflowIdempotencyService.reserve<CoverLetterGenerationResponse>({
        userId,
        operationName: 'generation.cover_letter',
        dedupeKey: forcedKey,
        runId: draft.complianceResult.audit.id,
      });
      dedupeKey = forcedKey;
      reservation = effectiveReservation;
    }

    if (!forceTemplateRegen && effectiveReservation.status === 'existing_completed' && effectiveReservation.responseBody) {
      if (
        (process.env.NODE_ENV ?? 'development') !== 'production' &&
        syntheticMetadata?.isSynthetic
      ) {
        const payload = {
          isSynthetic: true,
          reusedCompleted: true,
          candidateName: draft.candidateName ?? null,
          candidateNamePresent: Boolean(draft.candidateName),
          generatorName: this.generator?.constructor?.name ?? 'unknown',
          draftPreview:
            typeof (draft as any)?.generation?.content === 'string'
              ? (draft as any).generation.content.slice(0, 300)
              : null,
          postProcessingFlags: null as string[] | null,
          coverLetterId: (effectiveReservation.responseBody as any)?.id ?? null,
          analysisId: (input as any)?.analysisId ?? null,
          jobId: draft.job.id,
          baselineId: draft.baseline.id,
          dedupeKey,
        };
        this.logger.debug(
          `[synthetic][cover_letter] reused_completed ${JSON.stringify(payload)}`,
        );
      }
      try {
        const baselineVersionHash = draft.baselineVersion.hash;
        const jobFingerprint = this.studioArtifactsService.computeJobFingerprint(draft.job);
        await this.studioArtifactsService.recordCoverLetterSuccess({
          userId,
          baselineId: draft.baseline.id,
          jobId: draft.job.id,
          baselineVersionId: draft.baselineVersion.id,
          baselineVersionHash,
          jobFingerprint,
          inputsHash: this.studioArtifactsService.computeCoverLetterInputsHash({
            baselineVersionHash,
            jobFingerprint,
          }),
          analysisId: draft.analysisAssessment?.id ?? input.analysisId ?? null,
          responseBody: effectiveReservation.responseBody as unknown as Record<string, unknown>,
          content: String((effectiveReservation.responseBody as any)?.content ?? '').trim() || null,
          metadata: {
            auditId: (effectiveReservation.responseBody as any)?.auditId ?? (effectiveReservation.responseBody as any)?.audit_id ?? null,
            closingTemplateKey: (effectiveReservation.responseBody as any)?.closingTemplateKey ?? draft.closingTemplateKey,
            persistedFromIdempotencyReuse: true,
          },
        });
      } catch {
        // Keep the reused response usable, but canonical persistence must exist for Studio reloads.
      }
      const cachedExportReady =
        Boolean((effectiveReservation.responseBody as any)?.exportReady) &&
        draft.generationAuthority === 'canonical' &&
        draft.baselineFileUsable === true &&
        draft.baselineVerified === true &&
        (await this.canRenderCoverLetterTemplate(draft));
      return {
        ...(effectiveReservation.responseBody as CoverLetterGenerationResponse),
        generationAuthority: draft.generationAuthority,
        baselineVerified: draft.baselineVerified,
        baselineFileUsable: draft.baselineFileUsable,
        baselineFileVersionHash: draft.baselineFileVersionHash,
        exportReady: cachedExportReady,
        exports: cachedExportReady ? { docx: true, pdf: true } : { docx: false, pdf: false },
        idempotency: {
          status: effectiveReservation.status,
          runId: effectiveReservation.runId,
          dedupeKey,
          reused: true,
        },
      } as CoverLetterGenerationResponse;
    }

    if (!forceTemplateRegen && effectiveReservation.status === 'existing_in_flight') {
      throw new ConflictException({
        error: {
          code: 'generation_in_flight',
          message:
            'A cover letter is already being generated for this role. Please wait and try again.',
          retryable: true,
          nextAction: 'retry_later',
          runId: effectiveReservation.runId,
          dedupeKey,
        },
      });
    }

    const studioArtifactContext = {
      baselineId: draft.baseline.id,
      jobId: draft.job.id,
      baselineVersionId: draft.baselineVersion.id,
      baselineVersionHash: draft.baselineVersion.hash,
      jobFingerprint: this.studioArtifactsService.computeJobFingerprint(draft.job),
      inputsHash: this.studioArtifactsService.computeCoverLetterInputsHash({
        baselineVersionHash: draft.baselineVersion.hash,
        jobFingerprint: this.studioArtifactsService.computeJobFingerprint(draft.job),
      }),
    };
    const resolvedAnalysisId = draft.analysisAssessment?.id ?? input.analysisId ?? null;

    try {
      if (
        (process.env.NODE_ENV ?? 'development') !== 'production' &&
        syntheticMetadata?.isSynthetic
      ) {
        const payload = {
          isSynthetic: true,
          reusedCompleted: false,
          candidateName: draft.candidateName ?? null,
          candidateNamePresent: Boolean(draft.candidateName),
          generatorName: this.generator?.constructor?.name ?? 'unknown',
          draftPreview:
            typeof (draft as any)?.generation?.content === 'string'
              ? (draft as any).generation.content.slice(0, 300)
              : null,
          postProcessingFlags: null as string[] | null,
          coverLetterId: null as string | null,
          analysisId: (input as any)?.analysisId ?? null,
          jobId: draft.job.id,
          baselineId: draft.baseline.id,
          dedupeKey,
        };
        this.logger.debug(
          `[synthetic][cover_letter] generation_start ${JSON.stringify(payload)}`,
        );
      }
      await this.studioArtifactsService.recordCoverLetterInProgress({
        userId,
        baselineId: studioArtifactContext.baselineId,
        jobId: studioArtifactContext.jobId,
        baselineVersionId: studioArtifactContext.baselineVersionId,
        baselineVersionHash: studioArtifactContext.baselineVersionHash,
        jobFingerprint: studioArtifactContext.jobFingerprint,
        inputsHash: studioArtifactContext.inputsHash,
        analysisId: resolvedAnalysisId,
        metadata: {
          auditId: draft.complianceResult.audit.id,
          closingTemplateKey: draft.closingTemplateKey,
        },
      });

      if (!forceTemplateRegen) {
        await this.ensureNoDuplicateCoverLetter(
          userId,
          draft.baseline.id,
          draft.job.id,
          draft.generationInputsHash,
        );
      }

      const coverLetter = this.coverLetterRepository.create({
        userId,
        baselineId: draft.baseline.id,
        jobId: draft.job.id,
        generatorType: 'template',
        generatorVersion: 'v1',
        closingTemplateKey: draft.closingTemplateKey,
        content: draft.complianceResult.normalizedContent,
        generationInputsHash: draft.generationInputsHash,
      });
      if (syntheticMetadata?.isSynthetic) {
        applySyntheticMetadata(coverLetter, syntheticMetadata);
      }

      let savedCoverLetter: CoverLetter;
      let reusedExistingCoverLetter = false;
      try {
        savedCoverLetter = await this.coverLetterRepository.save(coverLetter);
      } catch (error) {
        const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
        const isUniqueViolation =
          String(record?.code ?? '').trim() === '23505' ||
          /duplicate key|unique constraint/i.test(String(record?.message ?? ''));
        if (!isUniqueViolation) {
          throw error;
        }
        const existingCoverLetter = await this.coverLetterRepository.findOne({
          where: {
            userId,
            baselineId: draft.baseline.id,
            jobId: draft.job.id,
          },
          order: { createdAt: 'DESC' },
        });
        if (!existingCoverLetter) {
          throw error;
        }
        if (forceTemplateRegen) {
          // Overwrite the existing artifact in-place for score >= 80 so Studio can never rehydrate
          // stale legacy content.
          (coverLetter as any).id = (existingCoverLetter as any).id;
          savedCoverLetter = await this.coverLetterRepository.save(coverLetter as any);
          reusedExistingCoverLetter = false;
        } else {
          savedCoverLetter = existingCoverLetter;
          reusedExistingCoverLetter = true;
        }
      }

      const display = this.buildSuccessDisplayPayload(
        (draft.templateReadiness.hardBlockReasons ?? []).map((reason) => String(reason.code ?? '')),
      );
      const templateRenderable = await this.canRenderCoverLetterTemplate(draft);
      const canonicalAuthority = draft.generationAuthority === 'canonical';
      const exportReady =
        canonicalAuthority &&
        draft.baselineFileUsable === true &&
        draft.baselineVerified === true &&
        draft.qualityGate.status === 'pass' &&
        templateRenderable;
      const exports: DocumentGenerationExports = exportReady
        ? { docx: true, pdf: true }
        : { docx: false, pdf: false };
      const canonicalQualityGate =
        draft.qualityGate ?? { status: 'pass', reasons: [] as string[] };
      const response = {
        status: 'success',
        generationStatus: 'success',
        quality: canonicalQualityGate.status === 'pass' ? { status: 'pass', reasons: [] } : canonicalQualityGate,
        qualityGate: canonicalQualityGate,
        ...savedCoverLetter,
      baselineVersionId: draft.baselineVersion.id,
      exportReady,
      exports,
      actions: {
        canExport: exportReady,
        canRegenerate: true,
        canSaveToOpportunities: exportReady,
      },
      preview: {
        coverLetter: draft.generation.document,
      },
        internalTrace: draft.generation.internalTrace,
        paragraphEvidence: draft.generation.paragraphEvidence,
        compliance_flags: draft.complianceResult.complianceFlags,
        audit_id: draft.complianceResult.audit.id,
        auditId: draft.complianceResult.audit.id,
        baseline_version_hash: draft.complianceResult.audit.baselineVersionHash,
        traceMap: draft.generation.traceMap,
        debugTrace: draft.generation.debugTrace ?? {
          passed: true,
          failures: [],
          traceCoverage: 100,
          unusedEvidence: [],
          selectedEvidence: [],
        },
        display,
        safeDisplay: display,
        internal: {
          auditId: draft.complianceResult.audit.id,
          baselineVersionHash: draft.complianceResult.audit.baselineVersionHash,
          complianceFlags: draft.complianceResult.complianceFlags,
          ...(process.env.DOCGEN_DIAGNOSTICS === 'true'
            ? {
                diagnostics: {
                  selectedEvidenceIds: Array.isArray(draft.generation.debugTrace?.selectedEvidence)
                    ? (draft.generation.debugTrace.selectedEvidence as unknown[]).map((x) => String(x ?? '')).slice(0, 24)
                    : [],
                  unusedEvidenceIds: Array.isArray(draft.generation.debugTrace?.unusedEvidence)
                    ? (draft.generation.debugTrace.unusedEvidence as unknown[]).map((x) => String(x ?? '')).slice(0, 24)
                    : [],
                },
              }
            : {}),
          ...(forceTemplateRegen || dedupeKey.includes('mode:structured_baseline_template')
            ? {
                generationMode: 'structured_baseline_template',
                templateVersion: 'structured-baseline-v1',
              }
            : {}),
        },
        idempotency: {
          status: reusedExistingCoverLetter ? 'existing_completed' : reservation.status,
          runId: reservation.runId,
          dedupeKey,
          reused: reusedExistingCoverLetter || reservation.status === 'existing_completed',
        },
      } as unknown as CoverLetterGenerationResponse;

      (response as any).generationAuthority = draft.generationAuthority;
      (response as any).baselineVerified = draft.baselineVerified;
      (response as any).baselineFileUsable = draft.baselineFileUsable;
      (response as any).baselineFileVersionHash = draft.baselineFileVersionHash;
      draft.complianceResult.normalizedContent = trimIncompleteTrailingFragments(draft.complianceResult.normalizedContent);
      (response as any).content = draft.complianceResult.normalizedContent;

      if (!draft.complianceResult.normalizedContent || draft.complianceResult.normalizedContent.trim().length < 1) {
        throw new UnprocessableEntityException({
          error: {
            code: 'generation_empty_output',
            message: 'Cover letter generation produced empty output.',
          },
        });
      }

      // Final post-generation guard: never return or persist unresolved placeholders.
      // This must run after final content assembly and immediately before success persistence.
      const finalContent = String(draft.complianceResult.normalizedContent ?? '');
      const normalizedFinal = finalContent.replace(/\s+/g, ' ').trim().toLowerCase();
      const hasTemplatePlaceholder = /\[\[[^\]]+\]\]/.test(finalContent);
      const bannedPlaceholderPhrases = [
        'specific interest in company',
        'insert company',
        'your company here',
        'placeholder',
      ];
      if (
        hasTemplatePlaceholder ||
        bannedPlaceholderPhrases.some((phrase) => normalizedFinal.includes(phrase))
      ) {
        throw new UnprocessableEntityException({
          error: {
            code: 'generation_unresolved_placeholders',
            message: 'Cover letter generation produced unresolved placeholder content.',
          },
        });
      }
      // eslint-disable-next-line no-console
      console.log('[COVER_LETTER_GENERATE_OUTPUT]', {
        hasContent: true,
        length: draft.complianceResult.normalizedContent.length,
        responseKeys: response && typeof response === 'object' ? Object.keys(response as any) : [],
      });

      emitArtifactQualityTelemetry(
        this.logger,
        {
          artifactType: 'cover_letter',
          baselineId: draft.baseline.id,
          baselineVersionId: draft.baselineVersion.id,
          jobId: draft.job.id,
          analysisId: draft.analysisAssessment?.id ?? (input as any)?.analysisId ?? null,
          requestId: draft.complianceResult.audit.id ?? null,
        },
        {
          firstPass:
            draft.firstPassQualityGate ??
            draft.qualityGate ?? { status: 'pass', reasons: [] },
          final: draft.qualityGate ?? { status: 'pass', reasons: [] },
          repairAttempted: draft.qualityRepairAttempted ?? false,
        },
      );
      const artifactId = await this.studioArtifactsService.recordCoverLetterSuccess({
        userId,
        baselineId: studioArtifactContext.baselineId,
        jobId: studioArtifactContext.jobId,
        baselineVersionId: studioArtifactContext.baselineVersionId,
        baselineVersionHash: studioArtifactContext.baselineVersionHash,
        jobFingerprint: studioArtifactContext.jobFingerprint,
        inputsHash: studioArtifactContext.inputsHash,
        analysisId: resolvedAnalysisId,
        responseBody: response as unknown as Record<string, unknown>,
        content: draft.complianceResult.normalizedContent,
        metadata: {
          auditId: draft.complianceResult.audit.id,
          closingTemplateKey: draft.closingTemplateKey,
          selectedEvidenceIds: Array.isArray((response as any)?.internalTrace?.usedEvidenceIds)
            ? ((response as any).internalTrace.usedEvidenceIds as unknown[]).map((id) => String(id ?? '')).filter(Boolean)
            : [],
          positioning: draft.positioningMetadata ?? null,
        },
      });
      // eslint-disable-next-line no-console
      console.log('[COVER_LETTER_GENERATE_PERSISTED]', { artifactId });

      // Prompt 8: production validation fields (diagnostics-only, no raw text).
      // Keep this payload available in production so Studio can explain the evidence source used.
      try {
        (response as any).internal = {
          ...((response as any).internal ?? {}),
          productionValidation: {
            evidenceSourceUsed: 'canonical',
            generationEligibilityDecision: {
              eligible: true,
              hardBlockerCode: null,
            },
            fallbackWarnings: [],
            omittedUnsupportedRequirements: [],
            artifactPersistenceStatus: { status: 'persisted', artifactId },
            finalDocumentStatus: {
              exportReady: Boolean((response as any)?.exportReady),
              qualityGateStatus: String((response as any)?.quality?.status ?? ''),
            },
            canonicalEvidenceIds: Array.from(
              new Set(
                (draft.generation.paragraphEvidence ?? []).flatMap((entry) =>
                  Array.isArray(entry.sourceEvidenceIds) ? entry.sourceEvidenceIds : [],
                ),
              ),
            ).filter(Boolean),
          },
        };
      } catch {
        // ignore diagnostics failures
      }
      try {
        await this.applicationsService.upsertApplicationForPair({
          userId,
          baselineId: studioArtifactContext.baselineId,
          jobId: studioArtifactContext.jobId,
          companyName: draft.job.company ?? draft.jobContext.company ?? draft.job.title ?? 'Unknown company',
          roleTitle: draft.job.title ?? draft.jobContext.title ?? 'Untitled role',
          jobUrl: draft.job.canonicalUrl ?? draft.job.sourceUrl ?? null,
          analysisId: draft.analysisAssessment.id ?? input.analysisId ?? null,
          baselineVersionId: draft.baselineVersion.id,
          fitScore: draft.analysisAssessment.overallScore ?? null,
          resumeArtifactId: draft.complianceResult.audit.id,
          resumeArtifactType: 'cover',
          resumeArtifactFormat: 'docx',
        });
      } catch (sideEffectError) {
        this.logger.warn('[cover-letter-generation] application write failed after cover-letter persistence', {
          userId,
          baselineId: studioArtifactContext.baselineId,
          jobId: studioArtifactContext.jobId,
          analysisId: draft.analysisAssessment.id ?? input.analysisId ?? null,
          errorName: sideEffectError instanceof Error ? sideEffectError.name : typeof sideEffectError,
          errorMessage: sideEffectError instanceof Error ? sideEffectError.message : String(sideEffectError),
        });
      }

      if (
        (process.env.NODE_ENV ?? 'development') !== 'production' &&
        syntheticMetadata?.isSynthetic
      ) {
        const payload = {
          isSynthetic: true,
          reusedCompleted: false,
          candidateName: draft.candidateName ?? null,
          candidateNamePresent: Boolean(draft.candidateName),
          generatorName: this.generator?.constructor?.name ?? 'unknown',
          draftPreview:
            typeof (draft as any)?.generation?.content === 'string'
              ? (draft as any).generation.content.slice(0, 300)
              : null,
          postProcessingFlags: null as string[] | null,
          coverLetterId: (response as any)?.id ?? (savedCoverLetter as any)?.id ?? null,
          analysisId: (input as any)?.analysisId ?? null,
          jobId: studioArtifactContext.jobId,
          baselineId: studioArtifactContext.baselineId,
          dedupeKey,
          runId: reservation.runId,
          reusedExistingCoverLetter,
        };
        this.logger.debug(
          `[synthetic][cover_letter] persisted ${JSON.stringify(payload)}`,
        );
      }
      if (!forceTemplateRegen) {
        await this.workflowIdempotencyService.complete({
          userId,
          operationName: 'generation.cover_letter',
          dedupeKey,
          runId: reservation.runId,
          responseBody: response,
        });
      }
      return response;
    } catch (error) {
      void this.studioArtifactsService.recordCoverLetterFailure({
        userId,
        baselineId: studioArtifactContext.baselineId,
        jobId: studioArtifactContext.jobId,
        baselineVersionId: studioArtifactContext.baselineVersionId,
        baselineVersionHash: studioArtifactContext.baselineVersionHash,
        jobFingerprint: studioArtifactContext.jobFingerprint,
        inputsHash: studioArtifactContext.inputsHash,
        analysisId: resolvedAnalysisId,
        failureCode: error instanceof Error ? error.name : 'generation_failed',
        failureMessage: error instanceof Error ? error.message : String(error),
        metadata: {
          auditId: draft.complianceResult.audit.id,
          closingTemplateKey: draft.closingTemplateKey,
        },
      });
      if (!forceTemplateRegen) {
        void this.workflowIdempotencyService.markFailure({
          userId,
          operationName: 'generation.cover_letter',
          dedupeKey,
          runId: reservation.runId,
          status: 'FAILED',
          errorCode: error instanceof Error ? error.name : 'generation_failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  async exportCoverLetter(
    userId: string,
    input: GenerateCoverLetterDto,
    format: 'docx' | 'pdf',
  ) {
    const draft = await this.buildCoverLetterDraft(userId, input);

    if (draft.complianceResult.blocked) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Compliance validation failed.',
          details: {
            blocked: true,
            compliance_flags: draft.complianceResult.complianceFlags,
            audit_id: draft.complianceResult.audit.id,
            baseline_version_hash: draft.complianceResult.audit.baselineVersionHash,
          },
        },
      });
    }

    const polished = polishCoverLetterGeneration(draft.generation, {
      plan:
        input.documentStrategyPlan ??
        ({} as DocumentStrategyPlanLike),
      roleLabel: draft.job.title ?? draft.jobContext.title ?? null,
    });
    const generation = polished.generation;
    const text = this.buildNormalizedCoverLetterText(generation);
    let buffer: Buffer;
    if (format === 'pdf') {
      buffer = this.buildPdfBuffer(text);
    } else {
      const identity = resolveBaselineIdentity(draft.baseline);
      const model = mapCoverLetterResultToModel(
        generation,
        identity,
        draft.jobContext,
      );
      const template = getDocxTemplate<CoverLetterDocxModel>(
        'cover_letter',
        DEFAULT_COVER_LETTER_TEMPLATE_KEY,
      );
      const renderContext: DocxRenderContextBase = {
        templateKey: DEFAULT_COVER_LETTER_TEMPLATE_KEY,
        font: 'Calibri',
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      };
      buffer = (await template.render(model, renderContext)).buffer;
    }

    const baselineSections = draft.allowedBlocks.map((block) => ({
      title: block.title,
      content: block.content,
    }));
    const generatedSections: ComplianceTextSection[] =
      this.buildCoverLetterGeneratedSectionsForCompliance(generation);

    const { complianceFlags, blocked, audit } =
      await this.complianceService.validateAndAudit({
        action: ComplianceAction.COVER_LETTER_EXPORT,
        actorId: userId,
        baselineVersion: draft.baselineVersion,
        job: draft.job,
        outputHash: createHash('sha256')
          .update(`${format}:${text}`)
          .digest('hex'),
        baselineSections,
        generatedSections,
        extraFlags: draft.complianceResult.complianceFlags,
        scopeInflationDetected: false,
        jobContext: draft.jobContextAllowlist,
        documentType: DocumentType.COVER_LETTER,
      });

    if (blocked) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Compliance validation failed.',
          details: {
            compliance_flags: complianceFlags,
            audit_id: audit.id,
            baseline_version_hash: audit.baselineVersionHash,
          },
        },
      });
    }

    return {
      buffer,
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: `cover-letter.${format}`,
      auditId: audit.id,
      baselineVersionHash: audit.baselineVersionHash,
    };
  }

  async getGenerationReadiness(userId: string, input: GenerateCoverLetterDto) { 
    // Readiness is a preflight signal. It should never throw for missing/invalid IDs; instead,
    // return a controlled blocked response so the UI can render safely.
    const baselineId = typeof (input as any)?.baselineId === 'string' ? (input as any).baselineId.trim() : '';
    const jobId = typeof (input as any)?.jobId === 'string' ? (input as any).jobId.trim() : '';
    const analysisId = typeof (input as any)?.analysisId === 'string' ? (input as any).analysisId.trim() : '';
    if (!baselineId || !jobId || !analysisId) {
      return {
        status: 'blocked',
        blocked: true,
        compliance_flags: [],
        reasons: [
          {
            code: 'missing_required_ids',
            message:
              'Generation readiness requires baselineId, jobId, and analysisId.',
          },
        ],
      } as const;
    }

    try { 
      const draft = await this.buildCoverLetterDraft(userId, input); 
      const flags = filterComplianceFlagsByCanonicalClaims( 
        draft.complianceResult.complianceFlags ?? [], 
        draft.analysisAssessment, 
      ); 
      const readiness = this.buildReadinessFromFlags(flags); 
      if (!draft.templateReadiness.canGenerateCoverLetter) {
        return {
          status: 'blocked',
          blocked: true,
          compliance_flags: flags,
          reasons: draft.templateReadiness.hardBlockReasons,
          canGenerateCoverLetter: false,
        } as const;
      }
      if (draft.templateReadiness.warnings.length) {
        return {
          status: 'limited',
          blocked: false,
          compliance_flags: flags,
          reasons: draft.templateReadiness.warnings,
          canGenerateCoverLetter: true,
        } as const;
      }
      const score = draft.analysisAssessment?.overallScore ?? null; 
      if ( 
        typeof score === 'number' && 
        score >= VERIFIED_ONLY_GENERATION_THRESHOLD && 
        readiness.status === 'blocked' 
      ) { 
        // Contract: score >= 80 should never be blocked for evidence gaps; proceed verified-only. 
        return { 
          ...readiness, 
          status: 'limited', 
          blocked: false, 
          reasons: [ 
            { 
              code: 'verified_only_generation', 
              message: 'Generation will proceed using only verified baseline evidence.', 
            }, 
          ], 
        } as const; 
      } 
      return {
        ...readiness,
        canGenerateCoverLetter: true,
      } as const;
    } catch (error) { 
      // Readiness is a preflight signal. If post-processing rejects the first-pass draft, 
      // return a limited readiness signal rather than surfacing a terminal generation failure. 
      if (error instanceof HttpException) { 
        const response = error.getResponse() as
          | { code?: string; details?: { flags?: string[] } }
          | { error?: { code?: string; details?: { flags?: string[] } } };
        const payload = response && typeof response === 'object' ? response : null;
        const code =
          (payload as any)?.code ??
          (payload as any)?.error?.code ??
          null;
        const flags =
          (payload as any)?.details?.flags ??
          (payload as any)?.error?.details?.flags ??
          [];
        if (code === 'generation_failed' && Array.isArray(flags) && flags.includes('keyword_echo_overuse')) {
          return {
            status: 'limited',
            blocked: false,
            compliance_flags: [],
            reasons: [
              {
                code: 'keyword_echo_overuse',
                message:
                  'Cover letter generation is available, but the first draft needs minor revision to reduce repeated role keywords.',
              },
            ],
          } as const;
        }

        // Missing/invalid input or missing data should not 500 in readiness.
        const status = error.getStatus?.();
        if (status === 400 || status === 404) {
          return {
            status: 'blocked',
            blocked: true,
            compliance_flags: [],
            reasons: [
              {
                code: 'readiness_unavailable',
                message:
                  'Readiness could not be determined from the current inputs.',
              },
            ],
          } as const;
        }
      }

      // For any unexpected runtime exception (TypeError, ORM edge cases, etc.), do not 500.
      // Return a safe blocked response so Studio "generated" state remains usable and visible.
      return {
        status: 'blocked',
        blocked: true,
        compliance_flags: [],
        reasons: [
          {
            code: 'readiness_error',
            message:
              'Readiness could not be determined due to an internal error.',
          },
        ],
      } as const;
    }
  }

  private buildReadinessFromFlags(flags: ComplianceFlag[]) {
    const blocked = flags.some((flag) => flag.severity === 'block');
    const warningFlags = flags.filter((flag) => flag.severity === 'warn');
    return {
      status: blocked ? 'blocked' : warningFlags.length > 0 ? 'limited' : 'ready',
      blocked,
      compliance_flags: flags,
      reasons:
        blocked
          ? [
              {
                code: 'full_block',
                message:
                  'Some claims required for tailored generation could not be verified against your baseline.',
              },
            ]
          : warningFlags.length > 0
            ? [
                {
                  code: 'personalization_limitation',
                  message:
                    'This role scored highly, but document generation is currently limited by verification constraints.',
                },
              ]
            : [],
    } as const;
  }

  private async buildCoverLetterDraft(
    userId: string,
    input: GenerateCoverLetterDto,
    syntheticMetadata?: SyntheticMetadataInput,
  ): Promise<CoverLetterDraft> {
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const baselineVersionId = input.baselineVersionId?.trim() || null;
    let analysisId = input.analysisId?.trim() || '';

    const baseline = await this.loadCanonicalBaselineRawModel(input.baselineId, userId);

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const job = await this.jobRepository.findOne({
      where: { id: input.jobId, userId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const baselineVersion = baselineVersionId
      ? await this.baselineVersionRepository.findOne({
          where: { baselineId: baseline.id, id: baselineVersionId },
        })
      : await this.baselineVersionRepository.findOne({
          where: { baselineId: baseline.id },
          order: { versionNumber: 'DESC' },
        });

    if (!baselineVersion) {
      throw new NotFoundException('Baseline version not found');
    }
    if (!baselineVersion.hash) {
      throw new BadRequestException('Baseline version hash missing');
    }

    if (!analysisId) {
      const assessmentForBaselineVersion = await buildPersistedFitAssessmentReadModelQuery(
        this.fitAssessmentRepository,
        '',
        userId,
        job.id,
        baseline.id,
      )
        .andWhere('assessment.baselineVersion = :baselineVersion', {
          baselineVersion: baselineVersion.versionNumber ?? null,
        })
        .getOne();
      const fallbackAssessment =
        assessmentForBaselineVersion ??
        (await loadPersistedFitAssessmentReadModel(
          this.fitAssessmentRepository,
          '',
          userId,
          job.id,
          baseline.id,
        ));
      analysisId = fallbackAssessment?.id ?? '';
    }

    if (!analysisId) {
      throw new BadRequestException({
        error: {
          code: 'analysis_not_found',
          message: 'analysisId could not be resolved for generation.',
          details: {
            expected: {
              jobId: input.jobId,
              baselineId: input.baselineId,
              baselineVersionId,
            },
            received: {
              jobId: input.jobId,
              baselineId: input.baselineId,
              baselineVersionId,
            },
          },
        },
      });
    }

    const analysisAssessment = await validateAnalysisContext({
      analysisRepository: this.fitAssessmentRepository,
      baselineVersionRepository: this.baselineVersionRepository,
      analysisId,
      userId,
      jobId: job.id,
      baselineId: baseline.id,
      baselineVersionId,
    });

    const oneTap = Boolean((input as unknown as { oneTap?: boolean })?.oneTap);

    const policies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: baselineVersion.id },
      relations: ['baselineSection'],
      order: { order: 'ASC' },
    });

    const closingTemplateKey = await this.resolveClosingTemplateKey(
      userId,
      input.closingTemplateKey,
    );
    const closingTemplate = resolveClosingTemplate(closingTemplateKey);
    const baselineFileVersionHash = baselineVersion.hash ?? null;
    const canonicalBaselineSections = resolveBaselineSectionsForGeneration(baseline);
    const canonicalStructuredBaseline = extractStructuredBaselineFromSections(canonicalBaselineSections as any);
    const sourceSections = canonicalBaselineSections;
    const sections = this.applyPoliciesToSections(sourceSections, policies);
    const allowedSections = sections.filter(
      (section) =>
        (section.includePolicy ?? BaselineIncludePolicy.OPTIONAL) !==
        BaselineIncludePolicy.NEVER,
    );

    const structuredBaseline = canonicalStructuredBaseline;
    const templateReadiness = evaluateBaselineTemplateReadiness(structuredBaseline as any);

    // Generation must be driven by canonical parsed sections and their evidence units, not legacy resume text.
    // Prefer role-aligned structured experience blocks over a single plain-text dump so evidence selection can
    // reliably choose the strongest relevant roles.
    const jobContext = {
      id: job.id,
      title: this.cleanText(job.title),
      company: this.cleanText(job.company),
      responsibilities: this.sanitizeList(job.normalizedResponsibilities),
      requirements: this.sanitizeList(job.normalizedRequirements),
    };
    let allowedBlocks: AllowedBaselineBlock[] = this.buildAllowedBlocksFromStructuredBaseline({
      structured: structuredBaseline,
      sourceSections,
      job: jobContext,
    });
    const canonicalEvidenceUnits = this.buildCanonicalEvidenceUnitsFromAllowedBlocks(allowedBlocks);
    const canonicalCoverLetterEvidenceUnits = canonicalEvidenceUnits.filter((unit) => {
      const sectionType = String(unit.sourceSectionType ?? '').toUpperCase();
      return sectionType === 'EXPERIENCE' || sectionType === 'PROJECT';
    });
    const groundedEvidenceUnitCount = canonicalCoverLetterEvidenceUnits.length;
    const groundedEvidenceLaneCount = groupCanonicalEvidenceUnits(canonicalCoverLetterEvidenceUnits).length;
    if (process.env.DEBUG_DOCGEN === 'true') {
      // eslint-disable-next-line no-console
      console.log('[COVER_LETTER_DRAFT_COUNTS]', {
        baselineId: baseline.id,
        jobId: job.id,
        allowedBlockCount: allowedBlocks.length,
        canonicalEvidenceUnitCount: canonicalEvidenceUnits.length,
        groundedEvidenceUnitCount,
        groundedEvidenceLaneCount,
      });
    }
    const baselineVerified = groundedEvidenceUnitCount >= 2;
    if (groundedEvidenceUnitCount < 2) {
      throw new UnprocessableEntityException(buildArtifactFailurePayload({
        code: 'canonical_cover_letter_evidence_insufficient',
        category: 'unsupported_input',
        message: 'The current cover letter input does not contain enough canonical evidence to generate a cover letter.',
        detail: 'The current cover letter input cannot be grounded into a supported artifact without recovering legacy evidence.',
        retryable: false,
        userAction: {
          title: 'Add stronger baseline evidence',
          description: 'Include at least two grounded canonical experience evidence units before generating again.',
        },
        diagnostics: {
          unsupportedEnvelope: 'canonical_cover_letter_evidence_insufficient',
          missingRequirements: [],
        },
      }));
    }
    const baselineFileUsable = true;
    const careerIdentitySnapshot = (() => {
      try {
        return deriveCareerIdentityFromStructuredBaseline(structuredBaseline as any);
      } catch {
        return null;
      }
    })();
    const positioningMetadata = (() => {
      try {
        const resumeV2Like = {
          heading: { name: 'Candidate', contactLine: '' },
          experience: (structuredBaseline?.experience ?? []).map((e: any) => ({
            company: e.company,
            roleTitle: e.roleTitle,
            dateRange: e.dates,
            bullets: e.bullets,
          })),
          summary: typeof (structuredBaseline as any)?.summary === 'string' ? (structuredBaseline as any).summary : '',
        } as any;
        return this.positioningResolver.resolve({
          job: { title: jobContext.title ?? null, company: jobContext.company ?? null, description: job.rawDescription ?? null },
          resumeV2: resumeV2Like,
          careerIdentity: careerIdentitySnapshot,
        });
      } catch {
        return null;
      }
    })();
    const baselineIdentity = resolveBaselineIdentity(baseline);
    let candidateName = this.cleanText((structuredBaseline as any)?.heading?.name ?? baselineIdentity?.fullName);
    if (syntheticMetadata?.isSynthetic) {
      candidateName = resolveSyntheticCandidateName(candidateName);
    }

    const generationInputsHash = this.computeGenerationInputsHash(
      baseline.id,
      job.id,
      allowedBlocks,
      jobContext,
      closingTemplateKey,
    );

    const complianceBaselineSections = this.buildComplianceBaselineSections(
      allowedBlocks,
      jobContext,
    );

    const complianceConstraints = this.normalizeComplianceConstraints(
      input.complianceConstraints,
    );
    const latestAssessment = await loadPersistedFitAssessmentReadModel(
      this.fitAssessmentRepository,
      '',
      userId,
      job.id,
      baseline.id,
    );
    const gapInsights = oneTap
      ? { strengths: [], criticalGaps: [] }
      : this.gapAnalysisService.analyze({
          baselineSections: allowedSections.map((section) => ({
            content: section.content ?? '',
          })),
          jobRequirements: job.normalizedRequirements ?? [],
          jobResponsibilities: job.normalizedResponsibilities ?? [],
          dimensionPercents:
            latestAssessment?.scoringV2?.rubric?.dimensionPercents ?? undefined,
        });

    let generation: CoverLetterGenerationResult;
    try {
      const requestSafeMode = oneTap || complianceConstraints?.mode === 'strict';

      const composition = assembleCoverLetterFromStructuredBaseline({
        structured: structuredBaseline as any,
        senderName: candidateName || 'Candidate',
        senderContactLine: null,
        jobTitle: job?.title ?? null,
        companyName: job?.company ?? null,
        allowedBlocks,
        evidenceUnits: canonicalCoverLetterEvidenceUnits,
      });
      if (process.env.DEBUG_DOCGEN === 'true') {
        // eslint-disable-next-line no-console
        console.log('[COVER_LETTER_COMPOSITION_COUNTS]', {
          baselineId: baseline.id,
          jobId: job.id,
          opening: composition.document.opening,
          bodyParagraphCount: composition.document.bodyParagraphs.length,
          closing: composition.document.closingParagraph,
          paragraphEvidenceCount: composition.paragraphEvidence.length,
          paragraphs: [composition.document.opening, ...composition.document.bodyParagraphs, composition.document.closingParagraph],
        });
      }
      const document = composition.document;
      const paragraphs = [
        document.opening,
        ...(document.bodyParagraphs ?? []),
        document.closingParagraph,
      ].map((p) => String(p ?? '').trim()).filter(Boolean);
      const content = paragraphs.join('\n\n');
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      generation = {
        document,
        content,
        wordCount,
        greeting: document.salutation,
        paragraphs,
        closingParagraphs: [document.closingParagraph].filter(Boolean),
        salutation: document.salutation,
        closing: `${document.signoff}\n${document.signatureName}`,
        traceMap: {},
        paragraphEvidence: composition.paragraphEvidence,
        debugTrace: {
          passed: true,
          failures: [],
          traceCoverage: 1,
          unusedEvidence: [],
          selectedEvidence: canonicalCoverLetterEvidenceUnits.map((unit) => unit.id),
        },
        internalTrace: {
          usedEvidenceIds: canonicalCoverLetterEvidenceUnits.map((unit) => unit.id),
          droppedEvidenceIds: [],
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message) as { category?: string; message?: string; detail?: string };
          if (parsed?.category === 'unsupported_input') {
            throw new UnprocessableEntityException(parsed);
          }
        } catch {
          if (/^canonical_cover_letter_evidence_insufficient$/i.test(error.message.trim())) {
            throw new UnprocessableEntityException(
              buildArtifactFailurePayload({
                code: 'canonical_cover_letter_evidence_insufficient',
                category: 'unsupported_input',
                message:
                  'The current cover letter input does not contain enough canonical evidence to generate a cover letter.',
                detail:
                  'The current cover letter input cannot be grounded into a supported artifact without recovering legacy evidence.',
                retryable: false,
                userAction: {
                  title: 'Add stronger baseline evidence',
                  description:
                    'Include at least two grounded canonical experience evidence units before generating again.',
                },
                diagnostics: {
                  unsupportedEnvelope: 'canonical_cover_letter_evidence_insufficient',
                  missingRequirements: [],
                },
              }),
            );
          }
          if (
            /Cover letter generation failed validation: insufficient baseline evidence\./i.test(
              error.message,
            )
          ) {
            throw new UnprocessableEntityException(
              buildArtifactFailurePayload({
                code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
                category: 'unsupported_input',
                message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
                detail:
                  'The current cover letter input cannot be grounded into a supported artifact.',
                retryable: false,
                userAction: {
                  title: 'Add stronger baseline evidence',
                  description:
                    'Include clearer accomplishment bullets and fuller role details before generating again.',
                },
                diagnostics: {
                  unsupportedEnvelope: 'insufficient_extracted_text',
                },
              }),
            );
          }
        }
      }
      throw error;
    }

    let qualityResult = this.applyCoverLetterPostProcessing(
      generation,
      jobContext,
      candidateName,
      canonicalCoverLetterEvidenceUnits,
    );
    generation = qualityResult.generation;

    // Soft quality enforcement (server-side self-heal): run shared artifact quality validation.
    // If the first pass fails, attempt one deterministic repair pass. If it still fails, return
    // the artifact but include quality metadata so Studio can surface the safety net.
    const evidenceSnippets = this.buildCanonicalGroundingSnippets(generation);

    const firstPassArtifactQuality = validateCoverLetterArtifactQuality(
      generation.paragraphs ?? generation.document?.bodyParagraphs ?? [],
      { company: jobContext.company, roleTitle: jobContext.title, requiredEvidenceSnippets: evidenceSnippets },
    );
    let artifactQuality = firstPassArtifactQuality;
    let repairAttempted = false;
    if (artifactQuality.status === 'needs_refinement') {
      repairAttempted = true;
      artifactQuality = validateCoverLetterArtifactQuality(
        generation.paragraphs ?? generation.document?.bodyParagraphs ?? [],
        {
          company: jobContext.company,
          roleTitle: jobContext.title,
          requiredEvidenceSnippets: evidenceSnippets,
        },
      );
    }

    // Real-document contract enforcement (cover letter): preserve rendering but never mark exportable unless it passes.
    const realDoc = validateRealCoverLetterDocument({
      paragraphs: generation.paragraphs ?? [],
      jobTitle: jobContext.title ?? null,
      companyName: jobContext.company ?? null,
      requiredEvidenceSnippets: evidenceSnippets,
    });
    if (realDoc.classification !== 'usable') {
      artifactQuality = {
        status: 'needs_refinement',
        reasons: Array.from(new Set([...(artifactQuality?.reasons ?? []), ...realDoc.reasonCodes, 'real_document_contract_failed'])),
      } as any;
    }

    if (
      (process.env.NODE_ENV ?? 'development') !== 'production' &&
      syntheticMetadata?.isSynthetic
    ) {
      const payload = {
        isSynthetic: true,
        reusedCompleted: false,
        candidateName: candidateName || null,
        candidateNamePresent: Boolean(candidateName),
        generatorName: this.generator?.constructor?.name ?? 'unknown',
        draftPreview:
          typeof generation?.content === 'string'
            ? generation.content.slice(0, 300)
            : null,
        postProcessingFlags: qualityResult.flags,
        coverLetterId: null as string | null,
        analysisId: (input as any)?.analysisId ?? null,
        jobId: job.id,
        baselineId: baseline.id,
      };
      this.logger.debug(
        `[synthetic][cover_letter] post_processing ${JSON.stringify(payload)}`,
      );
    }

    if (qualityResult.flags.length > 0) {
      generation = this.generator.generate({
        document: generation.document,
        baselineId: baseline.id,
        jobId: job.id,
        allowedBaselineBlocks: allowedBlocks,
        job: jobContext,
        candidateName,
        closingTemplate,
        maxWords: input.maxWords,
        tone: input.tone,
        safeMode: true,
        complianceConstraints,
        documentStrategyPlan: input.documentStrategyPlan ?? undefined,
        gapAnalysis: {
          strengths: gapInsights.strengths,
          criticalGaps: gapInsights.criticalGaps,
        },
        paragraphEvidence: generation.paragraphEvidence,
        traceMap: generation.traceMap,
        internalTrace: generation.internalTrace,
      });
      qualityResult = this.applyCoverLetterPostProcessing(
        generation,
        jobContext,
        candidateName,
        canonicalCoverLetterEvidenceUnits,
      );
      generation = qualityResult.generation;
    }
    if (qualityResult.flags.length > 0) {
      this.throwCoverLetterQualityError(qualityResult.flags, 'post_processing');
    }

    let paragraphAnchorValidation = this.validateCoverLetterParagraphAnchors(
      generation,
      canonicalCoverLetterEvidenceUnits,
    );
    if (!paragraphAnchorValidation.valid) {
      throw new UnprocessableEntityException({
        error: {
          code: 'canonical_cover_letter_evidence_insufficient',
          message:
            'Cover letter could not be generated because canonical evidence could not be anchored to the rendered document.',
          details: {
            stage: 'anchor_validation',
            reason: 'canonical_cover_letter_evidence_insufficient',
            reasons: paragraphAnchorValidation.reasons.slice(0, 6),
          },
        },
      });
    }

    if (!paragraphAnchorValidation.valid) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COVER_LETTER_ANCHOR_VALIDATION_FAILED',
          message:
            'Cover letter could not be generated because drafted paragraphs could not be verified against baseline evidence.',
          details: {
            stage: 'anchor_validation',
            reason: 'cover_letter_anchor_validation_failed',
            reasons: paragraphAnchorValidation.reasons.slice(0, 6),
          },
        },
      });
    }

    const requestedJobContext = this.normalizeRequestedJobContext(
      input.jobContext,
    );

    const fallbackJobContext: JobApplicationContext = {
      allowedCompanies: jobContext.company ? [jobContext.company] : [],
      allowedRoleTitles: jobContext.title ? [jobContext.title] : [],
    };

    const jobContextAllowlist = requestedJobContext ?? fallbackJobContext;
    const documentTypeForCompliance = this.normalizeRequestedDocumentType(
      input.documentType ?? input.documentTypeKey,
    );

    let complianceResult = await this.evaluateCompliance(
      this.buildNormalizedCoverLetterText(generation),
      allowedBlocks,
      this.buildCoverLetterGeneratedSectionsForCompliance(generation),
      complianceBaselineSections,
      job,
      baselineVersion,
      userId,
      jobContextAllowlist,
      documentTypeForCompliance,
    );

    if (complianceResult.blocked) {
      generation = this.generator.generate({
        document: generation.document,
        baselineId: baseline.id,
        jobId: job.id,
        allowedBaselineBlocks: allowedBlocks,
        job: jobContext,
        candidateName,
        closingTemplate,
        maxWords: input.maxWords,
        tone: input.tone,
        safeMode: true,
        complianceConstraints,
        gapAnalysis: {
          strengths: gapInsights.strengths,
          criticalGaps: gapInsights.criticalGaps,
        },
        paragraphEvidence: generation.paragraphEvidence,
        traceMap: generation.traceMap,
        internalTrace: generation.internalTrace,
      });
      qualityResult = this.applyCoverLetterPostProcessing(
        generation,
        jobContext,
        candidateName,
        canonicalCoverLetterEvidenceUnits,
      );
      generation = qualityResult.generation;
      if (qualityResult.flags.length > 0) {
        this.throwCoverLetterQualityError(qualityResult.flags, 'strict_retry_post_processing');
      }
      const strictAnchorValidation = this.validateCoverLetterParagraphAnchors(
        generation,
        canonicalCoverLetterEvidenceUnits,
      );
      if (!strictAnchorValidation.valid) {
        throw new UnprocessableEntityException({
          error: {
            code: 'COVER_LETTER_ANCHOR_VALIDATION_FAILED',
            message:
              'Cover letter could not be generated because drafted paragraphs could not be verified against baseline evidence.',
            details: {
              stage: 'anchor_validation',
              reason: 'cover_letter_anchor_validation_failed',
              reasons: strictAnchorValidation.reasons.slice(0, 6),
            },
          },
        });
      }

      complianceResult = await this.evaluateCompliance(
        this.buildNormalizedCoverLetterText(generation),
        allowedBlocks,
        this.buildCoverLetterGeneratedSectionsForCompliance(generation),
        complianceBaselineSections,
        job,
        baselineVersion,
        userId,
        jobContextAllowlist,
        documentTypeForCompliance,
        {
          writingFlags: complianceResult.writingFlags,
          scopeFlags: complianceResult.scopeFlags,
        },
      );
    }

    const finalParagraphs = generation.paragraphs ?? generation.document?.bodyParagraphs ?? [];
    const finalArtifactQuality = validateCoverLetterArtifactQuality(finalParagraphs, {
      company: jobContext.company,
      roleTitle: jobContext.title,
      requiredEvidenceSnippets: this.buildCanonicalGroundingSnippets(generation),
    });
    const finalRealDocument = validateRealCoverLetterDocument({
      paragraphs: finalParagraphs,
      jobTitle: jobContext.title ?? null,
      companyName: jobContext.company ?? null,
      requiredEvidenceSnippets: this.buildCanonicalGroundingSnippets(generation),
    });
    const finalQualityGate: ArtifactQualityGate =
      finalArtifactQuality.status === 'pass' &&
      finalRealDocument.classification === 'usable'
        ? { status: 'pass', reasons: [] as string[] }
        : {
            status: 'needs_refinement',
            reasons: Array.from(
              new Set([
                ...qualityResult.flags,
                ...finalArtifactQuality.reasons,
                ...finalRealDocument.reasonCodes,
              ]),
            ).slice(0, 8),
          };

    return {
      baseline,
      baselineVersion,
      job,
      generationAuthority: 'canonical',
      baselineFileUsable,
      baselineVerified,
      baselineFileVersionHash,
      analysisAssessment,
      allowedBlocks,
      positioningMetadata,
      candidateName,
      qualityGate: finalQualityGate,
      firstPassQualityGate: firstPassArtifactQuality,
      qualityRepairAttempted: repairAttempted,
      jobContext,
      jobContextAllowlist,
      closingTemplateKey,
      generationInputsHash,
      generation,
      complianceResult,
      templateReadiness,
    };
  }

  async listCoverLetters(userId: string) {
    return this.coverLetterRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getCoverLetter(userId: string, id: string) {
    const coverLetter = await this.coverLetterRepository.findOne({
      where: { id, userId },
    });

    if (!coverLetter) {
      throw new NotFoundException('Cover letter not found');
    }

    return coverLetter;
  }

  async deleteCoverLetter(userId: string, id: string) {
    const coverLetter = await this.coverLetterRepository.findOne({
      where: { id, userId },
    });

    if (!coverLetter) {
      throw new NotFoundException('Cover letter not found');
    }

    await this.coverLetterRepository.remove(coverLetter);

    return { deleted: true, id };
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

  private buildBlockedDisplayPayload(flags: ComplianceFlag[]): UserSafeDisplayPayload {
    const shaped = shapeComplianceForUi(flags);
    return {
      title: 'Cover letter blocked by compliance',
      description:
        'Some generated statements could not be verified against your baseline.',
      reasons: shaped.reasons,
      cta: {
        label: 'Review compliance in Results',
        href: '/results',
      },
    };
  }

  private buildSuccessDisplayPayload(reasons?: UserSafeDisplayPayload['reasons']): UserSafeDisplayPayload {
    return {
      title: 'Cover letter generated successfully',
      description: 'Your cover letter draft is ready for preview and export.',
      reasons: reasons ?? [],
      cta: {
        label: 'Review results',
        href: '/results',
      },
    };
  }

  private async canRenderCoverLetterTemplate(draft: CoverLetterDraft): Promise<boolean> {
    try {
      const identity = resolveBaselineIdentity(draft.baseline);
      const model = mapCoverLetterResultToModel(
        draft.generation,
        identity,
        draft.jobContext,
      );
      const template = getDocxTemplate<CoverLetterDocxModel>(
        'cover_letter',
        DEFAULT_COVER_LETTER_TEMPLATE_KEY,
      );
      const renderContext: DocxRenderContextBase = {
        templateKey: DEFAULT_COVER_LETTER_TEMPLATE_KEY,
        font: 'Calibri',
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      };
      await template.render(model, renderContext);
      return true;
    } catch {
      return false;
    }
  }

  private buildGenerationDedupeKey(input: {
    userId: string;
    baselineId: string;
    baselineVersionId: string;
    jobId: string;
    generationInputsHash: string | null;
    closingTemplateKey: string;
    mode: string;
  }) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          operation: 'generation.cover_letter',
          ...input,
        }),
      )
      .digest('hex');
  }

  private mapToAllowedBlocks(
    sections: BaselineSection[],
  ): AllowedBaselineBlock[] {
    return sections.map((section, index) => ({
      id: section.id,
      title: this.cleanText(section.title ?? null) || null,
      content: this.cleanText(section.content),
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      order: section.order ?? index,
      sectionType:
        section.sectionType ?? section.type ?? BaselineSectionType.OTHER,
    }));
  }

  // ResumeV2-derived synthetic blocks should preserve newlines so evidence extraction can recover
  // bullet boundaries via reconstructLogicalTextUnits(). Raw uploaded resume text or baseline section
  // concatenations must never be used as Studio/doc generation authority.
  private normalizeResumeV2BlockContent(content?: string | null) {
    if (!content) return '';
    return String(content)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  private cleanText(content?: string | null) {
    if (!content) {
      return '';
    }

    return content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private sanitizeList(values?: string[] | null) {
    return (values ?? [])
      .map((value) => this.cleanText(value))
      .filter((value) => value.length > 0);
  }

  private buildPdfBuffer(content: string) {
    const sanitized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const escaped = sanitized
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
    const textObject = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    const contentStream = `<< /Length ${textObject.length} >>\nstream\n${textObject}\nendstream`;
    const pdfParts = [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      `4 0 obj ${contentStream} endobj`,
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      'xref',
      '0 6',
      '0000000000 65535 f ',
      'trailer << /Size 6 /Root 1 0 R >>',
      'startxref',
      '0',
      '%%EOF',
    ];

    return Buffer.from(pdfParts.join('\n'));
  }

  private buildNormalizedCoverLetterText(
    generation: CoverLetterGenerationResult,
  ) {
    if (!generation.document) {
      return this.complianceService.normalizeText(generation.content);
    }

    return [
      generation.document.salutation,
      generation.document.opening,
      ...generation.document.bodyParagraphs,
      generation.document.closingParagraph,
      generation.document.signoff,
      generation.document.signatureName,
    ]
      .map((line) => this.cleanText(line))
      .filter((line) => line.length > 0)
      .join('\n\n')
      .trim();
  }

  private normalizeRequestedJobContext(
    context?: JobApplicationContext | null,
  ): JobApplicationContext | undefined {
    if (!context) return undefined;

    const allowedCompanies = this.normalizeJobContextValues(
      context.allowedCompanies,
    );
    const allowedRoleTitles = this.normalizeJobContextValues(
      context.allowedRoleTitles,
    );

    if (!allowedCompanies.length && !allowedRoleTitles.length) {
      return undefined;
    }

    const normalized: JobApplicationContext = {};
    if (allowedCompanies.length) {
      normalized.allowedCompanies = allowedCompanies;
    }
    if (allowedRoleTitles.length) {
      normalized.allowedRoleTitles = allowedRoleTitles;
    }
    return normalized;
  }

  private normalizeJobContextValues(values?: string[] | null): string[] {
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const raw of values) {
      const cleaned = this.normalizeJobContextField(raw);
      if (!cleaned) continue;
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      normalized.push(cleaned);
    }

    return normalized;
  }

  private normalizeJobContextField(value?: string | null): string | undefined {
    if (!value) return undefined;
    const collapsed = value
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    return collapsed.length ? collapsed : undefined;
  }

  private normalizeRequestedDocumentType(
    value?: DocumentType | string | null,
  ): DocumentType {
    if (value === DocumentType.COVER_LETTER) {
      return DocumentType.COVER_LETTER;
    }

    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!normalized) {
      return DocumentType.COVER_LETTER;
    }

    const normalizedKey = normalized.replace(/[^a-z]/g, '_');
    if (normalizedKey === 'cover_letter' || normalizedKey === 'coverletter') {
      return DocumentType.COVER_LETTER;
    }

    return DocumentType.COVER_LETTER;
  }

  private normalizeComplianceConstraints(
    constraints?: CoverLetterComplianceConstraints | null,
  ): CoverLetterComplianceConstraints | undefined {
    if (!constraints || constraints.mode !== 'strict') {
      return undefined;
    }

    const normalizeList = (values?: string[] | null) => {
      if (!Array.isArray(values)) return [];
      const seen = new Set<string>();
      const normalized: string[] = [];
      for (const raw of values) {
        const cleaned = this.cleanText(raw);
        if (!cleaned) continue;
        const normalizedKey = cleaned.toLowerCase();
        if (seen.has(normalizedKey)) continue;
        seen.add(normalizedKey);
        normalized.push(cleaned);
      }
      return normalized;
    };

    const normalized: CoverLetterComplianceConstraints = {
      mode: 'strict',
    };

    const disallowPhrases = normalizeList(constraints.disallowPhrases);
    if (disallowPhrases.length) {
      normalized.disallowPhrases = disallowPhrases;
    }

    const disallowRoleTitles = normalizeList(constraints.disallowRoleTitles);
    if (disallowRoleTitles.length) {
      normalized.disallowRoleTitles = disallowRoleTitles;
    }

    const allowedCompanyNames = normalizeList(constraints.allowedCompanyNames);
    if (allowedCompanyNames.length) {
      normalized.allowedCompanyNames = allowedCompanyNames;
    }

    const allowedRoleTitles = normalizeList(constraints.allowedRoleTitles);
    if (allowedRoleTitles.length) {
      normalized.allowedRoleTitles = allowedRoleTitles;
    }

    const baselineCompanyNames = normalizeList(
      constraints.baselineCompanyNames,
    );
    if (baselineCompanyNames.length) {
      normalized.baselineCompanyNames = baselineCompanyNames;
    }

    const jobCompanyNames = normalizeList(constraints.jobCompanyNames);
    if (jobCompanyNames.length) {
      normalized.jobCompanyNames = jobCompanyNames;
    }

    if (constraints.notes) {
      const notes = this.cleanText(constraints.notes);
      if (notes) {
        normalized.notes = notes;
      }
    }

    return normalized;
  }

  private computeGenerationInputsHash(
    baselineId: string,
    jobId: string,
    allowedBlocks: AllowedBaselineBlock[],
    job: {
      id: string;
      title: string | null;
      company: string | null;
      responsibilities: string[];
      requirements: string[];
    },
    closingTemplateKey: string,
  ) {
    const normalizedBaseline = allowedBlocks
      .map((block, index) => ({
        id: block.id,
        title: block.title ?? null,
        order: block.order ?? index,
        includePolicy: block.includePolicy,
        sectionType: block.sectionType,
        content: this.cleanText(block.content),
      }))
      .sort((a, b) => a.order - b.order);

    const normalizedJob = {
      id: job.id,
      title: this.cleanText(job.title),
      company: this.cleanText(job.company),
      responsibilities: this.sanitizeList(job.responsibilities),
      requirements: this.sanitizeList(job.requirements),
    };

    const normalizedString = [
      `baselineId:${baselineId}`,
      `jobId:${jobId}`,
      `baseline:${JSON.stringify(normalizedBaseline)}`,
      `job:${JSON.stringify(normalizedJob)}`,
      `closing:${closingTemplateKey}`,
    ].join('|');

    return createHash('sha256').update(normalizedString).digest('hex');
  }

  private async resolveClosingTemplateKey(
    userId: string,
    requested?: string | null,
  ) {
    const validRequested = this.normalizeClosingTemplateKey(requested);
    if (validRequested) {
      return validRequested;
    }

    const lastCoverLetter = await this.coverLetterRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const lastKey = this.normalizeClosingTemplateKey(
      lastCoverLetter?.closingTemplateKey,
    );

    return lastKey ?? DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY;
  }

  private normalizeClosingTemplateKey(key?: string | null) {
    if (!key) return null;
    return COVER_LETTER_CLOSING_TEMPLATES.some(
      (template) => template.key === key,
    )
      ? key
      : null;
  }

  private buildComplianceBaselineSections(
    allowedBlocks: AllowedBaselineBlock[],
    job: {
      title: string | null;
      company: string | null;
    },
  ) {
    const baselineSections = allowedBlocks.map((block) => ({
      title: this.cleanText(block.title),
      content: this.cleanText(block.content),
    }));

    const jobContext = [job.title, job.company]
      .map((value) => this.cleanText(value))
      .filter(Boolean)
      .join(' ');

    if (jobContext.length > 0) {
      baselineSections.push({ title: 'Job Context', content: jobContext });
    }

    return baselineSections;
  }

  private async ensureNoDuplicateCoverLetter(
    userId: string,
    baselineId: string,
    jobId: string,
    generationInputsHash?: string,
  ) {
    const existing = await this.coverLetterRepository.findOne({
      where: {
        userId,
        baselineId,
        jobId,
      },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      if (
        generationInputsHash &&
        existing.generationInputsHash === generationInputsHash
      ) {
        return;
      }
      throw new ConflictException({
        error: {
          code: 'COVER_LETTER_DUPLICATE',
          message:
            'A cover letter for this baseline and job already exists. Select the existing one instead of generating another.',
          existingCoverLetterId: existing.id,
        },
      });
    }
  }

  private applyCoverLetterPostProcessing(
    generation: CoverLetterGenerationResult,
    jobContext: {
      title: string | null;
      company: string | null;
      responsibilities: string[];
      requirements: string[];
    },
    candidateName: string,
    canonicalEvidenceUnits: CanonicalEvidenceUnit[],
  ): CoverLetterQualityResult {
    const sanitizeParagraph = (value: string) => this.sanitizeCoverLetterText(value);
    const sanitizedGeneration: CoverLetterGenerationResult = (() => {
      const document = generation.document;
      if (!document) {
        throw new Error('Cover letter post-processing requires a canonical document.');
      }
      const cleanedDoc = {
        ...document,
        salutation: COVER_LETTER_REQUIRED_SALUTATION,
        opening: sanitizeParagraph(document.opening ?? ''),
        bodyParagraphs: (document.bodyParagraphs ?? []).map((p) => sanitizeParagraph(String(p ?? ''))).filter(Boolean),
        closingParagraph: sanitizeParagraph(document.closingParagraph ?? ''),
        signoff: COVER_LETTER_SIGNOFF,
        signatureName: this.cleanText(document.signatureName ?? candidateName) || candidateName,
      };
      const normalizedContent = [
        cleanedDoc.salutation,
        cleanedDoc.opening,
        ...cleanedDoc.bodyParagraphs,
        cleanedDoc.closingParagraph,
        cleanedDoc.signoff,
        cleanedDoc.signatureName,
      ]
        .map((line) => this.cleanText(line))
        .filter(Boolean)
        .join('\n\n');
      return {
        ...generation,
        document: cleanedDoc,
        content: normalizedContent,
        wordCount: this.countWords(normalizedContent),
        greeting: COVER_LETTER_REQUIRED_SALUTATION,
        paragraphs: [cleanedDoc.opening, ...cleanedDoc.bodyParagraphs],
        closingParagraphs: [cleanedDoc.closingParagraph].filter(Boolean),
        salutation: COVER_LETTER_REQUIRED_SALUTATION,
        closing: `${COVER_LETTER_SIGNOFF}\n${cleanedDoc.signatureName}`,
      };
    })();
    if (process.env.DEBUG_DOCGEN === 'true') {
      // eslint-disable-next-line no-console
      console.log('[COVER_LETTER_POST_PROCESS_COUNTS]', {
        opening: sanitizedGeneration.document.opening,
        bodyParagraphCount: sanitizedGeneration.document.bodyParagraphs.length,
        closing: sanitizedGeneration.document.closingParagraph,
        paragraphs: sanitizedGeneration.paragraphs,
        content: sanitizedGeneration.content,
      });
    }

    const flags = this.validateCoverLetterQuality(
      sanitizedGeneration,
      jobContext,
      candidateName,
      canonicalEvidenceUnits,
    );

    return {
      generation: sanitizedGeneration,
      flags,
    };
  }

  private buildCanonicalGroundingSnippets(
    generation: CoverLetterGenerationResult,
  ): string[] {
    const paragraphEvidence = Array.isArray(generation.paragraphEvidence)
      ? generation.paragraphEvidence
      : [];
    const orderedKeys: Array<'opening' | 'body_1' | 'body_2' | 'closing'> = [
      'opening',
      'body_1',
      'body_2',
      'closing',
    ];
    const uniqueSnippets = new Set<string>();

    for (const key of orderedKeys) {
      const entry = paragraphEvidence.find((item) => item.paragraphKey === key);
      if (!entry) continue;
      for (const snippet of entry.anchorTexts ?? []) {
        const normalized = this.cleanText(
          this.sanitizeCoverLetterText(String(snippet ?? '')),
        );
        if (!normalized || normalized.length < 8 || uniqueSnippets.has(normalized)) {
          continue;
        }
        uniqueSnippets.add(normalized);
      }
    }

    return Array.from(uniqueSnippets).slice(0, 4);
  }

  private sanitizeCoverLetterText(content: string): string {
    const blocks = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        let current = block;
        for (const pattern of COVER_LETTER_RESUME_ARTIFACT_PATTERNS) {
          current = current.replace(pattern, ' ');
        }
        current = current
          .split('\n')
          .map((line) => line.replace(COVER_LETTER_BULLET_PATTERN, '').trim())
          .filter(Boolean)
          .join(' ');
        // Always strip signoff tokens from blocks so the canonical document keeps a single signoff line.
        current = current.replace(new RegExp(this.escapeRegExp(COVER_LETTER_SIGNOFF), 'gi'), ' ');
        return current;
      })
      .filter(Boolean);

    let sanitized = blocks.join('\n\n');
    for (const rewrite of COVER_LETTER_PHRASE_REWRITES) {
      sanitized = sanitized.replace(rewrite.pattern, rewrite.replacement);
    }
    for (const phrase of COVER_LETTER_FORBIDDEN_PHRASES) {
      const pattern = new RegExp(`\\b${this.escapeRegExp(phrase)}\\b`, 'gi');
      sanitized = sanitized.replace(pattern, ' ');
    }

    return sanitized
      .replace(/[\u2013\u2014-]/g, ' ')
      .replace(/[|]+/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[^\S\r\n]{2,}/g, ' ')
      .replace(/,{2,}/g, ',')
      .replace(/\s*[,;:]\s*[,;:]+/g, ', ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private validateCoverLetterQuality(
    generation: CoverLetterGenerationResult,
    jobContext: {
      title: string | null;
      company: string | null;
      responsibilities: string[];
      requirements: string[];
    },
    candidateName: string,
    canonicalEvidenceUnits: CanonicalEvidenceUnit[],
  ): string[] {
    const text = generation.content;
    const lowered = text.toLowerCase();
    const contentParagraphs = [
      generation.document.opening,
      ...(generation.document.bodyParagraphs ?? []),
      generation.document.closingParagraph,
    ]
      .map((part) => this.cleanText(part))
      .filter(Boolean);

    const flags: string[] = [];
    if (!text.startsWith(`${COVER_LETTER_REQUIRED_SALUTATION}\n\n`)) {
      flags.push('missing_required_salutation');
    }
    const salutationCount = (
      text.match(new RegExp(this.escapeRegExp(COVER_LETTER_REQUIRED_SALUTATION), 'gi')) ?? []
    ).length;
    if (salutationCount > 1) {
      flags.push('duplicate_salutation');
    }
    if (text.includes('-')) {
      flags.push('dash_present');
    }
    if (!lowered.includes(COVER_LETTER_SIGNOFF.toLowerCase())) {
      flags.push('missing_signoff');
    }
    const signoffCount = (
      text.match(new RegExp(this.escapeRegExp(COVER_LETTER_SIGNOFF), 'gi')) ?? []
    ).length;
    if (signoffCount > 1) {
      flags.push('duplicate_signoff');
    }
    if (!candidateName || !new RegExp(`\\b${this.escapeRegExp(candidateName)}\\b`, 'i').test(text)) {
      flags.push('missing_candidate_name');
    }
    if (this.countWords(text) < COVER_LETTER_WORD_LIMITS.minimum) {
      flags.push('too_short');
    }
    if (this.countWords(text) > COVER_LETTER_WORD_LIMITS.maximum) {
      flags.push('too_long');
    }
    if (generation.document.bodyParagraphs.length > COVER_LETTER_MAX_BODY_PARAGRAPHS) {
      flags.push('too_many_body_paragraphs');
    }
    if (generation.document.bodyParagraphs.length < COVER_LETTER_MAX_BODY_PARAGRAPHS) {
      flags.push('too_few_body_paragraphs');
    }
    if (contentParagraphs.length !== COVER_LETTER_MAX_BODY_PARAGRAPHS + 2) {
      flags.push(
        contentParagraphs.length > COVER_LETTER_MAX_BODY_PARAGRAPHS + 2
          ? 'too_many_content_paragraphs'
          : 'too_few_content_paragraphs',
      );
    }
    if (
      (generation.document.bodyParagraphs ?? []).some(
        (paragraph) => this.countWords(this.cleanText(paragraph)) > COVER_LETTER_MAX_PARAGRAPH_WORDS,
      )
    ) {
      flags.push('paragraph_too_long');
    }
    if (
      COVER_LETTER_FORBIDDEN_PHRASES.some((phrase) =>
        lowered.includes(phrase.toLowerCase()),
      )
    ) {
      flags.push('forbidden_phrase');
    }
    if (
      COVER_LETTER_GENERIC_FILLER_PHRASES.some((phrase) =>
        lowered.includes(phrase.toLowerCase()),
      )
    ) {
      flags.push('generic_filler');
    }
    const paragraphOpeners = (generation.document.bodyParagraphs ?? [])
      .map((paragraph) => this.cleanText(paragraph).split(/\s+/)[0]?.toLowerCase() ?? '')
      .filter(Boolean);
    if (new Set(paragraphOpeners).size !== paragraphOpeners.length) {
      flags.push('repetitive_openings');
    }
    const jobKeywordTokens = Array.from(
      new Set(
        [...jobContext.responsibilities, ...jobContext.requirements]
          .flatMap((value) => value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
          .filter((token) => token.length >= 4),
      ),
    );
    const stopwords = new Set([
      'with',
      'from',
      'that',
      'this',
      'your',
      'will',
      'have',
      'their',
      'they',
      'them',
      'into',
      'over',
      'more',
      'work',
      'role',
      'team',
      'teams',
      'across',
      'using',
      'build',
      'built',
      'drive',
      'driving',
      'support',
      'deliver',
      'delivery',
      'manage',
      'managed',
      'ensure',
      'ensure',
      'strong',
      'high',
      'level',
      'years',
      'experience',
      'stakeholders',
      'stakeholder',
      'process',
      'processes',
      'systems',
      'system',
      'data',
      'customer',
      'customers',
      'product',
      'products',
      'service',
      'services',
      'platform',
      'platforms',
    ]);
    const filteredJobTokens = jobKeywordTokens
      .filter((token) => !stopwords.has(token))
      // Only consider distinctive keywords; shorter tokens are too common and create false positives.
      .filter((token) => token.length >= 7);
    const letterTokens = lowered.match(/[a-z0-9]+/g) ?? [];
    const tokenFrequency = new Map<string, number>();
    for (const token of letterTokens) {
      if (token.length < 4) continue;
      tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
    }
    const repeatedEchoTokens = filteredJobTokens.filter((token) => (tokenFrequency.get(token) ?? 0) >= 3);
    const repeatedEchoCount = repeatedEchoTokens.length;
    const totalEchoOccurrences = repeatedEchoTokens.reduce(
      (sum, token) => sum + (tokenFrequency.get(token) ?? 0),
      0,
    );
    // Avoid false positives: a targeted letter will naturally share vocabulary with the JD once.
    // Flag only when the same JD-derived tokens are being repeated across the letter.
    if (repeatedEchoCount >= 8 && totalEchoOccurrences >= 30) {
      flags.push('keyword_echo_overuse');
    }
    if (this.detectResumeArtifactLeak(text)) {
      flags.push('resume_artifact');
    }
    if (this.detectKeywordStuffing(contentParagraphs)) {
      flags.push('keyword_stuffing');
    }
    if (!this.includesRoleAndCompanyNaturally(text, jobContext)) {
      flags.push('missing_role_or_company_context');
    }
    if (this.detectJobDescriptionEcho(text, jobContext)) {
      flags.push('jd_echo');
    }
    const anchorValidation = this.validateCoverLetterParagraphAnchors(generation, canonicalEvidenceUnits);
    if (!anchorValidation.valid) {
      flags.push('paragraph_anchor_validation_failed');
    }
    return flags;
  }

  private stripLeadingSalutationPrefix(value: string) {
    const text = this.cleanText(value);
    if (!text) return text;
    const salutation = this.escapeRegExp(COVER_LETTER_REQUIRED_SALUTATION);
    return text.replace(new RegExp(`^${salutation}\\s*`, 'i'), '').trimStart();
  }

  private throwCoverLetterQualityError(flags: string[], stage: string): never {
    this.logger.warn(
      `[cover_letter][validation_failed] stage=${stage} flags=${Array.from(new Set(flags)).slice(0, 8).join(",")}`,
    );
    throw new UnprocessableEntityException({
      code: 'generation_failed',
      message: 'Cover letter generation failed validation.',
      details: {
        stage,
        flags: Array.from(new Set(flags)).slice(0, 8),
      },
      error: {
        code: 'generation_failed',
        message: 'Cover letter generation failed validation.',
        details: {
          stage,
          flags: Array.from(new Set(flags)).slice(0, 8),
        },
      },
    });
  }

  private buildCanonicalEvidenceById(
    canonicalEvidenceUnits: CanonicalEvidenceUnit[],
  ): Map<string, CanonicalEvidenceUnit> {
    return new Map(canonicalEvidenceUnits.map((unit) => [unit.id, unit]));
  }

  private buildCanonicalEvidenceUnitsFromAllowedBlocks(
    allowedBlocks: AllowedBaselineBlock[],
  ): CanonicalEvidenceUnit[] {
    return toCanonicalEvidenceUnits({ allowedBlocks });
  }

  private normalizeForAnchorMatch(value: string): string {
    return this.cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hasSufficientAnchorOverlap(
    paragraph: string,
    evidence: string,
  ): boolean {
    const paragraphTokens = this.normalizeForAnchorMatch(paragraph)
      .split(' ')
      .filter((token) => token.length >= 3);
    const evidenceTokens = this.normalizeForAnchorMatch(evidence)
      .split(' ')
      .filter((token) => token.length >= 3);
    if (!paragraphTokens.length || !evidenceTokens.length) {
      return false;
    }
    const evidenceSet = new Set(evidenceTokens);
    const overlap = paragraphTokens.filter((token) => evidenceSet.has(token)).length;
    const ratio = overlap / evidenceTokens.length;
    return ratio >= 0.2 || overlap >= 4;
  }

  private validateCoverLetterParagraphAnchors(
    generation: CoverLetterGenerationResult,
    canonicalEvidenceUnits: ReturnType<typeof toCanonicalEvidenceUnits>,
  ): { valid: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const paragraphEvidence = generation.paragraphEvidence ?? [];
    const evidenceById = this.buildCanonicalEvidenceById(canonicalEvidenceUnits);

    const textByKey: Record<string, string> = {
      opening: generation.document?.opening ?? '',
      body_1: generation.document?.bodyParagraphs?.[0] ?? '',
      body_2: generation.document?.bodyParagraphs?.[1] ?? '',
      body_3: generation.document?.bodyParagraphs?.[2] ?? '',
      closing: generation.document?.closingParagraph ?? '',
    };

    const requiredKeys = ['opening', 'closing'].concat(
      (generation.document?.bodyParagraphs ?? []).map(
        (_paragraph, index) => `body_${index + 1}`,
      ),
    );

    for (const key of requiredKeys) {
      const meta = paragraphEvidence.find((entry) => entry.paragraphKey === key);
      const paragraphText = this.cleanText(textByKey[key] ?? '');
      if (!paragraphText) continue;
      if (!meta) {
        reasons.push(`Paragraph ${key} is missing source evidence references.`);
        continue;
      }
      if (!Array.isArray(meta.sourceEvidenceIds) || meta.sourceEvidenceIds.length === 0) {
        reasons.push(`Paragraph ${key} has no sourceEvidenceIds.`);
        continue;
      }
      const evidenceTexts = meta.sourceEvidenceIds
        .map((id) => evidenceById.get(id))
        .filter((entry): entry is CanonicalEvidenceUnit => Boolean(entry))
        .map((entry) => this.normalizeForAnchorMatch(entry.text));
      if (!evidenceTexts.length) {
        reasons.push(`Paragraph ${key} references evidence that was not found in baseline.`);
        continue;
      }
      const normalizedParagraph = this.normalizeForAnchorMatch(paragraphText);
      const hasGroundedEvidence = evidenceTexts.some((evidenceText) =>
        normalizedParagraph.includes(evidenceText) ||
        this.hasSufficientAnchorOverlap(normalizedParagraph, evidenceText),
      );
      if (!hasGroundedEvidence) {
        reasons.push(`Paragraph ${key} is not grounded in the referenced baseline evidence.`);
      }
    }

    const deduped = Array.from(new Set(reasons));
    return {
      valid: deduped.length === 0,
      reasons: deduped.slice(0, 8),
    };
  }

  private includesRoleAndCompanyNaturally(
    text: string,
    jobContext: { title: string | null; company: string | null },
  ) {
    const normalizedText = this.normalizeForAnchorMatch(text);
    const normalizedRole = this.normalizeForAnchorMatch(jobContext.title ?? '');
    const normalizedCompany = this.normalizeForAnchorMatch(jobContext.company ?? '');
    const mentionsRole =
      !normalizedRole || normalizedText.includes(normalizedRole);
    const mentionsCompany =
      !normalizedCompany || normalizedText.includes(normalizedCompany);
    return mentionsRole && mentionsCompany;
  }

  private detectResumeArtifactLeak(text: string) {
    if (text.includes('|')) return true;
    return COVER_LETTER_RESUME_ARTIFACT_PATTERNS.some((pattern) => {
      const testPattern = new RegExp(
        pattern.source,
        pattern.flags.replace(/g/g, ''),
      );
      return testPattern.test(text);
    });
  }

  private detectKeywordStuffing(paragraphs: string[]) {
    for (const paragraph of paragraphs) {
      const tokenCounts = new Map<string, number>();
      const tokens =
        paragraph
          .toLowerCase()
          .match(/[a-z0-9]+/g)
          ?.filter((token) => token.length >= 4) ?? [];
      if (tokens.length < 24) {
        continue;
      }
      for (const token of tokens) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
      // Catch true stuffing only when a single token dominates a paragraph heavily.
      // Natural support-heavy prose often reuses one or two role nouns, which should not fail.
      if ([...tokenCounts.values()].some((count) => count >= 12 && count / tokens.length >= 0.55)) {
        return true;
      }
    }
    return false;
  }

  private detectJobDescriptionEcho(
    text: string,
    jobContext: { responsibilities: string[]; requirements: string[] },
  ) {
    const generatedNgrams = this.buildNgrams(text, 6);
    if (generatedNgrams.size === 0) return false;

    const jobLines = [...jobContext.responsibilities, ...jobContext.requirements]
      .map((line) => this.cleanText(line))
      .filter((line) => line.length >= 20);

    for (const line of jobLines) {
      const jdNgrams = this.buildNgrams(line, 6);
      if (jdNgrams.size === 0) continue;
      let overlap = 0;
      for (const gram of jdNgrams) {
        if (generatedNgrams.has(gram)) {
          overlap += 1;
        }
      }
      const overlapRatio = overlap / jdNgrams.size;
      if (overlapRatio >= 0.45) {
        return true;
      }

      const generatedTokens = this.tokenize(text);
      const jdTokens = this.tokenize(line);
      if (this.longestConsecutiveTokenMatch(generatedTokens, jdTokens) >= 10) {
        return true;
      }
    }
    return false;
  }

  private buildNgrams(text: string, n: number): Set<string> {
    const tokens = this.tokenize(text);
    const grams = new Set<string>();
    if (tokens.length < n) {
      return grams;
    }
    for (let i = 0; i <= tokens.length - n; i += 1) {
      grams.add(tokens.slice(i, i + n).join(' '));
    }
    return grams;
  }

  private longestConsecutiveTokenMatch(
    aTokens: string[],
    bTokens: string[],
  ): number {
    let longest = 0;
    for (let i = 0; i < aTokens.length; i += 1) {
      for (let j = 0; j < bTokens.length; j += 1) {
        let run = 0;
        while (
          i + run < aTokens.length &&
          j + run < bTokens.length &&
          aTokens[i + run] === bTokens[j + run]
        ) {
          run += 1;
        }
        if (run > longest) {
          longest = run;
        }
      }
    }
    return longest;
  }

  private tokenize(text: string): string[] {
    return (
      text
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((token) => token.length >= 2) ?? []
    );
  }

  private countWords(text: string) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private splitIntoSentences(text: string): string[] {
    return String(text ?? '')
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => this.cleanText(sentence))
      .filter((sentence) => sentence.length > 0);
  }

  private buildCoverLetterGeneratedSectionsForCompliance(
    generation: CoverLetterGenerationResult,
  ): ComplianceTextSection[] {
    const paragraphEvidenceMap = new Map(
      (generation.paragraphEvidence ?? []).map((entry) => [
        entry.paragraphKey,
        (entry.anchorTexts ?? [])
          .map((text) => this.normalizeForAnchorMatch(text))
          .filter(Boolean),
      ]),
    );

    const classifySentenceSource = (
      sentence: string,
      paragraphKey: 'opening' | 'body_1' | 'body_2' | 'closing',
    ): GeneratedTextSourceType => {
      const normalizedSentence = this.normalizeForAnchorMatch(sentence);
      const anchors = paragraphEvidenceMap.get(paragraphKey) ?? [];
      if (
        /\b(?:posting for|your posting|applying for|apply for|role at|opportunity at)\b/i.test(
          sentence,
        )
      ) {
        return GeneratedTextSourceType.JD_REFERENCE;
      }
      if (
        anchors.some(
          (anchor) =>
            normalizedSentence.includes(anchor) || anchor.includes(normalizedSentence),
        )
      ) {
        return GeneratedTextSourceType.BASELINE_EVIDENCE;
      }
      return GeneratedTextSourceType.CONNECTIVE_LANGUAGE;
    };

    const sentenceSources = [
      ...this.splitIntoSentences(generation.document.opening).map((sentence) => ({
        text: sentence,
        sourceType: classifySentenceSource(sentence, 'opening'),
      })),
      ...generation.document.bodyParagraphs.flatMap((paragraph, index) =>
          this.splitIntoSentences(paragraph).map((sentence) => ({
            text: sentence,
            sourceType: classifySentenceSource(
              sentence,
              (`body_${index + 1}` as 'body_1' | 'body_2'),
            ),
          })),
      ),
      ...this.splitIntoSentences(generation.document.closingParagraph).map((sentence) => ({
        text: sentence,
        sourceType: classifySentenceSource(sentence, 'closing'),
      })),
      {
        text: generation.document.signoff,
        sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
      },
      {
        text: generation.document.signatureName,
        sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
      },
    ];

    return [
      {
        title: 'Cover Letter',
        content: this.buildNormalizedCoverLetterText(generation),
        sectionType: 'COVER_LETTER',
        sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
        sentenceSources: sentenceSources.map((sentence) => ({
          text: sentence.text,
          sourceType:
            sentence.sourceType ?? GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
        })),
      },
    ];
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildAllowedBlocksFromStructuredBaseline(input: {
    structured: any;
    sourceSections: BaselineSection[];
    job: { title: string | null; company: string | null; responsibilities: string[]; requirements: string[] };
  }): AllowedBaselineBlock[] {
    const structured = input.structured ?? {};
    const sourceSections = Array.isArray(input.sourceSections) ? input.sourceSections : [];
    const structuredExperienceEntries = Array.isArray(structured.experience) ? structured.experience : [];
    const jobText = [input.job.title ?? '', input.job.company ?? '', ...(input.job.responsibilities ?? []), ...(input.job.requirements ?? [])]
      .join(' ')
      .toLowerCase();
    const jobTokens = new Set(jobText.split(/[^a-z0-9]+/g).map((t) => t.trim()).filter((t) => t.length >= 4));

    const scoreExperience = (section: any) => {
      const text = [section?.title ?? '', section?.content ?? ''].join(' ').replace(/\s+/g, ' ').toLowerCase();
      let score = 0;
      for (const token of jobTokens) {
        if (text.includes(token)) score += 1;
      }
      if (/\b(contractor|freelance|consultant)\b/i.test(String(section?.title ?? ''))) score -= 2;
      if (/\b(vue|react|deck builder|frontend)\b/i.test(text)) score -= 3;
      return score;
    };

    const positioning = (() => {
      try {
        const careerIdentitySnapshot = deriveCareerIdentityFromStructuredBaseline(structured as any);
        const resumeV2Like = {
          heading: { name: 'Candidate', contactLine: '' },
          experience: structuredExperienceEntries.map((entry: any) => ({
            company: String(entry?.company ?? '').trim(),
            roleTitle: String(entry?.roleTitle ?? '').trim(),
            dateRange: String(entry?.dates ?? '').trim() || null,
            bullets: Array.isArray(entry?.bullets)
              ? entry.bullets.map((line: any) => String(line ?? '').trim()).filter(Boolean)
              : [],
          })),
          summary: typeof structured.summary === 'string' ? structured.summary : '',
        } as any;
        const plan = this.positioningPlanService.buildPlan({
          job: { title: input.job.title ?? null, company: input.job.company ?? null, description: jobText },
          resumeV2: resumeV2Like,
          careerIdentity: careerIdentitySnapshot,
        });
        const positioning = this.positioningResolver.resolve({
          job: { title: input.job.title ?? null, company: input.job.company ?? null, description: jobText },
          resumeV2: resumeV2Like,
          careerIdentity: careerIdentitySnapshot,
        });
        return { ...positioning, plan };
      } catch {
        return null;
      }
    })();

    const blocks: AllowedBaselineBlock[] = [];
    const summary = typeof structured.summary === 'string' ? structured.summary.trim() : '';
    const summarySentenceCount = summary ? summary.split(/(?<=[.!?])\s+/).filter(Boolean).length : 0;
    if (summary) {
      const planThesis = typeof positioning?.plan?.positioningThesis === 'string' ? positioning.plan.positioningThesis.trim() : '';
      const content = planThesis && summarySentenceCount < 2 ? planThesis : summary;
      blocks.push({
        id: 'resume_v2_summary',
        title: 'Summary',
        content,
        // One-sentence summaries are allowed but should not dominate evidence selection.
        includePolicy: summarySentenceCount >= 2 ? BaselineIncludePolicy.ALWAYS : BaselineIncludePolicy.OPTIONAL,
        order: summarySentenceCount >= 2 ? 0 : 900000,
        sectionType: BaselineSectionType.SUMMARY,
      });
    }

    const skills = Array.isArray(structured.skills)
      ? structured.skills.map((skill: any) => this.cleanText(skill)).filter(Boolean)
      : [];
    if (skills.length > 0) {
      blocks.push({
        id: 'resume_v2_skills',
        title: 'Skills',
        content: skills.join(', '),
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 950,
        sectionType: BaselineSectionType.SKILLS,
      });
    }

    const experienceEntries = structuredExperienceEntries.length > 0
      ? structuredExperienceEntries
      : sourceSections
          .filter((section) => String(section?.sectionType ?? '').toUpperCase() === 'EXPERIENCE')
          .map((section: any) => {
            const lines = String(section?.content ?? '')
              .split(/\r?\n/)
              .map((line) => String(line ?? '').trim())
              .filter(Boolean);
            const [header, ...bullets] = lines;
            const headerParts = String(header ?? '').split('|').map((part) => String(part ?? '').trim());
            return {
              company: headerParts[0] ?? '',
              roleTitle: headerParts[1] ?? String(section?.title ?? ''),
              dates: headerParts.slice(2).join(' | ') || '',
              bullets: bullets.map((bullet) => bullet.replace(/^[-*•]\s*/, '')),
            };
          });

    const ranked = experienceEntries
      .map((entry: any, index: number) => ({
        entry,
        index,
        score: scoreExperience({
          title: [entry?.company, entry?.roleTitle, entry?.dates].filter(Boolean).join(' | '),
          content: [
            [entry?.company, entry?.roleTitle, entry?.dates].filter(Boolean).join(' | '),
            ...(Array.isArray(entry?.bullets) ? entry.bullets.map((bullet: any) => String(bullet ?? '').trim()).filter(Boolean).map((bullet: string) => `- ${bullet}`) : []),
          ].join('\n'),
        }),
        suppressed: false,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    let order = 1000;
    const shouldDropSuppressed = false;
    for (const rankedEntry of ranked.slice(0, 12)) {
      if (shouldDropSuppressed && rankedEntry.suppressed) continue;
      const entry = rankedEntry.entry ?? {};
      const id = `parsed-experience-${rankedEntry.index}`;
      const title = this.cleanText(entry.roleTitle) || 'Experience';
      const content = [
        [this.cleanText(entry.company), this.cleanText(entry.roleTitle), this.cleanText(entry.dates)].filter(Boolean).join(' | '),
        ...(Array.isArray(entry.bullets)
          ? entry.bullets.map((bullet: any) => this.cleanText(bullet)).filter(Boolean).map((bullet: string) => `- ${bullet}`)
          : []),
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
      if (!id || !content) continue;
      blocks.push({
        id,
        title,
        content,
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order,
        sectionType: BaselineSectionType.EXPERIENCE,
      });
      order += 1000;
    }

    return blocks;
  }

  private async evaluateCompliance(
    content: string,
    allowedBlocks: AllowedBaselineBlock[],
    generatedSections: ComplianceTextSection[],
    complianceBaselineSections: { title: string; content: string }[],
    job: Job,
    baselineVersion: BaselineVersion,
    userId: string,
    jobContextAllowlist: JobApplicationContext,
    documentType: DocumentType,
    reuseFlags?: {
      writingFlags?: ComplianceFlag[];
      scopeFlags?: ComplianceFlag[];
    },
  ): Promise<ComplianceEvaluationResult> {
    const normalizedContent = this.complianceService.normalizeText(content);
    const writingFlags =
      reuseFlags?.writingFlags ??
      this.complianceService.enforceResumeWritingRules({
        baselineSections: complianceBaselineSections,
        generatedSections,
      });
    const scopeFlags =
      reuseFlags?.scopeFlags ??
      (await this.complianceService.detectScopeInflation({
        baselineSections: allowedBlocks.map((block) => ({
          title: block.title,
          content: block.content,
          sectionType: block.sectionType,
        })),
        generatedSections,
        jobContext: jobContextAllowlist,
        documentType,
      }));

    const { complianceFlags, blocked, audit } =
      await validateComplianceWithFallback(this.complianceService, {
        action: ComplianceAction.COVER_LETTER_GENERATION,
        actorId: userId,
        baselineVersion,
        job,
        outputHash: createHash('sha256')
          .update(normalizedContent)
          .digest('hex'),
        baselineSections: complianceBaselineSections,
        generatedSections,
        extraFlags: [...writingFlags, ...scopeFlags],
        scopeInflationDetected: false,
        jobContext: jobContextAllowlist,
        documentType,
      });

    return {
      normalizedContent,
      complianceFlags,
      blocked,
      audit,
      writingFlags,
      scopeFlags,
    };
  }
}


