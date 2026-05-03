import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import crypto from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { FitAssessment } from './fit-assessment.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';

type RegisterResponse = {
  accessToken: string;
  user: { id: string };
};

describe('Analysis scoring reliability (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baselineRepository: Repository<Baseline>;
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
    await dataSource.runMigrations();
    await dataSource.query(
      `ALTER TABLE "fit_assessments" ADD COLUMN IF NOT EXISTS "scoringReliability" character varying(32)`,
    );
    await dataSource.query(
      `ALTER TABLE "fit_assessments" ADD COLUMN IF NOT EXISTS "scoringReliabilityReason" character varying(64)`,
    );
    baselineRepository = dataSource.getRepository(Baseline);
    baselineSectionRepository = dataSource.getRepository(BaselineSection);
    jobRepository = dataSource.getRepository(Job);
    fitAssessmentRepository = dataSource.getRepository(FitAssessment);

    const authService = moduleRef.get(AuthService);
    const email = `analysis-reliability+${Date.now()}@example.com`;
    const password = 'Test1234!';

    await authService.register({
      email,
      password,
      confirmPassword: password,
      firstName: 'Analysis',
      lastName: 'Reliability',
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

  async function seedBaseline(params: { baselineId: string }) {
    await baselineRepository.save(
      baselineRepository.create({
        id: params.baselineId,
        userId,
        version: 1,
        originalFilename: 'resume.pdf',
        mimeType: 'application/pdf',
        storagePath: '/tmp/resume.pdf',
        hash: crypto.randomUUID(),
      } as Baseline),
    );

    await baselineSectionRepository.save(
      baselineSectionRepository.create({
        baselineId: params.baselineId,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: null,
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 0,
        content:
          'Built and maintained backend services using Node.js and PostgreSQL. '.repeat(
            20,
          ),
      }),
    );
  }

  it('returns scoringReliability=unreliable when a non-empty JD yields zero extracted terms and persists it', async () => {
    const baselineId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    await seedBaseline({ baselineId });

    await jobRepository.save(
      jobRepository.create({
        id: jobId,
        userId,
        title: 'Support Ops',
        company: 'ExampleCo',
        sourceUrl: null,
        jdIngestionMethod: JobIngestionMethod.PASTE,
        rawDescription:
          'Equal opportunity employer. Benefits and compensation details. All qualified applicants will receive consideration.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
      } as Job),
    );

    const runResponse = await request(app.getHttpServer())
      .post('/analysis/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        baselineId,
        jobId,
      })
      .expect(201);

    expect(runResponse.body?.scoringReliability).toBe('unreliable');
    expect(runResponse.body?.scoringReliabilityReason).toBe(
      'job_description_terms_empty',
    );

    const assessmentId = runResponse.body?.assessmentId as string;
    expect(typeof assessmentId).toBe('string');

    const saved = await fitAssessmentRepository.findOne({
      where: { id: assessmentId, userId },
    });
    expect(saved?.scoringReliability).toBe('unreliable');
    expect(saved?.scoringReliabilityReason).toBe('job_description_terms_empty');

    const latestResponse = await request(app.getHttpServer())
      .get(`/analysis/job/${encodeURIComponent(jobId)}/latest`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(latestResponse.body?.scoringReliability).toBe('unreliable');
    expect(latestResponse.body?.scoringReliabilityReason).toBe(
      'job_description_terms_empty',
    );

    const latestForBaselineResponse = await request(app.getHttpServer())
      .get(
        `/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(
          baselineId,
        )}/latest`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(latestForBaselineResponse.body?.scoringReliability).toBe('unreliable');
    expect(latestForBaselineResponse.body?.scoringReliabilityReason).toBe(
      'job_description_terms_empty',
    );

    const byIdResponse = await request(app.getHttpServer())
      .get(`/analysis/fit-assessments/${encodeURIComponent(assessmentId)}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(byIdResponse.body?.scoringReliability).toBe('unreliable');
    expect(byIdResponse.body?.scoringReliabilityReason).toBe(
      'job_description_terms_empty',
    );

    const listResponse = await request(app.getHttpServer())
      .get(`/analysis/fit-assessments?jobId=${encodeURIComponent(jobId)}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body[0]?.scoringReliability).toBe('unreliable');
    expect(listResponse.body[0]?.scoringReliabilityReason).toBe(
      'job_description_terms_empty',
    );
  });

  it('returns scoringReliability=ok for a normal parsed JD and persists it', async () => {
    const baselineId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    await seedBaseline({ baselineId });

    await jobRepository.save(
      jobRepository.create({
        id: jobId,
        userId,
        title: 'Cloud Lead',
        company: 'ExampleCo',
        sourceUrl: null,
        jdIngestionMethod: JobIngestionMethod.PASTE,
        rawDescription:
          'Responsibilities: Lead incident response. Requirements: Experience with AWS and SQL.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
      } as Job),
    );

    const runResponse = await request(app.getHttpServer())
      .post('/analysis/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        baselineId,
        jobId,
      })
      .expect(201);

    expect(runResponse.body?.scoringReliability).toBe('ok');
    const assessmentId = runResponse.body?.assessmentId as string;
    const saved = await fitAssessmentRepository.findOne({
      where: { id: assessmentId, userId },
    });
    expect(saved?.scoringReliability).toBe('ok');

    const latestResponse = await request(app.getHttpServer())
      .get(`/analysis/job/${encodeURIComponent(jobId)}/latest`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(latestResponse.body?.scoringReliability).toBe('ok');
  });
});
