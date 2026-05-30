import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
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
  ) {}

  getContractVersion() {
    return ARTIFACT_CONTRACT_VERSION;
  }

  async readState(input: {
    userId: string;
    baselineId: string;
    jobId: string;
    baselineVersionId: string;
    analysisId?: string | null;
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
      input.analysisId
        ? this.fitAssessmentRepository.findOne({
            where: {
              id: input.analysisId,
              userId: input.userId,
              jobId: input.jobId,
              baselineId: input.baselineId,
            },
          })
        : this.fitAssessmentRepository.findOne({
            where: {
              userId: input.userId,
              jobId: input.jobId,
              baselineId: input.baselineId,
            },
            order: { createdAt: 'DESC' },
          }),
      this.baselineRepository.findOne({
        where: { id: input.baselineId, userId: input.userId },
        relations: { sections: true, parsedRecords: true },
        order: { parsedRecords: { createdAt: 'DESC' } },
      }),
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

    const isStructuredTemplateResult = (responseBody: Record<string, unknown> | null): boolean => {
      if (!responseBody) return false;
      const internal = normalizeRecord(responseBody.internal);
      return (
        safeText(internal?.generationMode) === 'structured_baseline_template' &&
        safeText(internal?.templateVersion) === 'structured-baseline-v1'
      );
    };

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

    const resumePreviewAllowed = (() => {
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
      // Renderability contract: Studio needs a preview to hydrate after generation.
      // Export readiness is an output-quality concern and must not hide an otherwise renderable preview.
      // (Export gating is handled separately by export endpoints / UI affordances.)
      const gate = (resumeRecord.responseBody as any)?.qualityGate;
      const gateStatus = gate && typeof gate === 'object' ? String((gate as any).status ?? '') : '';
      if (gateStatus === 'failed' || gateStatus === 'blocked') {
        staleArtifactReasonCodes.push('quality_not_pass');
        return false;
      }
      return true;
    })();

    const resumeInternal = resumeRecord ? normalizeRecord((resumeRecord.responseBody as any)?.internal) : null;
    const resumeIsStaleLegacy =
      Boolean(resumeRecord) &&
      (isTrue(((resumeRecord ? resumeRecord.metadata : null) as any)?.staleLegacy) || isTrue(resumeInternal?.staleLegacy));
    const resumeIsMinimal = Boolean(resumeRecord) && detectMinimalResumeArtifact(resumeRecord?.responseBody ?? null).minimal;

    // Hydration contract:
    // - Never mutate persisted artifact fields.
    // - Do not surface stale legacy artifacts as the active preview payload (Prompt 15) => null responseBody/content.
    // - Minimal artifacts keep `responseBody` for audit/diagnostics, but must not surface preview (Prompt 18).
    const resumeRecordForResult =
      resumeRecord && resumeIsStaleLegacy && !resumeIsMinimal
        ? { ...resumeRecord, responseBody: null, content: null }
        : resumeRecord;
    if (resumeRecord && !resumePreviewAllowed) {
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
      resumeResultBase && !resumePreviewAllowed
        ? {
            ...(resumeResultBase as any),
            preview: null,
            exportReady: false,
            exports: { docx: false, pdf: false },
          }
        : resumeResultBase;

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
        ...(process.env.DOCGEN_DIAGNOSTICS === 'true'
          ? {
              staleArtifactRejected: Boolean(rejectedArtifactIds.length),
              staleArtifactReasonCodes: [...new Set(staleArtifactReasonCodes)].slice(0, 12),
              hydrationSource: resumePreviewAllowed ? 'authoritative_current_artifact' : 'blocked',
              authoritativeArtifactId,
              rejectedArtifactIds: rejectedArtifactIds.slice(0, 8),
              retrievalDecisionPath: resumePreviewAllowed ? 'use_current_completed' : 'reject_preview_fail_closed',
              hydrationRejected: Boolean(resumeRecord && !resumePreviewAllowed),
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

    // Contract repair: a persisted artifact record can carry a stale FAILED lifecycle status even when the
    // stored responseBody is a successful, renderable payload. In that case, the responseBody is the canonical
    // authority for Studio hydration and must win over stale failure metadata.
    if (record.status === StudioArtifactLifecycleStatus.FAILED) {
      const generationStatus = String((responseBody as any)?.generationStatus ?? (responseBody as any)?.status ?? '')
        .trim()
        .toLowerCase();
      const hasRenderablePreview = Boolean(previewModel && typeof previewModel === 'object');

      if (generationStatus === 'success' && hasRenderablePreview) {
        const qualityGate =
          responseBody && typeof (responseBody as any).qualityGate === 'object'
            ? ((responseBody as any).qualityGate as Record<string, unknown>)
            : null;
        const qualityStatusRaw = String((qualityGate as any)?.status ?? '').trim();
        const qualityStatus = qualityStatusRaw === 'pass' ? 'pass' : 'needs_refinement';

        const exportReadyRaw =
          responseBody && typeof (responseBody as any).exportReady === 'boolean' ? (responseBody as any).exportReady : false;
        const exportReady = Boolean(exportReadyRaw) && qualityStatus === 'pass';
        const exportsRaw =
          responseBody && typeof (responseBody as any).exports === 'object' ? ((responseBody as any).exports as Record<string, unknown>) : null;
        const exports = exportReady
          ? { docx: Boolean(exportsRaw && exportsRaw.docx), pdf: Boolean(exportsRaw && exportsRaw.pdf) }
          : { docx: false, pdf: false };

        return {
          artifactType,
          generationState: qualityStatus === 'pass' ? 'generated_usable' : 'generated_needs_correction',
          qualityStatus,
          preview: previewModel,
          correctionReasons: [],
          exportReady,
          exports,
          actions: {
            ...baseActions,
            canExport: exportReady,
            canSaveToOpportunities: exportReady,
          },
        };
      }

      const correctionReasons: ArtifactCorrectionReason[] = [];
      if (record.failureCode || record.failureMessage) {
        correctionReasons.push({
          code: String(record.failureCode ?? 'generation_failed'),
          message: String(record.failureMessage ?? 'Generation failed.'),
          severity: 'error',
        });
      }
      return {
        artifactType,
        generationState: 'generation_failed',
        qualityStatus: 'failed',
        preview: null,
        correctionReasons,
        exportReady: false,
        exports: { docx: false, pdf: false },
        actions: baseActions,
      };
    }

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
            : 'failed';

    const correctionReasons: ArtifactCorrectionReason[] = Array.isArray(qualityGate?.reasons)
      ? (qualityGate?.reasons as unknown[])
          .map((reason) => String(reason ?? '').trim())
          .filter(Boolean)
          .slice(0, 8)
          // Avoid duplicates from previous retry loops or upstream serializers.
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
          ? (correctionReasons.some((r) => String(r.code ?? '').includes('real_document_contract_failed')) ? 'generated_unusable' : 'generated_needs_correction')
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
      resumeMetadata: (input.metadata ?? {}) as any,
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
      resumeResponseBody: input.responseBody as any,
      resumeContent: input.content,
      resumeGeneratedAt: new Date(),
      resumeGenerationStartedAt: null,
      resumeFailedAt: null,
      resumeFailureCode: null,
      resumeFailureMessage: null,
      resumeMetadata: (input.metadata ?? {}) as any,
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
      resumeMetadata: (input.metadata ?? {}) as any,
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
      coverLetterMetadata: (input.metadata ?? {}) as any,
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
      coverLetterMetadata: (input.metadata ?? {}) as any,
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
      coverLetterMetadata: (input.metadata ?? {}) as any,
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
        ? sanitizeStoredResumeResponseBody(normalizeRecord(record.resumeResponseBody))
        : normalizeRecord(record.coverLetterResponseBody);
    const content =
      artifact === 'resume' ? record.resumeContent : record.coverLetterContent;

    const responseBody = (() => {
      if (!rawResponseBody) return null;
      if (!content) return rawResponseBody;
      const existing = typeof rawResponseBody.content === 'string' ? rawResponseBody.content.trim() : '';
      if (existing) return rawResponseBody;
      return { ...rawResponseBody, content };
    })();
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
    const interpretedEvidenceAudit = extractInterpretedEvidenceAuditFromResponseBody(responseBody);
    const minimalResume = artifact === 'resume' ? detectMinimalResumeArtifact(responseBody) : null;
    const artifactCurrent = inputsHashMatches && !(minimalResume?.minimal ?? false);
    const usableCurrent =
      status === StudioArtifactLifecycleStatus.COMPLETED && Boolean(responseBody) && artifactCurrent;

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
      responseBody,
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
