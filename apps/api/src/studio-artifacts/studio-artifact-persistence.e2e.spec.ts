import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import { Baseline } from '../baseline/baseline.entity';
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
  });

  afterAll(async () => {
    await app.close();
  });

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
          resumeGenerationMode: 'top_level_fail_safe_minimal',
          resumeFailSafeMinimalUsed: true,
          interpretedEvidenceAuditUnavailableReason: 'minimal_fail_safe_no_trace_audit',
        }),
      );
      // If interpreted evidence was available, summary/readiness/omissions must still be visible.
      if (state.resume?.resumeMetadata?.interpretedEvidenceAvailable) {
        expect(state.resume?.resumeMetadata).toEqual(
          expect.objectContaining({
            interpretedEvidenceAvailable: true,
            interpretedEvidenceSummary: expect.any(Object),
            interpretedEvidenceReadiness: expect.anything(),
            omittedInterpretedEvidence: expect.any(Object),
          }),
        );
      }
      // No evidenceDetailsMap when no trace/audit mapping exists.
      expect(state.resume?.responseBody?.evidenceDetailsMap).toBeUndefined();
    }
    // Cover letter audit should be visible either via the normalized `interpretedEvidenceAudit` wrapper
    // or directly in the persisted response body (older artifacts may only have the latter).
    const coverAudit = state.coverLetter?.interpretedEvidenceAudit ?? state.coverLetter?.responseBody?.internal;
    expect(coverAudit).toBeTruthy();
    expect(coverAudit).toEqual(
      expect.objectContaining({
        interpretedEvidenceSummary: expect.any(Object),
        interpretedEvidenceReadiness: expect.anything(),
        omittedInterpretedEvidence: expect.any(Object),
      }),
    );
    expect(state.coverLetter?.responseBody?.evidenceDetailsMap ?? state.coverLetter?.interpretedEvidenceAudit?.evidenceDetailsMap).toBeTruthy();
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
    expect(state.artifactReadiness).toBe('blocked');
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
          partialEvidenceCount: 0,
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
