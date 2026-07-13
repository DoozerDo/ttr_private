import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { Document, Paragraph, Packer } from 'docx';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { resolveBaselineSectionsForGeneration } from '../baseline/baseline-section-source';
import { extractStructuredBaselineFromSections } from '../baseline/structuredBaselineExtractor';
import { StudioArtifact, StudioArtifactLifecycleStatus } from '../studio-artifacts/studio-artifact.entity';

type RegisterResponse = {
  accessToken: string;
  user: { id: string };
};

function expectObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected object response.');
  }
}

function assertFitAssessmentContract(
  responseBody: unknown,
  expectedMinimumScore: number,
) {
  expectObject(responseBody);
  const body = responseBody as Record<string, any>;
  const score = Number(body.score ?? body.overallScore ?? body.fit_score ?? NaN);
  expect(Number.isFinite(score)).toBe(true);
  expect(score).toBeGreaterThanOrEqual(expectedMinimumScore);

  const scoreBreakdown = body.score_breakdown as
    | {
        total_score?: number;
        dimensions?: Array<{ key?: string; label?: string; score?: number; weight?: number }>;
      }
    | undefined;
  expect(scoreBreakdown).toBeTruthy();
  expect(Number(scoreBreakdown?.total_score ?? NaN)).toBe(score);

  const dimensions = Array.isArray(scoreBreakdown?.dimensions)
    ? scoreBreakdown!.dimensions
    : [];
  expect(dimensions).toHaveLength(5);
  const contributingDimensions = dimensions.filter(
    (dimension) => Number(dimension?.score ?? 0) > 0,
  );
  expect(contributingDimensions).toHaveLength(5);
  expect(
    contributingDimensions.reduce(
      (sum, dimension) => sum + Number(dimension?.score ?? 0),
      0,
    ),
  ).toBe(score);
  const dimensionByKey = Object.fromEntries(
    dimensions.map((dimension) => [dimension.key, Number(dimension?.score ?? 0)]),
  ) as Record<string, number>;
  expect(dimensionByKey.role_scope_and_seniority).toBeGreaterThan(0);
  expect(dimensionByKey.support_operations_and_process_rigor).toBeGreaterThan(0);
  expect(dimensionByKey.tooling_and_platform_experience).toBeGreaterThan(0);
  expect(dimensionByKey.domain_and_business_context).toBeGreaterThan(0);
  expect(dimensionByKey.change_leadership_and_customer_advocacy).toBeGreaterThan(0);
}

function loadStrongFitJobDescription(): string {
  return readFileSync(path.join(__dirname, '..', '..', 'test', 'cx-fit', 'fixtures', 'strong.job.txt'), 'utf8').trim();
}

type ResumeFixtureOptions = {
  includeDates?: boolean;
  experienceCount?: 2 | 5;
};

