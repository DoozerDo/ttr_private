import { Inject, Injectable, UnprocessableEntityException, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { loadPersistedFitAssessmentReadModel } from '../common/analysis-context-binding';
import { Job } from '../jobs/job.entity';
import { StudioArtifact, StudioArtifactLifecycleStatus } from './studio-artifact.entity';
import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import { sanitizeResumePreviewForStudio } from '../resume/resumePreviewSanitizer';
import type { ArtifactGenerationResult, ArtifactCorrectionReason } from '@shared/artifactGenerationResult';
import { extractStructuredBaselineFromSections } from '../baseline/structuredBaselineExtractor';
import {
  evaluateBaselineTemplateReadiness,
  type BaselineTemplateReadinessReason,
} from '../baseline/baselineTemplateReadiness';
import { interpretEvidenceFromResumeText } from '../evidence/evidence-interpreter';
import type { InterpretedEvidenceSummary } from '../evidence/evidence-model';
import { resolveEvidenceReadinessFromSummary } from '../evidence/readiness-thresholds';
import { resolveDocumentReadinessState } from '@shared/documentReadinessState';
import {
  buildResumePlainText,
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from '../resume/resume-normalization';
import { BaselineResumeV2BackfillService } from '../baseline/baseline-resume-v2-backfill.service';
import { ResumeService } from '../resume/resume.service';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import type { CustomerWorkflowState } from '../workflow/customer-workflow.service';

export type StudioArtifactKind = 'resume' | 'cover_letter';

export type StudioArtifactRecord = {
  artifactId?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  generationRunId?: string | null;
  artifactSource?: 'persisted' | 'fresh_generation';
  status: StudioArtifactLifecycleStatus;
  inputsHash: string | null;
  inputsHashMatches: boolean;
  artifactCurrent: boolean;
  usableCurrent: boolean;
  retryAllowed: boolean;
  responseBody: Record<string, unknown> | null;
  content: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  metadata: Record<string, unknown>;
  resumeMetadata?: Record<string, unknown>;
  interpretedEvidenceAudit?: {
    interpretedEvidenceSummary?: unknown;
    interpretedEvidenceReadiness?: unknown;
    omittedInterpretedEvidence?: unknown;
    evidenceDetailsMap?: unknown;
    bypassedTemplateHardBlockWithInterpretedEvidence?: unknown;
  };
};

export type StudioArtifactsState = {
  status: StudioArtifactLifecycleStatus;
  baselineId: string;
  jobId: string;
  baselineVersionId: string | null;
  baselineVersionHash: string | null;
  jobFingerprint: string | null;
  generationContractVersion: string;
  errors?: Array<{
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
  }>;
  artifactReadiness?: 'ready' | 'degraded' | 'blocked';
  artifactReadinessReasons?: string[];
  artifactReadinessReasonDetails?: BaselineTemplateReadinessReason[];
  assessmentScore?: number | null;
  structuredBaselineExperienceCount?: number;
  structuredBaselineMissingEvidenceReasons?: string[];
  structuredBaselineExtractedExperiencePreview?: Array<{
    company: string;
    roleTitle: string;
    dates?: string;
    bulletCount: number;
  }>;
  resume: StudioArtifactRecord | null;
  coverLetter: StudioArtifactRecord | null;
  resumeResult?: ArtifactGenerationResult<unknown>;
  coverLetterResult?: ArtifactGenerationResult<unknown>;
  resumeFailureDiagnostics?: Record<string, unknown> | null;
  workflowState?: CustomerWorkflowState | null;
  diagnostics?: {
    staleArtifactRejected?: boolean;
    staleArtifactReasonCodes?: string[];
    hydrationSource?: string;
    authoritativeArtifactId?: string | null;
    rejectedArtifactIds?: string[];
    retrievalDecisionPath?: string;
    hydrationRejected?: boolean;
    rejectedMinimalArtifact?: boolean;
    rejectedMinimalArtifactReason?: string | null;
    resumeV2Readiness?: {
      hasResumeV2?: boolean;
      usableExperienceCount?: number;
      requiredExperienceCount?: number;
      failureReasons?: string[];
      source?: string;
      valid?: boolean;
    };
  };
};

type ArtifactPatch = QueryDeepPartialEntity<StudioArtifact>;
type ArtifactWriteMetadata = Record<string, unknown> & {
  analysisId?: string | null;
};

type EvidenceContractBlocker = {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
};

type CanonicalBaselineReadModel = Pick<
  Baseline,
  | 'id'
  | 'userId'
  | 'version'
  | 'versionNumber'
  | 'originalFilename'
  | 'mimeType'
  | 'storagePath'
  | 'hash'
  | 'status'
  | 'isActive'
  | 'archivedAt'
  | 'originalBaselineScore'
  | 'latestBaselineScore'
  | 'latestAssessmentId'
  | 'firstAnalyzedAt'
  | 'lastAnalyzedAt'
  | 'isSynthetic'
  | 'syntheticScenarioKey'
  | 'syntheticRunId'
  | 'syntheticCreatedAt'
  | 'preserveFromCleanup'
> & {
  sections: Array<Pick<BaselineSection, 'id' | 'baselineId' | 'sectionType' | 'title' | 'content' | 'includePolicy' | 'order' | 'createdAt' | 'updatedAt'>>;
  parsedRecords: Array<
    Pick<
      BaselineParsed,
      | 'id'
      | 'baselineId'
      | 'sourceFileId'
      | 'schemaVersion'
      | 'sourceFormat'
      | 'ingestedAt'
      | 'parsedJson'
      | 'resumeV2Json'
      | 'flagsJson'
      | 'createdAt'
    >
  >;
};

const ARTIFACT_CONTRACT_VERSION = 'studio-artifacts-v1';
// Bump this when composition rules change in a way that should invalidate previously-generated artifacts
// (even when baseline/job/assessment inputs are identical). This prevents stale/cached artifacts from
// persisting after quality or domain-fidelity fixes.
const COMPOSITION_RULESET_VERSION = '2026-05-22-domain-fidelity-v1';

function safeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function safeObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>);
}

function sanitizeStoredResumeResponseBody(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value) return null;
  const preview = value.preview;
  if (!preview || typeof preview !== 'object') return value;
  const previewRecord = preview as Record<string, unknown>;
  const resume = previewRecord.resume;
  if (!resume || typeof resume !== 'object') return value;

  return {
    ...value,
    preview: {
      ...previewRecord,
      resume: sanitizeResumePreviewForStudio(resume as NormalizedResumeDocument),
    },
  };
}

function extractCanonicalResumePreviewModel(
  responseBody: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!responseBody) return null;

  const preview = normalizeRecord((responseBody as any).preview);
  const previewResume = normalizeRecord(preview?.resume);
  if (previewResume) return previewResume;

  const candidateSources = [
    (responseBody as any).previewResume,
    (responseBody as any).normalizedDocument,
    (responseBody as any).normalizedResume,
    (responseBody as any).resume,
    (responseBody as any).canonicalResume,
    (responseBody as any).model,
  ];

  for (const candidateSource of candidateSources) {
    const candidate = normalizeRecord(candidateSource);
    if (!candidate) continue;

    const nestedPreview = normalizeRecord(candidate.preview);
    const nestedPreviewResume = normalizeRecord(nestedPreview?.resume);
    if (nestedPreviewResume) return nestedPreviewResume;

    const candidateResume = normalizeRecord(candidate.resume);
    if (candidateResume) return candidateResume;

    const hasCanonicalResumeShape =
      Boolean(candidate.heading && typeof candidate.heading === 'object') &&
      Array.isArray((candidate as any).experience);
    if (hasCanonicalResumeShape) return candidate;
  }

  return null;
}

function shouldDebugDocgen() {
  return process.env.NODE_ENV !== 'production' || process.env.DEBUG_DOCGEN === 'true';
}

function extractInterpretedEvidenceAuditFromResponseBody(
  responseBody: Record<string, unknown> | null,
): StudioArtifactRecord['interpretedEvidenceAudit'] | null {
  if (!responseBody) return null;
  const internal = responseBody.internal;
  const internalRecord = internal && typeof internal === 'object' ? (internal as Record<string, unknown>) : null;
  const interpretedEvidenceSummary =
    internalRecord?.interpretedEvidenceSummary ?? (responseBody as any).interpretedEvidenceSummary;
  const interpretedEvidenceReadiness =
    internalRecord?.interpretedEvidenceReadiness ?? (responseBody as any).interpretedEvidenceReadiness;
  const omittedInterpretedEvidence =
    internalRecord?.omittedInterpretedEvidence ?? (responseBody as any).omittedInterpretedEvidence;
  const bypassedTemplateHardBlockWithInterpretedEvidence =
    internalRecord?.bypassedTemplateHardBlockWithInterpretedEvidence ??
    (responseBody as any).bypassedTemplateHardBlockWithInterpretedEvidence;
  const evidenceDetailsMap = responseBody.evidenceDetailsMap;

  const hasAny =
    Boolean(interpretedEvidenceSummary) ||
    Boolean(interpretedEvidenceReadiness) ||
    Boolean(omittedInterpretedEvidence) ||
    Boolean(bypassedTemplateHardBlockWithInterpretedEvidence) ||
    Boolean(evidenceDetailsMap);
  if (!hasAny) return null;

  return {
    ...(interpretedEvidenceSummary ? { interpretedEvidenceSummary } : {}),
    ...(interpretedEvidenceReadiness ? { interpretedEvidenceReadiness } : {}),
    ...(omittedInterpretedEvidence ? { omittedInterpretedEvidence } : {}),
    ...(evidenceDetailsMap ? { evidenceDetailsMap } : {}),
    ...(bypassedTemplateHardBlockWithInterpretedEvidence
      ? { bypassedTemplateHardBlockWithInterpretedEvidence }
      : {}),
  };
}

function isTrue(value: unknown): boolean {
  return value === true || String(value ?? '').toLowerCase() === 'true';
}

function buildArtifactWriteMetadata(
  metadata?: Record<string, unknown>,
  analysisId?: string | null,
): ArtifactWriteMetadata {
  return {
    ...(metadata ?? {}),
    ...(analysisId ? { analysisId } : {}),
  };
}

function looksLikeGenericResumeFiller(text: string): boolean {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 20) return true;
  return [
    /delivered consistent execution by clarifying priorities and maintaining a steady operating rhythm/i,
    /passionate team player/i,
    /thrives in fast-paced environments/i,
    /customer-facing technical support at the in-store computer helpdesk/i,
    /cascade aerial photography/i,
  ].some((pattern) => pattern.test(normalized));
}

