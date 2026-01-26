import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import {
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from '../../src/compliance/compliance.types';
import {
  ComplianceService,
  ValidateAndAuditRequest,
  ValidateAndAuditResult,
} from '../../src/compliance/compliance.service';
import { Baseline } from '../../src/baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSectionType,
} from '../../src/baseline/baseline-section.entity';
import { BaselineVersion } from '../../src/baseline/baseline-version.entity';
import {
  FitAssessment,
  FitAssessmentVerdict,
} from '../../src/analysis/fit-assessment.entity';
import { Job, JobIngestionMethod } from '../../src/jobs/job.entity';

const INVENTED_CLAIM =
  'Improved revenue by 42% at InventedCorp as Senior Imaginary Strategist';
const SAFE_SECTION =
  'Documented responsible teamwork across product and platform environments.';
const SAFE_RESPONSIBILITY =
  'Synthesized stakeholder priorities into consistent delivery updates.';
const SAFE_REQUIREMENT =
  'Strong background in cross-platform automation and observability.';

describe('Compliance blocking for generation endpoints (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baselineRepository: Repository<Baseline>;
  let baselineVersionRepository: Repository<BaselineVersion>;
  let jobRepository: Repository<Job>;
  let fitAssessmentRepository: Repository<FitAssessment>;
  let complianceService: ComplianceService;
  let mockValidateAndAudit: jest.SpyInstance<
    Promise<ValidateAndAuditResult>,
    [ValidateAndAuditRequest]
  >;
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
    jobRepository = dataSource.getRepository(Job);
    fitAssessmentRepository = dataSource.getRepository(FitAssessment);

    const authService = moduleRef.get(AuthService);
    const registration = await authService.register({
      email: `compliance-test+${Date.now()}@example.com`,
      password: 'Test1234!',
    });
    authToken = registration.accessToken;
    userId = registration.user.id;

    complianceService = moduleRef.get(ComplianceService);
    mockValidateAndAudit = jest
      .spyOn(complianceService, 'validateAndAudit')
      .mockImplementation(async (payload: ValidateAndAuditRequest) => {
        const normalizedSections = (payload.generatedSections ?? [])
          .map((section) => String(section.content ?? ''))
          .join(' ');

        const hasInvented =
          normalizedSections.includes(INVENTED_CLAIM) ||
          (
            (payload.job as Partial<Job>)?.normalizedResponsibilities ?? []
          ).some((entry) => (entry ?? '').includes(INVENTED_CLAIM)) ||
          ((payload.job as Partial<Job>)?.normalizedRequirements ?? []).some(
            (entry) => (entry ?? '').includes(INVENTED_CLAIM),
          );

        const auditId = `audit-${payload.action}-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2, 8)}`;

        const audit = {
          id: auditId,
          action: payload.action,
          actorId: payload.actorId,
          outputHash: payload.outputHash,
          baselineVersionId:
            ((payload.baselineVersion ?? {}) as Partial<BaselineVersion>).id ??
            null,
          baselineVersionHash:
            ((payload.baselineVersion ?? {}) as Partial<BaselineVersion>)
              .hash ??
            ((payload.baselineVersion ?? {}) as Partial<BaselineVersion>)
              .fileHash ??
            null,
          jobId: payload.job?.id ?? null,
          createdAt: new Date().toISOString(),
        };

        const inventedFlags = [
          {
            code: ComplianceFlagCode.INVENTED_METRIC,
            severity: ComplianceFlagSeverity.BLOCK,
            message: 'Detected invented metric',
          },
          {
            code: ComplianceFlagCode.INVENTED_COMPANY,
            severity: ComplianceFlagSeverity.BLOCK,
            message: 'Detected invented company reference',
          },
          {
            code: ComplianceFlagCode.INVENTED_ROLE,
            severity: ComplianceFlagSeverity.BLOCK,
            message: 'Detected invented role',
          },
        ];

        return {
          blocked: hasInvented,
          complianceFlags: hasInvented ? inventedFlags : [],
          audit,
        };
      });
  });

  afterEach(() => {
    mockValidateAndAudit.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createBaselineWithSections(
    sections: string[],
    versionNumber = 1,
  ) {
    const hash = `baseline-hash-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;

    const baseline = baselineRepository.create({
      userId,
      version: versionNumber,
      originalFilename: 'mock-baseline.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      storagePath: `/tmp/baseline-${hash}.docx`,
      hash,
      sections: sections.map((content, index) => ({
        sectionType: BaselineSectionType.EXPERIENCE,
        title: null,
        content,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: index,
      })),
    });

    const savedBaseline = await baselineRepository.save(baseline);
    const version = baselineVersionRepository.create({
      baselineId: savedBaseline.id,
      baseline: savedBaseline,
      versionNumber,
      fileHash: hash,
      storagePath: `/tmp/version-${hash}.bin`,
    });

    const savedVersion = await baselineVersionRepository.save(version);
    return { baseline: savedBaseline, baselineVersion: savedVersion };
  }

  async function createJobWithResponsibilities(responsibilities: string[]) {
    const job = jobRepository.create({
      userId,
      title: 'Platform Engineer',
      company: 'Acme Data Works',
      rawDescription: 'Maintain scalable infrastructure.',
      sourceUrl: 'https://example.com/job',
      normalizedResponsibilities: responsibilities,
      normalizedRequirements: [SAFE_REQUIREMENT],
      jdIngestionMethod: JobIngestionMethod.PASTE,
      jdParsedAt: new Date(),
    });

    return jobRepository.save(job);
  }

  async function createFitAssessmentFixture(
    job: Job,
    baseline: Baseline,
    baselineVersion: BaselineVersion,
  ) {
    const assessment = fitAssessmentRepository.create({
      userId,
      jobId: job.id,
      baselineId: baseline.id,
      baselineVersion: baselineVersion.versionNumber ?? 1,
      overallScore: 95,
      verdict: FitAssessmentVerdict.APPLY,
      dimensionScores: {
        experienceAlignment: 95,
        leadershipLevel: 90,
        technicalPlatformFit: 96,
        industryContext: 92,
        strategicTacticalFit: 91,
      },
      strengths: [],
      gaps: [],
      complianceFlags: [],
      inputsHash: 'fit-assessment-hash',
    });

    return fitAssessmentRepository.save(assessment);
  }

  async function buildFixture(options: {
    includeInventedClaimInSections?: boolean;
    includeInventedClaimInResponsibilities?: boolean;
  }) {
    const sections = [
      SAFE_SECTION,
      ...(options.includeInventedClaimInSections ? [INVENTED_CLAIM] : []),
    ];
    const { baseline, baselineVersion } = await createBaselineWithSections(
      sections,
      1,
    );

    const responsibilities = options.includeInventedClaimInResponsibilities
      ? [INVENTED_CLAIM]
      : [SAFE_RESPONSIBILITY];

    const job = await createJobWithResponsibilities(responsibilities);
    await createFitAssessmentFixture(job, baseline, baselineVersion);

    return { baseline, baselineVersion, job };
  }

  function authHeader() {
    return { Authorization: `Bearer ${authToken}` };
  }

  describe('blocking behavior', () => {
    it('blocks resume generation with invented claim', async () => {
      const { baseline, baselineVersion, job } = await buildFixture({
        includeInventedClaimInSections: true,
      });

      const response = await request(app.getHttpServer())
        .post('/resume/generate')
        .set(authHeader())
        .send({
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
        });

      expect(response.status).toBe(422);
      const details = response.body.error?.details;
      expect(details?.audit_id).toBeTruthy();
      expect(details?.compliance_flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: ComplianceFlagCode.INVENTED_METRIC }),
          expect.objectContaining({
            code: ComplianceFlagCode.INVENTED_COMPANY,
          }),
          expect.objectContaining({ code: ComplianceFlagCode.INVENTED_ROLE }),
        ]),
      );
    });

    it('blocks resume export when the same invented claim is present', async () => {
      const { baseline, baselineVersion, job } = await buildFixture({
        includeInventedClaimInSections: true,
      });

      const response = await request(app.getHttpServer())
        .post('/resume/export')
        .set(authHeader())
        .send({
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
          format: 'docx',
        });

      expect(response.status).toBe(422);
      const details = response.body.error?.details;
      expect(details?.audit_id).toBeTruthy();
      expect(details?.compliance_flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: ComplianceFlagCode.INVENTED_METRIC }),
        ]),
      );
    });

    it('blocks cover letter generation when responsibilities cite the invented claim', async () => {
      const { baseline, baselineVersion, job } = await buildFixture({
        includeInventedClaimInSections: false,
        includeInventedClaimInResponsibilities: true,
      });

      const response = await request(app.getHttpServer())
        .post('/cover-letters/generate')
        .set(authHeader())
        .send({
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
        });

      expect(response.status).toBe(422);
      const details = response.body.error?.details;
      expect(details?.audit_id).toBeTruthy();
      expect(details?.compliance_flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: ComplianceFlagCode.INVENTED_COMPANY,
          }),
        ]),
      );
    });

    it('blocks follow-up generation when notes include the invented claim', async () => {
      const { baselineVersion, job } = await buildFixture({
        includeInventedClaimInSections: false,
      });

      const response = await request(app.getHttpServer())
        .post(`/interview-toolkit/${job.id}/follow-up`)
        .set(authHeader())
        .send({
          baselineVersionId: baselineVersion.id,
          notes: INVENTED_CLAIM,
        });

      expect(response.status).toBe(422);
      const details = response.body.error?.details;
      expect(details?.audit_id).toBeTruthy();
      expect(details?.compliance_flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: ComplianceFlagCode.INVENTED_ROLE }),
        ]),
      );
    });
  });

  describe('happy paths', () => {
    it('allows resume generation when content is grounded', async () => {
      const { baseline, baselineVersion, job } = await buildFixture({
        includeInventedClaimInSections: false,
      });

      const response = await request(app.getHttpServer())
        .post('/resume/generate')
        .set(authHeader())
        .send({
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
      expect(response.body.compliance_flags).toEqual([]);
      expect(response.body.audit_id).toBeTruthy();
    });

    it('exports a resume successfully when content is safe', async () => {
      const { baseline, baselineVersion, job } = await buildFixture({
        includeInventedClaimInSections: false,
      });

      const response = await request(app.getHttpServer())
        .post('/resume/export')
        .set(authHeader())
        .send({
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
          format: 'docx',
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toMatch(/resume\.docx/);
      expect(response.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/,
      );
    });

    it('creates a cover letter when no invented claim is introduced', async () => {
      const { baseline, baselineVersion, job } = await buildFixture({
        includeInventedClaimInSections: false,
      });

      const response = await request(app.getHttpServer())
        .post('/cover-letters/generate')
        .set(authHeader())
        .send({
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.compliance_flags).toEqual([]);
      expect(response.body.audit_id).toBeTruthy();
    });

    it('generates follow-up copy when notes are safe', async () => {
      const { baselineVersion, job } = await buildFixture({
        includeInventedClaimInSections: false,
      });

      const response = await request(app.getHttpServer())
        .post(`/interview-toolkit/${job.id}/follow-up`)
        .set(authHeader())
        .send({
          baselineVersionId: baselineVersion.id,
          notes: 'Thanks again for the chance to speak about the role.',
        });

      expect(response.status).toBe(201);
      expect(response.body.complianceFlags).toEqual([]);
      expect(response.body.auditId).toBeTruthy();
    });
  });
});
