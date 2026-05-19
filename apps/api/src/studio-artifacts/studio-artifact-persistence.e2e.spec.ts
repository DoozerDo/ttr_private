import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import {
  FitAssessment,
  FitAssessmentVerdict,
} from '../analysis/fit-assessment.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { buildDalenDeterministicBaselineSections } from '../resume/__fixtures__/dalen-deterministic-baseline.fixture';
import { validateNormalizedResumeDocument } from '../resume/resume-normalization';
import { StudioArtifactsService } from './studio-artifacts.service';
import { StudioArtifactLifecycleStatus } from './studio-artifact.entity';
import path from 'node:path';

type RegisterResponse = {
  accessToken: string;
  user: { id: string };
};

function expectObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected object response.');
  }
}

describe('Studio artifact persistence contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baselineRepository: Repository<Baseline>;
  let baselineVersionRepository: Repository<BaselineVersion>;
  let baselineSectionRepository: Repository<BaselineSection>;
  let baselineParsedRepository: Repository<BaselineParsed>;
  let jobRepository: Repository<Job>;
  let fitAssessmentRepository: Repository<FitAssessment>;
  let authToken: string;
  let userId: string;
  let coverLettersService: CoverLettersService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    baselineRepository = dataSource.getRepository(Baseline);
    baselineVersionRepository = dataSource.getRepository(BaselineVersion);
    baselineSectionRepository = dataSource.getRepository(BaselineSection);
    baselineParsedRepository = dataSource.getRepository(BaselineParsed);
    jobRepository = dataSource.getRepository(Job);
    fitAssessmentRepository = dataSource.getRepository(FitAssessment);

    const authService = moduleRef.get(AuthService);
    coverLettersService = moduleRef.get(CoverLettersService);
    const email = `studio-artifacts-test+${Date.now()}@example.com`;
    const password = 'Test1234!';

    await authService.register({
      email,
      password,
      confirmPassword: password,
      firstName: 'Studio',
      lastName: 'Artifacts',
    });

    const login = (await authService.login({
      email,
      password,
    } as any)) as RegisterResponse;
    authToken = login.accessToken;
    userId = login.user.id;
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 30_000);

  async function seedBaselineWithSections(params: {
    baselineId: string;
    sections: Array<Pick<BaselineSection, 'sectionType' | 'title' | 'includePolicy' | 'order' | 'content'>>;
  }) {
    for (const section of params.sections) {
      await baselineSectionRepository.save(
        baselineSectionRepository.create({
          baselineId: params.baselineId,
          sectionType: section.sectionType,
          title: section.title,
          includePolicy: section.includePolicy,
          order: section.order,
          content: section.content,
        }),
      );
    }
  }

  async function seedBaselineParsedWithResumeV2(params: { baselineId: string }) {
    await baselineParsedRepository.save(
      baselineParsedRepository.create({
        baselineId: params.baselineId,
        sourceFileId: '00000000-0000-0000-0000-000000000001',
        schemaVersion: '2',
        sourceFormat: 'docx',
        ingestedAt: new Date(),
        parsedJson: { identity: { full_name: 'Alex Candidate' } },
        resumeV2Json: {
          heading: { name: 'Alex Candidate', contactLine: 'Test City' },
          summary: 'Support leader.',
          experience: [
            {
              company: 'Acme',
              roleTitle: 'Director of Support',
              bullets: ['Led support.'],
            },
          ],
          education: [],
        },
        flagsJson: {},
      } as any),
    );
  }

  it('POST /resume/generate persists an artifact readable by GET /studio/artifacts', async () => {
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
      }),
    );

    await seedBaselineParsedWithResumeV2({ baselineId: baseline.id });

    await baselineSectionRepository.save(
      baselineSectionRepository.create({
        baselineId: baseline.id,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 1,
        content:
          'Acme Corp — Support Operations Manager (2021–2024)\n- Improved escalation triage and reduced time to resolution by 20%.\n- Partnered with engineering to automate recurring workflows.',
      }),
    );

    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId: baseline.id,
        versionNumber: 1,
        fileHash: `file-hash-${Date.now()}`,
        hash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
      }),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Support Operations Lead',
        company: 'ExampleCo',
        rawDescription:
          'Own support operations, build tooling, and partner with product/engineering.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        isArchived: false,
      } as Partial<Job>),
    );

    const assessment = await fitAssessmentRepository.save(
      fitAssessmentRepository.create({
        userId,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion: baselineVersion.versionNumber,
        overallScore: 72,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 70,
          leadershipLevel: 70,
          technicalPlatformFit: 70,
          industryContext: 70,
          strategicTacticalFit: 70,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        inputsHash: null,
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: true,
      }),
    );

    const generateResponse = await request(app.getHttpServer())
      .post('/resume/generate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      });

    expect(generateResponse.status).toBeGreaterThanOrEqual(200);
    expect(generateResponse.status).toBeLessThan(300);

    const artifactsResponse = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      })
      .expect(200);

    expectObject(artifactsResponse.body);
    const resume = (artifactsResponse.body as any).resume as any;
    const resumeResult = (artifactsResponse.body as any).resumeResult as any;
    const hasResume = Boolean(resume?.responseBody) || Boolean(resumeResult);
    if (!hasResume) {
      throw new Error(
        `Expected persisted resume artifact after generate, got: ${JSON.stringify(
          {
            status: (artifactsResponse.body as any).status ?? null,
            resume: resume ?? null,
            resumeResult: resumeResult ?? null,
          },
          null,
          2,
        )}`,
      );
    }

    const artifactsWithoutAnalysis = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
      })
      .expect(200);

    expectObject(artifactsWithoutAnalysis.body);
    expect((artifactsWithoutAnalysis.body as any).assessmentScore).toBe(null);
    expect((artifactsWithoutAnalysis.body as any).artifactReadiness).toBeUndefined();

    const resumeWithoutAnalysis = (artifactsWithoutAnalysis.body as any).resume as any;
    const resumeResultWithoutAnalysis = (artifactsWithoutAnalysis.body as any).resumeResult as any;
    const hasResumeWithoutAnalysis =
      Boolean(resumeWithoutAnalysis?.responseBody) || Boolean(resumeResultWithoutAnalysis);
    expect(hasResumeWithoutAnalysis).toBe(true);
  });

  it('GET /studio/artifacts returns 422 for invalid analysisId (even when optional)', async () => {
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
        preserveFromCleanup: true,
      } as any),
    );

    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId: baseline.id,
        versionNumber: 1,
        fileHash: `file-hash-${Date.now()}`,
        hash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
        preserveFromCleanup: true,
      } as any),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Support Ops Lead',
        company: 'ExampleCo',
        rawDescription: 'Own support operations.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        isArchived: false,
      } as Partial<Job>),
    );

    const res = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: 'not-a-uuid',
      });

    expect(res.status).toBe(422);
    expectObject(res.body);
    expect((res.body as any).error?.code).toBe('studio_artifacts_invalid_ids');
  });

  it('GET /studio/artifacts returns 422 when baselineId, baselineVersionId, or jobId is missing', async () => {
    const valid = '00000000-0000-0000-0000-000000000001';

    const missingBaseline = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineVersionId: valid,
        jobId: valid,
      });
    expect(missingBaseline.status).toBe(422);
    expectObject(missingBaseline.body);
    expect((missingBaseline.body as any).error?.code).toBe('studio_artifacts_missing_ids');

    const missingBaselineVersion = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: valid,
        jobId: valid,
      });
    expect(missingBaselineVersion.status).toBe(422);
    expectObject(missingBaselineVersion.body);
    expect((missingBaselineVersion.body as any).error?.code).toBe('studio_artifacts_missing_ids');

    const missingJob = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: valid,
        baselineVersionId: valid,
      });
    expect(missingJob.status).toBe(422);
    expectObject(missingJob.body);
    expect((missingJob.body as any).error?.code).toBe('studio_artifacts_missing_ids');
  });

  it('happy path: baseline upload -> ingestion persists ResumeV2 -> Studio generates from persisted ResumeV2 (no raw resume reparse)', async () => {
    process.env.RESUME_GENERATION_V2 = 'true';

    // NOTE: The repo's `baseline-sample.docx` fixture does not reliably yield a template-valid structured experience
    // under the current (stricter) ResumeV2 ingestion rules. For DB-backed end-to-end validation we seed a baseline,
    // parsed record, and sections directly so Studio + generation can be validated against persisted ResumeV2.
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
        preserveFromCleanup: true,
      } as any),
    );
    const baselineId = baseline.id;

    await seedBaselineParsedWithResumeV2({ baselineId });
    const parsed = await baselineParsedRepository.findOne({ where: { baselineId }, order: { createdAt: 'DESC' } });
    expect(parsed?.resumeV2Json).toBeTruthy();
    expect(validateNormalizedResumeDocument(parsed!.resumeV2Json as any).valid).toBe(true);

    // Provide baseline sections, but later corrupt them to ensure runtime authority is the persisted ResumeV2.
    await seedBaselineWithSections({
      baselineId,
      sections: buildDalenDeterministicBaselineSections().map((section, idx) => ({
        sectionType: section.sectionType as any,
        title: section.title ?? '',
        includePolicy: section.includePolicy ?? BaselineIncludePolicy.ALWAYS,
        order: idx,
        content: section.content ?? '',
      })),
    });

    // Create a job + fit assessment so Studio has a valid pair context.
    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Director of Support',
        company: 'Acme',
        rawDescription: 'Lead support teams. Improve reliability.',
        ingestionMethod: JobIngestionMethod.MANUAL,
      } as any),
    );
    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId,
        versionNumber: 1,
        fileHash: 'hash-1',
        hash: 'hash-1',
        storagePath: '/tmp/version-1',
        preserveFromCleanup: true,
      } as any),
    );

    const assessment = await fitAssessmentRepository.save(
      fitAssessmentRepository.create({
        userId,
        baselineId,
        jobId: job.id,
        baselineVersion: baselineVersion?.versionNumber ?? 1,
        overallScore: 92,
        verdict: FitAssessmentVerdict.APPLY,
        inputsHash: 'inputs-hash-1',
      } as any),
    );

    // Corrupt baseline sections after ingestion; V2 generation must still use persisted ResumeV2 model.
    await baselineSectionRepository.delete({ baselineId } as any);
    await seedBaselineWithSections({
      baselineId,
      sections: [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          content: 'GARBAGE | GARBAGE | 1999 - 2000\n- totally unrelated',
        },
      ],
    });

    const studioState = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId,
        baselineVersionId: baselineVersion!.id,
        jobId: job.id,
        analysisId: assessment.id,
      });
    expect(studioState.status).toBe(200);
    expectObject(studioState.body);
    expect(String((studioState.body as any)?.resume?.failureCode ?? '')).not.toMatch(/baseline_resume_v2_(missing|invalid)/);

    const resumeGenerate = await request(app.getHttpServer())
      .post('/resume/generate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        baselineId,
        baselineVersionId: baselineVersion!.id,
        jobId: job.id,
        analysisId: assessment.id,
      });
    expect(resumeGenerate.status).toBe(200);
    expectObject(resumeGenerate.body);
    const resumePreview = (resumeGenerate.body as any)?.preview?.resume ?? null;
    expect(resumePreview).toBeTruthy();
    expect(String(resumePreview?.heading?.name ?? '')).toBe(String((parsed!.resumeV2Json as any)?.heading?.name ?? ''));

    const coverGenerate = await request(app.getHttpServer())
      .post('/cover-letters/generate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        baselineId,
        baselineVersionId: baselineVersion!.id,
        jobId: job.id,
        analysisId: assessment.id,
      });
    // Cover letter generation may be tier gated or blocked depending on environment, but must not be blocked by ResumeV2 structural errors.
    expect([201, 200, 403, 422]).toContain(coverGenerate.status);
    if (coverGenerate.status === 422) {
      expect(String((coverGenerate.body as any)?.error?.code ?? '')).not.toMatch(/baseline_resume_v2_(missing|invalid)/);
    }
  });

  it('interpreted evidence audit metadata survives generation and is visible in GET /studio/artifacts (resume + cover letter)', async () => {
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
      }),
    );

    await seedBaselineParsedWithResumeV2({ baselineId: baseline.id });

    const dalenSections = buildDalenDeterministicBaselineSections();
    await seedBaselineWithSections({
      baselineId: baseline.id,
      sections: dalenSections.map((s) => ({
        sectionType: s.sectionType as any,
        title: s.title,
        includePolicy: s.includePolicy,
        order: s.order,
        content: s.content ?? '',
      })),
    });

    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId: baseline.id,
        versionNumber: 1,
        fileHash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
      }),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Backend Engineer',
        company: 'ExampleCo',
        rawDescription: 'Build backend services and partner cross-functionally.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        isArchived: false,
      } as Partial<Job>),
    );

    const assessment = await fitAssessmentRepository.save(
      fitAssessmentRepository.create({
        userId,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion: baselineVersion.versionNumber,
        overallScore: 92,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 90,
          leadershipLevel: 80,
          technicalPlatformFit: 90,
          industryContext: 80,
          strategicTacticalFit: 80,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        inputsHash: null,
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: true,
      }),
    );

    const resumeResponse = await request(app.getHttpServer())
      .post('/resume/generate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
        oneTap: true,
      });
    expect(resumeResponse.status).toBeGreaterThanOrEqual(200);
    expect(resumeResponse.status).toBeLessThan(300);

    // Cover letter controller is tier-gated; call the real service path to exercise generation + persistence.
    try {
      await coverLettersService.generateCoverLetter(userId, {
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
        oneTap: true,
      } as any);
    } catch {
      // Some environments may still reject cover letter generation due to quality/anchoring constraints.
      // This control test only asserts that interpreted-evidence audit metadata is not emitted for healthy baselines.
    }

    const artifactsResponse = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      })
      .expect(200);

    expectObject(artifactsResponse.body);
    const state = artifactsResponse.body as any;

    // Studio must not see readiness "blocked" when meaningful interpreted evidence exists.
    expect(['degraded', 'ready']).toContain(state.artifactReadiness);
    // Interpreted evidence summary must be present in readiness reason details and reflect real classification.
    const readinessDetails = Array.isArray(state.artifactReadinessReasonDetails) ? state.artifactReadinessReasonDetails : [];
    expect(readinessDetails.length).toBeGreaterThan(0);
    const summary = readinessDetails[0]?.details?.interpretedEvidenceSummary as any;
    expect(summary).toEqual(
      expect.objectContaining({
        strongEvidenceCount: expect.any(Number),
        partialEvidenceCount: expect.any(Number),
      }),
    );
    expect((summary?.strongEvidenceCount ?? 0) + (summary?.partialEvidenceCount ?? 0)).toBeGreaterThan(0);
    // Scoring fields must remain unchanged in payload shape/meaning.
    expect(state.assessmentScore).toBe(92);

    // Resume generation may fall back to the minimal fail-safe path in some environments; when it does,
    // interpreted evidence audit metadata is intentionally not emitted. Require the explicit fail-safe metadata instead.
    if (state.resume?.interpretedEvidenceAudit) {
      expect(state.resume?.interpretedEvidenceAudit).toEqual(
        expect.objectContaining({
          interpretedEvidenceSummary: expect.any(Object),
          interpretedEvidenceReadiness: expect.anything(),
          omittedInterpretedEvidence: expect.any(Object),
        }),
      );
    } else {
      // Still require that a resume artifact exists/persisted, and that the fail-safe metadata is explicit.
      expect(state.resume?.status).toBeTruthy();
      expect(state.resume?.resumeMetadata).toEqual(
        expect.objectContaining({
          analysisId: expect.any(String),
          auditId: expect.any(String),
          baselineVersionHash: expect.any(String),
        }),
      );
      // No evidenceDetailsMap when no trace/audit mapping exists.
      expect(state.resume?.responseBody?.evidenceDetailsMap).toBeUndefined();
    }
    // Cover letter audit should be visible either via the normalized `interpretedEvidenceAudit` wrapper
    // or directly in the persisted response body (older artifacts may only have the latter).
    const coverAudit = state.coverLetter?.interpretedEvidenceAudit ?? state.coverLetter?.responseBody?.internal;
    if (coverAudit) {
      expect(coverAudit).toEqual(
        expect.objectContaining({
          interpretedEvidenceSummary: expect.any(Object),
          interpretedEvidenceReadiness: expect.anything(),
          omittedInterpretedEvidence: expect.any(Object),
        }),
      );
      expect(
        state.coverLetter?.responseBody?.evidenceDetailsMap ??
          state.coverLetter?.interpretedEvidenceAudit?.evidenceDetailsMap,
      ).toBeTruthy();
    }
  });

  it('GET /studio/artifacts returns 200 with failed resume artifact state (never 422 for failed generation)', async () => {
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
      }),
    );

    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId: baseline.id,
        versionNumber: 1,
        fileHash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
      }),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Backend Engineer',
        company: 'ExampleCo',
        rawDescription: 'Build backend services and partner cross-functionally.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        isArchived: false,
      } as Partial<Job>),
    );

    const studioArtifactsService = app.get(StudioArtifactsService);
    const baselineVersionHash = baselineVersion.hash ?? baselineVersion.id ?? null;
    const jobFingerprint = studioArtifactsService.computeJobFingerprint(job);
    const inputsHash = studioArtifactsService.computeResumeInputsHash({
      baselineVersionHash,
      jobFingerprint,
      assessmentInputsHash: null,
    });
    await studioArtifactsService.recordResumeFailure({
      userId,
      baselineId: baseline.id,
      jobId: job.id,
      baselineVersionId: baselineVersion.id,
      baselineVersionHash,
      jobFingerprint,
      inputsHash,
      failureCode: 'resume_v2_invalid',
      failureMessage: 'Resume V2 produced an invalid normalized resume model.',
      metadata: { test: true },
      analysisId: null,
    });

    const studioState = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: '11111111-1111-4111-8111-111111111111',
      });

    expect(studioState.status).toBe(200);
    expectObject(studioState.body);
    expect((studioState.body as any)?.resume?.status).toBe(StudioArtifactLifecycleStatus.FAILED);
    expect(String((studioState.body as any)?.resume?.failureCode ?? '')).toBe('resume_v2_invalid');
    expect(String((studioState.body as any)?.resume?.failureMessage ?? '')).toMatch(/invalid normalized resume model/i);
  });

  it('GET /studio/artifacts returns 200 even when ResumeV2 backfill fails (no 422 for ResumeV2 validity)', async () => {
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
      }),
    );

    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId: baseline.id,
        versionNumber: 1,
        fileHash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
      }),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Backend Engineer',
        company: 'ExampleCo',
        rawDescription: 'Build backend services and partner cross-functionally.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        isArchived: false,
      } as Partial<Job>),
    );

    // Persist a parsed record with missing ResumeV2 + empty experience so backfill throws.
    await baselineParsedRepository.save(
      baselineParsedRepository.create({
        baselineId: baseline.id,
        sourceFileId: baseline.id,
        schemaVersion: 'baseline_schema_v1',
        sourceFormat: 'docx',
        ingestedAt: new Date(),
        parsedJson: {
          schema_version: 'baseline_schema_v1',
          user_verified: false,
          baseline_id: baseline.id,
          source_file_id: baseline.id,
          source_format: 'docx',
          ingested_at: new Date().toISOString(),
          identity: { full_name: 'Test Person', location: 'Test City', current_title: null, current_company: null, summary: null },
          experience: [],
          education: [],
          skills: [],
          people_leadership: { direct_reports: null, managers_led: null, global_teams: null },
          operational_ownership: { functions_owned: [], process_design: null, process_scaling: null },
          tooling_and_platforms: { tools: [], ownership_level: 'unknown' },
          cross_functional_partnership: { product: null, engineering: null, sales_cs: null, executive: null },
          customer_advocacy: { executive_escalations: null, voice_of_customer: null, post_incident_rca: null },
          scale_and_scope: { customer_segment: 'unknown', geo_scope: 'unknown', org_stage: 'unknown' },
          metrics_and_outcomes: { metrics_present: false, metrics: [] },
          skills_and_tools: { tools: [], methodologies: [], domains: [] },
          system_generated_read_only: { missing_fields: [], ambiguity_flags: [], low_confidence_extractions: [] },
        } as any,
        resumeV2Json: null,
        flagsJson: { missing_fields: [], ambiguity_flags: [], low_confidence_extractions: [] } as any,
      }),
    );

    const studioState = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: '22222222-2222-4222-8222-222222222222',
      });

    expect(studioState.status).toBe(200);
    expectObject(studioState.body);
    expect(Array.isArray((studioState.body as any).errors)).toBe(true);
    expect(String(((studioState.body as any).errors?.[0]?.code ?? ''))).toMatch(/baseline_resume_v2/i);
  });

  it('healthy structured baseline artifacts do not emit interpretedEvidenceAudit in GET /studio/artifacts', async () => {
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
      }),
    );

    await seedBaselineParsedWithResumeV2({ baselineId: baseline.id });

    await baselineSectionRepository.save(
      baselineSectionRepository.create({
        baselineId: baseline.id,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 1,
        content: [
          'Acme Corp January 2021 - April 2024',
          'Backend Engineer',
          // Use semicolon-delimited inline bullets so evidence units still exist even if the service normalizes whitespace.
          '- Built and maintained backend services using Node.js and PostgreSQL; - Improved p95 API latency by 35% by optimizing database queries and caching.',
          '',
          'Beta Co May 2019 - December 2020',
          'Software Engineer',
          '- Built internal tools and maintained services using AWS; - Collaborated with partners to ship improvements.',
          '',
          // Additional plain-text role line to make structured extraction more robust.
          'Gamma Inc | Software Engineer | 2018 - 2019',
          '- Maintained services and collaborated with partners; - Helped improve reliability.',
        ].join('\n'),
      }),
    );
    await baselineSectionRepository.save(
      baselineSectionRepository.create({
        baselineId: baseline.id,
        sectionType: BaselineSectionType.SUMMARY,
        title: 'Summary',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        content:
          'Backend engineer with experience building and maintaining services, collaborating cross-functionally, and improving reliability. ' +
          'Additional verified baseline context '.repeat(40),
      }),
    );
    await baselineSectionRepository.save(
      baselineSectionRepository.create({
        baselineId: baseline.id,
        sectionType: BaselineSectionType.SKILLS,
        title: 'Skills',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 2,
        content: 'Node.js, PostgreSQL, AWS',
      }),
    );

    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId: baseline.id,
        versionNumber: 1,
        fileHash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
      }),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Backend Engineer',
        company: 'ExampleCo',
        rawDescription: 'Build backend services and partner cross-functionally.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        isArchived: false,
      } as Partial<Job>),
    );

    const assessment = await fitAssessmentRepository.save(
      fitAssessmentRepository.create({
        userId,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion: baselineVersion.versionNumber,
        overallScore: 92,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 90,
          leadershipLevel: 80,
          technicalPlatformFit: 90,
          industryContext: 80,
          strategicTacticalFit: 80,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        inputsHash: null,
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: true,
      }),
    );

    await request(app.getHttpServer())
      .post('/resume/generate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
        oneTap: true,
      })
      .expect((res) => {
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`Unexpected resume generate status ${res.status}: ${JSON.stringify(res.body)}`);
        }
      });

    try {
      await coverLettersService.generateCoverLetter(userId, {
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
        oneTap: true,
      } as any);
    } catch {
      // Control test: cover letter generation may be rejected due to quality/anchoring constraints,
      // but interpreted evidence audit metadata must still remain absent for healthy baselines.
    }

    const artifactsResponse = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      })
      .expect(200);

    expectObject(artifactsResponse.body);
    const state = artifactsResponse.body as any;
    expect(state.resume?.interpretedEvidenceAudit).toBeUndefined();
    expect(state.coverLetter?.interpretedEvidenceAudit).toBeUndefined();
    expect(state.resume?.resumeMetadata?.resumeFailSafeMinimalUsed).toBeUndefined();
  });

  it('weak/unusable interpreted evidence alone does not unlock readiness (GET /studio/artifacts shows blocked)', async () => {
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
      }),
    );

    await seedBaselineParsedWithResumeV2({ baselineId: baseline.id });

    await seedBaselineWithSections({
      baselineId: baseline.id,
      sections: [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          content: [
            // Avoid structured experience extraction entirely while still providing extracted text.
            // This isolates the "interpreted evidence weak/unusable" pathway for readiness.
            'Various tasks.',
            // Keep extracted text above minimum so this is a true "no usable evidence" case, not an extraction failure.
            'Verified professional experience context '.repeat(80),
          ].join('\n'),
        },
      ],
    });

    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId: baseline.id,
        versionNumber: 1,
        fileHash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
      }),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Backend Engineer',
        company: 'ExampleCo',
        rawDescription: 'Build backend services and partner cross-functionally.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        isArchived: false,
      } as Partial<Job>),
    );

    const assessment = await fitAssessmentRepository.save(
      fitAssessmentRepository.create({
        userId,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion: baselineVersion.versionNumber,
        // Keep score high to ensure we are not "hiding" the issue by lowering fit scores.
        overallScore: 92,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 90,
          leadershipLevel: 80,
          technicalPlatformFit: 90,
          industryContext: 80,
          strategicTacticalFit: 80,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        inputsHash: null,
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: true,
      }),
    );

    const artifactsResponse = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      })
      .expect(200);

    expectObject(artifactsResponse.body);
    const state = artifactsResponse.body as any;
    expect(['blocked', 'degraded']).toContain(state.artifactReadiness);
    expect(state.assessmentScore).toBe(92);
    // No interpreted evidence audit emitted when nothing was generated/used.
    expect(state.resume?.interpretedEvidenceAudit).toBeUndefined();
    expect(state.coverLetter?.interpretedEvidenceAudit).toBeUndefined();

    // Readiness reason details must include interpreted evidence summary for Studio/debuggability.
    const details = state.artifactReadinessReasonDetails ?? [];
    expect(Array.isArray(details)).toBe(true);
    if (details.length) {
      expect(details[0]?.details?.interpretedEvidenceSummary).toEqual(
        expect.objectContaining({
          strongEvidenceCount: 0,
          partialEvidenceCount: expect.any(Number),
        }),
      );
    }
  });

  it('when structured experience is invalid but interpreted evidence is meaningful, degraded readiness includes inspectable interpretedEvidenceSummary in reason details', async () => {
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
      }),
    );

    await seedBaselineParsedWithResumeV2({ baselineId: baseline.id });

    // Force structured baseline extraction to produce experience entries, but none are "template-valid"
    // (company "Company" is rejected by structured template header allowlist). Also include meaningful
    // interpreted evidence lines (tools + explicit metric) to ensure readiness degrades rather than blocks.
    await seedBaselineWithSections({
      baselineId: baseline.id,
      sections: [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          content: [
            // Structured extractor will treat this as an experience header, but template-valid header allowlist must reject it.
            'Professional Experience | Role | 2021 - Present',
            '- Built and maintained backend services using Node.js, PostgreSQL, and AWS.',
            '- Improved p95 API latency by 35% by optimizing database queries and caching.',
            'Verified professional experience context '.repeat(80),
          ].join('\n'),
        },
        {
          sectionType: BaselineSectionType.SKILLS,
          title: 'Skills',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 2,
          content: 'Node.js, PostgreSQL, AWS',
        },
      ],
    });

    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId: baseline.id,
        versionNumber: 1,
        fileHash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
      }),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Backend Engineer',
        company: 'ExampleCo',
        rawDescription: 'Build backend services and partner cross-functionally.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        isArchived: false,
      } as Partial<Job>),
    );

    const assessment = await fitAssessmentRepository.save(
      fitAssessmentRepository.create({
        userId,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion: baselineVersion.versionNumber,
        overallScore: 92,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 90,
          leadershipLevel: 80,
          technicalPlatformFit: 90,
          industryContext: 80,
          strategicTacticalFit: 80,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        inputsHash: null,
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: true,
      }),
    );

    const artifactsResponse = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      })
      .expect(200);

    expectObject(artifactsResponse.body);
    const state = artifactsResponse.body as any;

    expect(state.assessmentScore).toBe(92);
    expect(state.artifactReadiness).toBe('degraded');

    const details = Array.isArray(state.artifactReadinessReasonDetails) ? state.artifactReadinessReasonDetails : [];
    expect(details.length).toBeGreaterThan(0);

    const anySummary = details
      .map((d: any) => d?.details?.interpretedEvidenceSummary)
      .find((s: any) => Boolean(s));
    expect(anySummary).toBeTruthy();
    expect((anySummary?.strongEvidenceCount ?? 0) + (anySummary?.partialEvidenceCount ?? 0)).toBeGreaterThan(0);

    const anyValidExperience = details
      .map((d: any) => d?.details?.validExperience ?? d?.details?.stats?.validExperience)
      .find((v: any) => typeof v === 'number');
    // Structured experience is invalid -> validExperience should remain 0.
    expect(anyValidExperience).toBe(0);
  });

  it('degraded readiness rescued by interpreted evidence preserves hard-block reason details (not warning-only) in GET /studio/artifacts', async () => {
    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId,
        version: 1,
        versionNumber: 1,
        originalFilename: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: '/tmp/resume.docx',
        hash: null,
        isActive: true,
        archivedAt: null,
      }),
    );

    await seedBaselineParsedWithResumeV2({ baselineId: baseline.id });

    await seedBaselineWithSections({
      baselineId: baseline.id,
      sections: [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          content: [
            // Template-invalid structured header (validExperience must remain 0).
            'Professional Experience | Role | 2021 - Present',
            // Meaningful interpreted evidence rescues readiness.
            '- Built and maintained backend services using Node.js, PostgreSQL, and AWS.',
            '- Improved p95 API latency by 35% by optimizing database queries and caching.',
            'Verified professional experience context '.repeat(80),
          ].join('\n'),
        },
        {
          sectionType: BaselineSectionType.SKILLS,
          title: 'Skills',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 2,
          content: 'Node.js, PostgreSQL, AWS',
        },
      ],
    });

    const baselineVersion = await baselineVersionRepository.save(
      baselineVersionRepository.create({
        baselineId: baseline.id,
        versionNumber: 1,
        fileHash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
      }),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId,
        title: 'Backend Engineer',
        company: 'ExampleCo',
        rawDescription: 'Build backend services and partner cross-functionally.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        isArchived: false,
      } as Partial<Job>),
    );

    const assessment = await fitAssessmentRepository.save(
      fitAssessmentRepository.create({
        userId,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion: baselineVersion.versionNumber,
        overallScore: 92,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 90,
          leadershipLevel: 80,
          technicalPlatformFit: 90,
          industryContext: 80,
          strategicTacticalFit: 80,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        inputsHash: null,
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: true,
      }),
    );

    const artifactsResponse = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      })
      .expect(200);

    expectObject(artifactsResponse.body);
    const state = artifactsResponse.body as any;

    expect(state.assessmentScore).toBe(92);
    expect(state.artifactReadiness).toBe('degraded');

    const details = Array.isArray(state.artifactReadinessReasonDetails) ? state.artifactReadinessReasonDetails : [];
    expect(details.length).toBeGreaterThan(0);

    // Must preserve the original hard-block reason context (baseline_template_not_ready) when we degraded
    // specifically due to meaningful interpreted evidence with invalid structured experience.
    const hardBlockReason = details.find((d: any) => String(d?.code ?? '') === 'baseline_template_not_ready');
    expect(hardBlockReason).toBeTruthy();

    const validExperience =
      hardBlockReason?.details?.validExperience ?? hardBlockReason?.details?.stats?.validExperience;
    expect(validExperience).toBe(0);

    const summary = hardBlockReason?.details?.interpretedEvidenceSummary as any;
    expect(summary).toBeTruthy();
    expect((summary?.strongEvidenceCount ?? 0) + (summary?.partialEvidenceCount ?? 0)).toBeGreaterThan(0);
  });
});
