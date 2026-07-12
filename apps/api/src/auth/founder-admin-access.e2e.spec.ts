import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { AuthService } from './auth.service';
import { AdminUser } from '../admin-users/admin-user.entity';
import { User } from '../users/user.entity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { FitAssessment, FitAssessmentVerdict } from '../analysis/fit-assessment.entity';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

describe('founder/admin auth access contract (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authService: AuthService;
  let userRepository: Repository<User>;
  let adminUserRepository: Repository<AdminUser>;
  let baselineRepository: Repository<Baseline>;
  let baselineVersionRepository: Repository<BaselineVersion>;
  let jobRepository: Repository<Job>;
  let fitAssessmentRepository: Repository<FitAssessment>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.USE_PGMEM_DB = 'true';
    process.env.TYPEORM_SYNCHRONIZE = 'true';
    process.env.REQUIRE_ACCESS_CODE = 'true';
    process.env.REQUIRE_EMAIL_CONFIRMATION = 'false';
    delete process.env.DATABASE_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    authService = moduleRef.get(AuthService);
    userRepository = dataSource.getRepository(User);
    adminUserRepository = dataSource.getRepository(AdminUser);
    baselineRepository = dataSource.getRepository(Baseline);
    baselineVersionRepository = dataSource.getRepository(BaselineVersion);
    jobRepository = dataSource.getRepository(Job);
    fitAssessmentRepository = dataSource.getRepository(FitAssessment);
  }, 45_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 45_000);

  it('allows a persisted admin account to log in and access Studio plus cover-letter generation', async () => {
    const email = `admin-access+${Date.now()}@example.com`;
    const password = 'Test1234!';

    await authService.register({
      email,
      password,
      confirmPassword: password,
      firstName: 'Admin',
      lastName: 'Access',
    });

    const user = await userRepository.findOne({ where: { email } });
    expect(user?.id).toBeTruthy();

    await adminUserRepository.save(
      adminUserRepository.create({
        userId: user!.id,
        role: 'admin',
      }),
    );

    const login = await authService.login({
      email,
      password,
    } as any);

    expect(login.user.role).toBe('admin');
    expect(login.user.subscriptionTier).toBe(SubscriptionTier.PRO);

    const baseline = await baselineRepository.save(
      baselineRepository.create({
        userId: user!.id,
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
        hash: `file-hash-${Date.now()}`,
        storagePath: '/tmp/baseline-version-1',
      }),
    );

    const job = await jobRepository.save(
      jobRepository.create({
        userId: user!.id,
        title: 'Support Operations Lead',
        company: 'ExampleCo',
        rawDescription: 'Own support operations, build tooling, and partner with product/engineering.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
        jdParsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      } as Partial<Job>),
    );

    const assessment = await fitAssessmentRepository.save(
      fitAssessmentRepository.create({
        userId: user!.id,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion: baselineVersion.versionNumber,
        overallScore: 82,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 80,
          leadershipLevel: 80,
          technicalPlatformFit: 80,
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
      } as any),
    );

    const studioResponse = await request(app.getHttpServer())
      .get('/studio/artifacts')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .query({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      });
    expect(studioResponse.status).toBe(200);

    const coverResponse = await request(app.getHttpServer())
      .post('/cover-letters/generate')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .send({
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      });
    expect(coverResponse.status).not.toBe(403);
  }, 90_000);
});