function sanitizeResumeResponseBodyForEvidenceContract(
  responseBody: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = normalizeRecord(responseBody);
  if (!normalized) return responseBody;

  const preview = normalizeRecord((normalized as any).preview);
  const resume = normalizeRecord(preview?.resume);
  if (!preview || !resume) return normalized;

  const experience = Array.isArray((resume as any).experience) ? (resume as any).experience : [];
  const nextExperience: unknown[] = [];
  const usedEvidenceIds = new Set<string>();

  for (const employer of experience) {
    const employerRecord = normalizeRecord(employer);
    if (!employerRecord) continue;
    const bullets = Array.isArray((employerRecord as any).bullets) ? (employerRecord as any).bullets : [];
    const nextBullets: unknown[] = [];

    for (const bullet of bullets) {
      const bulletRecord = normalizeRecord(bullet) ?? (typeof bullet === 'string' ? { text: bullet } : null);
      if (!bulletRecord) continue;
      const text = safeText((bulletRecord as any).text ?? bullet);
      const sourceEvidenceIds = Array.isArray((bulletRecord as any).sourceEvidenceIds)
        ? (bulletRecord as any).sourceEvidenceIds.filter(Boolean)
        : Array.isArray((bulletRecord as any)?.source?.sourceEvidenceIds)
          ? (bulletRecord as any).source.sourceEvidenceIds.filter(Boolean)
          : [];

      if (!text || looksLikeGenericResumeFiller(text) || sourceEvidenceIds.length === 0) {
        continue;
      }

      sourceEvidenceIds.forEach((id) => usedEvidenceIds.add(String(id)));
      nextBullets.push({
        ...bulletRecord,
        text,
        sourceEvidenceIds,
        source: {
          ...normalizeRecord((bulletRecord as any).source),
          sourceEvidenceIds,
        },
      });
    }

    if (!nextBullets.length) continue;
    nextExperience.push({
      ...employerRecord,
      bullets: nextBullets,
    });
  }

  const nextResume = {
    ...resume,
    experience: nextExperience,
  };

  return {
    ...normalized,
    preview: {
      ...preview,
      resume: nextResume,
    },
    internalTrace: {
      ...normalizeRecord((normalized as any).internalTrace),
      usedEvidenceIds: Array.from(usedEvidenceIds),
    },
  };
}

function getResponseInternalBool(responseBody: Record<string, unknown> | null, key: string): boolean {
  if (!responseBody) return false;
  const internal = normalizeRecord((responseBody as any).internal);
  return isTrue(internal?.[key]);
}

function detectMinimalResumeArtifact(responseBody: Record<string, unknown> | null): {
  minimal: boolean;
  reasons: string[];
  authoritativeExperienceCount: number | null;
} {
  if (!responseBody) return { minimal: false, reasons: [], authoritativeExperienceCount: null };
  const reasons: string[] = [];
  const internal = normalizeRecord((responseBody as any).internal);
  const minimalFallback = isTrue(internal?.minimalFallback);
  if (minimalFallback) reasons.push('internal.minimalFallback');

  const auditId = safeText((responseBody as any)?.auditId);
  const auditIdLegacy = safeText((responseBody as any)?.audit_id);
  if (auditId.startsWith('minimal:') || auditIdLegacy.startsWith('minimal:')) {
    reasons.push('auditId.minimal_prefix');
  }

  const generationMode = safeText((internal as any)?.resumeGenerationMode);
  if (generationMode === 'top_level_fail_safe_minimal') {
    reasons.push('internal.resumeGenerationMode.top_level_fail_safe_minimal');
  }

  const failSafeUsed = isTrue((internal as any)?.resumeFailSafeMinimalUsed);
  if (failSafeUsed) reasons.push('internal.resumeFailSafeMinimalUsed');

  const resumeSections = (responseBody as any)?.preview?.resume?.sections;
  const hasMinimalSummary =
    Array.isArray(resumeSections) &&
    resumeSections.some((s: any) => String(s?.type ?? '').trim().toLowerCase() === 'minimal-summary');
  if (hasMinimalSummary) reasons.push('sections.minimal-summary');

  const pv = normalizeRecord((internal as any)?.productionValidation);
  const authoritativeRoleKeys = (pv as any)?.authoritativeExperienceRoleKeys;
  if (Array.isArray(authoritativeRoleKeys) && authoritativeRoleKeys.length === 0) {
    reasons.push('productionValidation.authoritativeExperienceRoleKeys.empty');
  }
  const authoritativeExperienceCountRaw = (pv as any)?.authoritativeExperienceCount;
  const authoritativeExperienceCount =
    typeof authoritativeExperienceCountRaw === 'number'
      ? authoritativeExperienceCountRaw
      : typeof authoritativeExperienceCountRaw === 'string' && authoritativeExperienceCountRaw.trim()
        ? Number(authoritativeExperienceCountRaw)
        : null;
  if (typeof authoritativeExperienceCount === 'number' && Number.isFinite(authoritativeExperienceCount) && authoritativeExperienceCount <= 0) {
    reasons.push('productionValidation.authoritativeExperienceCount.zero');
  }
  if (isTrue((pv as any)?.persistencePrevented)) {
    reasons.push('productionValidation.persistencePrevented');
  }

  return { minimal: reasons.length > 0, reasons, authoritativeExperienceCount };
}

const shouldTraceArtifactIdentity = process.env.ARTIFACT_IDENTITY_TRACE === 'true';

const GENERIC_FILLER_PATTERNS = [
  /\bresults? driven\b/i,
  /\bpassionate\b/i,
  /\bteam player\b/i,
  /\bsynergy\b/i,
  /\bfast[-\s]?paced\b/i,
  /\bdetail[-\s]?oriented\b/i,
  /\bworld[-\s]?class\b/i,
];

@Injectable()
export class StudioArtifactsService {
  constructor(
    @InjectRepository(StudioArtifact)
    private readonly studioArtifactRepository: Repository<StudioArtifact>,
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    private readonly baselineResumeV2BackfillService: BaselineResumeV2BackfillService,
    private readonly resumeService: ResumeService,
    @Inject(forwardRef(() => CoverLettersService))
    private readonly coverLettersService: CoverLettersService,
  ) {}

  getContractVersion() {
    return ARTIFACT_CONTRACT_VERSION;
  }

