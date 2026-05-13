import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
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
  status: StudioArtifactLifecycleStatus;
  inputsHash: string | null;
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
};

type ArtifactPatch = Partial<Pick<
  StudioArtifact,
  | 'baselineVersionId'
  | 'baselineVersionHash'
  | 'jobFingerprint'
  | 'generationContractVersion'
  | 'resumeStatus'
  | 'coverLetterStatus'
  | 'resumeInputsHash'
  | 'coverLetterInputsHash'
  | 'resumeResponseBody'
  | 'coverLetterResponseBody'
  | 'resumeContent'
  | 'coverLetterContent'
  | 'resumeFailureCode'
  | 'coverLetterFailureCode'
  | 'resumeFailureMessage'
  | 'coverLetterFailureMessage'
  | 'resumeGenerationStartedAt'
  | 'coverLetterGenerationStartedAt'
  | 'resumeGeneratedAt'
  | 'coverLetterGeneratedAt'
  | 'resumeFailedAt'
  | 'coverLetterFailedAt'
  | 'resumeMetadata'
  | 'coverLetterMetadata'
>>;

const ARTIFACT_CONTRACT_VERSION = 'studio-artifacts-v1';

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
            where: { id: input.analysisId, userId: input.userId, jobId: input.jobId, baselineId: input.baselineId },
          })
        : Promise.resolve(null),
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
    const baselineTextForInterpretation = (() => {
      try {
        if (!persisted || typeof persisted !== 'object') return null;
        const normalized = normalizeNormalizedResumeDocument(persisted as NormalizedResumeDocument);
        const validation = validateNormalizedResumeDocument(normalized);
        if (!validation.valid) return null;
        return buildResumePlainText(normalized);
      } catch {
        return null;
      }
    })();

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

    const isTemplateNotReadyBlocked =
      Boolean(templateReadiness) &&
      (!templateReadiness!.canGenerateResume || !templateReadiness!.canGenerateCoverLetter) &&
      (templateReadiness?.hardBlockReasons ?? []).some((r) => safeText(r.code) === 'baseline_template_not_ready');

    const stripArtifactPayload = (artifact: StudioArtifactRecord | null): StudioArtifactRecord | null => {
      if (!artifact) return artifact;
      return { ...artifact, responseBody: null, content: null };
    };

    // Default: never drop persisted artifacts from readState; legacy/stale output should be signaled via metadata.
    // Exception: baseline_template_not_ready means Studio must not receive stale/legacy preview payloads.
    const resumeRecord = isTemplateNotReadyBlocked
      ? stripArtifactPayload(resumeRecordRaw)
      : artifactReadiness && resumeRecordRaw && !isStructuredTemplateResult(resumeRecordRaw.responseBody)
        ? {
            ...resumeRecordRaw,
            metadata: { ...(resumeRecordRaw.metadata ?? {}), staleLegacy: true },
          }
        : resumeRecordRaw;
    const coverRecord = isTemplateNotReadyBlocked
      ? stripArtifactPayload(coverRecordRaw)
      : artifactReadiness && coverRecordRaw && !isStructuredTemplateResult(coverRecordRaw.responseBody)
        ? {
            ...coverRecordRaw,
            metadata: { ...(coverRecordRaw.metadata ?? {}), staleLegacy: true },
          }
        : coverRecordRaw;

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

    const resumeResult = this.buildCanonicalResultFromRecord('resume', resumeRecord);
    const coverLetterResult = this.buildCanonicalResultFromRecord('cover_letter', coverRecord);

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
      assessmentScore: score,
      structuredBaselineExperienceCount,
      structuredBaselineMissingEvidenceReasons,
      structuredBaselineExtractedExperiencePreview,
      ...(artifactReadiness
        ? { artifactReadiness, artifactReadinessReasons, artifactReadinessReasonDetails }
        : {}),
      resume: resumeRecord,
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

    if (record.status === StudioArtifactLifecycleStatus.FAILED) {
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
      resumeMetadata: input.metadata ?? {},
      resumeFailureCode: null,
      resumeFailureMessage: null,
    });
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
      resumeResponseBody: input.responseBody,
      resumeContent: input.content,
      resumeGeneratedAt: new Date(),
      resumeGenerationStartedAt: null,
      resumeFailedAt: null,
      resumeFailureCode: null,
      resumeFailureMessage: null,
      resumeMetadata: input.metadata ?? {},
    });
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
      resumeMetadata: input.metadata ?? {},
    });
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
      coverLetterMetadata: input.metadata ?? {},
      coverLetterFailureCode: null,
      coverLetterFailureMessage: null,
    });
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
      coverLetterResponseBody: input.responseBody,
      coverLetterContent: input.content,
      coverLetterGeneratedAt: new Date(),
      coverLetterGenerationStartedAt: null,
      coverLetterFailedAt: null,
      coverLetterFailureCode: null,
      coverLetterFailureMessage: null,
      coverLetterMetadata: input.metadata ?? {},
    });
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
      coverLetterMetadata: input.metadata ?? {},
    });
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
    return createHash('sha256')
      .update(
        JSON.stringify({
          artifactType: 'resume',
          contractVersion: ARTIFACT_CONTRACT_VERSION,
          baselineVersionHash: input.baselineVersionHash,
          jobFingerprint: input.jobFingerprint,
          assessmentInputsHash: input.assessmentInputsHash,
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
    if (inputsHash && inputsHash !== expectedInputsHash) return null;
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
    const interpretedEvidenceAudit = extractInterpretedEvidenceAuditFromResponseBody(responseBody);

    return {
      status,
      inputsHash,
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
    if (
      resumeRecord?.status === StudioArtifactLifecycleStatus.COMPLETED ||
      coverRecord?.status === StudioArtifactLifecycleStatus.COMPLETED
    ) {
      return StudioArtifactLifecycleStatus.COMPLETED;
    }
    if (
      resumeRecord?.status === StudioArtifactLifecycleStatus.IN_PROGRESS ||
      coverRecord?.status === StudioArtifactLifecycleStatus.IN_PROGRESS
    ) {
      return StudioArtifactLifecycleStatus.IN_PROGRESS;
    }
    if (
      resumeRecord?.status === StudioArtifactLifecycleStatus.FAILED ||
      coverRecord?.status === StudioArtifactLifecycleStatus.FAILED
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
  ): Promise<string> {
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
    const existing = await this.studioArtifactRepository.findOne({
      where: { userId, baselineId, jobId },
    });
    const next = existing ?? this.studioArtifactRepository.create({ userId, baselineId, jobId });
    Object.assign(next, patch);
    const saved = await this.studioArtifactRepository.save(next);
    return String((saved as any)?.id ?? (next as any)?.id ?? '');
  }
}
