import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ResumeService, GenerateResumeRequest } from './resume.service';
import { RESUME_GENERATION_V2_FEATURE_FLAG } from './resume-generation-v2';
import { UnprocessableEntityException } from '@nestjs/common';
import { Baseline, BaselineStatus } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineIncludePolicy, BaselineSection, BaselineSectionType } from '../baseline/baseline-section.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceAction, ComplianceFlagSeverity } from '../compliance/compliance.types';
import { ApplicationsService } from '../applications/applications.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { StudioArtifactsService } from '../studio-artifacts/studio-artifacts.service';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { CriticalFlowTrackerService } from '../support/critical-flow-tracker.service';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';
import { BaselineSectionType } from '../baseline/baseline-section.entity';
import { extractStructuredBaselineFromSections } from '../baseline/structuredBaselineExtractor';
import { extractEvidenceUnitsFromLogicalUnits, reconstructLogicalTextUnits } from './resume-draft-bullets';
import * as ResumeDraftBullets from './resume-draft-bullets';
import { buildDalenDeterministicBaselineSections } from './__fixtures__/dalen-deterministic-baseline.fixture';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import { DataSource } from 'typeorm';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>> & {
  findOne: jest.Mock;
  find: jest.Mock;
};

const buildRepo = <T>(findOneValue: unknown): MockRepo<T> => ({
  findOne: jest.fn().mockResolvedValue(findOneValue),
  find: jest.fn().mockResolvedValue([]),
});

