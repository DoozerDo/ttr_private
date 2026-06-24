import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { Document, Paragraph, Packer, TextRun } from 'docx';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

type RegisterResponse = {
  accessToken: string;
  user: { id: string };
};

function expectObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected object response.');
  }
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
            header: 'Example SaaS | Support Operations Director',
            dates: includeDates ? '2019 - 2022' : '',
            bullets: [
              'Owned the support operations operating model and support workflow design for a high-volume SaaS support team.',
              'Built dashboards and KPIs for executive communication and weekly operating reviews that kept staffing tradeoffs, SLA adherence, and queue health visible.',
            ],
          },
          {
            header: 'Example SaaS | Support Operations Program Owner',
            dates: includeDates ? '2024 - Present' : '',
            bullets: [
              'Led operating reviews, coaching rhythms, and escalation playbooks.',
              'Used voice of the customer, CSAT trends, and self service signals to guide change leadership.',
              'Owned capacity planning and staffing tradeoffs across two regions and three queues.',
            ],
          },
          {
            header: 'Example SaaS | Workflow And Incident Design Lead',
            dates: includeDates ? '2022 - 2024' : '',
            bullets: [
              'Partnered with cloud infrastructure and observability teams on incident response, major incident follow-up, incident command, and service reliability.',
              'Standardized ticketing system governance in Zendesk and Jira, plus CRM reporting in Salesforce Service Cloud, so routing and handoff stayed predictable.',
            ],
          },
          {
            header: 'Example SaaS | Support Operations Manager',
            dates: includeDates ? '2020 - 2022' : '',
            bullets: [
              'Drove automation workflows and ITSM process maturity improvements that reduced repeat escalations, improved SLA adherence, and reduced time to resolution.',
              'Kept issue analysis and service metrics aligned with the operating rhythm.',
            ],
          },
          {
            header: 'Example SaaS | Customer Advocacy Lead',
            dates: includeDates ? '2018 - 2020' : '',
            bullets: [
              'Maintained leadership visibility into customer advocacy and service quality.',
              'Aligned support tooling, reporting, and team workflows to the operating model.',
            ],
          },
        ]
      : [
          {
            header: 'Example SaaS | Support Operations Director',
            dates: includeDates ? '2019 - 2022' : '',
            bullets: [
              'Owned the support operations operating model and support workflow design for a high-volume SaaS support team.',
              'Built dashboards and KPIs for executive communication and weekly operating reviews that kept staffing tradeoffs, SLA adherence, and queue health visible.',
              'Partnered with cloud infrastructure and observability teams on incident response, major incident follow-up, incident command, and service reliability.',
              'Standardized ticketing system governance in Zendesk and Jira, plus CRM reporting in Salesforce Service Cloud, so routing and handoff stayed predictable.',
              'Drove automation workflows and ITSM process maturity improvements that reduced repeat escalations, improved SLA adherence, and reduced time to resolution.',
            ],
          },
          {
            header: 'Example SaaS | Support Operations Program Owner',
            dates: includeDates ? '2024 - Present' : '',
            bullets: [
              'Led operating reviews, coaching rhythms, and escalation playbooks.',
              'Led cross functional prioritization on recurring issue fixes.',
              'Improved automation workflows and ITSM process maturity.',
              'Used voice of the customer, CSAT trends, and self service signals to guide change leadership.',
              'Owned capacity planning and staffing tradeoffs across two regions and three queues.',
              'Reduced repeat escalations, improved SLA adherence, and lowered response time.',
              'Kept issue analysis and service metrics aligned with the operating rhythm.',
              'Built operating reviews and playbooks that clarified ownership.',
              'Aligned support tooling, reporting, and team workflows to the operating model.',
              'Maintained leadership visibility into customer advocacy and service quality.',
            ],
          },
        ];

  const lines = [
    'Alex Candidate',
    'alex.candidate@example.com | Seattle, WA | (555) 555-1234',
    '',
    'SUMMARY',
    'Support Operations Director with operating model ownership, governance design, tooling roadmap responsibility, and customer-facing support leadership for a SaaS support team. Leads queue health, service reliability, incident management, ITSM process maturity, automation workflows, dashboards and KPIs, voice of the customer, customer advocacy, and capacity planning through weekly operating reviews and executive updates.',
    '',
    'EXPERIENCE',
    ...experienceBlocks.flatMap((block) => [
      [block.header, block.dates].filter(Boolean).join(' | '),
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
  let baselineVersionRepository: Repository<BaselineVersion>;
  let coverLettersService: CoverLettersService;

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
    baselineVersionRepository = dataSource.getRepository(BaselineVersion);
    coverLettersService = moduleRef.get(CoverLettersService);

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
          company: 'Example SaaS Date Less',
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
      expectObject(latestAssessmentResponse.body);
      const score = Number(
        (latestAssessmentResponse.body as any).score ??
          (latestAssessmentResponse.body as any).overallScore ??
          (latestAssessmentResponse.body as any).fit_score ??
          NaN,
      );
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(80);
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
      await coverLettersService.generateCoverLetter(userId, {
        baselineId,
        baselineVersionId,
        jobId,
        analysisId: assessmentId,
        oneTap: false,
      } as any);
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
          company: 'Example SaaS Date Less',
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
      expectObject(latestAssessmentResponse.body);
      const score = Number(
        (latestAssessmentResponse.body as any).score ??
          (latestAssessmentResponse.body as any).overallScore ??
          (latestAssessmentResponse.body as any).fit_score ??
          NaN,
      );
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(80);
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
      await coverLettersService.generateCoverLetter(userId, {
        baselineId,
        baselineVersionId,
        jobId,
        analysisId: assessmentId,
        oneTap: false,
      } as any);

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