async function createResumeFixtureDocx(options: ResumeFixtureOptions = {}): Promise<{ dir: string; filePath: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ttr-real-loop-'));
  const experienceCount = options.experienceCount ?? 2;
  const includeDates = options.includeDates ?? true;
  const filePath = path.join(
    dir,
    experienceCount === 5 && !includeDates ? 'date-less-five-role-resume.docx' : 'strong-fit-resume.docx',
  );

    const experienceBlocks =
    experienceCount === 5
      ? [
          {
            header: includeDates
              ? 'Example SaaS | Support Operations Director | 2019 - 2022'
              : 'Example SaaS | Support Operations Director',
            bullets: [
              'Owned the support operations operating model and support workflow design for a high-volume SaaS support team.',
              'Built dashboards and KPIs for executive communication and weekly operating reviews that kept staffing tradeoffs, SLA adherence, and queue health visible.',
            ],
          },
          {
            header: includeDates
              ? 'Acme Corp | Support Operations Program Owner | 2024 - Present'
              : 'Acme Corp | Support Operations Program Owner',
            bullets: [
              'Led operating reviews, coaching rhythms, and escalation playbooks.',
              'Owned capacity planning and staffing tradeoffs across two regions and three queues.',
            ],
          },
          {
            header: includeDates
              ? 'Northwind Support | Workflow And Incident Design Lead | 2022 - 2024'
              : 'Northwind Support | Workflow And Incident Design Lead',
            bullets: [
              'Partnered with cloud infrastructure and observability teams on incident response, major incident follow-up, incident command, and service reliability.',
              'Standardized ticketing system governance in Zendesk and Jira so routing and handoff stayed predictable.',
            ],
          },
          {
            header: includeDates
              ? 'Greenfield Systems | Support Operations Manager | 2020 - 2022'
              : 'Greenfield Systems | Support Operations Manager',
            bullets: [
              'Drove automation workflows and ITSM process maturity improvements that reduced repeat escalations and improved SLA adherence.',
              'Kept issue analysis and service metrics aligned with the operating rhythm.',
            ],
          },
          {
            header: includeDates
              ? 'Blue Sky Services | Customer Advocacy Lead | 2018 - 2020'
              : 'Blue Sky Services | Customer Advocacy Lead',
            bullets: [
              'Maintained leadership visibility into customer advocacy and service quality.',
              'Aligned support tooling, reporting, and team workflows to the operating model.',
            ],
          },
        ]
      : [
          {
            header: 'Biblioso | Support Operations Director',
            dates: includeDates ? '2019 - 2022' : '',
            bullets: [
              'Owned the support operations operating model and support workflow design for a high-volume SaaS support team.',
              'Built dashboards and KPIs for executive communication and weekly operating reviews that kept staffing tradeoffs, SLA adherence, and queue health visible.',
            ],
          },
          {
            header: 'Acme Corp | Support Operations Program Owner',
            dates: includeDates ? '2024 - Present' : '',
            bullets: [
              'Led operating reviews, coaching rhythms, and escalation playbooks.',
              'Owned capacity planning and staffing tradeoffs across two regions and three queues.',
            ],
          },
        ];

  const lines = [
    'Alex Candidate',
    'alex.candidate@example.com | Seattle, WA | (555) 555-1234',
    '',
    'SUMMARY',
    'Support operations leader focused on measurable improvements and reliable execution. Builds cross-functional programs across support and product to strengthen service quality and operating rhythm.',
    '',
    ...experienceBlocks.flatMap((block) => [
      'EXPERIENCE',
      block.header,
      ...block.bullets.map((bullet) => `- ${bullet}`),
      '',
    ]),
    'SKILLS',
    'Jira Service Management, ServiceNow, incident response, change management, problem management, runbooks, RCA facilitation, observability, AWS, SQL, billing controls',
    '',
    'EDUCATION',
    'State University | B.S. Business Administration',
    '',
    'CERTIFICATIONS',
    'ITIL Foundation',
  ];

  const doc = new Document({
    sections: [
      {
        children: lines.map((line) => new Paragraph({ text: line })),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await writeFile(filePath, buffer);
  return { dir, filePath };
}

describe('customer workflow contract (real API e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let AppModule: any;
  let authToken: string;
  let userId: string;
  let userRepository: Repository<User>;
  let baselineRepository: Repository<Baseline>;
  let baselineVersionRepository: Repository<BaselineVersion>;
  let studioArtifactRepository: Repository<StudioArtifact>;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.USE_PGMEM_DB = 'true';
    process.env.TYPEORM_SYNCHRONIZE = 'true';
    delete process.env.DATABASE_URL;
  });

  beforeAll(async () => {
    ({ AppModule } = require('../app.module'));
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    if (process.env.NODE_ENV !== 'test') {
      await dataSource.runMigrations();
    }

    userRepository = dataSource.getRepository(User);
    baselineRepository = dataSource.getRepository(Baseline);
    baselineVersionRepository = dataSource.getRepository(BaselineVersion);
    studioArtifactRepository = dataSource.getRepository(StudioArtifact);

    const authService = moduleRef.get(AuthService);
    const email = `workflow-real-loop+${Date.now()}@example.com`;
    const password = 'Test1234!';

    await authService.register({
      email,
      password,
      confirmPassword: password,
      firstName: 'Workflow',
      lastName: 'RealLoop',
    });

    const login = (await authService.login({
      email,
      password,
    } as any)) as RegisterResponse;
    authToken = login.accessToken;
    userId = login.user.id;

    await userRepository.update(
      { id: userId },
      {
        subscriptionTier: SubscriptionTier.PRO,
        betaAccessApproved: true,
      } as Partial<User>,
    );
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 60_000);

  it('ingests, scores, generates, persists, and reloads both artifacts for a strong-fit role', async () => {
    const fixture = await createResumeFixtureDocx();
    try {
      const uploadResponse = await request(app.getHttpServer())
        .post('/baselines')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fixture.filePath, 'strong-fit-resume.docx');

      expect(uploadResponse.status).toBe(201);
      expectObject(uploadResponse.body);
      const baselineId = String((uploadResponse.body as any).baselineId ?? '').trim();
      expect(baselineId).toBeTruthy();

      const persistedBaseline = await baselineRepository.findOne({
        where: { id: baselineId },
        relations: ['sections', 'parsedRecords'],
      });
      expect(persistedBaseline).toBeTruthy();
      const resolvedSections = resolveBaselineSectionsForGeneration(persistedBaseline as Baseline);
      expect(resolvedSections.some((section) => String(section.sectionType ?? '').toUpperCase() === 'EXPERIENCE')).toBe(true);
      const resolvedStructuredBaseline = extractStructuredBaselineFromSections(resolvedSections as any);
      expect(resolvedStructuredBaseline.experience.length).toBeGreaterThan(0);

      const versionsResponse = await request(app.getHttpServer())
        .get(`/baselines/${encodeURIComponent(baselineId)}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(Array.isArray(versionsResponse.body)).toBe(true);
      const baselineVersionId = String((versionsResponse.body as any)?.[0]?.id ?? '').trim();
      expect(baselineVersionId).toBeTruthy();

      const jobDescription = loadStrongFitJobDescription();

      const jobResponse = await request(app.getHttpServer())
        .post('/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Director of Support Operations - Date Less Fixture',
          company: 'Example SaaS',
          rawDescription: jobDescription.trim(),
          responsibilities: [
            'Lead and scale support operations across global teams.',
            'Own executive reporting, operating rhythms, quality assurance, and root cause analysis.',
            'Drive automation, routing, reporting dashboards, and customer advocacy.',
          ],
          requirements: [
            'Cross-functional leadership in support operations.',
            'Experience with incident management, routing, automation, and dashboards.',
            'Track record of improving customer outcomes and service quality.',
          ],
        });
      expect(jobResponse.status).toBe(201);
      expectObject(jobResponse.body);
      const jobId = String((jobResponse.body as any).id ?? '').trim();
      expect(jobId).toBeTruthy();

      const analysisResponse = await request(app.getHttpServer())
        .post('/analysis/run')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          baselineId,
          jobId,
        });
      expect([201, 422]).toContain(analysisResponse.status);
      const latestAssessmentResponse = await request(app.getHttpServer())
        .get(`/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(baselineId)}/latest`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      assertFitAssessmentContract(latestAssessmentResponse.body, 30);
      const assessmentId = String(
        (latestAssessmentResponse.body as any).assessmentId ??
          (latestAssessmentResponse.body as any).id ??
          '',
      ).trim();
      expect(assessmentId).toBeTruthy();

      const resumeResponse = await request(app.getHttpServer())
        .post('/resume/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          baselineId,
          baselineVersionId,
          jobId,
          analysisId: assessmentId,
          oneTap: true,
      });
      expect([200, 201]).toContain(resumeResponse.status);
      expectObject(resumeResponse.body);
      // eslint-disable-next-line no-console
      console.log('[CUSTOMER_LOOP_RESUME_RESULT]', {
        status: (resumeResponse.body as any)?.status ?? null,
        generationStatus: (resumeResponse.body as any)?.generationStatus ?? null,
        exportReady: (resumeResponse.body as any)?.exportReady ?? null,
        qualityGateStatus: (resumeResponse.body as any)?.qualityGate?.status ?? null,
        qualityGateReasons: Array.isArray((resumeResponse.body as any)?.qualityGate?.reasons)
          ? (resumeResponse.body as any).qualityGate.reasons
          : null,
      });
      expect(String((resumeResponse.body as any)?.auditId ?? '')).not.toMatch(/^minimal:/);
      expect(String((resumeResponse.body as any)?.generationAuthority ?? '')).not.toBe('fallback');

      const coverLetterResponse = await request(app.getHttpServer())
        .post('/cover-letters/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          baselineId,
          baselineVersionId,
          jobId,
          analysisId: assessmentId,
          oneTap: true,
      });
      expect([200, 201]).toContain(coverLetterResponse.status);
      expectObject(coverLetterResponse.body);
      // eslint-disable-next-line no-console
      console.log('[CUSTOMER_LOOP_COVER_RESULT]', {
        status: (coverLetterResponse.body as any)?.status ?? null,
        generationStatus: (coverLetterResponse.body as any)?.generationStatus ?? null,
        exportReady: (coverLetterResponse.body as any)?.exportReady ?? null,
        qualityGateStatus: (coverLetterResponse.body as any)?.qualityGate?.status ?? null,
        qualityGateReasons: Array.isArray((coverLetterResponse.body as any)?.qualityGate?.reasons)
          ? (coverLetterResponse.body as any).qualityGate.reasons
          : null,
      });

      const persistedArtifact = await studioArtifactRepository
        .createQueryBuilder('artifact')
        .where('artifact.userId = :userId', { userId })
        .andWhere('artifact.baselineId = :baselineId', { baselineId })
        .andWhere('artifact.jobId = :jobId', { jobId })
        .orderBy('artifact.resumeGeneratedAt', 'DESC')
        .addOrderBy('artifact.coverLetterGeneratedAt', 'DESC')
        .addOrderBy('artifact.updatedAt', 'DESC')
        .addOrderBy('artifact.createdAt', 'DESC')
        .getOne();
      expect(persistedArtifact).toBeTruthy();
      expect(persistedArtifact?.baselineId).toBe(baselineId);
      expect(persistedArtifact?.jobId).toBe(jobId);
      expect(persistedArtifact?.baselineVersionId).toBe(baselineVersionId);
      expect(persistedArtifact?.resumeStatus).toBe(StudioArtifactLifecycleStatus.COMPLETED);
      expect(persistedArtifact?.coverLetterStatus).toBe(StudioArtifactLifecycleStatus.COMPLETED);
      expect(persistedArtifact?.resumeResponseBody).toBeTruthy();
      expect(persistedArtifact?.coverLetterResponseBody).toBeTruthy();
      expect((persistedArtifact?.resumeMetadata as any)?.analysisId).toBe(assessmentId);
      expect((persistedArtifact?.coverLetterMetadata as any)?.analysisId).toBe(assessmentId);
      let studioResponse: any = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        studioResponse = await request(app.getHttpServer())
          .get('/studio/artifacts')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            baselineId,
            baselineVersionId,
            jobId,
            analysisId: assessmentId,
          })
          .expect(200);
        const state = studioResponse.body as any;
        if (
          state.resume &&
          state.coverLetter &&
          (state.resume?.exportReady ?? state.resume?.responseBody?.exportReady) === true &&
          (state.coverLetter?.exportReady ?? state.coverLetter?.responseBody?.exportReady) === true
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      expectObject(studioResponse.body);
      const state = studioResponse.body as any;

      expect(state.resume).toBeTruthy();
      expect(state.coverLetter).toBeTruthy();

      expect(state.resume?.exportReady ?? state.resume?.responseBody?.exportReady).toBe(true);
      expect(state.resume?.actions?.canExport ?? state.resume?.responseBody?.actions?.canExport).toBe(true);
      expect(state.coverLetter?.exportReady ?? state.coverLetter?.responseBody?.exportReady).toBe(true);
      expect(state.coverLetter?.actions?.canExport ?? state.coverLetter?.responseBody?.actions?.canExport).toBe(true);

      const resumePreview = state.resume?.preview ?? state.resume?.responseBody?.preview?.resume ?? null;
      const coverPreview = state.coverLetter?.preview ?? state.coverLetter?.responseBody?.preview?.coverLetter ?? null;
      expect(resumePreview).toBeTruthy();
      expect(coverPreview).toBeTruthy();
    } finally {
      await rm(fixture.dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('ingests, scores, generates, persists, and reloads the five-entry workflow fixture', async () => {
    const fixture = await createResumeFixtureDocx({ includeDates: false, experienceCount: 5 });
    try {
      const uploadResponse = await request(app.getHttpServer())
        .post('/baselines')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', fixture.filePath, 'date-less-five-role-resume.docx');

      expect(uploadResponse.status).toBe(201);
      expectObject(uploadResponse.body);
      expect(Number((uploadResponse.body as any)?.rolesCount ?? 0)).toBe(5);
      expect((uploadResponse.body as any)?.trace?.baselineIngestion?.mappedExperienceCount).toBe(5);
      expect((uploadResponse.body as any)?.trace?.baselineIngestion?.warningReasons).toEqual(
        expect.arrayContaining(['experience.date_range_missing']),
      );
      expect((uploadResponse.body as any)?.trace?.baselineIngestion?.rejectionReasons ?? []).toEqual([]);

      const baselineId = String((uploadResponse.body as any).baselineId ?? '').trim();
      expect(baselineId).toBeTruthy();

      const versionsResponse = await request(app.getHttpServer())
        .get(`/baselines/${encodeURIComponent(baselineId)}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(Array.isArray(versionsResponse.body)).toBe(true);
      const baselineVersionId = String((versionsResponse.body as any)?.[0]?.id ?? '').trim();
      expect(baselineVersionId).toBeTruthy();

      const jobDescription = loadStrongFitJobDescription();
      const uniqueJobDescription = `${jobDescription}\n\nAdditional support-operations proof line for the date-less fixture.`;

      const jobResponse = await request(app.getHttpServer())
        .post('/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Director of Support Operations - Date Less Fixture',
          company: 'Example SaaS',
          rawDescription: uniqueJobDescription,
          responsibilities: [
            'Lead and scale support operations across global teams.',
            'Own executive reporting, operating rhythms, quality assurance, and root cause analysis.',
            'Drive automation, routing, reporting dashboards, and customer advocacy.',
          ],
          requirements: [
            'Cross-functional leadership in support operations.',
            'Experience with incident management, routing, automation, and dashboards.',
            'Track record of improving customer outcomes and service quality.',
          ],
        });
      expect(jobResponse.status).toBe(201);
      expectObject(jobResponse.body);
      const jobId = String((jobResponse.body as any).id ?? '').trim();
      expect(jobId).toBeTruthy();

      const analysisResponse = await request(app.getHttpServer())
        .post('/analysis/run')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          baselineId,
          jobId,
        });
      expect([201, 422]).toContain(analysisResponse.status);
      const latestAssessmentResponse = await request(app.getHttpServer())
        .get(`/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(baselineId)}/latest`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      assertFitAssessmentContract(latestAssessmentResponse.body, 30);
      const assessmentId = String(
        (latestAssessmentResponse.body as any).assessmentId ??
          (latestAssessmentResponse.body as any).id ??
          '',
      ).trim();
      expect(assessmentId).toBeTruthy();

      const resumeResponse = await request(app.getHttpServer())
        .post('/resume/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          baselineId,
          baselineVersionId,
          jobId,
          analysisId: assessmentId,
          oneTap: true,
      });
      expect([200, 201]).toContain(resumeResponse.status);
      expectObject(resumeResponse.body);
      expect((resumeResponse.body as any)?.status).toBe('success');
      expect((resumeResponse.body as any)?.generationStatus).toBe('success');
      expect((resumeResponse.body as any)?.qualityGate?.status).toBe('pass');
      expect((resumeResponse.body as any)?.exportReady).toBe(true);
      expect(Array.isArray((resumeResponse.body as any)?.preview?.resume?.experience)).toBe(true);
      expect((resumeResponse.body as any)?.preview?.resume?.experience?.length ?? 0).toBeGreaterThan(0);
      expect(String((resumeResponse.body as any)?.preview?.resume?.summary ?? '')).toContain('operational process improvement');

      const coverLetterResponse = await request(app.getHttpServer())
        .post('/cover-letters/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          baselineId,
          baselineVersionId,
          jobId,
          analysisId: assessmentId,
          oneTap: true,
      });
      expect([200, 201]).toContain(coverLetterResponse.status);
      expectObject(coverLetterResponse.body);

      const coverContent = String(
        (coverLetterResponse.body as any)?.preview?.coverLetter ??
          (coverLetterResponse.body as any)?.responseBody?.preview?.coverLetter ??
          (coverLetterResponse.body as any)?.content ??
          (coverLetterResponse.body as any)?.responseBody?.content ??
          '',
      );
      expect(coverContent).toBeDefined();
      expect(coverContent).not.toContain('Present');
      expect(coverContent).not.toContain('Current');
      let studioResponse: any = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        studioResponse = await request(app.getHttpServer())
          .get('/studio/artifacts')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            baselineId,
            baselineVersionId,
            jobId,
            analysisId: assessmentId,
          })
          .expect(200);
        const state = studioResponse.body as any;
        if (
          state.resume &&
          state.coverLetter &&
          (state.resume?.exportReady ?? state.resume?.responseBody?.exportReady) === true &&
          (state.coverLetter?.exportReady ?? state.coverLetter?.responseBody?.exportReady) === true
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      expectObject(studioResponse.body);
      const state = studioResponse.body as any;
      expect(state.resume).toBeTruthy();
      expect(state.coverLetter).toBeTruthy();
      expect(state.resume?.actions?.canExport ?? state.resume?.responseBody?.actions?.canExport).toBe(true);
      expect(state.coverLetter?.actions?.canExport ?? state.coverLetter?.responseBody?.actions?.canExport).toBe(true);

      const resumePreview = state.resume?.preview ?? state.resume?.responseBody?.preview?.resume ?? null;
      const coverPreview = state.coverLetter?.preview ?? state.coverLetter?.responseBody?.preview?.coverLetter ?? null;
      expect(resumePreview).toBeTruthy();
      expect(coverPreview).toBeTruthy();
      expect(String(resumePreview ?? '')).not.toContain('Present');
      expect(String(resumePreview ?? '')).not.toContain('Current');
      expect(String(coverPreview ?? '')).not.toContain('Present');
      expect(String(coverPreview ?? '')).not.toContain('Current');
    } finally {
      await rm(fixture.dir, { recursive: true, force: true });
    }
  }, 120_000);
});
