import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { StudioArtifact, StudioArtifactLifecycleStatus } from './studio-artifact.entity';

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
  resume: StudioArtifactRecord | null;
  coverLetter: StudioArtifactRecord | null;
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

function shouldDebugDocgen() {
  return process.env.NODE_ENV !== 'production' || process.env.DEBUG_DOCGEN === 'true';
}

@Injectable()
export class StudioArtifactsService {
  constructor(
    @InjectRepository(StudioArtifact)
    private readonly studioArtifactRepository: Repository<StudioArtifact>,
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
    const [baselineVersion, job, assessment] = await Promise.all([
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
    ]);

    const record = await this.studioArtifactRepository.findOne({
      where: {
        userId: input.userId,
        baselineId: input.baselineId,
        jobId: input.jobId,
      },
    });

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

    return {
      status: this.resolvePairStatus(record, resumeInputsHash, coverLetterInputsHash),
      baselineId: input.baselineId,
      jobId: input.jobId,
      baselineVersionId: baselineVersion?.id ?? input.baselineVersionId,
      baselineVersionHash,
      jobFingerprint,
      generationContractVersion: ARTIFACT_CONTRACT_VERSION,
      resume: this.buildArtifactRecord(record, 'resume', resumeInputsHash),
      coverLetter: this.buildArtifactRecord(record, 'cover_letter', coverLetterInputsHash),
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
  }) {
    await this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
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
  }) {
    await this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
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
  }) {
    await this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
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
  }) {
    await this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
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
  }) {
    await this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
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
  }) {
    await this.upsertArtifactRow(input.userId, input.baselineId, input.jobId, {
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
    const responseBody =
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
  ) {
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
    await this.studioArtifactRepository.save(next);
  }
}
