import { describe, expect, it } from '@jest/globals';

import { randomUUID } from 'node:crypto';
import type { ArtifactGenerationResult } from '@shared/artifactGenerationResult';
import { StudioArtifactsService } from './studio-artifacts.service';

type AnyRecord = Record<string, any>;

function buildRepo<T extends object>() {
  return {
    findOne: jest.fn<Promise<T | null>, any>(() => Promise.resolve(null)),
    find: jest.fn<Promise<T[]>, any>(() => Promise.resolve([])),
    save: jest.fn<Promise<T>, any>((value: T) => Promise.resolve(value)),
    create: jest.fn<any, any>((value: any) => value),
    createQueryBuilder: jest.fn<any, any>(() => {
      throw new Error('QueryBuilder not implemented in this unit test');
    }),
  } as any;
}

function resumeResult(preview: any): ArtifactGenerationResult<any> {
  return {
    artifactType: 'resume',
    generationState: 'generated_usable',
    qualityStatus: 'pass',
    qualityGate: { status: 'pass', reasons: [] },
    correctionReasons: [],
    exportReady: true,
    exports: { docx: true, pdf: true },
    preview,
    actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
  } as any;
}

function coverLetterResult(preview: any): ArtifactGenerationResult<any> {
  return {
    artifactType: 'cover_letter',
    generationState: 'generated_usable',
    qualityStatus: 'pass',
    qualityGate: { status: 'pass', reasons: [] },
    correctionReasons: [],
    exportReady: true,
    exports: { docx: true, pdf: true },
    preview,
    actions: { canEdit: false, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
  } as any;
}

describe('StudioArtifactsService persistence boundary', () => {
  it('returns both persisted artifacts for Studio hydration after successful generation', async () => {
    const userId = randomUUID();
    const baselineId = randomUUID();
    const baselineVersionId = randomUUID();
    const jobId = randomUUID();
    const analysisId = randomUUID();

    const persistedResume = {
      id: 'art-resume-1',
      userId,
      baselineId,
      baselineVersionId,
      jobId,
      assessmentId: analysisId,
      artifactType: 'resume',
      responseBody: {
        resumeResult: resumeResult({
          summary: 'Hello',
          experience: [{ company: 'Acme', bullets: ['Did thing'] }],
        }),
      },
      content: null,
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
    };
    const persistedCover = {
      id: 'art-cover-1',
      userId,
      baselineId,
      baselineVersionId,
      jobId,
      assessmentId: analysisId,
      artifactType: 'cover_letter',
      responseBody: {
        coverLetterResult: coverLetterResult({ paragraphs: ['Hello', 'Fit', 'Thanks'] }),
      },
      content: null,
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
    };

    const studioArtifactRepository = buildRepo<any>();
    studioArtifactRepository.findOne.mockResolvedValue({
      id: 'pair-1',
      userId,
      baselineId,
      jobId,
      baselineVersionId,
      baselineVersionHash: baselineVersionId,
      jobFingerprint: 'jobfp',
      generationContractVersion: 'studio-artifacts-v1',
      resumeStatus: 'complete',
      coverLetterStatus: 'complete',
      resumeInputsHash: 'resume_hash',
      coverLetterInputsHash: 'cover_hash',
      resumeResponseBody: persistedResume.responseBody,
      coverLetterResponseBody: persistedCover.responseBody,
      resumeContent: null,
      coverLetterContent: null,
      resumeFailureCode: null,
      coverLetterFailureCode: null,
      resumeFailureMessage: null,
      coverLetterFailureMessage: null,
      resumeGenerationStartedAt: new Date('2026-05-27T00:00:00.000Z'),
      coverLetterGenerationStartedAt: new Date('2026-05-27T00:00:00.000Z'),
      resumeGeneratedAt: new Date('2026-05-27T00:00:01.000Z'),
      coverLetterGeneratedAt: new Date('2026-05-27T00:00:02.000Z'),
      resumeFailedAt: null,
      coverLetterFailedAt: null,
      resumeMetadata: {},
      coverLetterMetadata: {},
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
      updatedAt: new Date('2026-05-27T00:00:02.000Z'),
    });

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      buildRepo<any>(),
      buildRepo<any>(),
      buildRepo<any>(),
      buildRepo<any>(),
      { ensureResumeV2ExistsForBaseline: jest.fn(async () => null) } as any,
    ) as any;

    const result = await service.readState({
      userId,
      baselineId,
      baselineVersionId,
      jobId,
      analysisId,
    });

    expect(result.generationContractVersion).toBe('studio-artifacts-v1');
    expect(result.resume?.responseBody ?? null).toBeTruthy();
    expect(result.coverLetter?.responseBody ?? null).toBeTruthy();
    expect(String(result.status ?? '').toLowerCase()).not.toBe('missing');
  });

  it('record*Success writes artifacts retrievable by readState() for the same context', async () => {
    const userId = randomUUID();
    const baselineId = randomUUID();
    const baselineVersionId = randomUUID();
    const jobId = randomUUID();
    const analysisId = randomUUID();

    // In-memory persistence for the single StudioArtifact row.
    let storedRow: AnyRecord | null = null;

    const studioArtifactRepository = {
      ...buildRepo<any>(),
      findOne: jest.fn(async ({ where }: any) => {
        if (!storedRow) return null;
        if (
          storedRow.userId === where.userId &&
          storedRow.baselineId === where.baselineId &&
          storedRow.jobId === where.jobId
        ) {
          return storedRow;
        }
        return null;
      }),
      save: jest.fn(async (value: any) => {
        storedRow = { ...(storedRow ?? {}), ...value };
        return storedRow;
      }),
      create: jest.fn((value: any) => value),
    } as any;

    const baselineVersionRepository = buildRepo<any>();
    baselineVersionRepository.findOne.mockResolvedValue({
      id: baselineVersionId,
      baselineId,
      hash: baselineVersionId,
    });

    const jobRepository = buildRepo<any>();
    jobRepository.findOne.mockResolvedValue({
      id: jobId,
      userId,
      title: 'Role',
      companyName: 'Acme',
      description: 'Desc',
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
    });

    const fitAssessmentRepository = buildRepo<any>();
    fitAssessmentRepository.findOne.mockResolvedValue({
      id: analysisId,
      userId,
      jobId,
      baselineId,
      overallScore: 85,
      inputsHash: 'inputs',
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
    });

    const baselineRepository = buildRepo<any>();
    baselineRepository.findOne.mockResolvedValue({
      id: baselineId,
      userId,
      sections: [],
      parsedRecords: [],
    });

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      baselineRepository,
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      { ensureResumeV2ExistsForBaseline: jest.fn(async () => null) } as any,
    ) as any;

    const resumeResponseBody = {
      preview: {
        resume: {
          summary: 'Hello',
          experience: [{ company: 'Acme', roleTitle: 'Ops', bullets: ['Did thing'] }],
        },
      },
      qualityGate: { status: 'pass', reasons: [] },
      internal: {},
    };
    const coverResponseBody = {
      preview: {
        coverLetter: { paragraphs: ['Hello', 'Fit', 'Thanks'] },
      },
      qualityGate: { status: 'pass', reasons: [] },
      internal: {},
    };

    // These are the write hooks used by the real generation endpoints/services.
    await service.recordResumeSuccess({
      userId,
      baselineId,
      baselineVersionId,
      jobId,
      analysisId,
      responseBody: resumeResponseBody,
      content: null,
      metadata: { auditId: 'audit-1' },
      generationContractVersion: service.getContractVersion(),
    });

    await service.recordCoverLetterSuccess({
      userId,
      baselineId,
      baselineVersionId,
      jobId,
      analysisId,
      responseBody: coverResponseBody,
      content: null,
      metadata: { auditId: 'audit-2' },
      generationContractVersion: service.getContractVersion(),
    });

    const hydrated = await service.readState({
      userId,
      baselineId,
      baselineVersionId,
      jobId,
      analysisId,
    });

    // Persisted response bodies must be present + renderable, and status must not be missing.
    expect(hydrated.resume?.responseBody ?? null).toBeTruthy();
    expect(hydrated.coverLetter?.responseBody ?? null).toBeTruthy();
    expect(String(hydrated.status ?? '').toLowerCase()).not.toBe('missing');
  });
});

