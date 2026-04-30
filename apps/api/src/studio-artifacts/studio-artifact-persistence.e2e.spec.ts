import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
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
});