  private cleanEvidenceText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  private detectGenericFiller(text: string) {
    const normalized = this.cleanEvidenceText(text).toLowerCase();
    if (!normalized) return true;
    if (normalized.length < 20) return true;
    return GENERIC_FILLER_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  private collectArtifactEvidenceBlockers(
    kind: StudioArtifactKind,
    responseBody: Record<string, unknown>,
  ): EvidenceContractBlocker[] {
    const blockers: EvidenceContractBlocker[] = [];
    const usedEvidenceIds = Array.isArray((responseBody as any)?.internalTrace?.usedEvidenceIds)
      ? (responseBody as any).internalTrace.usedEvidenceIds.filter(Boolean)
      : [];
    if (kind === 'resume') {
      const preview = normalizeRecord((responseBody as any)?.preview)?.resume ?? null;
      const summary = this.cleanEvidenceText((preview as any)?.summary);
      const experiences = Array.isArray((preview as any)?.experience) ? (preview as any).experience : [];
      const seenBullets = new Map<string, string>();
      let hasEvidence = usedEvidenceIds.length > 0;

      if (!summary || this.detectGenericFiller(summary)) {
        blockers.push({
          code: 'resume_summary_unverified',
          message: 'Resume summary is not traceable to verified baseline evidence.',
        });
      }

      for (const employer of experiences) {
        const employerName = this.cleanEvidenceText((employer as any)?.company || (employer as any)?.companyName);
        const bullets = Array.isArray((employer as any)?.bullets) ? (employer as any).bullets : [];
        for (const bullet of bullets) {
          const bulletText = this.cleanEvidenceText(typeof bullet === 'string' ? bullet : (bullet as any)?.text);
          const evidenceIds = Array.isArray((bullet as any)?.sourceEvidenceIds)
            ? (bullet as any).sourceEvidenceIds.filter(Boolean)
            : Array.isArray((bullet as any)?.source?.sourceEvidenceIds)
              ? (bullet as any).source.sourceEvidenceIds.filter(Boolean)
              : [];
          if (!bulletText || this.detectGenericFiller(bulletText)) {
            blockers.push({
              code: 'resume_generic_filler',
              message: 'Resume contains generic filler that is not evidence-backed.',
              details: { employer: employerName || null, bullet: bulletText || null },
            });
            continue;
          }
          if (this.detectGenericFiller(bulletText)) {
            blockers.push({
              code: 'resume_generic_filler',
              message: 'Resume contains generic filler that is not evidence-backed.',
              details: { employer: employerName || null, bullet: bulletText },
            });
            continue;
          }
          if (evidenceIds.length === 0 && usedEvidenceIds.length === 0) {
            blockers.push({
              code: 'resume_missing_evidence',
              message: 'Resume bullet is missing verified baseline evidence references.',
              details: { employer: employerName || null, bullet: bulletText },
            });
            continue;
          }
          hasEvidence = true;
          const previousEmployer = seenBullets.get(bulletText.toLowerCase());
          if (previousEmployer && previousEmployer !== employerName) {
            blockers.push({
              code: 'resume_duplicate_bullet_across_employers',
              message: 'The same resume bullet appears under more than one employer.',
              details: { bullet: bulletText, firstEmployer: previousEmployer, secondEmployer: employerName || null },
            });
          } else {
            seenBullets.set(bulletText.toLowerCase(), employerName || '');
          }
        }
      }

      if (!hasEvidence) {
        blockers.push({
          code: 'resume_missing_evidence',
          message: 'Resume has no verified baseline evidence to mark current.',
        });
      }
    } else {
      const preview = normalizeRecord((responseBody as any)?.preview)?.coverLetter ?? null;
      const paragraphs = Array.isArray((preview as any)?.paragraphs) ? (preview as any).paragraphs : [];
      const paragraphEvidence = Array.isArray((responseBody as any)?.paragraphEvidence)
        ? (responseBody as any).paragraphEvidence
        : [];
      let hasEvidence = usedEvidenceIds.length > 0;
      for (const paragraph of paragraphs) {
        const paragraphText = this.cleanEvidenceText(paragraph);
        const meta = paragraphEvidence.find((entry: any) =>
          this.cleanEvidenceText(entry?.paragraphKey) && entry.paragraphText
            ? this.cleanEvidenceText(entry.paragraphText) === paragraphText
            : false,
        );
        const sourceEvidenceIds = Array.isArray(meta?.sourceEvidenceIds) ? meta.sourceEvidenceIds.filter(Boolean) : [];
        if (!paragraphText || this.detectGenericFiller(paragraphText)) {
          blockers.push({
            code: 'cover_letter_generic_filler',
            message: 'Cover letter contains generic filler that is not evidence-backed.',
            details: { paragraph: paragraphText || null },
          });
          continue;
        }
        if (sourceEvidenceIds.length === 0 && usedEvidenceIds.length === 0) {
          blockers.push({
            code: 'cover_letter_missing_evidence',
            message: 'Cover letter paragraph is missing verified baseline evidence references.',
            details: { paragraph: paragraphText },
          });
          continue;
        }
        hasEvidence = true;
      }

      if (!hasEvidence) {
        blockers.push({
          code: 'cover_letter_missing_evidence',
          message: 'Cover letter has no verified baseline evidence to mark current.',
        });
      }
    }

    return blockers;
  }

  private assertCurrentArtifactEvidenceContract(
    kind: StudioArtifactKind,
    responseBody: Record<string, unknown>,
  ): void {
    const blockers = this.collectArtifactEvidenceBlockers(kind, responseBody);
    if (blockers.length > 0) {
      throw new UnprocessableEntityException({
        error: {
          code: 'studio_artifact_evidence_contract_failed',
          message: `${kind} artifact failed the evidence contract.`,
          blockers,
        },
      });
    }
  }

  async readState(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    analysisId?: string | null;
    recoveryAttempted?: boolean;
  }): Promise<StudioArtifactsState> {
    const errors: NonNullable<StudioArtifactsState['errors']> = [];
    const shouldLogIngest = process.env.RESUME_V2_INGEST_DEBUG === 'true';
    if (process.env.DEBUG_STUDIO_ARTIFACT_QUALITY === 'true') {
      // eslint-disable-next-line no-console
      console.log('[ARTIFACT_QUALITY_READ]', `baselineId=${input.baselineId} jobId=${input.jobId} baselineVersionId=${input.baselineVersionId} analysisId=${input.analysisId ?? null}`);
    }
    const [baselineVersion, job, assessment, baseline] = await Promise.all([
      this.baselineVersionRepository.findOne({
        where: { id: input.baselineVersionId, baselineId: input.baselineId },
      }),
      this.jobRepository.findOne({
        where: { id: input.jobId, userId: input.userId },
      }),
      loadPersistedFitAssessmentReadModel(
        this.fitAssessmentRepository,
        input.analysisId ?? '',
        input.userId,
        input.jobId,
        input.baselineId,
      ),
      (async () => {
        const baselineRows = await this.baselineRepository
          .createQueryBuilder('baseline')
          .leftJoin('baseline.sections', 'sections')
          .leftJoin('baseline.parsedRecords', 'parsedRecords')
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
            'sections.id',
            'sections.baselineId',
            'sections.sectionType',
            'sections.title',
            'sections.content',
            'sections.includePolicy',
            'sections.order',
            'sections.createdAt',
            'sections.updatedAt',
            'parsedRecords.id',
            'parsedRecords.baselineId',
            'parsedRecords.sourceFileId',
            'parsedRecords.schemaVersion',
            'parsedRecords.sourceFormat',
            'parsedRecords.ingestedAt',
            'parsedRecords.parsedJson',
            'parsedRecords.resumeV2Json',
            'parsedRecords.flagsJson',
            'parsedRecords.createdAt',
          ])
          .where('baseline.id = :baselineId', { baselineId: input.baselineId })
          .andWhere('baseline.userId = :userId', { userId: input.userId })
          .orderBy('sections.order', 'ASC')
          .addOrderBy('parsedRecords.createdAt', 'DESC')
          .getRawMany();

        if (!baselineRows.length) return null;

        const firstRow = baselineRows[0] as Record<string, unknown>;
        const baseline = {
          id: firstRow['baseline_id'],
          userId: firstRow['baseline_userId'],
          version: firstRow['baseline_version'],
          versionNumber: firstRow['baseline_versionNumber'],
          originalFilename: firstRow['baseline_originalFilename'],
          mimeType: firstRow['baseline_mimeType'],
          storagePath: firstRow['baseline_storagePath'],
          hash: firstRow['baseline_hash'],
          status: firstRow['baseline_status'],
          isActive: firstRow['baseline_isActive'],
          archivedAt: firstRow['baseline_archivedAt'],
          originalBaselineScore: firstRow['baseline_originalBaselineScore'],
          latestBaselineScore: firstRow['baseline_latestBaselineScore'],
          latestAssessmentId: firstRow['baseline_latestAssessmentId'],
          firstAnalyzedAt: firstRow['baseline_firstAnalyzedAt'],
          lastAnalyzedAt: firstRow['baseline_lastAnalyzedAt'],
          isSynthetic: firstRow['baseline_isSynthetic'],
          syntheticScenarioKey: firstRow['baseline_syntheticScenarioKey'],
          syntheticRunId: firstRow['baseline_syntheticRunId'],
          syntheticCreatedAt: firstRow['baseline_syntheticCreatedAt'],
          preserveFromCleanup: firstRow['baseline_preserveFromCleanup'],
          sections: [],
          parsedRecords: [],
        } as CanonicalBaselineReadModel;

        for (const row of baselineRows) {
          const sectionId = row['sections_id'];
          if (sectionId) {
            baseline.sections.push({
              id: row['sections_id'] as string,
              baselineId: row['sections_baselineId'] as string,
              sectionType: row['sections_sectionType'] as any,
              title: row['sections_title'] as string,
              content: row['sections_content'] as string,
              includePolicy: row['sections_includePolicy'] as any,
              order: row['sections_order'] as number,
              createdAt: row['sections_createdAt'] as any,
              updatedAt: row['sections_updatedAt'] as any,
            });
          }
          const parsedId = row['parsedRecords_id'];
          if (parsedId) {
            baseline.parsedRecords.push({
              id: row['parsedRecords_id'] as string,
              baselineId: row['parsedRecords_baselineId'] as string,
              sourceFileId: row['parsedRecords_sourceFileId'] as string,
              schemaVersion: row['parsedRecords_schemaVersion'] as string,
              sourceFormat: row['parsedRecords_sourceFormat'] as 'docx' | 'pdf',
              ingestedAt: row['parsedRecords_ingestedAt'] as any,
              parsedJson: row['parsedRecords_parsedJson'] as any,
              resumeV2Json: row['parsedRecords_resumeV2Json'] as any,
              flagsJson: row['parsedRecords_flagsJson'] as any,
              createdAt: row['parsedRecords_createdAt'] as any,
            });
          }
        }

        return baseline;
      })(),
    ]);

    const baselineVersionHash = baselineVersion?.hash ?? baselineVersion?.id ?? null;
    const jobFingerprint = this.computeJobFingerprint(job);
    const resumeInputsHash = this.computeResumeInputsHash({
      baselineVersionHash,
      jobFingerprint,
      assessmentInputsHash: assessment?.inputsHash ?? null,
    });
    const coverLetterInputsHash = this.computeCoverLetterInputsHash({
      baselineVersionHash,
      jobFingerprint,
    });

    if (shouldTraceArtifactIdentity) {
      // eslint-disable-next-line no-console
      console.log(
        `[ARTIFACT_READ] baselineVersionId=${input.baselineVersionId} jobId=${input.jobId} resumeInputsHash=${resumeInputsHash} coverInputsHash=${coverLetterInputsHash} analysisId=${input.analysisId ?? null}`,
      );
    }

    const record = await this.studioArtifactRepository.findOne({
      where: {
        userId: input.userId,
        baselineId: input.baselineId,
        jobId: input.jobId,
      },
    });
    const rawResumeResponseBody = normalizeRecord((record as any)?.resumeResponseBody);
    const rawResumePreview = normalizeRecord(rawResumeResponseBody?.preview);
    const rawResumePreviewResume = normalizeRecord(rawResumePreview?.resume);

    if (shouldLogIngest) {
      try {
        // eslint-disable-next-line no-console
        console.log('[RESUME_V2_INGEST][STUDIO_ARTIFACT_ROW_READ]', {
          userId: input.userId,
          baselineId: input.baselineId,
          jobId: input.jobId,
          baselineVersionId: input.baselineVersionId,
          analysisId: input.analysisId ?? null,
          expected: {
            resumeInputsHash,
            coverLetterInputsHash,
          },
          stored: record
            ? {
                artifactId: String((record as any)?.id ?? ''),
                resumeStatus: record.resumeStatus,
                resumeFailureCode: record.resumeFailureCode ?? null,
                resumeInputsHash: record.resumeInputsHash,
                resumeHasResponseBody: Boolean(record.resumeResponseBody),
                resumeContentLength: record.resumeContent?.length ?? 0,
                coverStatus: record.coverLetterStatus,
                coverFailureCode: record.coverLetterFailureCode ?? null,
                coverInputsHash: record.coverLetterInputsHash,
                coverHasResponseBody: Boolean(record.coverLetterResponseBody),
                coverContentLength: record.coverLetterContent?.length ?? 0,
              }
            : null,
        });
      } catch {
        // ignore
      }
    }

    if (process.env.DEBUG_STUDIO_ARTIFACTS_READSTATE === 'true') {
      // eslint-disable-next-line no-console
      console.log('[STUDIO_ARTIFACTS_READSTATE]', {
        userId: input.userId,
        baselineId: input.baselineId,
        jobId: input.jobId,
        baselineVersionId: input.baselineVersionId,
        analysisId: input.analysisId ?? null,
        found: {
          baselineVersion: Boolean(baselineVersion),
          job: Boolean(job),
          assessment: Boolean(assessment),
          baseline: Boolean(baseline),
          artifactRow: Boolean(record),
        },
        expected: {
          baselineVersionHash,
          jobFingerprint,
          resumeInputsHash,
          coverLetterInputsHash,
        },
        stored: record
          ? {
              resumeStatus: record.resumeStatus,
              coverLetterStatus: record.coverLetterStatus,
              resumeInputsHash: record.resumeInputsHash,
              coverLetterInputsHash: record.coverLetterInputsHash,
              resumeHasResponseBody: Boolean(record.resumeResponseBody),
              coverHasResponseBody: Boolean(record.coverLetterResponseBody),
              resumeContentLength: record.resumeContent?.length ?? 0,
              coverContentLength: record.coverLetterContent?.length ?? 0,
            }
          : null,
      });
    }

    const score = typeof assessment?.overallScore === 'number' ? assessment.overallScore : null;
    const structured = baseline?.sections?.length
      ? extractStructuredBaselineFromSections(baseline.sections as any)
      : null;
    const structuredBaselineExperienceCount = structured?.experience?.length ?? 0;
    const structuredBaselineMissingEvidenceReasons = structured?.missingEvidenceReasons ?? [];
    const structuredBaselineExtractedExperiencePreview = (structured?.experience ?? [])
      .slice(0, 6)
      .map((entry) => ({
        company: safeText((entry as any)?.company),
        roleTitle: safeText((entry as any)?.roleTitle),
        ...(safeText((entry as any)?.dates) ? { dates: safeText((entry as any)?.dates) } : {}),
        bulletCount: Array.isArray((entry as any)?.bullets) ? (entry as any).bullets.length : 0,
      }));
    const templateReadiness =
      structured && assessment ? evaluateBaselineTemplateReadiness(structured as any) : null;
    const validExperienceCount =
      templateReadiness && typeof (templateReadiness as any).stats?.validExperience === 'number'
        ? (templateReadiness as any).stats.validExperience
        : 0;
    const hasUsableExperience = validExperienceCount > 0;

    let persisted = (baseline?.parsedRecords?.[0] as any)?.resumeV2Json ?? null;
    if (!persisted || typeof persisted !== 'object') {
      try {
        const backfilled = await this.baselineResumeV2BackfillService.backfillLatestIfMissing({
          baselineId: String(baseline?.id ?? ''),
        });
        persisted = backfilled?.resumeV2Json ?? null;
      } catch (error) {
        const response =
          typeof (error as any)?.getResponse === 'function' ? (error as any).getResponse() : null;
        const code =
          (response as any)?.error?.code ??
          (response as any)?.code ??
          (error instanceof Error ? error.name : 'baseline_resume_v2_backfill_failed');
        const message =
          (response as any)?.error?.message ??
          (response as any)?.message ??
          (error instanceof Error ? error.message : String(error));
        errors.push({
          code: String(code || 'baseline_resume_v2_backfill_failed'),
          message: String(message || 'Baseline ResumeV2 backfill failed.'),
          details:
            response && typeof response === 'object'
              ? ((response as any)?.error?.details ?? (response as any)?.details ?? null)
              : null,
        });
        persisted = null;
      }
    }

    // Artifacts retrieval must never 422 due to readiness/template gating.
    // Baseline ResumeV2 is used only to enrich readiness with interpreted evidence; treat it as optional here.
    const resumeV2Diagnostics = (() => {
      try {
        if (!persisted || typeof persisted !== 'object') return null;
        const normalized = normalizeNormalizedResumeDocument(persisted as NormalizedResumeDocument);
        const validation = validateNormalizedResumeDocument(normalized);
        const experienceCount = Array.isArray((normalized as any)?.experience) ? (normalized as any).experience.length : 0;
        if (!validation.valid) {
          return {
            source: 'persisted_resume_v2',
            valid: false,
            experienceCount,
            reasons: validation.reasons,
          } as const;
        }
        if (experienceCount === 0) {
          return {
            source: 'persisted_resume_v2',
            valid: false,
            experienceCount: 0,
            reasons: ['usable_experience_empty'],
          } as const;
        }
        return {
          source: 'persisted_resume_v2',
          valid: true,
          experienceCount,
          plainText: buildResumePlainText(normalized),
        } as const;
      } catch {
        return null;
      }
    })();
    const baselineTextForInterpretation =
      resumeV2Diagnostics && (resumeV2Diagnostics as any).valid && typeof (resumeV2Diagnostics as any).plainText === 'string'
        ? String((resumeV2Diagnostics as any).plainText)
        : null;

    // Readiness/guidance synchronization rule:
    // If we can validate a non-empty ResumeV2 experience set now, suppress stale ResumeV2-ingestion failure banners
    // that may have been cached on previous artifacts or raised by earlier backfill attempts.
    const resumeV2UsableExperienceCount =
      resumeV2Diagnostics && (resumeV2Diagnostics as any).valid
        ? Number((resumeV2Diagnostics as any).experienceCount ?? 0)
        : 0;

    const resumeV2Readiness = {
      hasResumeV2: Boolean(persisted && typeof persisted === 'object'),
      usableExperienceCount: resumeV2UsableExperienceCount,
      source: resumeV2Diagnostics ? String((resumeV2Diagnostics as any).source ?? 'unknown') : 'missing',
      valid: resumeV2Diagnostics ? Boolean((resumeV2Diagnostics as any).valid) : false,
      reasons:
        resumeV2Diagnostics && !(resumeV2Diagnostics as any).valid && Array.isArray((resumeV2Diagnostics as any).reasons)
          ? ((resumeV2Diagnostics as any).reasons as any[]).map((r) => String(r ?? '')).filter(Boolean).slice(0, 8)
          : [],
    } as const;

    if (!resumeV2Readiness.hasResumeV2) {
      errors.push({
        code: 'baseline_resume_v2_missing',
        message: 'Baseline ResumeV2 missing. Re-run baseline processing to restore structured generation authority.',
        details: { usableExperienceCount: 0 },
      });
    } else if (!resumeV2Readiness.valid || resumeV2Readiness.usableExperienceCount <= 0) {
      errors.push({
        code: 'baseline_resume_v2_invalid',
        message: 'Baseline ResumeV2 invalid. Repair your baseline to restore structured generation authority.',
        details: { usableExperienceCount: 0, reasons: resumeV2Readiness.reasons },
      });
    }

    if (errors.length) {
      const seen = new Set<string>();
      const deduped = errors.filter((e) => {
        const key = String((e as any)?.code ?? '');
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      errors.splice(0, errors.length, ...deduped);
    }
    if (resumeV2UsableExperienceCount > 0 && errors.length) {
      const before = errors.length;
      const filtered = errors.filter((e) => !String((e as any)?.code ?? '').startsWith('baseline_resume_v2_'));
      errors.splice(0, errors.length, ...filtered);
      if (process.env.DOCGEN_DIAGNOSTICS === 'true') {
        try {
          // eslint-disable-next-line no-console
          console.log('[RESUME_V2_INGEST][STUDIO_READSTATE_SYNC]', {
            baselineId: String(baseline?.id ?? ''),
            usableExperienceCount: resumeV2UsableExperienceCount,
            errorsSuppressed: before - errors.length,
          });
        } catch {
          // ignore
        }
      }
    }

    const emptyInterpretedEvidenceSummary: InterpretedEvidenceSummary = {
      strongEvidenceCount: 0,
      partialEvidenceCount: 0,
      weakEvidenceCount: 0,
      unusableEvidenceCount: 0,
    };

    const interpretedEvidence = baselineTextForInterpretation
      ? interpretEvidenceFromResumeText({
          baselineId: String(baseline?.id ?? ''),
          baselineVersionId: String(baselineVersion?.id ?? ''),
          resumeText: baselineTextForInterpretation,
        })
      : {
          summary: emptyInterpretedEvidenceSummary,
          omittedInterpretedEvidence: [],
          evidenceDetailsMap: {},
        };
    const interpretedMeaningfulEvidenceCount =
      (interpretedEvidence.summary.strongEvidenceCount ?? 0) + (interpretedEvidence.summary.partialEvidenceCount ?? 0);
    const hasInterpretedMeaningfulEvidence = interpretedMeaningfulEvidenceCount > 0;

    const interpretedEvidenceReadiness = resolveEvidenceReadinessFromSummary(interpretedEvidence.summary);

    const isHardBlocked =
      Boolean(templateReadiness) &&
      (!templateReadiness!.canGenerateResume || !templateReadiness!.canGenerateCoverLetter);
    const hasWarnings = Boolean(templateReadiness?.warnings?.length);

    const artifactReadiness =
      templateReadiness && !isHardBlocked && !hasWarnings && hasUsableExperience
        ? 'ready'
        : templateReadiness && !isHardBlocked && hasWarnings
          ? 'degraded'
          : templateReadiness && isHardBlocked
            ? hasUsableExperience || hasInterpretedMeaningfulEvidence
              ? 'degraded'
              : 'blocked'
            : templateReadiness && !hasUsableExperience && hasInterpretedMeaningfulEvidence
              ? interpretedEvidenceReadiness === 'ready'
                ? 'ready'
                : 'degraded'
              : undefined;

    const readinessReasonCodes =
      artifactReadiness === 'blocked'
        ? templateReadiness?.hardBlockReasons?.map((reason) => reason.code).filter(Boolean) ?? []
        : artifactReadiness === 'degraded'
          ? templateReadiness?.warnings?.map((reason) => reason.code).filter(Boolean) ?? []
          : [];

    const artifactReadinessReasons =
      artifactReadiness === 'blocked' || artifactReadiness === 'degraded'
        ? [
            ...readinessReasonCodes,
            ...(structured?.missingEvidenceReasons?.slice(0, 6) ?? []),
            ...((templateReadiness as any)?.evidence?.improvementSuggestions ?? []),
          ].slice(0, 8)
        : [];

    const rawReadinessReasonDetails: BaselineTemplateReadinessReason[] =
      artifactReadiness === 'blocked'
        ? templateReadiness?.hardBlockReasons ?? []
        : artifactReadiness === 'degraded'
          ? // If we degraded specifically because interpreted evidence is meaningful while structured experience is missing,
            // preserve the baseline_template_not_ready context from hardBlockReasons (warnings will be empty in this lane).
            isHardBlocked && !hasUsableExperience && hasInterpretedMeaningfulEvidence
            ? templateReadiness?.hardBlockReasons ?? []
            : templateReadiness?.warnings ?? []
          : [];

    const artifactReadinessReasonDetails: BaselineTemplateReadinessReason[] = rawReadinessReasonDetails.map((reason) => ({
      ...reason,
      details: {
        ...((reason as any)?.details ?? {}),
        validExperience: validExperienceCount,
        stats: {
          ...(((reason as any)?.details as any)?.stats ?? {}),
          validExperience: validExperienceCount,
        },
        interpretedEvidenceSummary: interpretedEvidence.summary,
      },
    }));

    // NOTE: Intentionally no logging here; this endpoint is high-volume and verbose logs can
    // overwhelm production logging (Railway rate limits).

    const resumeRecordRaw = this.buildArtifactRecord(record, 'resume', resumeInputsHash);
    const coverRecordRaw = this.buildArtifactRecord(record, 'cover_letter', coverLetterInputsHash);
    const resumeRecoveryBlocked =
      Boolean(record) &&
      (record?.resumeStatus === StudioArtifactLifecycleStatus.FAILED ||
        record?.resumeStatus === StudioArtifactLifecycleStatus.MISSING) &&
      (!resumeRecordRaw || !resumeRecordRaw.usableCurrent || !resumeRecordRaw.responseBody);
    const coverRecoveryBlocked =
      !coverRecordRaw || !coverRecordRaw.usableCurrent || !coverRecordRaw.responseBody;

    const isStructuredTemplateResult = (responseBody: Record<string, unknown> | null): boolean => {
      if (!responseBody) return false;
      const internal = normalizeRecord(responseBody.internal);
      return (
        safeText(internal?.generationMode) === 'structured_baseline_template' &&
        safeText(internal?.templateVersion) === 'structured-baseline-v1'
      );
    };

    const exactLegacyResumeFailure =
      record?.resumeStatus === StudioArtifactLifecycleStatus.FAILED &&
      String(record?.resumeFailureMessage ?? '') === 'column Baseline.verifiedBaseline does not exist';
    const shouldRecoverEligibleArtifacts =
      !input.recoveryAttempted &&
      typeof score === 'number' &&
      score >= 80 &&
      exactLegacyResumeFailure &&
      (resumeRecoveryBlocked || coverRecoveryBlocked);
    if (shouldRecoverEligibleArtifacts) {
      const generationRequest = {
        baselineId: input.baselineId,
        baselineVersionId: input.baselineVersionId,
        jobId: input.jobId,
        analysisId: input.analysisId ?? null,
        oneTap: true,
        forceRegenerate: true,
      } as any;
      await Promise.all([
        this.resumeService.generateResume(input.userId, generationRequest),
        this.coverLettersService.generateCoverLetter(input.userId, generationRequest),
      ]);
      return this.readState({ ...input, recoveryAttempted: true });
    }

    // Never drop persisted artifacts from readState; currentness/staleness must be indicated via metadata flags.
    const shouldMarkLegacyStale =
      Boolean(artifactReadiness) && typeof score === 'number' && score >= 80;

    const resumeRecord = 
      shouldMarkLegacyStale && resumeRecordRaw && !isStructuredTemplateResult(resumeRecordRaw.responseBody)
        ? { ...resumeRecordRaw, metadata: { ...(resumeRecordRaw.metadata ?? {}), staleLegacy: true } }
        : resumeRecordRaw;
    const coverRecord =
      shouldMarkLegacyStale && coverRecordRaw && !isStructuredTemplateResult(coverRecordRaw.responseBody)
        ? { ...coverRecordRaw, metadata: { ...(coverRecordRaw.metadata ?? {}), staleLegacy: true } }
        : coverRecordRaw;

    // Prompt 15: Fail-closed retrieval/hydration. Never surface stale legacy/minimal artifacts as the active preview
    // when the authoritative current generation state is blocked/failed/not-exportable.
    const authoritativeArtifactId = record ? String((record as any)?.id ?? '') : null;
    const rejectedArtifactIds: string[] = [];
    const staleArtifactReasonCodes: string[] = [];
    let resumeHydrationDebug: Record<string, unknown> | null = null;
    const debugTargetArtifactId = 'c3696092-8b36-468e-b0f7-54e19e666ea4';
    const shouldEmitResumeHydrationDebug = String(authoritativeArtifactId ?? '') === debugTargetArtifactId;

    const resumeRenderablePreviewModel = (() => {
      if (!resumeRecord) return null;
      const previewResume = normalizeRecord((resumeRecord.responseBody as any)?.preview?.resume ?? null);
      return previewResume;
    })();

    const resumeRecoverablePreviewModel = (() => {
      if (!resumeRecord) return null;
      return extractCanonicalResumePreviewModel(resumeRecord.responseBody);
    })();

    const resumePreviewRenderable = Boolean(resumeRenderablePreviewModel);

    const resumeExportEligible = (() => {
      if (!resumeRecord) return false;
      // Prompt 18: minimal artifacts must be rejected deterministically (not reported as inputs mismatch).
      const minimalDetection = detectMinimalResumeArtifact(resumeRecord.responseBody);
      if (minimalDetection.minimal) {
        staleArtifactReasonCodes.push('minimal_artifact_rejected');
        staleArtifactReasonCodes.push(...minimalDetection.reasons.map((r) => `minimal:${r}`));
        return false;
      }
      if (!resumeRecord.inputsHashMatches) {
        staleArtifactReasonCodes.push('inputs_hash_mismatch');
        return false;
      }
      if (!resumeRecord.artifactCurrent) {
        staleArtifactReasonCodes.push('not_current');
        return false;
      }
      if (resumeRecord.status !== StudioArtifactLifecycleStatus.COMPLETED) {
        staleArtifactReasonCodes.push('not_completed');
        return false;
      }
      const internal = normalizeRecord((resumeRecord.responseBody as any)?.internal);
      const staleLegacy =
        isTrue(((resumeRecord ? resumeRecord.metadata : null) as any)?.staleLegacy) || isTrue(internal?.staleLegacy);
      if (staleLegacy) {
        staleArtifactReasonCodes.push('stale_legacy');
        return false;
      }
      // Export eligibility additionally requires a renderable preview.
      if (!resumePreviewRenderable) {
        staleArtifactReasonCodes.push('preview_missing');
        return false;
      }
      return true;
    })();

    const resumeInternal = resumeRecord ? normalizeRecord((resumeRecord.responseBody as any)?.internal) : null;
    const resumeIsStaleLegacy =
      Boolean(resumeRecord) &&
      (isTrue(((resumeRecord ? resumeRecord.metadata : null) as any)?.staleLegacy) || isTrue(resumeInternal?.staleLegacy));
    const resumeIsMinimal = Boolean(resumeRecord) && detectMinimalResumeArtifact(resumeRecord?.responseBody ?? null).minimal;
    const resumeHasRecoverablePayload = (() => {
      if (!resumeRecord) return false;
      const responseBodyPresent = Boolean(resumeRecord.responseBody && Object.keys(resumeRecord.responseBody).length > 0);
      const contentPresent = Boolean(String(resumeRecord.content ?? '').trim());
      return responseBodyPresent || contentPresent;
    })();

    const debugResumeRecordResponseBody = normalizeRecord((resumeRecordRaw as any)?.responseBody);
    const debugResumeRecordPreview = normalizeRecord(debugResumeRecordResponseBody?.preview);
    const debugResumeRecordPreviewResume = normalizeRecord(debugResumeRecordPreview?.resume);

	    // Hydration contract:
	    // - Never mutate persisted artifact fields.
	    // - Do not surface stale legacy artifacts as the active preview payload (Prompt 15) => null responseBody/content.
	    // - Minimal artifacts keep `responseBody` for audit/diagnostics, but must not surface preview (Prompt 18).
    const resumeRecordForResult = (() => {
      if (!resumeRecord) return resumeRecord;
      // Never erase a renderable preview payload before canonical shaping.
      // Export eligibility is enforced at the resumeResult layer below.
      const emitResumeHydrationDebug = (branchTaken: string, responseBodyPresent: boolean, previewResumePresent: boolean) => {
        if (!shouldEmitResumeHydrationDebug) return;
        resumeHydrationDebug = {
          loadedRecordId: String((resumeRecord as any)?.artifactId ?? ''),
          loadedResumeStatus: String((resumeRecord as any)?.status ?? ''),
          loadedResumeContentLength: String((resumeRecord as any)?.content ?? '').length,
          loadedResumeResponseBodyPresent: Boolean((resumeRecord as any)?.responseBody),
          loadedResumePreviewPresent: Boolean((resumeRecord as any)?.responseBody?.preview),
          loadedResumePreviewResumePresent: Boolean((resumeRecord as any)?.responseBody?.preview?.resume),
          rawRowHasResumeResponseBody: Boolean(rawResumeResponseBody),
          rawRowHasResumeContent: Boolean(String((record as any)?.resumeContent ?? '').trim()),
          rawRowResumeResponseBodyTopLevelKeys: safeObjectKeys(rawResumeResponseBody).slice(0, 24),
          rawRowResumePreviewKeys: safeObjectKeys(rawResumePreview).slice(0, 24),
          rawRowHasPreviewResume: Boolean(rawResumePreviewResume),
          buildArtifactRecordHasResponseBody: Boolean((resumeRecordRaw as any)?.responseBody),
          buildArtifactRecordHasContent: Boolean(String((resumeRecordRaw as any)?.content ?? '').trim()),
          buildArtifactRecordPreviewKeys: safeObjectKeys(normalizeRecord((resumeRecordRaw as any)?.responseBody?.preview)).slice(0, 24),
          buildArtifactRecordHasPreviewResume: Boolean((resumeRecordRaw as any)?.responseBody?.preview?.resume),
          resumePreviewRenderable,
          resumeIsMinimal,
          resumeIsStaleLegacy,
          resumeRecordForResultBranchTaken: branchTaken,
          resumeRecordForResultResponseBodyPresent: responseBodyPresent,
          resumeRecordForResultPreviewResumePresent: previewResumePresent,
          resumeRecordForResultHasResponseBody: responseBodyPresent,
          resumeRecordForResultHasContent: false,
          resumeRecordForResultPreviewKeys: [],
          resumeRecordForResultHasPreviewResume: false,
          canonicalResumeResultPreviewPresent: false,
        };
      };
      if (!resumePreviewRenderable && !resumeHasRecoverablePayload) {
        emitResumeHydrationDebug('nulled_non_renderable', false, false);
        return { ...resumeRecord, responseBody: null, content: null };
      }
      if (!resumeIsMinimal && resumeHasRecoverablePayload) {
        const responseBody = normalizeRecord(resumeRecord.responseBody);
        const canonicalPreviewResume = resumeRecoverablePreviewModel;
        const canonicalResponseBody =
          responseBody && canonicalPreviewResume
            ? {
                ...responseBody,
                preview: {
                  ...(normalizeRecord((responseBody as any).preview) ?? {}),
                  resume: canonicalPreviewResume,
                },
              }
            : responseBody;
        emitResumeHydrationDebug(
          'preserved_recoverable',
          Boolean(canonicalResponseBody),
          Boolean(canonicalPreviewResume),
        );
        return {
          ...resumeRecord,
          responseBody: canonicalResponseBody,
          content: resumeRecord.content,
        };
      }
      if (resumeIsMinimal) {
        emitResumeHydrationDebug('nulled_minimal', Boolean((resumeRecord as any)?.responseBody), Boolean((resumeRecord as any)?.responseBody?.preview?.resume));
        return { ...resumeRecord, responseBody: null, content: null };
      }
      if (resumeIsStaleLegacy && !resumeIsMinimal) {
        emitResumeHydrationDebug('nulled_stale_legacy', Boolean((resumeRecord as any)?.responseBody), Boolean((resumeRecord as any)?.responseBody?.preview?.resume));
        return { ...resumeRecord, responseBody: null, content: null };
      }
      emitResumeHydrationDebug(
        resumeExportEligible ? 'preserved_renderable' : 'preserved_recoverable',
        Boolean((resumeRecord as any)?.responseBody),
        Boolean((resumeRecord as any)?.responseBody?.preview?.resume),
      );
      return resumeRecord;
    })();
    if (resumeHydrationDebug) {
      const resumeHydrationDebugObject =
        typeof resumeHydrationDebug === 'object' &&
        resumeHydrationDebug !== null &&
        !Array.isArray(resumeHydrationDebug)
          ? (resumeHydrationDebug as Record<string, unknown>)
          : null;
      if (resumeHydrationDebugObject) {
        resumeHydrationDebug = {
          ...resumeHydrationDebugObject,
          canonicalResumeResultPreviewPresent: false,
        };
      }
    } else if (shouldEmitResumeHydrationDebug) {
      resumeHydrationDebug = {
        loadedRecordId: String((resumeRecord as any)?.artifactId ?? ''),
        loadedResumeStatus: String((resumeRecord as any)?.status ?? ''),
        loadedResumeContentLength: String((resumeRecord as any)?.content ?? '').length,
        loadedResumeResponseBodyPresent: Boolean((resumeRecord as any)?.responseBody),
        loadedResumePreviewPresent: Boolean((resumeRecord as any)?.responseBody?.preview),
        loadedResumePreviewResumePresent: Boolean((resumeRecord as any)?.responseBody?.preview?.resume),
        rawRowHasResumeResponseBody: Boolean(rawResumeResponseBody),
        rawRowHasResumeContent: Boolean(String((record as any)?.resumeContent ?? '').trim()),
        rawRowResumeResponseBodyTopLevelKeys: safeObjectKeys(rawResumeResponseBody).slice(0, 24),
        rawRowResumePreviewKeys: safeObjectKeys(rawResumePreview).slice(0, 24),
        rawRowHasPreviewResume: Boolean(rawResumePreviewResume),
        buildArtifactRecordHasResponseBody: Boolean((resumeRecordRaw as any)?.responseBody),
        buildArtifactRecordHasContent: Boolean(String((resumeRecordRaw as any)?.content ?? '').trim()),
        buildArtifactRecordPreviewKeys: safeObjectKeys(normalizeRecord((resumeRecordRaw as any)?.responseBody?.preview)).slice(0, 24),
        buildArtifactRecordHasPreviewResume: Boolean((resumeRecordRaw as any)?.responseBody?.preview?.resume),
        resumePreviewRenderable,
        resumeIsMinimal,
        resumeIsStaleLegacy,
        resumeRecordForResultBranchTaken: 'no_resume_record',
        resumeRecordForResultResponseBodyPresent: false,
        resumeRecordForResultHasResponseBody: false,
        resumeRecordForResultHasContent: false,
        resumeRecordForResultPreviewKeys: [],
        resumeRecordForResultPreviewResumePresent: false,
        resumeRecordForResultHasPreviewResume: false,
        canonicalResumeResultPreviewPresent: false,
      };
    }
    if (resumeRecord && !resumeExportEligible) {
      rejectedArtifactIds.push(authoritativeArtifactId ?? 'unknown');
    }

    if (process.env.DEBUG_STUDIO_ARTIFACT_QUALITY === 'true') {
      try {
        const resumeGate = (resumeRecord?.responseBody as any)?.qualityGate;
        const resumeStatus =
          resumeGate && typeof resumeGate === 'object' ? String((resumeGate as any).status ?? '') : '';
        const resumeReasons =
          resumeGate && typeof resumeGate === 'object' && Array.isArray((resumeGate as any).reasons)
            ? (resumeGate as any).reasons.map((r: unknown) => String(r ?? '')).slice(0, 8)
            : [];
        const coverGate = (coverRecord?.responseBody as any)?.qualityGate;
        const coverStatus =
          coverGate && typeof coverGate === 'object' ? String((coverGate as any).status ?? '') : '';
        const coverReasons =
          coverGate && typeof coverGate === 'object' && Array.isArray((coverGate as any).reasons)
            ? (coverGate as any).reasons.map((r: unknown) => String(r ?? '')).slice(0, 8)
            : [];
        // eslint-disable-next-line no-console
        console.log(
          '[ARTIFACT_QUALITY_READ_RESULT]',
          `resumeStatus=${resumeStatus || 'missing'} resumeReasons=${resumeReasons.join(',')} coverStatus=${coverStatus || 'missing'} coverReasons=${coverReasons.join(',')}`,
        );
      } catch {
        // ignore debug logging failures
      }
    }

    const resumeResultRaw = this.buildCanonicalResultFromRecord('resume', resumeRecordForResult);
    const coverLetterResult = this.buildCanonicalResultFromRecord('cover_letter', coverRecord);

    if (resumeHydrationDebug) {
      const resumeHydrationDebugObject =
        typeof resumeHydrationDebug === 'object' &&
        resumeHydrationDebug !== null &&
        !Array.isArray(resumeHydrationDebug)
          ? (resumeHydrationDebug as Record<string, unknown>)
          : null;
      if (resumeHydrationDebugObject) {
        resumeHydrationDebug = {
          ...resumeHydrationDebugObject,
          canonicalResumeResultPreviewPresent: Boolean((resumeResultRaw as any)?.preview),
        };
      }
    }

    // Note: we intentionally avoid mutating persisted artifact fields (failure codes, response bodies, etc.)
    // during readState. Any guidance suppression must be handled via non-authoritative `errors` shaping only.

    // Projection-only suppression: if current persisted ResumeV2 is valid and non-empty, do not surface
    // legacy ResumeV2 ingestion failure guidance as current blockers in the returned state.
    const shouldSuppressResumeV2Guidance = resumeV2UsableExperienceCount > 0;
    const resumeResultBase =
      shouldSuppressResumeV2Guidance && resumeResultRaw && Array.isArray((resumeResultRaw as any).correctionReasons)
        ? {
            ...(resumeResultRaw as any),
            correctionReasons: (resumeResultRaw as any).correctionReasons.filter(
              (r: any) => !String(r?.code ?? '').startsWith('baseline_resume_v2_'),
            ),
          }
        : resumeResultRaw;

    const resumeResult =
      resumeResultBase && !resumeExportEligible
        ? {
            ...(resumeResultBase as any),
            // Preserve renderable preview for display, but never allow export when ineligible.
            ...(resumePreviewRenderable ? { generationState: 'generated_needs_correction' } : {}),
            exportReady: false,
            exports: { docx: false, pdf: false },
          }
        : resumeResultBase;
    const resumeFailureDiagnostics = (() => {
      const metadata = normalizeRecord(
        (resumeRecord as any)?.resumeMetadata ??
          (resumeRecord as any)?.metadata ??
          (record as any)?.resumeMetadata ??
          (record as any)?.metadata ??
          null,
      );
      const diagnostics = normalizeRecord(metadata?.resumeArtifactInvalidDiagnostics);
      return diagnostics && Object.keys(diagnostics).length > 0 ? diagnostics : null;
    })();

    if (shouldLogIngest) {
      try {
        const correctionReasonCodes = Array.isArray((resumeResult as any)?.correctionReasons)
          ? (resumeResult as any).correctionReasons
              .map((r: any) => String(r?.code ?? ''))
              .filter(Boolean)
              .slice(0, 12)
          : [];
        // eslint-disable-next-line no-console
        console.log('[RESUME_V2_INGEST][STUDIO_READSTATE_DECISION]', {
          artifactId: String((record as any)?.id ?? ''),
          resumeGenerationState: (resumeResult as any)?.generationState ?? null,
          resumeFailureCode: (record as any)?.resumeFailureCode ?? null,
          correctionReasonCodes,
          shouldTreatAsRegeneratableFailure: Boolean(
            String((record as any)?.resumeFailureCode ?? '').includes('baseline_resume_v2_') ||
              correctionReasonCodes.includes('baseline_resume_v2_ingestion_failed'),
          ),
          inputsHashMatches: Boolean(record && record.resumeInputsHash === resumeInputsHash),
        });
      } catch {
        // ignore
      }
    }

    const canonicalReadiness = resolveDocumentReadinessState({
      resumeArtifact: resumeResult as any,
      coverLetterArtifact: coverLetterResult as any,
      critiqueResult: null,
      qualityGate: null,
      exportReady: null,
      generationState: null,
    });

    if (process.env.DOCGEN_DIAGNOSTICS === 'true') {
      try {
        // eslint-disable-next-line no-console
        console.log('[DOCGEN][canonical_readiness_state]', {
          canonicalReadinessState: canonicalReadiness.state,
          readinessInputs: {
            resumeGenerationState: (resumeResult as any)?.generationState ?? null,
            resumeExportReady: (resumeResult as any)?.exportReady ?? null,
            resumeQualityGate: (resumeRecord?.responseBody as any)?.qualityGate ?? null,
            resumeCorrectionReasons: (resumeResult as any)?.correctionReasons ?? [],
            coverGenerationState: (coverLetterResult as any)?.generationState ?? null,
            coverExportReady: (coverLetterResult as any)?.exportReady ?? null,
            coverQualityGate: (coverRecord?.responseBody as any)?.qualityGate ?? null,
            coverCorrectionReasons: (coverLetterResult as any)?.correctionReasons ?? [],
          },
          overridden: canonicalReadiness.impossibleStatePrevented,
          impossibleStatePrevented: canonicalReadiness.impossibleStatePrevented,
        });
      } catch {
        // ignore
      }
    }

    if (resumeResult?.correctionReasons?.length) {
      try {
        const gate = (resumeRecord?.responseBody as any)?.qualityGate as any;
        const gateStatus = gate && typeof gate === 'object' ? String(gate.status ?? '') : null;
        const qualityGateReasonCodes =
          gate && typeof gate === 'object' && Array.isArray(gate.reasons)
            ? gate.reasons.map((r: unknown) => String(r ?? '')).filter(Boolean).slice(0, 8)
            : [];
        const correctionReasonCodes = Array.isArray(resumeResult.correctionReasons)
          ? resumeResult.correctionReasons
              .map((r) => String((r as any)?.code ?? ''))
              .filter(Boolean)
              .slice(0, 8)
          : [];
        const createdAt =
          (record as any)?.createdAt && typeof (record as any).createdAt.toISOString === 'function'
            ? (record as any).createdAt.toISOString()
            : null;
        const updatedAt =
          (record as any)?.updatedAt && typeof (record as any).updatedAt.toISOString === 'function'
            ? (record as any).updatedAt.toISOString()
            : null;
        const payload = {
          artifactId: String((record as any)?.id ?? ''),
          runId: (resumeRecord?.metadata as any)?.auditId ?? null,
          auditId: (resumeRecord?.metadata as any)?.auditId ?? null,
          qualityStatus: resumeResult.qualityStatus ?? null,
          resumeStatus: resumeRecord?.status ?? null,
          correctionReasonCodes,
          qualityGateStatus: gateStatus,
          qualityGateReasonCodes,
          createdAt,
          updatedAt,
        };
        // eslint-disable-next-line no-console
        console.log('[STUDIO_ARTIFACT_REASONS_TRACE]', JSON.stringify(payload));
      } catch {
        // ignore logging failures
      }
    }

    return {
      status: this.resolvePairStatus(record, resumeInputsHash, coverLetterInputsHash),
      baselineId: input.baselineId,
      jobId: input.jobId,
      baselineVersionId: baselineVersion?.id ?? input.baselineVersionId,
      baselineVersionHash,
      jobFingerprint,
      generationContractVersion: ARTIFACT_CONTRACT_VERSION,
      ...(errors.length ? { errors } : {}),
      diagnostics: {
        resumeV2Readiness,
        ...(
          resumeHydrationDebug &&
          typeof resumeHydrationDebug === 'object' &&
          !Array.isArray(resumeHydrationDebug)
            ? { resumeHydration: resumeHydrationDebug }
            : {}
        ),
        ...(process.env.DOCGEN_DIAGNOSTICS === 'true'
          ? {
              staleArtifactRejected: Boolean(rejectedArtifactIds.length),
              staleArtifactReasonCodes: [...new Set(staleArtifactReasonCodes)].slice(0, 12),
              hydrationSource: resumeExportEligible ? 'authoritative_current_artifact' : 'blocked',
              authoritativeArtifactId,
              rejectedArtifactIds: rejectedArtifactIds.slice(0, 8),
              retrievalDecisionPath: resumeExportEligible ? 'use_current_completed' : 'reject_preview_fail_closed',
              hydrationRejected: Boolean(resumeRecord && !resumeExportEligible),
              rejectedMinimalArtifact: Boolean(staleArtifactReasonCodes.some((c) => c === 'minimal_artifact_rejected' || String(c).startsWith('minimal:'))),
              rejectedMinimalArtifactReason: staleArtifactReasonCodes.find((c) => String(c).startsWith('minimal:')) ?? null,
            }
          : {}),
      },
      assessmentScore: score,
      structuredBaselineExperienceCount,
      structuredBaselineMissingEvidenceReasons,
      structuredBaselineExtractedExperiencePreview,
      ...(artifactReadiness
        ? { artifactReadiness, artifactReadinessReasons, artifactReadinessReasonDetails }
        : {}),
      resume: resumeRecordForResult,
      coverLetter: coverRecord,
      resumeResult,
      coverLetterResult,
      ...(resumeFailureDiagnostics ? { resumeFailureDiagnostics } : {}),
    };
  }

  private buildCanonicalResultFromRecord(
    artifact: StudioArtifactKind,
    record: StudioArtifactRecord | null,
  ): ArtifactGenerationResult<unknown> {
    const artifactType = artifact === 'resume' ? 'resume' : 'cover_letter';
    const baseActions = {
      canEdit: artifact === 'resume',
      canRegenerate: true,
      canExport: false,
      canSaveToOpportunities: false,
    };

    if (!record) {
      return {
        artifactType,
        generationState: 'not_started',
        qualityStatus: 'needs_refinement',
        preview: null,
        correctionReasons: [],
        exportReady: false,
        exports: { docx: false, pdf: false },
        actions: baseActions,
      };
    }

    if (record.status === StudioArtifactLifecycleStatus.IN_PROGRESS) {
      return {
        artifactType,
        generationState: 'generating',
        qualityStatus: 'needs_refinement',
        preview: null,
        correctionReasons: [],
        exportReady: false,
        exports: { docx: false, pdf: false },
        actions: baseActions,
      };
    }

    const responseBody = record.responseBody;
    const preview = responseBody && typeof responseBody.preview === 'object'
      ? (responseBody.preview as Record<string, unknown>)
      : null;
    const previewModel =
      artifact === 'resume'
        ? preview?.resume ?? null
        : preview?.coverLetter ?? null;
    const qualityGate =
      responseBody && typeof responseBody.qualityGate === 'object'
        ? (responseBody.qualityGate as Record<string, unknown>)
        : null;
    const qualityStatusRaw = qualityGate?.status;
    const qualityStatus =
      qualityStatusRaw === 'pass'
        ? 'pass'
        : qualityStatusRaw === 'needs_refinement'
          ? 'needs_refinement'
          : qualityStatusRaw === 'blocked'
            ? 'blocked'
            : artifact === 'resume' && Boolean(previewModel)
              ? 'needs_refinement'
              : 'failed';

    const correctionReasons: ArtifactCorrectionReason[] = Array.isArray(qualityGate?.reasons)
      ? (qualityGate?.reasons as unknown[])
          .map((reason) => String(reason ?? '').trim())
          .filter(Boolean)
          .slice(0, 8)
          .filter((value, index, all) => all.indexOf(value) === index)
          .map((code) => ({
            code,
            message: code,
            severity: 'warning' as const,
          }))
      : [];

    const exportReadyRaw =
      responseBody && typeof responseBody.exportReady === 'boolean' ? responseBody.exportReady : false;
    const exportReady = Boolean(exportReadyRaw) && qualityStatus === 'pass';
    const exportsRaw =
      responseBody && typeof responseBody.exports === 'object' ? (responseBody.exports as Record<string, unknown>) : null;
    const exports = exportReady
      ? {
          docx: Boolean(exportsRaw && exportsRaw.docx),
          pdf: Boolean(exportsRaw && exportsRaw.pdf),
        }
      : { docx: false, pdf: false };

    const generationState =
      qualityStatus === 'pass' && previewModel
        ? 'generated_usable'
        : previewModel
          ? 'generated_needs_correction'
          : 'generated_unusable';

    return {
      artifactType,
      generationState,
      qualityStatus,
      preview: previewModel ?? null,
      correctionReasons:
        qualityStatus === 'pass'
          ? []
          : correctionReasons.length
            ? correctionReasons
            : [{ code: 'needs_correction', message: 'Needs correction.', severity: 'warning' }],
      exportReady,
      exports,
      actions: {
        ...baseActions,
        canExport: exportReady,
        canSaveToOpportunities: exportReady,
      },
    };
  }

  async recordResumeInProgress(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
    inputsHash: string;
    metadata?: Record<string, unknown>;
    analysisId?: string | null;
  }): Promise<string> {
    if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
      try {
        // eslint-disable-next-line no-console
        console.log('[RESUME_V2_INGEST][RESUME_RECORD_IN_PROGRESS]', {
          baselineId: input.baselineId,
          jobId: input.jobId,
          baselineVersionId: input.baselineVersionId,
          inputsHash: input.inputsHash,
          analysisId: input.analysisId ?? null,
        });
      } catch {
        // ignore
      }
    }
    return this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
      baselineVersionId: input.baselineVersionId,
      baselineVersionHash: input.baselineVersionHash,
      jobFingerprint: input.jobFingerprint,
      generationContractVersion: ARTIFACT_CONTRACT_VERSION,
      resumeStatus: StudioArtifactLifecycleStatus.IN_PROGRESS,
      resumeInputsHash: input.inputsHash,
      resumeGenerationStartedAt: new Date(),
      resumeMetadata: buildArtifactWriteMetadata(input.metadata, input.analysisId) as any,
      resumeFailureCode: null,
      resumeFailureMessage: null,
    }, 'resume');
  }

  async recordResumeSuccess(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
    inputsHash: string;
    responseBody: Record<string, unknown>;
    content: string | null;
    metadata?: Record<string, unknown>;
    analysisId?: string | null;
  }): Promise<string> {
    const filteredResponseBody = sanitizeResumeResponseBodyForEvidenceContract(input.responseBody);
    this.assertCurrentArtifactEvidenceContract('resume', filteredResponseBody);
    if (shouldTraceArtifactIdentity) {
      // eslint-disable-next-line no-console
      console.log(
        `[ARTIFACT_WRITE] type=resume baselineVersionId=${input.baselineVersionId} jobId=${input.jobId} inputsHash=${input.inputsHash} analysisId=${input.analysisId ?? null}`,
      );
    }
    if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
      try {
        // eslint-disable-next-line no-console
        console.log('[RESUME_V2_INGEST][RESUME_RECORD_SUCCESS]', {
          baselineId: input.baselineId,
          jobId: input.jobId,
          baselineVersionId: input.baselineVersionId,
          inputsHash: input.inputsHash,
          analysisId: input.analysisId ?? null,
        });
      } catch {
        // ignore
      }
    }
    if (process.env.DEBUG_STUDIO_ARTIFACT_QUALITY === 'true') {
      const gate = (input.responseBody as any)?.qualityGate;
      const status = gate && typeof gate === 'object' ? String((gate as any).status ?? '') : '';
      const reasons = gate && typeof gate === 'object' && Array.isArray((gate as any).reasons)
        ? (gate as any).reasons.map((r: unknown) => String(r ?? '')).slice(0, 8)
        : [];
      // eslint-disable-next-line no-console
      console.log('[ARTIFACT_QUALITY_WRITE]', `type=resume status=${status || 'missing'} reasons=${reasons.join(',')}`);
    }
    return this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
      baselineVersionId: input.baselineVersionId,
      baselineVersionHash: input.baselineVersionHash,
      jobFingerprint: input.jobFingerprint,
      generationContractVersion: ARTIFACT_CONTRACT_VERSION,
      resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
      resumeInputsHash: input.inputsHash,
      resumeResponseBody: filteredResponseBody as any,
      resumeContent: input.content,
      resumeGeneratedAt: new Date(),
      resumeGenerationStartedAt: null,
      resumeFailedAt: null,
      resumeFailureCode: null,
      resumeFailureMessage: null,
      resumeMetadata: buildArtifactWriteMetadata(input.metadata, input.analysisId) as any,
    }, 'resume');
  }

  async recordResumeFailure(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
    inputsHash: string;
    failureCode: string;
    failureMessage: string;
    metadata?: Record<string, unknown>;
    analysisId?: string | null;
  }): Promise<string> {
    if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
      try {
        // eslint-disable-next-line no-console
        console.warn('[RESUME_V2_INGEST][RESUME_RECORD_FAILURE]', {
          baselineId: input.baselineId,
          jobId: input.jobId,
          baselineVersionId: input.baselineVersionId,
          inputsHash: input.inputsHash,
          analysisId: input.analysisId ?? null,
          failureCode: input.failureCode,
        });
      } catch {
        // ignore
      }
    }
    return this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
      baselineVersionId: input.baselineVersionId,
      baselineVersionHash: input.baselineVersionHash,
      jobFingerprint: input.jobFingerprint,
      generationContractVersion: ARTIFACT_CONTRACT_VERSION,
      resumeStatus: StudioArtifactLifecycleStatus.FAILED,
      resumeInputsHash: input.inputsHash,
      resumeFailedAt: new Date(),
      resumeGenerationStartedAt: null,
      resumeFailureCode: input.failureCode,
      resumeFailureMessage: input.failureMessage,
      resumeMetadata: buildArtifactWriteMetadata(input.metadata, input.analysisId) as any,
    }, 'resume');
  }

  async recordCoverLetterInProgress(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
    inputsHash: string;
    metadata?: Record<string, unknown>;
    analysisId?: string | null;
  }): Promise<string> {
    return this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
      baselineVersionId: input.baselineVersionId,
      baselineVersionHash: input.baselineVersionHash,
      jobFingerprint: input.jobFingerprint,
      generationContractVersion: ARTIFACT_CONTRACT_VERSION,
      coverLetterStatus: StudioArtifactLifecycleStatus.IN_PROGRESS,
      coverLetterInputsHash: input.inputsHash,
      coverLetterGenerationStartedAt: new Date(),
      coverLetterMetadata: buildArtifactWriteMetadata(input.metadata, input.analysisId) as any,
      coverLetterFailureCode: null,
      coverLetterFailureMessage: null,
    }, 'cover_letter');
  }

  async recordCoverLetterSuccess(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
    inputsHash: string;
    responseBody: Record<string, unknown>;
    content: string | null;
    metadata?: Record<string, unknown>;
    analysisId?: string | null;
  }): Promise<string> {
    this.assertCurrentArtifactEvidenceContract('cover_letter', input.responseBody);
    if (shouldTraceArtifactIdentity) {
      // eslint-disable-next-line no-console
      console.log(
        `[ARTIFACT_WRITE] type=coverLetter baselineVersionId=${input.baselineVersionId} jobId=${input.jobId} inputsHash=${input.inputsHash} analysisId=${input.analysisId ?? null}`,
      );
    }
    return this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
      baselineVersionId: input.baselineVersionId,
      baselineVersionHash: input.baselineVersionHash,
      jobFingerprint: input.jobFingerprint,
      generationContractVersion: ARTIFACT_CONTRACT_VERSION,
      coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED,
      coverLetterInputsHash: input.inputsHash,
      coverLetterResponseBody: input.responseBody as any,
      coverLetterContent: input.content,
      coverLetterGeneratedAt: new Date(),
      coverLetterGenerationStartedAt: null,
      coverLetterFailedAt: null,
      coverLetterFailureCode: null,
      coverLetterFailureMessage: null,
      coverLetterMetadata: buildArtifactWriteMetadata(input.metadata, input.analysisId) as any,
    }, 'cover_letter');
  }

  async recordCoverLetterFailure(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
    inputsHash: string;
    failureCode: string;
    failureMessage: string;
    metadata?: Record<string, unknown>;
    analysisId?: string | null;
  }): Promise<string> {
    return this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
      baselineVersionId: input.baselineVersionId,
      baselineVersionHash: input.baselineVersionHash,
      jobFingerprint: input.jobFingerprint,
      generationContractVersion: ARTIFACT_CONTRACT_VERSION,
      coverLetterStatus: StudioArtifactLifecycleStatus.FAILED,
      coverLetterInputsHash: input.inputsHash,
      coverLetterFailedAt: new Date(),
      coverLetterGenerationStartedAt: null,
      coverLetterFailureCode: input.failureCode,
      coverLetterFailureMessage: input.failureMessage,
      coverLetterMetadata: buildArtifactWriteMetadata(input.metadata, input.analysisId) as any,
    }, 'cover_letter');
  }

  async seedResumeFromCompletedResponse(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
    inputsHash: string;
    responseBody: Record<string, unknown>;
    content: string | null;
  }) {
    await this.recordResumeSuccess(input);
  }

  async seedCoverLetterFromCompletedResponse(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
    inputsHash: string;
    responseBody: Record<string, unknown>;
    content: string | null;
  }) {
    await this.recordCoverLetterSuccess(input);
  }

  computeJobFingerprint(job: Job | null | undefined) {
    if (!job) return null;
    if (job.dedupeHash && safeText(job.dedupeHash)) {
      return safeText(job.dedupeHash);
    }
    return createHash('sha256')
      .update(
        JSON.stringify({
          title: safeText(job.title),
          company: safeText(job.company),
          description: safeText(job.rawDescription),
        }),
      )
      .digest('hex');
  }

  computeResumeInputsHash(input: {
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
    assessmentInputsHash: string | null;
  }) {
    const normalizedAssessmentInputsHash =
      typeof input.assessmentInputsHash === 'string' && input.assessmentInputsHash.trim().length === 0
        ? null
        : input.assessmentInputsHash;
    return createHash('sha256')
      .update(
        JSON.stringify({
          artifactType: 'resume',
          contractVersion: ARTIFACT_CONTRACT_VERSION,
          compositionRulesetVersion: COMPOSITION_RULESET_VERSION,
          baselineVersionHash: input.baselineVersionHash,
          jobFingerprint: input.jobFingerprint,
          assessmentInputsHash: normalizedAssessmentInputsHash,
        }),
      )
      .digest('hex');
  }

  computeCoverLetterInputsHash(input: {
    baselineVersionHash: string | null;
    jobFingerprint: string | null;
  }) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          artifactType: 'cover_letter',
          contractVersion: ARTIFACT_CONTRACT_VERSION,
          compositionRulesetVersion: COMPOSITION_RULESET_VERSION,
          baselineVersionHash: input.baselineVersionHash,
          jobFingerprint: input.jobFingerprint,
        }),
      )
      .digest('hex');
  }

  private buildArtifactRecord(
    record: StudioArtifact | null,
    artifact: StudioArtifactKind,
    expectedInputsHash: string,
  ): StudioArtifactRecord | null {
    if (!record) return null;
    const status =
      artifact === 'resume' ? record.resumeStatus : record.coverLetterStatus;
    const inputsHash =
      artifact === 'resume' ? record.resumeInputsHash : record.coverLetterInputsHash;
    if (status === StudioArtifactLifecycleStatus.MISSING) return null;
    const inputsHashMatches = Boolean(inputsHash && inputsHash === expectedInputsHash);
    const retryAllowed = status !== StudioArtifactLifecycleStatus.IN_PROGRESS;
    const rawResponseBody =
      artifact === 'resume'
        ? normalizeRecord(record.resumeResponseBody)
        : normalizeRecord(record.coverLetterResponseBody);
    const content =
      artifact === 'resume' ? record.resumeContent : record.coverLetterContent;
    const failureCode =
      artifact === 'resume' ? record.resumeFailureCode : record.coverLetterFailureCode;
    const failureMessage =
      artifact === 'resume'
        ? record.resumeFailureMessage
        : record.coverLetterFailureMessage;
    const startedAt =
      artifact === 'resume'
        ? record.resumeGenerationStartedAt
        : record.coverLetterGenerationStartedAt;
    const completedAt =
      artifact === 'resume' ? record.resumeGeneratedAt : record.coverLetterGeneratedAt;
    const failedAt =
      artifact === 'resume' ? record.resumeFailedAt : record.coverLetterFailedAt;
    const metadata =
      artifact === 'resume' ? record.resumeMetadata : record.coverLetterMetadata;
    const createdAt =
      (record as any)?.createdAt && typeof (record as any).createdAt.toISOString === 'function'
        ? (record as any).createdAt.toISOString()
        : null;
    const updatedAt =
      (record as any)?.updatedAt && typeof (record as any).updatedAt.toISOString === 'function'
        ? (record as any).updatedAt.toISOString()
        : null;
    const generationRunId =
      metadata && typeof metadata === 'object' ? (metadata as any)?.auditId ?? null : null;
    const interpretedEvidenceAudit = extractInterpretedEvidenceAuditFromResponseBody(rawResponseBody);
    const artifactCurrent = inputsHashMatches;
    const usableCurrent =
      status === StudioArtifactLifecycleStatus.COMPLETED && Boolean(rawResponseBody) && artifactCurrent;

    if (process.env.DOCGEN_DIAGNOSTICS === 'true') {
      // Low-noise observability for stale artifact reuse decisions.
      // Safe: no content, no PII; only presence/match signals and artifact kind.
      const storedPresent = Boolean(inputsHash && inputsHash.trim());
      const expectedPresent = Boolean(expectedInputsHash && expectedInputsHash.trim());
      // eslint-disable-next-line no-console
      console.info('[studio-artifacts][reuse_decision]', {
        artifact,
        status,
        storedInputsHashPresent: storedPresent,
        expectedInputsHashPresent: expectedPresent,
        inputsHashMatches,
        artifactCurrent,
      });
    }

    return {
      artifactId: String((record as any)?.id ?? ''),
      createdAt,
      updatedAt,
      generationRunId: generationRunId ? String(generationRunId) : null,
      artifactSource: 'persisted',
      status,
      inputsHash,
      inputsHashMatches,
      artifactCurrent,
      usableCurrent,
      retryAllowed,
      responseBody: rawResponseBody,
      content,
      failureCode,
      failureMessage,
      startedAt: startedAt?.toISOString() ?? null,
      completedAt: completedAt?.toISOString() ?? null,
      failedAt: failedAt?.toISOString() ?? null,
      metadata: metadata ?? {},
      ...(artifact === 'resume' ? { resumeMetadata: (metadata ?? {}) as Record<string, unknown> } : {}),
      ...(interpretedEvidenceAudit ? { interpretedEvidenceAudit } : {}),
    };
  }

  private resolvePairStatus(
    record: StudioArtifact | null,
    resumeInputsHash: string,
    coverLetterInputsHash: string,
  ) {
    if (!record) return StudioArtifactLifecycleStatus.MISSING;
    const resumeRecord = this.buildArtifactRecord(record, 'resume', resumeInputsHash);
    const coverRecord = this.buildArtifactRecord(record, 'cover_letter', coverLetterInputsHash);
    const resumeCurrent = Boolean(resumeRecord?.artifactCurrent);
    const coverCurrent = Boolean(coverRecord?.artifactCurrent);
    if (
      (resumeCurrent && resumeRecord?.status === StudioArtifactLifecycleStatus.COMPLETED) ||
      (coverCurrent && coverRecord?.status === StudioArtifactLifecycleStatus.COMPLETED)
    ) {
      return StudioArtifactLifecycleStatus.COMPLETED;
    }
    if (
      (resumeCurrent && resumeRecord?.status === StudioArtifactLifecycleStatus.IN_PROGRESS) ||
      (coverCurrent && coverRecord?.status === StudioArtifactLifecycleStatus.IN_PROGRESS)
    ) {
      return StudioArtifactLifecycleStatus.IN_PROGRESS;
    }
    if (
      (resumeCurrent && resumeRecord?.status === StudioArtifactLifecycleStatus.FAILED) ||
      (coverCurrent && coverRecord?.status === StudioArtifactLifecycleStatus.FAILED)
    ) {
      return StudioArtifactLifecycleStatus.FAILED;
    }
    return StudioArtifactLifecycleStatus.MISSING;
  }

  private async upsertArtifactRow(
    userId: string,
    baselineId: string,
    jobId: string,
    patch: ArtifactPatch,
    artifactTypeForLog: StudioArtifactKind,
  ): Promise<string> {
    const scopeKey = `${userId}:${baselineId}:${jobId}`;

    if (shouldDebugDocgen()) {
      const resumeStatus = patch.resumeStatus ?? null;
      const coverLetterStatus = patch.coverLetterStatus ?? null;
      if (resumeStatus || coverLetterStatus) {
        // eslint-disable-next-line no-console
        console.log('[DOCGEN][ARTIFACT_UPSERT]', {
          userId,
          baselineId,
          jobId,
          resumeStatus,
          coverLetterStatus,
        });
      }
    }

    // Contract: preserve UQ_studio_artifacts_scope and make writes idempotent under concurrency.
    // Avoid a read-then-insert race by first attempting an atomic insert, then updating if needed.
    try {
      const insertResult = await this.studioArtifactRepository
        .createQueryBuilder()
        .insert()
        .into(StudioArtifact)
        .values({ userId, baselineId, jobId, ...patch })
        .onConflict('("userId","baselineId","jobId") DO NOTHING')
        .returning(['id'])
        .execute();

      const insertedId = insertResult?.raw?.[0]?.id ?? null;
      if (insertedId) {
        // eslint-disable-next-line no-console
        console.info('[studio-artifacts][persist_decision]', {
          scopeKey,
          artifactType: artifactTypeForLog,
          decision: 'create',
        });
        return String(insertedId);
      }
    } catch (error) {
      // If something unexpected happens here, surface it; do not silently retry inserts.
      // eslint-disable-next-line no-console
      console.warn('[studio-artifacts][persist_insert_failed]', {
        scopeKey,
        artifactType: artifactTypeForLog,
        error: (error as any)?.message ?? String(error),
      });
      throw error;
    }

    // Row already exists for this scope; update it.
    // eslint-disable-next-line no-console
    console.info('[studio-artifacts][persist_decision]', {
      scopeKey,
      artifactType: artifactTypeForLog,
      decision: 'update',
    });

    await this.studioArtifactRepository
      .createQueryBuilder()
      .update(StudioArtifact)
      .set(patch)
      .where('"userId" = :userId AND "baselineId" = :baselineId AND "jobId" = :jobId', {
        userId,
        baselineId,
        jobId,
      })
      .execute();

    const refreshed = await this.studioArtifactRepository.findOne({ where: { userId, baselineId, jobId } });
    return String((refreshed as any)?.id ?? '');
  }
}
