import { Injectable } from '@nestjs/common';
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
};

export type StudioArtifactsState = {
  status: StudioArtifactLifecycleStatus;
  baselineId: string;
  jobId: string;
  baselineVersionId: string | null;
  baselineVersionHash: string | null;
  jobFingerprint: string | null;
  generationContractVersion: string;
  artifactReadiness?: 'ready' | 'blocked';
  artifactReadinessReasons?: string[];
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
        relations: { sections: true },
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
    const TEMPLATE_THRESHOLD = 80;
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
    const hasUsableExperience =
      Boolean(structured) &&
      (structured?.experience ?? []).some((entry) => {
        const company = safeText((entry as any)?.company);
        const roleTitle = safeText((entry as any)?.roleTitle);
        const bullets = Array.isArray((entry as any)?.bullets) ? (entry as any).bullets : [];
        const usableBullets = bullets.map((b: unknown) => safeText(b)).filter(Boolean);
        return company.length > 0 && roleTitle.length > 0 && usableBullets.length > 0;
      });
    const artifactReadiness =
      typeof score === 'number' && score >= TEMPLATE_THRESHOLD && hasUsableExperience
        ? 'ready'
        : typeof score === 'number' && score >= TEMPLATE_THRESHOLD
          ? 'blocked'
          : undefined;
    const artifactReadinessReasons =
      artifactReadiness === 'blocked'
        ? (structured?.missingEvidenceReasons?.slice(0, 8) ?? ['Missing structured baseline evidence.'])
        : [];

    // eslint-disable-next-line no-console
    console.log('STUDIO_ARTIFACT_READINESS_DEBUG', {
      score,
      artifactReadiness,
      structuredBaselineExperienceCount,
      structuredBaselineMissingEvidenceReasons,
      structuredBaselineExtractedExperiencePreview,
    });

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

    // Never drop persisted artifacts from readState; legacy/stale output should be signaled via metadata,
    // not by returning `null` (which makes Studio think artifacts are missing).
    const resumeRecord =
      artifactReadiness && resumeRecordRaw && !isStructuredTemplateResult(resumeRecordRaw.responseBody)
        ? {
            ...resumeRecordRaw,
            metadata: { ...(resumeRecordRaw.metadata ?? {}), staleLegacy: true },
          }
        : resumeRecordRaw;
    const coverRecord =
      artifactReadiness && coverRecordRaw && !isStructuredTemplateResult(coverRecordRaw.responseBody)
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

    return {
      status: this.resolvePairStatus(record, resumeInputsHash, coverLetterInputsHash),
      baselineId: input.baselineId,
      jobId: input.jobId,
      baselineVersionId: baselineVersion?.id ?? input.baselineVersionId,
      baselineVersionHash,
      jobFingerprint,
      generationContractVersion: ARTIFACT_CONTRACT_VERSION,
      assessmentScore: score,
      structuredBaselineExperienceCount,
      structuredBaselineMissingEvidenceReasons,
      structuredBaselineExtractedExperiencePreview,
      ...(artifactReadiness ? { artifactReadiness, artifactReadinessReasons } : {}),
      resume: resumeRecord,
      coverLetter: coverRecord,
      resumeResult: this.buildCanonicalResultFromRecord('resume', resumeRecord),
      coverLetterResult: this.buildCanonicalResultFromRecord('cover_letter', coverRecord),
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