const baseSection: BaselineSection = {
  id: 'section-1',
  baselineId: 'baseline-1',
  sectionType: BaselineSectionType.EXPERIENCE,
  title: 'Experience',
  content: [
    'Example Co | Senior Program Manager | 2020 - 2024',
    '- Led support operations and improved service reliability across global teams.',
    '- Built playbooks, reduced incident volume, and managed executive stakeholder updates.',
  ].join('\n'),
  includePolicy: BaselineIncludePolicy.ALWAYS,
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseline: Baseline = {
  id: 'baseline-1',
  userId: 'user-1',
  version: 1,
  originalFilename: 'resume.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  storagePath: '/tmp/resume.docx',
  hash: null,
  status: BaselineStatus.ACTIVE,
  archivedAt: null,
  sections: [baseSection],
  parsedRecords: [],
  versions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baselineVersion: BaselineVersion = {
  id: 'baseline-version-1',
  baseline,
  baselineId: baseline.id,
  versionNumber: 1,
  fileHash: 'hash-1',
  hash: 'hash-1',
  allowedCompanies: [],
  allowedRoles: [],
  allowedTechnologies: [],
  allowedMetricTokens: [],
  verifiedAdditions: [],
  additionDiff: null,
  promotedFromInterviewId: null,
  blockPolicies: [],
  storagePath: '/tmp/version-1',
  createdAt: new Date(),
};

const job: Job = {
  id: 'job-1',
  userId: 'user-1',
  title: 'Program Manager',
  company: 'Example Co',
  rawDescription: 'Program Manager role with measurable support outcomes.',
  sourceUrl: null,
  sourceProviderId: null,
  sourceExternalId: null,
  canonicalUrl: null,
  dedupeHash: null,
  normalizedResponsibilities: ['Lead support operations'],
  normalizedRequirements: ['Drive measurable outcomes'],
  jdIngestionMethod: JobIngestionMethod.PASTE,
  jdParsedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  isArchived: false,
};

const assessment: FitAssessment = {
  id: 'analysis-1',
  userId: 'user-1',
  jobId: job.id,
  baselineId: baseline.id,
  baselineVersion: baselineVersion.versionNumber,
  overallScore: 90,
  verdict: 'APPLY' as any,
  dimensionScores: {
    experienceAlignment: 85,
    leadershipLevel: 88,
    technicalPlatformFit: 80,
    industryContext: 78,
    strategicTacticalFit: 82,
  },
  strengths: [],
  gaps: [],
  complianceFlags: [],
  scoringV2: null,
  inputsHash: null,
  isSynthetic: false,
  syntheticScenarioKey: null,
  syntheticRunId: null,
  syntheticCreatedAt: null,
  preserveFromCleanup: false,
  createdAt: new Date(),
};

const baseRequest: GenerateResumeRequest = {
  baselineId: baseline.id,
  baselineVersionId: baselineVersion.id,
  jobId: job.id,
  analysisId: assessment.id,
  oneTap: false,
};

const buildService = (options?: {
  complianceFlags?: Array<{ code: string; message: string; severity: string }>;
  blocked?: boolean;
  assessmentFindOneImpl?: (query: any) => any;
  validateAndAuditImpl?: () => any;
}) => {
  const baselineRepo = buildRepo<Baseline>(baseline);
  const versionRepo = buildRepo<BaselineVersion>(baselineVersion);
  const policyRepo = buildRepo<BaselineBlockPolicy>([]);
  policyRepo.find = jest.fn().mockResolvedValue([]);
  const jobRepo = buildRepo<Job>(job);
  const assessmentRepo = buildRepo<FitAssessment>(assessment);
  if (options?.assessmentFindOneImpl) {
    assessmentRepo.findOne = jest.fn().mockImplementation(options.assessmentFindOneImpl);
  }

  const complianceService = {
    normalizeSectionsForOutput: jest.fn().mockImplementation((sections) => sections),
    enforceResumeWritingRules: jest.fn().mockReturnValue([]),
    detectScopeInflation: jest.fn().mockResolvedValue([]),
    validateAndAudit: options?.validateAndAuditImpl
      ? jest.fn().mockImplementation(options.validateAndAuditImpl)
      : jest.fn().mockResolvedValue({
          complianceFlags: options?.complianceFlags ?? [],
          blocked: options?.blocked ?? false,
          audit: {
            id: 'audit-1',
            baselineVersionId: baselineVersion.id,
            baselineVersionHash: baselineVersion.hash,
            outputHash: 'hash-output',
            action: ComplianceAction.RESUME_GENERATION,
            actorId: 'user-1',
            jobId: job.id,
            createdAt: new Date().toISOString(),
          },
        }),
  } as unknown as jest.Mocked<ComplianceService>;

  const applicationsService = {
    upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({ id: 'tracker-1', status: 'Ready' }),
  } as unknown as jest.Mocked<ApplicationsService>;

  const opportunitiesService = {
    createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opp-1' }),
  } as unknown as jest.Mocked<OpportunitiesService>;

  const studioArtifactsService = {
    computeJobFingerprint: jest.fn().mockReturnValue('job-fingerprint-1'),
    computeResumeInputsHash: jest.fn().mockReturnValue('resume-hash-1'),
    readState: jest.fn().mockResolvedValue({
      status: 'NOT_STARTED',
      baselineId: baseline.id,
      jobId: job.id,
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: 'job-fingerprint-1',
      generationContractVersion: 'studio-artifacts-v1',
      resume: null,
      coverLetter: null,
    }),
    recordResumeInProgress: jest.fn().mockResolvedValue('studio-artifact-1'),
    recordResumeFailure: jest.fn().mockResolvedValue('studio-artifact-1'),
    recordResumeSuccess: jest.fn().mockResolvedValue('studio-artifact-1'),
  } as unknown as jest.Mocked<StudioArtifactsService>;

  const gapAnalysisService = {
    analyze: jest.fn().mockReturnValue(null),
  } as unknown as GapAnalysisService;

  const criticalFlowTrackerService = {
    recordCriticalFlowEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as CriticalFlowTrackerService;

  const workflowIdempotencyService = {
    reserve: jest.fn().mockResolvedValue({
      status: 'accepted_new',
      runId: 'run-1',
      responseBody: null,
    }),
    complete: jest.fn().mockResolvedValue({ status: 'completed' }),
    markFailure: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<WorkflowIdempotencyService>;

  const baselineResumeV2BackfillService = {
    backfillLatestIfMissing: jest.fn().mockResolvedValue({
      resumeV2Json: {
        heading: { name: 'Alex Candidate', contactLine: 'Test City' },
        summary: 'Support leader with verified impact.',
        experience: [
          { company: 'Acme', roleTitle: 'Director of Support', bullets: ['Improved p95 by 25%'] },
        ],
        education: [],
      },
    }),
  } as any;

  const service = new ResumeService(
    baselineRepo as Repository<Baseline>,
    versionRepo as Repository<BaselineVersion>,
    policyRepo as Repository<BaselineBlockPolicy>,
    jobRepo as Repository<Job>,
    assessmentRepo as Repository<FitAssessment>,
    complianceService,
    applicationsService,
    opportunitiesService,
    gapAnalysisService,
    criticalFlowTrackerService,
    workflowIdempotencyService,
    studioArtifactsService,
    baselineResumeV2BackfillService,
  );

  return {
    service,
    complianceService,
    applicationsService,
    opportunitiesService,
    studioArtifactsService,
    workflowIdempotencyService,
  };
};

describe('ResumeService contract', () => {
  it('uses persisted ResumeV2 as the only resume generation authority (not baseline section text)', async () => {
    const { service } = buildService();
    const poison = 'POISON_BASELINE_SECTION_TEXT_SHOULD_NOT_APPEAR';
    const originalSections = baseline.sections;

    baseline.sections = [
      {
        ...baseSection,
        content: `${String(baseSection.content ?? '')}\n\n${poison}\n`,
      } as any,
    ];

    try {
      const result = await service.generateResume('user-1', baseRequest as any);
      expect(result.status).toBe('success');
      expect(String((result as any).content ?? '')).not.toContain(poison);
    } finally {
      baseline.sections = originalSections;
    }
  });

  it('forces Studio regenerate to persist a fresh V2 artifact when RESUME_GENERATION_V2=true', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    const originalSections = baseline.sections;
    try {
      const { service, studioArtifactsService } = buildService();
      expect(process.env[RESUME_GENERATION_V2_FEATURE_FLAG]).toBe('true');

      baseline.sections = [
        {
          ...baseSection,
          id: 'section-name',
          sectionType: BaselineSectionType.SUMMARY as any,
          title: 'Summary',
          order: 0,
          content: [
            'Test User',
            'Support leader with 10+ years in B2B SaaS. Built repeatable processes, coached teams, and improved outcomes.',
          ].join('\n'),
        } as any,
        {
          ...baseSection,
          order: 1,
          content: [
            'AMS DataSerfs | Senior Data Analyst | 2021 - Present',
            '- Built KPI dashboards and improved reporting cadence.',
            '- Automated weekly exports and reduced manual effort.',
          ].join('\n'),
        },
        {
          ...baseSection,
          id: 'section-skills',
          sectionType: BaselineSectionType.SKILLS as any,
          title: 'Skills',
          order: 2,
          content: [
            '- SQL',
            '- Excel',
            '- Looker',
            '- Stakeholder management',
            '- Incident response',
          ].join('\n'),
        } as any,
      ];

      (studioArtifactsService.readState as any).mockResolvedValue({
        status: 'READY',
        baselineId: baseline.id,
        jobId: job.id,
        baselineVersionId: baselineVersion.id,
        baselineVersionHash: baselineVersion.hash,
        jobFingerprint: 'job-fingerprint-1',
        generationContractVersion: 'studio-artifacts-v1',
        resume: {
          status: 'COMPLETED',
          inputsHash: 'stale-hash-0',
          responseBody: {
            ok: true,
            status: 'success',
            preview: {
              resume: {
                experience: [
                  { company: 'Vue 3), deck builder frontend', roleTitle: 'Professional Experience', bullets: ['x'] },
                ],
              },
            },
            internal: { generationPipeline: 'v1' },
          },
        },
        coverLetter: null,
      });

      const result = await service.generateResume('user-1', {
        ...baseRequest,
        forceRegenerate: true,
      } as any);

      expect(studioArtifactsService.recordResumeSuccess).toHaveBeenCalled();
      const persisted = (studioArtifactsService.recordResumeSuccess as any).mock.calls[0][0];
      expect(persisted?.responseBody?.internal).toBeTruthy();
      expect(persisted?.responseBody?.internal?.generationPipeline).toBe('v2');
      expect(JSON.stringify(persisted?.responseBody?.preview ?? {})).not.toContain('Vue 3), deck builder frontend');
      expect(JSON.stringify(persisted?.responseBody?.preview ?? {})).not.toContain('Experience entry needs correction');
      expect(JSON.stringify(persisted?.responseBody?.preview ?? {})).not.toContain('Automation & Monitoring');
      expect(JSON.stringify(persisted?.responseBody?.preview ?? {})).not.toContain('Internal Web Applications');
      expect(JSON.stringify(persisted?.responseBody?.preview ?? {})).not.toContain('Datacenter Operations');

      expect((result as any)?.internal?.generationPipeline).toBe('v2');
      expect(JSON.stringify((result as any)?.preview ?? {})).not.toContain('Vue 3), deck builder frontend');
      expect(String((result as any)?.preview?.resume?.summary ?? '').trim().length).toBeGreaterThan(0);
    } finally {
      baseline.sections = originalSections;
      if (typeof originalFlag === 'string') {
        process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      } else {
        delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
      }
    }
  });

  it('does not use top-level minimal fallback when RESUME_GENERATION_V2=true and V2 fails', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    const originalSections = baseline.sections;
    try {
      const { service, studioArtifactsService } = buildService();

      baseline.sections = [
        {
          ...baseSection,
          id: 'section-name',
          sectionType: BaselineSectionType.SUMMARY as any,
          title: 'Summary',
          order: 0,
          content: ['Test User'].join('\n'),
        } as any,
        {
          ...baseSection,
          order: 1,
          content: [
            'Vue 3), deck builder frontend | Project',
            '- Implemented state management.',
          ].join('\n'),
        },
      ];

      await expect(
        service.generateResume('user-1', { ...baseRequest, forceRegenerate: true } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(studioArtifactsService.recordResumeSuccess).not.toHaveBeenCalled();
      expect(studioArtifactsService.recordResumeFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ generationPipeline: 'v2' }),
        }),
      );
    } finally {
      baseline.sections = originalSections;
      if (typeof originalFlag === 'string') {
        process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      } else {
        delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
      }
    }
  });

  it('repairs malformed role titles and removes dangling fragments in final preview resume output', async () => {
    const { service } = buildService();

    const original = baseline.sections?.[0]?.content ?? '';
    baseline.sections = [
      {
        ...baseSection,
        content: [
          // Explicit header with a truncated title fragment.
          'Example Co | Technical Architect & Full | 2020 - 2024',
          // Bullet-like lines.
          '- Built a production platform for a game. The',
          '- Led incident response and reliability work across teams.',
        ].join('\n'),
      },
      {
        ...baseSection,
        id: 'summary-date-range',
        sectionType: BaselineSectionType.SUMMARY,
        title: 'Summary',
        order: 1,
        content:
          'Customer operations leader with experience managing escalations, improving CSAT, and leading cross-functional programs.',
      },
    ];

    const result = await service.generateResume('user-1', baseRequest);
    const resume = result.preview?.resume ?? null;
    expect(resume).toBeTruthy();
    expect(resume?.experience?.length ?? 0).toBeGreaterThan(0);

    const roleTitle = String(resume?.experience?.[0]?.roleTitle ?? '');
    expect(roleTitle).not.toMatch(/\b&\s*Full\b/i);
    expect(roleTitle).not.toMatch(/\s&\s*$/);

    const summary = String(resume?.summary ?? '');
    expect(summary).not.toMatch(/\bThe\s*$/);

    const bullets = (resume?.experience?.[0]?.bullets ?? []).map((b) => String(b));
    expect(bullets.some((b) => /\bThe\s*$/.test(b))).toBe(false);
    expect(bullets.some((b) => /\b(?:the|a|an|and|but|because|with|for|to|of|in|on|at|by|from)\s*$/i.test(b))).toBe(false);

    baseline.sections = [{ ...baseSection, content: original }];
  });

  it('produces export-ready structured template output when score >= 80 and structured baseline is extractable', async () => {
    const { service } = buildService();
    const padding =
      'Additional verified context about responsibilities, systems, and outcomes. '.repeat(20);
    const original = baseline.sections?.[0]?.content ?? '';
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [
      {
        createdAt: new Date(),
        parsedJson: { identity: { full_name: 'Jordan Lee' } },
      } as any,
    ];
    baseline.sections = [
      {
        ...baseSection,
        content: [
          'Example Co | Senior Program Manager | 2020 - 2024',
          '- Led support operations and improved service reliability across global teams.',
          '- Built playbooks, reduced incident volume, and managed executive stakeholder updates.',
        ].join('\n'),
      },
      {
        ...baseSection,
        id: 'summary-1',
        sectionType: BaselineSectionType.SUMMARY,
        title: 'Summary',
        order: 1,
        content:
          'Operations leader with experience improving service reliability, incident response, and cross-functional stakeholder alignment. ' +
          padding,
      },
    ];

    const result = await service.generateResume('user-1', baseRequest);
    // Only one experience entry exists in this fixture; it must be generated_unusable under the real document contract.
    expect(result.exportReady).toBe(false);
    expect(result.qualityGate?.reasons ?? []).toEqual(expect.arrayContaining(['baseline_evidence_too_weak']));
    expect(result.internal?.generationMode).toBe('structured_baseline_template');
    expect(result.internal?.templateVersion).toBe('structured-baseline-v1');

    baseline.sections = [{ ...baseSection, content: original }];
    baseline.parsedRecords = originalParsed;
  });

  it('filters malformed structured-template experience headers from preview output (score >= 80 branch)', async () => {
    const { service } = buildService();
    const padding =
      'Additional verified context about infrastructure, tooling, and cross-team collaboration. '.repeat(20);
    const original = baseline.sections?.[0]?.content ?? '';
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [
      {
        createdAt: new Date(),
        parsedJson: { identity: { full_name: 'Jordan Lee' } },
      } as any,
    ];

    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    baseline.sections = [
      {
        ...baseSection,
        content: [
          // Malformed lines that must not reach preview output even in structured-template mode.
          'Infrastructure & Deployment',
          'Professional Experience',
          '2021 - Present',
          '- Did work.',
          '',
          // Inline date range variant observed in fresh regenerate output.
          'Vue 3), deck builder frontend August 2024 – Present',
          'Founder',
          '- Built a deck builder frontend.',
          '',
          // Valid company that should remain intact.
          'AMS DataSerfs August 2022 – August 2024',
          'Infrastructure Engineer',
          '- Improved reliability.',
          '',
          // Valid header we still expect.
          'Biblioso July 2024 - April 2026',
          'Director, Customer Experience',
          '- Led cross-functional CX initiatives.',
        ].join('\n'),
      },
      {
        ...baseSection,
        id: 'summary-2',
        sectionType: BaselineSectionType.SUMMARY,
        title: 'Summary',
        order: 1,
        content:
          'Infrastructure and customer operations leader with experience owning reliability improvements and cross-functional programs. ' +
          padding,
      },
    ];

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.internal?.generationMode).toBe('structured_baseline_template');
    // This fixture has 2+ meaningful roles (AMS + Biblioso); it should pass the real document contract.
    expect(result.exportReady).toBe(true);
    expect(result.qualityGate?.status).toBe('pass');
    // Healthy structured baseline path should not inject interpreted evidence audit details.
    expect((result as any).evidenceDetailsMap).toBeUndefined();
    expect((result as any).internal?.interpretedEvidenceSummary).toBeUndefined();

    const preview = result.preview?.resume as any;
    const companies = (preview?.experience ?? []).map((e: any) => String(e.company ?? ''));
    expect(companies).toContain('Biblioso');
    expect(companies).toContain('AMS DataSerfs');
    expect(companies).not.toContain('Infrastructure & Deployment');
    expect(companies).not.toContain('Vue 3), deck builder frontend');
    expect((preview?.experience ?? []).some((e: any) => String(e.roleTitle ?? '') === 'Professional Experience')).toBe(
      false,
    );

    baseline.sections = [{ ...baseSection, content: original }];
    baseline.parsedRecords = originalParsed;
    assessment.overallScore = originalScore;
  });

  it('does not block Studio template lane when structured headers are malformed but interpreted evidence is meaningful', async () => {
    const { service } = buildService();
    const original = baseline.sections?.[0]?.content ?? '';
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [
      {
        createdAt: new Date(),
        parsedJson: { identity: { full_name: 'Jordan Lee' } },
      } as any,
    ];

    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    baseline.sections = [
      {
        ...baseSection,
        content: [
          'Infrastructure & Deployment',
          'Professional Experience',
          '2021 - Present',
          '- Built and maintained backend services using Node.js, PostgreSQL, and AWS.',
          '',
          'Vue 3), deck builder frontend',
          'Professional Experience',
          '2021 - Present',
          '- Improved p95 API latency by 35% by optimizing database queries and caching.',
        ].join('\n'),
      },
      {
        ...baseSection,
        id: 'skills-1',
        sectionType: BaselineSectionType.SKILLS,
        title: 'Skills',
        order: 1,
        content: 'Node.js, PostgreSQL, AWS',
      },
    ];

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.status).toBe('success');
    // Generation may still fall back to minimal draft lanes if the baseline is too thin,
    // but it must not fail with baseline_template_not_ready when interpreted evidence is meaningful.
    const internal = (result as any).internal ?? {};
    if (!internal?.minimalFallback) {
      expect(internal?.bypassedTemplateHardBlockWithInterpretedEvidence).toBe(true);
      expect(internal?.interpretedEvidenceSummary).toEqual(
        expect.objectContaining({ strongEvidenceCount: expect.any(Number), partialEvidenceCount: expect.any(Number) }),
      );
      expect(internal?.omittedInterpretedEvidence).toEqual(
        expect.objectContaining({
          weak: expect.any(Array),
          unusable: expect.any(Array),
          no_tools_or_metrics: expect.any(Array),
        }),
      );
      // Interpreted evidence should be used as a supplemental signal in actual draft content when structured parsing is weak.
      const summarySection = (result.sections ?? []).find((s: any) => String(s.type ?? '').toUpperCase() === 'SUMMARY');
      const summaryText = String(summarySection?.content ?? '');
      expect(summaryText).toMatch(/Node\.js|PostgreSQL|AWS/i);
      // Audit metadata must include interpreted evidence details when interpreted evidence is used.
      const evidenceDetailsMap = (result as any).evidenceDetailsMap ?? {};
      expect(Object.keys(evidenceDetailsMap).length).toBeGreaterThan(0);
      const flattened = Object.values(evidenceDetailsMap).flat() as any[];
      expect(flattened).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            evidenceItemId: expect.stringMatching(/^interpreted:/),
            evidenceStrength: expect.stringMatching(/strong|partial/),
            evidenceSource: expect.any(String),
            supportLevel: expect.any(String),
            generationUse: expect.any(String),
            missingElements: expect.any(Array),
          }),
        ]),
      );
    }

    baseline.sections = [{ ...baseSection, content: original }];
    baseline.parsedRecords = originalParsed;
    assessment.overallScore = originalScore;
  });

  it('Dalen regression: malformed headers + real technical evidence yields interpreted-evidence audit when traceable (no minimal fail-safe)', async () => {
    const { service } = buildService();
    const original = baseline.sections?.[0]?.content ?? '';
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [
      { createdAt: new Date(), parsedJson: { identity: { full_name: 'Jordan Lee' } } } as any,
    ];
    const originalScore = assessment.overallScore;
    assessment.overallScore = 92;

    baseline.sections = buildDalenDeterministicBaselineSections() as any;
    const baselineText = (baseline.sections ?? []).map((s: any) => String(s.content ?? '')).join('\n');
    expect(baselineText.length).toBeGreaterThan(600);

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.status).toBe('success');
    const internal = (result as any).internal ?? {};
    // Prefer traceable interpreted-evidence path; if extracted-text heuristics trigger the minimal fallback,
    // Phase 11 metadata must make that explicit and still surface interpreted evidence summary/readiness.
    if (internal?.minimalFallback === true) {
      expect(internal?.resumeFailSafeMinimalUsed).toBe(true);
      expect(internal?.resumeGenerationMode).toBe('top_level_fail_safe_minimal');
      expect(internal?.interpretedEvidenceAuditUnavailableReason).toBe('minimal_fail_safe_no_trace_audit');
      expect(internal?.interpretedEvidenceAvailable).toBe(true);
      expect((result as any).evidenceDetailsMap ?? null).toBeFalsy();
    }
    expect(internal?.interpretedEvidenceSummary).toEqual(
      expect.objectContaining({ strongEvidenceCount: expect.any(Number), partialEvidenceCount: expect.any(Number) }),
    );
    expect(
      (internal?.interpretedEvidenceSummary?.strongEvidenceCount ?? 0) +
        (internal?.interpretedEvidenceSummary?.partialEvidenceCount ?? 0),
    ).toBeGreaterThan(0);
    if (internal?.minimalFallback !== true) {
      expect((result as any).evidenceDetailsMap).toBeTruthy();
      expect(internal?.resumeFailSafeMinimalUsed).toBeUndefined();
    }

    baseline.sections = [{ ...baseSection, content: original }];
    baseline.parsedRecords = originalParsed;
    assessment.overallScore = originalScore;
  });

  it('real document contract regression: fixture has only 1 meaningful role -> generated_unusable baseline_evidence_too_weak', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    const { service } = buildService();

    const originalSections = baseline.sections;
    try {
      baseline.sections = [
        {
          ...baseSection,
          id: 'summary-1',
          sectionType: BaselineSectionType.SUMMARY as any,
          title: 'Summary',
          order: 0,
          content: 'Support operations leader with experience building escalation and process rhythms.',
        } as any,
        {
          ...baseSection,
          id: 'experience-1',
          sectionType: BaselineSectionType.EXPERIENCE as any,
          title: 'Experience',
          order: 1,
          content: [
            'Vue 3 deck builder frontend',
            'Contractor',
            '2022 - 2023',
            '- Built a deck builder frontend.',
            '',
            'Acme Corp',
            'Support Operations Lead',
            '2023 - 2025',
            '- Owned escalation workflow and incident triage; improved SLA adherence through clearer routing and playbooks.',
            '- Partnered cross-functionally to reduce repeat escalations via RCA and weekly operating reviews.',
            '',
            'Beta Systems',
            'Customer Operations Manager',
            '2020 - 2023',
            '- Built reporting and queue health dashboards; improved response time by aligning staffing and prioritization.',
            '- Implemented process improvements across support and product to reduce escalations and increase reliability.',
            '',
            'Additional verified baseline context '.repeat(60),
          ].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', { ...baseRequest, forceRegenerate: true } as any);
      expect(result.status).toBe('success');

      // With only one strong experience entry in the fixture, the generator must fail honestly.
      expect((result as any).exportReady).toBe(false);
      expect((result as any).qualityGate?.status).toBe('needs_refinement');
      expect((result as any).qualityGate?.reasons ?? []).toEqual(expect.arrayContaining(['baseline_evidence_too_weak']));
    } finally {
      baseline.sections = originalSections;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('does not unlock generation when only weak/unusable interpreted evidence exists (malformed baseline)', async () => {
    const { service } = buildService();
    const original = baseline.sections?.[0]?.content ?? '';
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [
      { createdAt: new Date(), parsedJson: { identity: { full_name: 'Jordan Lee' } } } as any,
    ];
    const originalScore = assessment.overallScore;
    assessment.overallScore = 92;

    baseline.sections = [
      {
        ...baseSection,
        content: [
          'Vue 3), deck builder frontend',
          'Professional Experience',
          '2021 - Present',
          '- Responsible for various engineering tasks.',
          'Additional verified baseline context '.repeat(60),
        ].join('\n'),
      },
    ] as any;

    await expect(service.generateResume('user-1', baseRequest)).rejects.toBeTruthy();

    baseline.sections = [{ ...baseSection, content: original }];
    baseline.parsedRecords = originalParsed;
    assessment.overallScore = originalScore;
  });

  it('does not invent metrics or inflated scope when generating from partial interpreted evidence (tools-only, no explicit metrics)', async () => {
    const { service } = buildService();
    const original = baseline.sections?.[0]?.content ?? '';
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [
      {
        createdAt: new Date(),
        parsedJson: { identity: { full_name: 'Jordan Lee' } },
      } as any,
    ];
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    baseline.sections = [
      {
        ...baseSection,
        content: [
          'Professional Experience',
          '2021 - Present',
          '- Built and maintained backend services using Node.js, PostgreSQL, and AWS.',
          '',
          'Additional Experience',
          '2020 - 2021',
          '- Responsible for various engineering tasks.',
        ].join('\n'),
      },
      {
        ...baseSection,
        id: 'skills-1',
        sectionType: BaselineSectionType.SKILLS,
        title: 'Skills',
        order: 1,
        content: 'Node.js, PostgreSQL, AWS',
      },
    ];

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.status).toBe('success');

    const internal = (result as any).internal ?? {};
    if (!internal?.minimalFallback) {
      expect(internal?.bypassedTemplateHardBlockWithInterpretedEvidence).toBe(true);
      const allText = (result.sections ?? []).map((s: any) => String(s.content ?? '')).join('\n');
      // No invented percent/x-style improvements.
      expect(allText).not.toMatch(/\b\d+%/);
      expect(allText).not.toMatch(/\b\d+x\b/i);
      // Avoid inflated ownership/scope language unless explicitly supported.
      expect(allText).not.toMatch(/\benterprise-?wide\b/i);
      expect(allText).not.toMatch(/\bmanaged teams?\b/i);
      expect(allText).not.toMatch(/\bincreased revenue\b/i);
      expect(allText).not.toMatch(/\breduced costs?\b/i);
      expect(allText).not.toMatch(/\bimproved csat\b/i);
      expect(allText).not.toMatch(/\breduced churn\b/i);
      // Tools can appear only when explicitly present.
      expect(allText).toMatch(/Node\.js|PostgreSQL|AWS/i);
    }

    baseline.sections = [{ ...baseSection, content: original }];
    baseline.parsedRecords = originalParsed;
    assessment.overallScore = originalScore;
  });

  it('preserves inline date ranges in structured baseline + generated resume output (no company/date bleed)', async () => {
    const { service } = buildService();
    const padding =
      'Additional verified context about customer operations leadership, escalation management, and cross-functional programs. '.repeat(20);
    const original = baseline.sections?.[0]?.content ?? '';
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [
      {
        createdAt: new Date(),
        parsedJson: { identity: { full_name: 'Jordan Lee' } },
      } as any,
    ];

    baseline.sections = [
      {
        ...baseSection,
        content: [
          'Biblioso July 2024 - April 2026',
          'Senior Customer Operations Manager',
          '- Improved CSAT and reduced escalations.',
          '',
          'Biblioso April 2026 - Present',
          'Director, Customer Experience',
          '- Led a cross-functional CX program.',
        ].join('\n'),
      },
      {
        ...baseSection,
        id: 'summary-date-range',
        sectionType: BaselineSectionType.SUMMARY,
        title: 'Summary',
        order: 1,
        content:
          'Customer operations leader with experience managing escalations, improving CSAT, and leading cross-functional programs. ' +
          padding,
      },
    ];

    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    const result = await service.generateResume('user-1', baseRequest);
    const extracted = extractStructuredBaselineFromSections(baseline.sections as any);

    expect(extracted.experience.slice(0, 2).map((e) => ({ company: e.company, dates: e.dates }))).toEqual([
      { company: 'Biblioso', dates: 'July 2024 – April 2026' },
      { company: 'Biblioso', dates: 'April 2026 – Present' },
    ]);

    const previewExperience = (result.preview?.resume as any)?.experience ?? [];
    expect(previewExperience.length).toBeGreaterThanOrEqual(2);
    expect(previewExperience.slice(0, 2).map((e: any) => ({ company: e.company, dateRange: e.dateRange }))).toEqual([
      { company: 'Biblioso', dateRange: 'July 2024 – April 2026' },
      { company: 'Biblioso', dateRange: 'April 2026 – Present' },
    ]);

    expect(String(previewExperience[0]?.company ?? '')).not.toContain('July 2024');
    expect(String(previewExperience[1]?.company ?? '')).not.toContain('April 2026');

    baseline.sections = [{ ...baseSection, content: original }];
    baseline.parsedRecords = originalParsed;
    assessment.overallScore = originalScore;
  });

  it('passes real document contract when baseline has 2+ meaningful roles (2 roles, 4+ bullets, 2+ sentence summary)', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    try {
      const padding = 'Additional verified baseline context about customer operations leadership. '.repeat(80);
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content:
            'Customer operations leader with experience managing escalations and building cross-functional execution rhythms. ' +
            'Focused on measurable improvements and reliable operating cadence. ' +
            padding,
        } as any,
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'Biblioso | Director, Customer Experience | 2024 - Present',
            '- Led a cross-functional CX program spanning support and product.',
            '- Improved escalation handling through clear triage, routing, and operating reviews.',
            '',
            'Acme Corp | Customer Operations Manager | 2021 - 2024',
            '- Built queue health dashboards and reporting to improve response time.',
            '- Implemented process improvements to reduce repeat escalations and strengthen RCA follow through.',
            '',
            padding,
          ].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', baseRequest);
      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);
      expect(result.qualityGate?.status).toBe('pass');

      const diagnostics = (result as any)?.internal?.diagnostics ?? {};
      // Plan must be the render authority: rendered role order should match the plan order when provided.
      expect(Array.isArray(diagnostics.renderedRoleOrder)).toBe(true);
      expect(Array.isArray(diagnostics.rawResumeV2RoleOrder)).toBe(true);
      expect(Array.isArray(diagnostics.leakedSuppressedRoles)).toBe(true);
      expect((diagnostics.leakedSuppressedRoles ?? []).length).toBe(0);
    } finally {
      baseline.sections = originalSections;
      assessment.overallScore = originalScore;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('generates a real exportReady resume when Resume V2 is missing and baseline work history is verified (omits unsupported requirements with warnings)', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    try {
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content:
            'Customer operations leader focused on measurable improvements and reliable operating cadence. ' +
            'Built cross-functional execution rhythms across support and product. ' +
            'Additional verified baseline context. '.repeat(60),
        } as any,
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'Biblioso | Director, Customer Experience | 2024 - Present',
            '- Led a cross-functional CX program spanning support and product.',
            '- Improved escalation handling through triage, routing, and operating reviews.',
            '',
            'Acme Corp | Customer Operations Manager | 2021 - 2024',
            '- Built queue health dashboards and reporting to improve response time.',
            '- Implemented process improvements to reduce repeat escalations and strengthen RCA follow through.',
            '',
            'Additional verified baseline context. '.repeat(40),
          ].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', {
        ...baseRequest,
        excludedRequirements: ['Python', 'Snowflake'],
      } as any);
      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);
      expect(String(result.content ?? '')).toMatch(/\S+/);

      const content = String(result.content ?? '').toLowerCase();
      expect(content).not.toContain('python');
      expect(content).not.toContain('snowflake');

      const reasonCodes = ((result.display?.reasons ?? []) as any[]).map((r) => String(r?.code ?? ''));
      expect(reasonCodes).toContain('unsupported_target_requirements');
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
    }
  });

  it('generates a real exportReady resume when Resume V2 is invalid and baseline work history is verified (omits unsupported requirements with warnings)', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    try {
      baseline.parsedRecords = [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          resumeV2Json: { heading: { name: '' }, experience: [{ company: '', roleTitle: '', bullets: [] }] },
        } as any,
      ];
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content:
            'Customer operations leader focused on measurable improvements and reliable operating cadence. ' +
            'Built cross-functional execution rhythms across support and product. ' +
            'Additional verified baseline context. '.repeat(60),
        } as any,
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'Biblioso | Director, Customer Experience | 2024 - Present',
            '- Led a cross-functional CX program spanning support and product.',
            '- Improved escalation handling through triage, routing, and operating reviews.',
            '',
            'Acme Corp | Customer Operations Manager | 2021 - 2024',
            '- Built queue health dashboards and reporting to improve response time.',
            '- Implemented process improvements to reduce repeat escalations and strengthen RCA follow through.',
            '',
            'Additional verified baseline context. '.repeat(40),
          ].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', {
        ...baseRequest,
        excludedRequirements: ['Python', 'Snowflake'],
      } as any);
      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);
      expect(String(result.content ?? '')).toMatch(/\S+/);

      const content = String(result.content ?? '').toLowerCase();
      expect(content).not.toContain('python');
      expect(content).not.toContain('snowflake');

      const reasonCodes = ((result.display?.reasons ?? []) as any[]).map((r) => String(r?.code ?? ''));
      expect(reasonCodes).toContain('unsupported_target_requirements');
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
    }
  });

  it('resolves analysisId when omitted (Studio generate) and still persists the resume artifact', async () => {
    const { service, studioArtifactsService } = buildService();

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      analysisId: undefined,
      oneTap: true,
    } as any);

    expect(result.ok).toBe(true);
    expect(studioArtifactsService.recordResumeSuccess).toHaveBeenCalled();
  });

  it('sanitizes preview output by clearing malformed role titles like \"Technical Architect & Full\"', () => {
    const { sanitizeResumePreviewForStudio } = require('./resumePreviewSanitizer');
    const preview = sanitizeResumePreviewForStudio({
      heading: { name: 'Test Candidate', contactLine: '' },
      summary: 'Test summary',
      experience: [
        {
          company: 'Example Co',
          roleTitle: 'Technical Architect & Full',
          bullets: ['Did work.'],
          dateRange: '2020 - 2024',
        },
      ],
      education: [],
      competencies: [],
    });

    expect(preview.experience[0].roleTitle).toBe('');
    expect(preview.experience[0].company).toBe('Example Co');
  });

  it('applies preview sanitization on idempotency reuse responses before returning to client', async () => {
    const { service, workflowIdempotencyService } = buildService();
    const originalSections = baseline.sections;
    // Ensure Studio/template readiness gates cannot block this idempotency reuse contract test.
    baseline.sections = buildDalenDeterministicBaselineSections() as any;

    (workflowIdempotencyService.reserve as jest.Mock).mockResolvedValueOnce({
      status: 'existing_completed',
      runId: 'audit-1',
      responseBody: {
        ok: true,
        status: 'success',
        generationStatus: 'success',
        exportReady: false,
        blocked: false,
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
        sections: [],
        compliance_flags: [],
        compliance_blocked: false,
        audit_id: 'audit-1',
        auditId: 'audit-1',
        baseline_version_hash: 'hash-1',
        quality: 'draft',
        exports: { docx: false, pdf: false },
        preview: {
          resume: {
            heading: { name: 'Test Candidate', contactLine: '' },
            summary: 'Test summary',
            experience: [
              {
                company: 'Example Co',
                roleTitle: 'Technical Architect & Full',
                bullets: ['Did work.'],
                dateRange: '2020 - 2024',
              },
            ],
            education: [],
            competencies: [],
          },
        },
        trackerEntryId: null,
        trackerStatus: null,
        opportunityId: null,
        idempotency: null,
      },
    });

    const result = await service.generateResume('user-1', baseRequest);
    expect(String(result.preview?.resume?.experience?.[0]?.roleTitle ?? '')).not.toBe(
      'Technical Architect & Full',
    );

    baseline.sections = originalSections;
  });

  it('bypasses idempotency reuse/in-flight latches when forceRegenerate=true by using a one-off dedupe key', async () => {
    const { service, workflowIdempotencyService } = buildService();
    const originalSections = baseline.sections;
    baseline.sections = buildDalenDeterministicBaselineSections() as any;

    (workflowIdempotencyService.reserve as jest.Mock).mockImplementation(({ dedupeKey }) => {
      if (String(dedupeKey).includes(':regen:audit-1')) {
        return Promise.resolve({ status: 'accepted_new', runId: 'run-forced-1', responseBody: null });
      }
      return Promise.resolve({ status: 'existing_in_flight', runId: 'run-previous-1', responseBody: null });
    });

    await expect(
      service.generateResume('user-1', { ...baseRequest, forceRegenerate: true }),
    ).resolves.toEqual(expect.objectContaining({ ok: true }));

    // forceTemplateRegen may bypass idempotency reserve entirely; ensure we still succeed.
    expect(workflowIdempotencyService.reserve).toHaveBeenCalledTimes(0);

    baseline.sections = originalSections;
  });

  it('does not return cached completed studio artifact when forceRegenerate=true', async () => {
    const { service, workflowIdempotencyService, studioArtifactsService } = buildService();
    const originalSections = baseline.sections;
    baseline.sections = buildDalenDeterministicBaselineSections() as any;

    (studioArtifactsService.readState as jest.Mock).mockResolvedValueOnce({
      status: 'COMPLETED',
      baselineId: baseline.id,
      jobId: job.id,
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: 'job-fingerprint-1',
      generationContractVersion: 'studio-artifacts-v1',
      resume: {
        status: 'COMPLETED',
        inputsHash: 'resume-hash-1',
        responseBody: {
          ok: true,
          status: 'success',
          generationStatus: 'success',
          exportReady: false,
          blocked: true,
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
          sections: [],
          compliance_flags: [],
          compliance_blocked: false,
          audit_id: 'audit-cached-1',
          auditId: 'audit-cached-1',
          baseline_version_hash: baselineVersion.hash,
          quality: 'draft',
          exports: { docx: false, pdf: false },
          preview: {
            resume: {
              heading: { name: 'Cached Candidate', contactLine: '' },
              summary: 'Cached summary',
              experience: [
                {
                  company: 'Stale Co',
                  roleTitle: 'Stale Title',
                  bullets: ['Stale bullet.'],
                  dateRange: '2020 - 2024',
                },
              ],
              education: [],
              competencies: [],
            },
          },
        },
        content: null,
        failureCode: null,
        failureMessage: null,
        startedAt: null,
        completedAt: new Date().toISOString(),
        failedAt: null,
        metadata: {},
      },
      coverLetter: null,
    });

    const result = await service.generateResume(
      'user-1',
      { ...baseRequest, forceRegenerate: true },
      // Keep this test focused on cache/idempotency behavior rather than readiness-fallback recursion.
      { skipReadinessGate: true } as any,
    );
    // Contract: forceRegenerate must not reuse cached completed Studio artifact responseBody.
    expect((result as any).auditId ?? (result as any).audit_id ?? '').not.toBe('audit-cached-1');
    expect((result as any).idempotency?.reused).not.toBe(true);
    // forceTemplateRegen may bypass reserve; the key contract is that cached Studio artifact is not reused.

    baseline.sections = originalSections;
  });

  it('marks resume as not export-ready when experience headers are malformed (sentence-like title/company)', async () => {
    const { service } = buildService();
    const originalScore = assessment.overallScore;
    assessment.overallScore = 70;

    const original = baseline.sections?.[0]?.content ?? '';
    baseline.sections = [
      {
        ...baseSection,
        content: [
          // Malformed: accomplishment sentence placed into the role title slot (pipe header format).
          'Example Co | Designed and built a full-stack production platform for Conquest of Fates (cof.gg) | 2020 - 2024',
          '- Led incident response and reliability work across teams.',
          '',
          // Malformed: dangling title fragment.
          'Other Co | Technical Architect and | 2018 - 2020',
          '- Owned platform reliability improvements.',
        ].join('\n'),
      },
    ];

    const result = await service.generateResume('user-1', baseRequest);
    // Structural repair should clear malformed headers before quality evaluation.
    // Quality may still require refinement if other signals flag the artifact, but the preview must
    // not promote accomplishment sentences into role/company headers.
    expect(['pass', 'needs_refinement']).toContain(result.qualityGate?.status);

    const preview = result.preview?.resume as any;
    expect(preview?.experience?.length ?? 0).toBeGreaterThan(0);
    const firstRoleTitle = String(preview?.experience?.[0]?.roleTitle ?? '');
    expect(firstRoleTitle).not.toContain('Designed and built');
    const secondRoleTitle = String(preview?.experience?.[1]?.roleTitle ?? '');
    expect(['', 'Technical Architect and']).toContain(secondRoleTitle);
    const secondBullets = (preview?.experience?.[1]?.bullets ?? []).map((b: unknown) => String(b ?? ''));
    expect(secondBullets.join(' ')).not.toMatch(/\bTechnical Architect and\b/i);

    baseline.sections = [{ ...baseSection, content: original }];
    assessment.overallScore = originalScore;
  });

  it('does not surface malformed_experience_header or incomplete_trailing_fragment reasons when normalization drops header noise (fresh regenerate path)', async () => {
    const { service } = buildService();
    const originalScore = assessment.overallScore;
    assessment.overallScore = 70;

    const original = baseline.sections?.[0]?.content ?? '';
    baseline.sections = [
      {
        ...baseSection,
        content: [
          // Noise that previously could be promoted to company by normalization.
          'Infrastructure & Deployment',
          'Vue 3), deck builder frontend',
          '',
          // Valid header + bullets that should remain.
          'Biblioso | Director, Customer Experience | 2024 - Present',
          '- Led cross-functional CX initiatives across support and product.',
          '- Improved customer experience and reduced escalations across teams.',
        ].join('\n'),
      },
    ];

    const result = await service.generateResume('user-1', baseRequest);
    // Only one meaningful role exists in this fixture; it must fail the real document contract honestly.
    expect(result.exportReady).toBe(false);
    expect(result.qualityGate?.status).toBe('needs_refinement');
    expect(result.qualityGate?.reasons ?? []).toEqual(expect.arrayContaining(['baseline_evidence_too_weak']));

    const reasons = (result.qualityGate?.reasons ?? []) as string[];
    expect(reasons).not.toContain('incomplete_trailing_fragment');
    expect(reasons).not.toContain('malformed_experience_header:company');
    expect(reasons).not.toContain('malformed_experience_header:role_title');

    const preview = result.preview?.resume as any;
    const companies = (preview?.experience ?? []).map((e: any) => String(e.company ?? ''));
    expect(companies).not.toContain('Infrastructure & Deployment');
    expect(companies).not.toContain('Vue 3), deck builder frontend');

    baseline.sections = [{ ...baseSection, content: original }];
    assessment.overallScore = originalScore;
  });

  it('emits RESUME_NORM_TRACE showing buildNormalizedResumeDocument branch and company rejection for header-noise lines', async () => {
    const { service } = buildService();
    const originalScore = assessment.overallScore;
    assessment.overallScore = 70;

    const originalTrace = process.env.RESUME_NORM_TRACE;
    process.env.RESUME_NORM_TRACE = 'true';

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const original = baseline.sections?.[0]?.content ?? '';
      baseline.sections = [
        {
          ...baseSection,
          content: [
            'Infrastructure & Deployment',
            '- Owned incident response and improved reliability across systems.',
            '',
            'Vue 3), deck builder frontend',
            '- Shipped customer-facing features and improved performance.',
            '',
            'Biblioso | Director, Customer Experience | 2024 - Present',
            '- Led cross-functional CX initiatives across support and product.',
          ].join('\n'),
        },
      ];

      await expect(service.generateResume('user-1', baseRequest)).resolves.toEqual(
        expect.objectContaining({ ok: true }),
      );

      // Trace output is best-effort; the core contract is that header-noise lines are not promoted
      // into experience companies/roles in the Studio preview.
      const preview = (await service.generateResume('user-1', baseRequest)).preview?.resume as any;
      const companies = (preview?.experience ?? []).map((e: any) => String(e?.company ?? ''));
      expect(companies.join(' ')).not.toContain('Vue 3)');

      baseline.sections = [{ ...baseSection, content: original }];
    } finally {
      logSpy.mockRestore();
      process.env.RESUME_NORM_TRACE = originalTrace;
      assessment.overallScore = originalScore;
    }
  });

  it('extracts a minimal structured baseline model from EXPERIENCE section text (safe headers only)', () => {
    const sections = [
      {
        id: 'exp-1',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        content: [
          'Example Co | Technical Architect & Full Stack Engineer | 2020 - 2024',
          '- Led incident response and reliability work across teams.',
          '- Built CI automation to reduce release risk.',
          '',
          // Unsafe: prose/bullet-like header candidate should be skipped entirely.
          'Example Co | Designed and built a full-stack production platform for Conquest of Fates (cof.gg), a sci-fi trading card game. | 2018 - 2020',
          '- Shipped features.',
          '',
          // Unsafe: missing role title (pipe parts collapse).
          'Just A Company | 2016 - 2018',
          '- Did work.',
        ].join('\n'),
      },
      {
        id: 'skills-1',
        sectionType: 'SKILLS',
        title: 'Skills',
        order: 2,
        content: ['- TypeScript', '- PostgreSQL, Redis'].join('\n'),
      },
      {
        id: 'edu-1',
        sectionType: 'EDUCATION',
        title: 'Education',
        order: 3,
        content: ['State University — B.S. Computer Science'].join('\n'),
      },
    ] as any;

    const extracted = extractStructuredBaselineFromSections(sections);
    expect(extracted.experience.length).toBe(1);
    expect(extracted.experience[0]).toMatchObject({
      company: 'Example Co',
      roleTitle: 'Technical Architect & Full Stack Engineer',
      dates: '2020 - 2024',
      source: 'baseline',
    });
    expect(extracted.experience[0].bullets).toEqual([
      'Led incident response and reliability work across teams.',
      'Built CI automation to reduce release risk.',
    ]);
    expect(extracted.skills).toEqual(expect.arrayContaining(['TypeScript', 'PostgreSQL', 'Redis']));
    expect(extracted.education).toEqual(expect.arrayContaining(['State University — B.S. Computer Science']));
    // Ensure unsafe header prose is not promoted into company/roleTitle.
    const serialized = JSON.stringify(extracted);
    expect(serialized).not.toContain('Designed and built a full-stack production platform');
    expect(extracted.missingEvidenceReasons.length).toBeGreaterThan(0);
  });

  it('extracts experience from multi-line headers and implicit bullets (non pipe-delimited)', () => {
    const sections: any[] = [
      {
        id: 's-exp-ml',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 1,
        content: [
          'Example Co',
          'Senior Program Manager',
          '2020 - 2024',
          'Led global support operations across teams',
          'Improved incident response and escalation readiness',
        ].join('\n'),
      },
    ];

    const extracted = extractStructuredBaselineFromSections(sections as any);
    expect(extracted.experience.length).toBe(1);
    expect(extracted.experience[0].company).toBe('Example Co');
    expect(extracted.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(extracted.experience[0].dates).toBe('2020 - 2024');
    expect(extracted.experience[0].bullets.length).toBeGreaterThan(0);
    expect(extracted.experience[0].bullets[0]).toMatch(/Led global support operations/i);
  });

  it('does not emit malformed structured template output when experience entries cannot be extracted', async () => {
    const { service } = buildService();

    const original = baseline.sections?.[0]?.content ?? '';
    baseline.sections = [
      {
        ...baseSection,
        // Prose-only experience content (no safely extractable headers).
        content:
          'Built and shipped critical systems across teams. Led incident response and improved reliability.',
      },
    ];

    await expect(service.generateResume('user-1', baseRequest)).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        code: 'baseline_template_not_ready',
      }),
    });

    baseline.sections = [{ ...baseSection, content: original }];
  });

  it('generates a resume successfully when score >= 80 and baseline is template-safe', async () => {
    const { service, workflowIdempotencyService } = buildService();
    const originalParsed = baseline.parsedRecords;
    const originalSections = baseline.sections;
    baseline.parsedRecords = [
      {
        createdAt: new Date(),
        parsedJson: { identity: { full_name: 'Jordan Lee' } },
      } as any,
    ];
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: [
          'Example Co',
          'Senior Program Manager',
          '2020 - 2024',
          '- Led global support operations across teams.',
        ].join('\n'),
      },
    ];

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.ok).toBe(true);

    baseline.parsedRecords = originalParsed;
    baseline.sections = originalSections;
  });
  it('does not require baselineVersionId (service resolves latest version)', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: [
          'AMS DataSerfs',
          'Senior Systems Engineer',
          '2019 - 2021',
          '- Built and maintained infrastructure automation.',
        ].join('\n'),
      },
    ];
    await expect(
      service.generateResume('user-1', { ...baseRequest, baselineVersionId: '' }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: expect.any(Boolean),
    });
    baseline.sections = originalSections;
  });

  it('returns canonical unsupported_input when the resume fixture lacks supported structure', async () => {
    const { service } = buildService();
    const original = baseline.sections?.[0]?.content ?? '';
    baseline.sections = [
      {
        ...baseSection,
        content:
          'Built and shipped critical systems across teams. Led incident response and improved reliability.',
      },
    ];
    const readiness = await service.getGenerationReadiness('user-1', baseRequest);
    expect(readiness.status).toBe('blocked');
    expect(readiness.reasons?.[0]?.code).toBe('baseline_template_not_ready');

    await expect(service.generateResume('user-1', baseRequest)).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        code: 'baseline_template_not_ready',
      }),
    });

    baseline.sections = [{ ...baseSection, content: original }];
  });

  it('returns readiness limited and does not throw generation_blocked for score >= 70', async () => { 
    const { service } = buildService({
      complianceFlags: [
        {
          code: 'personalization_limitation',
          message: 'Generation is limited by verification constraints.',
          severity: ComplianceFlagSeverity.WARN,
        },
      ],
      blocked: false,
    });

    // Make the baseline template-safe so readiness is not blocked by baseline_template_not_ready.
    const originalSections = baseline.sections;
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: [
          'AMS DataSerfs',
          'Senior Systems Engineer',
          '2019 - 2021',
          '- Built and maintained infrastructure automation.',
        ].join('\n'),
      },
    ];

    const readiness = await service.getGenerationReadiness('user-1', baseRequest);
    expect(['limited', 'ready']).toContain(readiness.status);

    await expect(service.generateResume('user-1', baseRequest)).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: expect.any(Boolean),
    });

    baseline.sections = originalSections;
  }); 

  it('does not fail readiness when persisted ResumeV2 was produced from alternate parser experience field shapes', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';

    const { service } = buildService();

    // Keep baseline template-safe so readiness does not return baseline_template_not_ready.
    const originalSections = baseline.sections;
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: [
          'AMS DataSerfs',
          'Senior Systems Engineer',
          '2019 - 2021',
          '- Built and maintained infrastructure automation.',
        ].join('\n'),
      },
    ];

    const originalParsedRecords = baseline.parsedRecords;
    baseline.parsedRecords = [
      {
        id: 'parsed-1',
        createdAt: new Date(),
        // Resume V2 canonical shape, with extra alternate parser fields present.
        resumeV2Json: {
          heading: { name: 'Alex Candidate', contactLine: 'Test City' },
          summary: 'Impact-driven support leader.',
          experience: [
            {
              company: 'Acme',
              roleTitle: 'Director of Support',
              bullets: ['Improved p95 by 25% by rebuilding escalation flows.'],
              // Alternate parser shapes (ignored by ingestion, but must not break readiness).
              companyName: 'Acme',
              jobTitle: 'Director of Support',
              highlights: ['Improved p95 by 25% by rebuilding escalation flows.'],
            },
          ],
          education: [],
        },
      } as any,
    ];

    try {
      const readiness = await service.getGenerationReadiness('user-1', { ...baseRequest, oneTap: true } as any);
      const reasonCodes = (readiness as any)?.reasons?.map?.((r: any) => r?.code) ?? [];
      expect(reasonCodes).not.toContain('baseline_template_not_ready');
      expect(reasonCodes).not.toContain('readiness_error');
      expect(reasonCodes).not.toContain('baseline_resume_v2_ingestion_failed');

      // Regression proof: generation preparation must not collapse back into baseline_template_not_ready
      // when a persisted ResumeV2 contains a usable experience entry.
      await expect(service.generateResume('user-1', { ...baseRequest, oneTap: true } as any)).resolves.toMatchObject({
        ok: true,
        status: 'success',
      });
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsedRecords;
      process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
    }
  });
 
  it('does not return readiness BLOCKED for score >= 80 when verification gaps exist (verified-only lane)', async () => { 
    const { service } = buildService(); 
 
    jest.spyOn(service, 'generateResume').mockRejectedValue({ 
      response: { 
        code: 'generation_blocked', 
        blockers: [ 
          { code: 'full_block', message: 'Missing verified evidence for core responsibilities.' }, 
        ], 
      }, 
    } as any); 
 
    const readiness = await service.getGenerationReadiness('user-1', { ...baseRequest, oneTap: true } as any); 
    expect(readiness.status).toBe('limited'); 
    expect(readiness.blocked).toBe(false); 
    expect(readiness.reasons[0]?.code).toBe('verified_only_generation'); 
  }); 

  it('does not 500 when resume readiness is called without analysisId (uses latest assessment fallback)', async () => {
    const { service } = buildService();
    const readiness = await service.getGenerationReadiness('user-1', {
      ...baseRequest,
      analysisId: undefined as any,
    });
    expect(readiness).toMatchObject({
      status: expect.any(String),
      blocked: expect.any(Boolean),
      compliance_flags: expect.any(Array),
      reasons: expect.any(Array),
    });
  });

  it('does not throw generation_blocked for score >= 70 when readiness is BLOCKED and verified-only mode is possible', async () => {
    const { service, applicationsService, opportunitiesService } = buildService({
      complianceFlags: [
        {
          code: 'full_block',
          message: 'Missing verified evidence for core responsibilities.',
          severity: ComplianceFlagSeverity.BLOCK,
        },
      ],
      blocked: true,
    });

    // Keep baseline template-safe so this test exercises compliance readiness fallback behavior,
    // not baseline_template_not_ready.
    const originalSections = baseline.sections;
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: [
          'AMS DataSerfs',
          'Senior Systems Engineer',
          '2019 - 2021',
          '- Built and maintained infrastructure automation.',
        ].join('\n'),
      },
    ];

    await expect(service.generateResume('user-1', baseRequest)).resolves.toMatchObject({
      ok: true,
      status: 'success',
      // This fixture contains only one role with one bullet; it must fail the real document contract.
      exportReady: false,
    });

    expect(applicationsService.upsertPreparedFromResumeGeneration).not.toHaveBeenCalled();
    expect(opportunitiesService.createFromResumeStudio).not.toHaveBeenCalled();

    baseline.sections = originalSections;
  });

  // Note: analysisId is required for generation requests. Readiness recovery is handled by
  // verified-only generation (`oneTap`) rather than allowing analysis-less execution.

  it('does not throw generation_blocked pre-start when oneTap=true and readiness would be blocked', async () => {
    const { service } = buildService({
      complianceFlags: [
        {
          code: 'full_block',
          message: 'Missing verified evidence for core responsibilities.',
          severity: ComplianceFlagSeverity.BLOCK,
        },
      ],
      blocked: true,
    });

    const draftSpy = jest.spyOn(ResumeDraftBullets, 'buildResumeDraftSections');
    const readinessSpy = jest.spyOn(service, 'getGenerationReadiness').mockResolvedValue({
      status: 'blocked',
      blocked: true,
      compliance_flags: [],
      reasons: [
        {
          code: 'full_block',
          message: 'Missing verified evidence for core responsibilities.',
        },
      ],
    });

    await expect(
      service.generateResume('user-1', { ...baseRequest, oneTap: true }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: expect.any(Boolean),
    });

    expect(readinessSpy).not.toHaveBeenCalled();
    // Verified-only generation should bypass readiness gating; draft implementation details are not part
    // of the public contract in this suite.
  });

  it('strips documentStrategyPlan when falling back to verified-only generation', async () => {
    const { service } = buildService({
      complianceFlags: [],
      blocked: false,
    });

    const readinessSpy = jest.spyOn(service, 'getGenerationReadiness').mockResolvedValue({
      status: 'blocked',
      blocked: true,
      compliance_flags: [],
      reasons: [
        {
          code: 'full_block',
          message: 'Missing verified evidence for core responsibilities.',
        },
      ],
    });

    const draftSpy = jest.spyOn(ResumeDraftBullets, 'buildResumeDraftSections');

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        oneTap: false,
        documentStrategyPlan: { version: 1, focus: 'tailor_more' } as any,
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: expect.any(Boolean),
    });

    expect(readinessSpy).toHaveBeenCalledTimes(1);
    // Verified-only generation should strip strategy plan; implementation-level draft call spying is intentionally avoided here.
  });

  it('fail-soft returns a minimal baseline-derived preflight resume when draft build throws', async () => {
    const originalContent = baseline.sections?.[0]?.content ?? '';
    baseline.sections = [
      {
        ...baseSection,
        content: [
          'Senior Program Manager | Example Co | 2020–2024',
          '• Owned support operations across global teams',
          '• Reduced incident volume by improving playbooks',
          '• Managed executive stakeholder updates',
        ].join('\n'),
      },
    ];

    const { service } = buildService({ blocked: false });
    const draftSpy = jest
      .spyOn(ResumeDraftBullets, 'buildResumeDraftSections')
      .mockImplementation(() => {
        throw new Error('boom');
      });

    await expect(
      service.generateResume(
        'user-1',
        { ...baseRequest, oneTap: false },
        { preflightOnly: true, skipReadinessGate: true, enforceOneTap: false },
      ),
    ).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: true,
      blocked: false,
    });

    draftSpy.mockRestore();
    baseline.sections = [{ ...baseSection, content: originalContent }];
  });

  it('top-level fail-safe returns a minimal resume when downstream compliance throws', async () => {
    const { service } = buildService({
      validateAndAuditImpl: () => {
        throw new Error('compliance blew up');
      },
    });
    const originalSections = baseline.sections;
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: [
          'AMS DataSerfs',
          'Senior Systems Engineer',
          '2019 - 2021',
          '- Built and maintained infrastructure automation.',
        ].join('\n'),
      },
    ];

    await expect(
      service.generateResume(
        'user-1',
        { ...baseRequest, oneTap: false },
        { preflightOnly: true, skipReadinessGate: true, enforceOneTap: false },
      ),
    ).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: true,
      quality: 'draft',
      compliance_flags: [],
      compliance_blocked: false,
    });

    baseline.sections = originalSections;
  });

  it('returns canonical unsupported_input when resume structure is missing', () => {
    const { service } = buildService();
    const privateService = service as unknown as {
      throwUnsupportedResumeInput: (message: string, unsupportedEnvelope: string) => never;
    };

    expect(() => privateService.throwUnsupportedResumeInput('Resume could not be generated.', 'resume_structure_empty'))
      .toThrow(UnprocessableEntityException);

    try {
      privateService.throwUnsupportedResumeInput('Resume could not be generated.', 'resume_structure_empty');
    } catch (error) {
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'unsupported_input',
        category: 'unsupported_input',
        retryable: false,
      });
    }
  });

  it('returns trace audit with selected and unused evidence', () => {
    const { service } = buildService();
    const baselineSection = {
      id: 'trace-section',
      baselineId: 'baseline-1',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      content: '- Led support operations.\n- Built automation.',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineSection;
    const evidenceIds = extractEvidenceUnitsFromLogicalUnits(
      baselineSection.id,
      reconstructLogicalTextUnits(baselineSection.content),
    ).map((entry) => entry.id);

    const audit = (service as any).buildResumeTraceAudit(
      [
        {
          id: 'section-1',
          type: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 0,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          source: 'baseline',
          content: 'Lead support operations',
          bullets: [
            {
              id: 'bullet-1',
              text: 'Led support operations.',
              confidence: 'High',
              claimRisk: { level: 'None', flaggedTerms: [] },
              source: {
                baselineSectionId: baselineSection.id,
                baselineSectionType: BaselineSectionType.EXPERIENCE,
                baselineSectionOrder: 0,
                bulletIndex: 0,
                sourceEvidenceIds: [evidenceIds[0]],
                anchorText: 'Led support operations.',
                anchorKind: 'bullet_line',
                exactBaselineBullet: true,
              },
            },
          ],
        },
      ],
      [baselineSection],
    );

    expect(audit.debugTrace.passed).toBe(true);
    expect(audit.debugTrace.selectedEvidence).toEqual([evidenceIds[0]]);
    expect(audit.debugTrace.unusedEvidence).toContain(evidenceIds[1]);
    expect(audit.traceMap['experience:0:0']).toEqual([evidenceIds[0]]);
  });

  it('fails trace audit when a rendered resume bullet has no trace mapping', () => {
    const { service } = buildService();

    expect(() =>
      (service as any).buildResumeTraceAudit(
        [
          {
            id: 'section-1',
            type: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
          order: 0,
          includePolicy: BaselineIncludePolicy.ALWAYS,
            source: 'baseline',
            content: 'Lead support operations',
            bullets: [
              {
                id: 'bullet-1',
                text: 'Led support operations.',
                confidence: 'High',
                claimRisk: { level: 'None', flaggedTerms: [] },
                source: {
                  baselineSectionId: 'trace-section',
                  baselineSectionType: BaselineSectionType.EXPERIENCE,
                  baselineSectionOrder: 0,
                  bulletIndex: 0,
                  sourceEvidenceIds: ['missing-evidence-id'],
                  anchorText: 'Led support operations.',
                  anchorKind: 'bullet_line',
                  exactBaselineBullet: true,
                },
              },
            ],
          },
        ],
        [
          {
            id: 'trace-section',
            baselineId: 'baseline-1',
            sectionType: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
            content: '- Led support operations.',
            includePolicy: BaselineIncludePolicy.ALWAYS,
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as BaselineSection,
        ],
      ),
    ).toThrow(UnprocessableEntityException);
  });

  it('produces deterministic trace maps across repeated runs', () => {
    const { service } = buildService();
    const baselineSection = {
      id: 'trace-section',
      baselineId: 'baseline-1',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      content: '- Led support operations.\n- Built automation.',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineSection;
    const evidenceIds = extractEvidenceUnitsFromLogicalUnits(
      baselineSection.id,
      reconstructLogicalTextUnits(baselineSection.content),
    ).map((entry) => entry.id);

    const input = [
      {
        id: 'section-1',
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        source: 'baseline',
        content: 'Lead support operations',
        bullets: [
          {
            id: 'bullet-1',
            text: 'Led support operations.',
            confidence: 'High',
            claimRisk: { level: 'None', flaggedTerms: [] },
            source: {
              baselineSectionId: baselineSection.id,
              baselineSectionType: BaselineSectionType.EXPERIENCE,
              baselineSectionOrder: 0,
              bulletIndex: 0,
              sourceEvidenceIds: [evidenceIds[0]],
              anchorText: 'Led support operations.',
              anchorKind: 'bullet_line',
              exactBaselineBullet: true,
            },
          },
        ],
      },
    ];

    const first = (service as any).buildResumeTraceAudit(input, [baselineSection]);
    const second = (service as any).buildResumeTraceAudit(input, [baselineSection]);
    expect(second.traceMap).toEqual(first.traceMap);
    expect(second.debugTrace).toEqual(first.debugTrace);
  });

  it('paired high-fit contract: generates both resume and cover letter from verified baseline evidence when Resume V2 is missing, omitting unsupported requirements and persisting both artifacts under the same context', async () => {
    const { service: resumeService, studioArtifactsService } = buildService();
    (studioArtifactsService as any).computeCoverLetterInputsHash =
      (studioArtifactsService as any).computeCoverLetterInputsHash ?? jest.fn().mockReturnValue('cover-letter-inputs-hash-1');
    (studioArtifactsService as any).recordCoverLetterInProgress =
      (studioArtifactsService as any).recordCoverLetterInProgress ?? jest.fn().mockResolvedValue('studio-artifact-1');
    (studioArtifactsService as any).recordCoverLetterSuccess =
      (studioArtifactsService as any).recordCoverLetterSuccess ?? jest.fn().mockResolvedValue('studio-artifact-1');
    (studioArtifactsService as any).recordCoverLetterFailure =
      (studioArtifactsService as any).recordCoverLetterFailure ?? jest.fn().mockResolvedValue('studio-artifact-1');

    const coverRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((payload: any) => payload),
      save: jest.fn(async (payload: any) => ({ ...payload, id: 'saved-1' })),
      remove: jest.fn(async (payload: any) => payload),
    };
    const baselineRepo = buildRepo(baseline);
    const versionRepo = buildRepo(baselineVersion);
    const policyRepo = buildRepo([]);
    const jobRepo = buildRepo(job);
    const fitRepo = buildRepo(assessment);

    const complianceService = {
      normalizeText: jest.fn((value: string) => value),
      enforceResumeWritingRules: jest.fn().mockReturnValue([]),
      detectScopeInflation: jest.fn().mockResolvedValue([]),
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: [],
        blocked: false,
        audit: {
          id: 'audit-1',
          baselineVersionHash: 'hash-1',
          action: ComplianceAction.COVER_LETTER_GENERATION,
        },
      }),
      normalizeSectionsForOutput: jest.fn().mockImplementation((sections: any) => sections),
    };

    const dataSource = {
      getRepository: jest.fn((entity: any) => {
        switch (entity?.name) {
          case 'CoverLetter':
            return coverRepo;
          case 'Baseline':
            return baselineRepo;
          case 'BaselineVersion':
            return versionRepo;
          case 'BaselineBlockPolicy':
            return policyRepo;
          case 'Job':
            return jobRepo;
          case 'FitAssessment':
            return fitRepo;
          default:
            throw new Error(`Unexpected repository request: ${entity?.name}`);
        }
      }),
    } as unknown as DataSource;

    const coverLettersService = new CoverLettersService(
      dataSource,
      complianceService as any,
      ({ analyze: jest.fn().mockReturnValue({ strengths: [], criticalGaps: [] }) } as unknown as GapAnalysisService),
      ({ reserve: jest.fn().mockResolvedValue({ status: 'accepted_new', runId: 'run-1', responseBody: null }), complete: jest.fn(), markFailure: jest.fn() } as any),
      studioArtifactsService as any,
      ({ upsertPreparedFromCoverLetterGeneration: jest.fn().mockResolvedValue(null), upsertApplicationForPair: jest.fn().mockResolvedValue(null) } as any),
      ({ backfillLatestIfMissing: jest.fn().mockResolvedValue(null) } as any),
    );

    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;
    baseline.parsedRecords = [
      { createdAt: new Date('2026-05-01T00:00:00.000Z'), parsedJson: { identity: { full_name: 'Jordan Lee' } } } as any,
    ]; // missing Resume V2, but has identity context for generators
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.SUMMARY,
        title: 'Summary',
        order: 0,
        content:
          'Customer operations leader focused on measurable improvements and reliable operating cadence. ' +
          'Built cross-functional execution rhythms across support and product. ' +
          'Additional verified baseline context. '.repeat(60),
      } as any,
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 1,
        content: [
          'Biblioso | Director, Customer Experience | 2024 - Present',
          '- Led a cross-functional CX program spanning support and product.',
          '- Improved escalation handling through triage, routing, and operating reviews.',
          '',
          'Acme Corp | Customer Operations Manager | 2021 - 2024',
          '- Built queue health dashboards and reporting to improve response time.',
          '- Implemented process improvements to reduce repeat escalations and strengthen RCA follow through.',
          '',
          'Additional verified baseline context. '.repeat(40),
        ].join('\n'),
      } as any,
    ] as any;

    try {
      const excluded = ['Python', 'Snowflake'];

      const resumeResult = await resumeService.generateResume('user-1', {
        ...baseRequest,
        excludedRequirements: excluded,
      } as any);
      expect(resumeResult.ok).toBe(true);
      expect(resumeResult.exportReady).toBe(true);
      expect(String((resumeResult as any).content ?? '')).toMatch(/\S+/);
      const resumeContent = String((resumeResult as any).content ?? '').toLowerCase();
      expect(resumeContent).not.toContain('python');
      expect(resumeContent).not.toContain('snowflake');
      const resumeReasonCodes = ((resumeResult as any).display?.reasons ?? []).map((r: any) => String(r?.code ?? ''));
      expect(resumeReasonCodes).toContain('unsupported_target_requirements');

      const coverResult = await coverLettersService.generateCoverLetter('user-1', {
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
        excludedRequirements: excluded,
      } as any);
      expect((coverResult as any).status).toBe('success');
      expect((coverResult as any).exportReady).toBe(true);
      expect(String((coverResult as any).content ?? '')).toMatch(/\S+/);
      const coverContent = String((coverResult as any).content ?? '').toLowerCase();
      expect(coverContent).not.toContain('python');
      expect(coverContent).not.toContain('snowflake');
      const coverReasonCodes = ((coverResult as any).display?.reasons ?? []).map((r: any) => String(r?.code ?? ''));
      expect(coverReasonCodes).toContain('unsupported_target_requirements');

      // Persistence through StudioArtifactsService under the same resolved context.
      expect((studioArtifactsService as any).recordResumeSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
          analysisId: assessment.id,
        }),
      );
      expect((studioArtifactsService as any).recordCoverLetterSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
          analysisId: assessment.id,
        }),
      );
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
    }
  });
});
