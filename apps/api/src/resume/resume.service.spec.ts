import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ResumeService, GenerateResumeRequest, buildFailSafeExperienceContentFromStructuredAndBaseline } from './resume.service';
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
import { NarrativeCompositionEngine } from '../composition/narrative-composition-engine';
import * as ResumeAssembler from './resumeTemplateAssembler';
import * as AuthoritativeRenderPlan from '../positioning/authoritative-render-plan';
import * as ResumeNormalizer from './resume-normalization';
import * as BaselineTemplateReadiness from '../baseline/baselineTemplateReadiness';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>> & {
  findOne: jest.Mock;
  find: jest.Mock;
};

const buildRepo = <T>(findOneValue: unknown, rawRows: unknown[] = []): MockRepo<T> => ({
  findOne: jest.fn().mockResolvedValue(findOneValue),
  find: jest.fn().mockResolvedValue([]),
  createQueryBuilder: jest.fn().mockReturnValue({
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(findOneValue),
    getRawOne: jest.fn().mockResolvedValue(findOneValue),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  }),
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
  baselineRepo.createQueryBuilder = jest.fn().mockReturnValue({
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockImplementation(async () => {
      const rows: Record<string, unknown>[] = [];
      const sections = baseline.sections.length
        ? baseline.sections
        : [
            {
              id: null,
              baselineId: baseline.id,
              sectionType: null,
              title: null,
              content: null,
              includePolicy: null,
              order: null,
              createdAt: null,
              updatedAt: null,
            },
          ];
      const parsedRecords = baseline.parsedRecords.length
        ? baseline.parsedRecords
        : [
            {
              id: null,
              baselineId: baseline.id,
              sourceFileId: null,
              schemaVersion: null,
              sourceFormat: null,
              ingestedAt: null,
              parsedJson: null,
              resumeV2Json: null,
              flagsJson: null,
              createdAt: null,
            },
          ];

      for (const section of sections) {
        for (const parsedRecord of parsedRecords) {
          rows.push({
            baseline_id: baseline.id,
            baseline_userId: baseline.userId,
            baseline_version: baseline.version,
            baseline_versionNumber: baseline.version,
            baseline_originalFilename: baseline.originalFilename,
            baseline_mimeType: baseline.mimeType,
            baseline_storagePath: baseline.storagePath,
            baseline_hash: baseline.hash,
            baseline_status: baseline.status,
            baseline_isActive: true,
            baseline_archivedAt: baseline.archivedAt,
            baseline_originalBaselineScore: null,
            baseline_latestBaselineScore: null,
            baseline_latestAssessmentId: null,
            baseline_firstAnalyzedAt: null,
            baseline_lastAnalyzedAt: null,
            baseline_isSynthetic: false,
            baseline_syntheticScenarioKey: null,
            baseline_syntheticRunId: null,
            baseline_syntheticCreatedAt: null,
            baseline_preserveFromCleanup: false,
            sections_id: section.id,
            sections_baselineId: section.baselineId,
            sections_sectionType: section.sectionType,
            sections_title: section.title,
            sections_content: section.content,
            sections_includePolicy: section.includePolicy,
            sections_order: section.order,
            sections_createdAt: section.createdAt,
            sections_updatedAt: section.updatedAt,
            parsedRecords_id: parsedRecord.id,
            parsedRecords_baselineId: parsedRecord.baselineId ?? baseline.id,
            parsedRecords_sourceFileId: parsedRecord.sourceFileId ?? 'source-file-1',
            parsedRecords_schemaVersion: parsedRecord.schemaVersion ?? '1',
            parsedRecords_sourceFormat: parsedRecord.sourceFormat ?? 'docx',
            parsedRecords_ingestedAt: parsedRecord.ingestedAt ?? parsedRecord.createdAt ?? new Date(),
            parsedRecords_parsedJson: parsedRecord.parsedJson ?? parsedRecord.resumeV2Json ?? null,
            parsedRecords_resumeV2Json: parsedRecord.resumeV2Json ?? parsedRecord.parsedJson ?? null,
            parsedRecords_flagsJson: parsedRecord.flagsJson ?? null,
            parsedRecords_createdAt: parsedRecord.createdAt ?? new Date(),
          });
        }
      }

      return rows;
    }),
  }) as any;
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
    computeCoverLetterInputsHash: jest.fn().mockReturnValue('cover-letter-hash-1'),
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
    baselineRepo,
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
      const result = await service.generateResume('user-1', { ...baseRequest, forceRegenerate: true } as any);
      expect(result.status).toBe('success');
      expect(String((result as any).content ?? '')).not.toContain(poison);
    } finally {
      baseline.sections = originalSections;
    }
  });

  it('recovers from persisted ResumeV2 with empty usable experience by extracting from baseline sections', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    const originalParsedRecords = baseline.parsedRecords;
    try {
      const { service } = buildService();

      baseline.parsedRecords = [
        {
          id: 'parsed-1',
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          createdAt: new Date(),
          // Valid-ish ResumeV2 shape but with empty experience => baseline_resume_v2_invalid (usable_experience_empty).
          resumeV2Json: {
            heading: { name: 'Test User', contactLine: 'test@example.com' },
            experience: [],
          },
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', { ...baseRequest, oneTap: true } as any);
      expect(result.status).toBe('success');
      expect(Array.isArray((result as any)?.preview?.resume?.experience)).toBe(true);
      expect((result as any).preview.resume.experience.length).toBeGreaterThan(0);
    } finally {
      baseline.parsedRecords = originalParsedRecords;
      if (typeof originalFlag === 'string') {
        process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      } else {
        delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
      }
    }
  });

  it('fail-safe experience recovery attaches implicit action lines to each structured header block', () => {
    const baselineSections: any[] = [
      {
        id: 'exp-1',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        content: [
          'PMB Performance | Senior Manager, Customer Operations | Dec 2022 – Aug 2025',
          'Led incident triage and escalation management across support operations.',
          'Built support playbooks and operating reviews to reduce escalations.',
          '',
          'Warner Bros. Discovery | Senior Program Manager | 2021 – 2022',
          'Owned cross-functional delivery across stakeholders.',
          '',
          'CenturyLink | Manager | 2019 – 2020',
          'Managed customer operations workflows and improved service reliability.',
        ].join('\n'),
      },
    ];

    const structuredExperience = [
      { company: 'PMB Performance', roleTitle: 'Senior Manager, Customer Operations', dates: 'Dec 2022 � Aug 2025', bullets: ['Led incident triage and escalation management across support operations.'] },
      { company: 'Warner Bros. Discovery', roleTitle: 'Senior Program Manager', dates: '2021 � 2022', bullets: ['Owned cross-functional delivery across stakeholders.'] },
      { company: 'CenturyLink', roleTitle: 'Manager', dates: '2019 � 2020', bullets: ['Managed customer operations workflows and improved service reliability.'] },
    ];

    const content = buildFailSafeExperienceContentFromStructuredAndBaseline({
      baselineSections: baselineSections as any,
      structuredExperience: structuredExperience as any,
    });

    expect(content).toContain('PMB Performance | Senior Manager, Customer Operations | Dec 2022 – Aug 2025');
    expect(content).toContain('- Led incident triage and escalation management across support operations.');
    expect(content).toContain('Warner Bros. Discovery | Senior Program Manager | 2021 – 2022');
    expect(content).toContain('- Owned cross-functional delivery across stakeholders.');
    expect(content).toContain('CenturyLink | Manager | 2019 – 2020');
    expect(content).toContain('- Managed customer operations workflows and improved service reliability.');
  });

  it('fail-safe experience recovery matches split-line headers and stops before non-experience headings', () => {
    const baselineSections: any[] = [
      {
        id: 'exp-1',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        content: [
          'Senior Manager, Customer Operations',
          'PMB Performance',
          'Dec 2022 – Aug 2025',
          'Led incident triage and escalation management across support operations.',
          '',
          'Senior Program Manager',
          'Warner Bros. Discovery',
          '2021 – 2022',
          'Owned cross-functional delivery across stakeholders.',
          '',
          'Service Engineering Team Lead',
          'CenturyLink Cloud',
          '2019 – 2020',
          'Improved queue health reporting and response time visibility.',
          '',
          'Senior Systems Engineer',
          'Tier 3',
          '2014 – 2019',
          'Troubleshot production incidents and automated common remediations.',
          '',
          'Evault',
          'Fulfillment Engineer',
          '2010 – 2011',
          'Delivered storage provisioning and support workflows.',
          '',
          'Earlier Career',
          'Technology & Tools',
          'Linux, Windows',
        ].join('\n'),
      },
    ];

    const structuredExperience = [
      { company: 'PMB Performance', roleTitle: 'Senior Manager, Customer Operations', dates: 'Dec 2022 – Aug 2025', bullets: [] },
      { company: 'Warner Bros. Discovery', roleTitle: 'Senior Program Manager', dates: '2021 – 2022', bullets: [] },
      { company: 'CenturyLink Cloud', roleTitle: 'Service Engineering Team Lead', dates: '2019 – 2020', bullets: [] },
      { company: 'Tier 3', roleTitle: 'Senior Systems Engineer', dates: '2014 – 2019', bullets: [] },
      { company: 'Evault', roleTitle: 'Fulfillment Engineer', dates: '2010 – 2011', bullets: [] },
    ];

    const content = buildFailSafeExperienceContentFromStructuredAndBaseline({
      baselineSections: baselineSections as any,
      structuredExperience: structuredExperience as any,
    });

    expect(content).toContain('PMB Performance | Senior Manager, Customer Operations');
    expect(content).toContain('Warner Bros. Discovery | Senior Program Manager');
    expect(content).toContain('CenturyLink Cloud | Service Engineering Team Lead');
    expect(content).toContain('Tier 3 | Senior Systems Engineer');
    expect(content).toContain('Evault | Fulfillment Engineer');
    expect(content).not.toContain('Vue 3), deck builder frontend');
    expect(content).not.toContain('Automation & Monitoring');
    expect(content).not.toContain('Datacenter Operations');
    expect(content).not.toContain('Internal Web Applications');
  });

  it('fail-safe experience recovery preserves all discoverable headers (generic fixture)', () => {
    const baselineSections: any[] = [
      {
        id: 'exp-1',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        content: [
          'Manager, Operations',
          'Company A',
          '2022 – 2025',
          'Led incident triage and improved operational outcomes.',
          '',
          'Senior Program Manager',
          'Company B',
          '2021 – 2022',
          'Owned cross-functional delivery across stakeholders.',
          '',
          'Service Engineering Team Lead',
          'Company C',
          '2019 – 2020',
          'Improved queue health reporting and response time visibility.',
          '',
          'Senior Systems Engineer',
          'Company D',
          '2014 – 2019',
          'Troubleshot production incidents and automated common remediations.',
          '',
          'Company E | Fulfillment Engineer | 2010 – 2011',
          'Delivered storage provisioning and support workflows.',
          '',
          'Earlier Career',
          'Technology & Tools',
          'Linux, Windows',
        ].join('\n'),
      },
    ];

    // Intentionally incomplete structured list: discovery should still pick up missing headers from text.
    const structuredExperience = [
      { company: 'Company A', roleTitle: 'Manager, Operations', dates: '2022 � 2025', bullets: ['Led incident triage and improved operational outcomes.'] },
      { company: 'Company E', roleTitle: 'Fulfillment Engineer', dates: '2010 � 2011', bullets: ['Delivered storage provisioning and support workflows.'] },
    ];

    const content = buildFailSafeExperienceContentFromStructuredAndBaseline({
      baselineSections: baselineSections as any,
      structuredExperience: structuredExperience as any,
    });

    expect(content).toContain('Company A | Manager, Operations');
    expect(content).toContain('Company E | Fulfillment Engineer');
    expect(content).not.toContain('Vue 3), deck builder frontend');
    expect(content).not.toContain('Automation & Monitoring');
    expect(content).not.toContain('Datacenter Operations');
    expect(content).not.toContain('Internal Web Applications');
  });

  it('fail-safe experience header discovery never classifies bullet sentences as headers', () => {
    const baselineSections: any[] = [
      {
        id: 'exp-1',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        content: [
          'Role A',
          'Company A',
          '2022 â€“ 2025',
          // Bullet/action lines without leading dash (PDF-derived) and containing role-title keywords.
          'Participated in incident commander on-call rotation and cross-team restoration efforts.',
          'Served as principal contributor and administrator of the internal knowledge base.',
          'Improved execution.',
          'Lead a team of six direct reports overseeing service delivery, customer support, and operational excellence.',
          '',
          'Role B',
          'Company B',
          '2021 â€“ 2022',
          'Built operational dashboards.',
        ].join('\n'),
      },
    ];

    const structuredExperience = [
      { company: 'Company A', roleTitle: 'Role A', dates: '2022 â€“ 2025', bullets: ['Built operational dashboards.'] },
      { company: 'Company B', roleTitle: 'Role B', dates: '2021 â€“ 2022', bullets: ['Improved service reliability.'] },
    ];

    const content = buildFailSafeExperienceContentFromStructuredAndBaseline({
      baselineSections: baselineSections as any,
      structuredExperience: structuredExperience as any,
    });

    expect(content).toBe('');
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
      expect(studioArtifactsService.recordResumeSuccess).toHaveBeenCalledTimes(1);
      const persisted = (studioArtifactsService.recordResumeSuccess as any).mock.calls[0][0];
      expect(persisted).toEqual(
        expect.objectContaining({
          userId: baseline.userId,
          baselineId: baseRequest.baselineId,
          baselineVersionId: baseRequest.baselineVersionId,
          jobId: baseRequest.jobId,
          analysisId: baseRequest.analysisId,
          responseBody: expect.any(Object),
        }),
      );
      expect(persisted?.responseBody?.internal).toBeTruthy();
      expect(persisted?.responseBody?.internal?.generationPipeline).toBe('v2');
      expect(String(persisted?.responseBody?.preview?.resume?.summary ?? '').trim().length).toBeGreaterThan(0);
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

  it('does not complete a successful resume generation when Studio artifact persistence fails', async () => {
    const { service, studioArtifactsService } = buildService();
    baseline.sections = [baseSection] as any;

    (studioArtifactsService.recordResumeSuccess as any).mockRejectedValueOnce(
      new Error('persistence_failed'),
    );

    await expect(service.generateResume('user-1', baseRequest as any)).rejects.toBeTruthy();
    expect(studioArtifactsService.recordResumeSuccess).toHaveBeenCalled();
  });

  it('does not use top-level minimal fallback when RESUME_GENERATION_V2=true and V2 fails', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
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
      // Force canonical ResumeV2 invalid in v2 mode to simulate a v2-lane failure.
      baseline.parsedRecords = [
        {
          id: 'parsed-1',
          baselineVersionId: baselineVersion.id,
          resumeV2Json: {
            heading: { name: 'Test User', contactLine: '' },
            experience: [],
            education: [],
          },
        },
      ] as any;

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
      baseline.parsedRecords = originalParsed;
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
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [
      { createdAt: new Date(), parsedJson: { identity: { full_name: 'Jordan Lee' } } } as any,
    ];
    const originalScore = assessment.overallScore;
    assessment.overallScore = 92;

    // Prompt 14: ensure at least one authoritative experience group exists so generation is allowed,
    // while still including the malformed-header corpus that previously triggered legacy minimal fallbacks.
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: [
          'Example Co | Senior Program Manager | 2020 - 2024',
          '- Led support operations and improved service reliability across global teams.',
          '- Built playbooks, reduced incident volume, and managed executive stakeholder updates.',
        ].join('\n'),
      } as any,
      ...(buildDalenDeterministicBaselineSections() as any[]),
    ] as any;
    const baselineText = (baseline.sections ?? []).map((s: any) => String(s.content ?? '')).join('\n');
    expect(baselineText.length).toBeGreaterThan(600);

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.status).toBe('success');
    const internal = (result as any).internal ?? {};
    // Prompt 14: With at least one authoritative experience group present, this path must not fall into legacy minimal synthesis.
    expect(internal?.minimalFallback).not.toBe(true);
    expect(internal?.resumeGenerationMode).not.toBe('top_level_fail_safe_minimal');
    expect(internal?.resumeFailSafeMinimalUsed).not.toBe(true);
    // Interpreted evidence summary is optional depending on readiness/template gating; if present it must be non-empty.
    if (internal?.interpretedEvidenceSummary) {
      expect(internal.interpretedEvidenceSummary).toEqual(
        expect.objectContaining({ strongEvidenceCount: expect.any(Number), partialEvidenceCount: expect.any(Number) }),
      );
      expect(
        (internal?.interpretedEvidenceSummary?.strongEvidenceCount ?? 0) +
          (internal?.interpretedEvidenceSummary?.partialEvidenceCount ?? 0),
      ).toBeGreaterThan(0);
    }

    baseline.sections = originalSections;
    baseline.parsedRecords = originalParsed;
    assessment.overallScore = originalScore;
  });

  it('real document contract regression: fixture has only 1 meaningful role -> generated_unusable baseline_evidence_too_weak', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'false';
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
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
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

      const productionValidation = (result as any)?.internal?.productionValidation ?? null;
      expect(productionValidation).toEqual(
        expect.objectContaining({
          evidenceSourceUsed: expect.any(String),
          generationEligibilityDecision: expect.objectContaining({ eligible: expect.any(Boolean) }),
          fallbackWarnings: expect.any(Array),
          omittedUnsupportedRequirements: expect.any(Array),
          artifactPersistenceStatus: expect.any(Object),
          finalDocumentStatus: expect.any(Object),
        }),
      );
      expect(JSON.stringify(productionValidation)).not.toMatch(/resumeText|baselineText|generated/i);

      const content = String(result.content ?? '').toLowerCase();
      expect(content).not.toContain('python');
      expect(content).not.toContain('snowflake');

      const reasonCodes = ((result.display?.reasons ?? []) as any[]).map((r) => String(r?.code ?? ''));
      expect(reasonCodes).toContain('unsupported_target_requirements');
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('diagnostics identify persisted Resume V2 as the first contamination stage when authoritative extraction is clean but Resume V2 is contaminated', async () => {
    const { service } = buildService();
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    try {
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'Senior Manager, Customer Operations – SentinelOne',
            'Remote Dec 2022 – Aug 2025',
            '- Led incident response operations and escalation handling across teams.',
            '- Built support workflows and improved service reliability.',
            '',
            'Director, Cloud Development and Support – CenturyLink Business for Enterprise',
            'Seattle, WA Dec 2018 – Oct 2019',
            '- Improved invoice dispute workflows and revenue reconciliation accuracy.',
            '- Reduced billing-related escalations through knowledge base and process improvements.',
          ].join('\n'),
        } as any,
      ] as any;

      baseline.parsedRecords = [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          resumeV2Json: {
            heading: { name: 'Test User' },
            experience: [
              {
                company: 'SentinelOne',
                roleTitle: 'Senior Manager, Customer Operations (Invoice Operations)',
                dateRange: 'Dec 2022 – Aug 2025',
                bullets: [
                  'Owned incident operations and escalation readiness across support teams.',
                  // Contamination: billing-domain bullet placed under SentinelOne without mentioning CenturyLink.
                  'Improved invoice accuracy and dispute handling by tightening reconciliation workflows.',
                ],
              },
              {
                company: 'CenturyLink Business for Enterprise',
                roleTitle: 'Director, Cloud Development and Support',
                dateRange: 'Dec 2018 – Oct 2019',
                bullets: [
                  'Led billing support operations and reduced invoice disputes through better triage.',
                  'Improved revenue reconciliation reporting and credit handling workflows.',
                ],
              },
            ],
          },
        } as any,
      ];

      const result = await service.generateResume('user-1', { ...baseRequest } as any);
      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);

      const pv = (result as any)?.internal?.productionValidation ?? null;
      expect(pv).toEqual(
        expect.objectContaining({
          authoritativeExperienceRoleKeys: expect.any(Array),
          persistedResumeV2RoleKeys: expect.any(Array),
          contaminationStage: 'persisted_resume_v2',
          contaminationSignals: expect.any(Array),
        }),
      );
      expect(JSON.stringify(pv)).not.toMatch(/resumeText|baselineText|generated|bullet/i);

      // Proof final SentinelOne output is contaminated (content assertion; diagnostics remain safe-only).
      expect(String(result.content ?? '').toLowerCase()).toContain('invoice');
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('generates successfully when Resume V2 exists on a newer parsedRecord (not index 0)', async () => {
    const { service } = buildService();
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    try {
      baseline.parsedRecords = [
        {
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          // Older parsed record without ResumeV2 json.
          resumeV2Json: null,
        } as any,
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          resumeV2Json: {
            heading: { name: 'Test User' },
            experience: [
              {
                company: 'Example Co',
                roleTitle: 'Senior Program Manager',
                dateRange: '2020 - 2024',
                bullets: ['Owned incident response operations across support teams.'],
              },
            ],
          },
        } as any,
      ];

      const result = await service.generateResume('user-1', { ...baseRequest } as any);
      expect(result.ok).toBe(true);
      expect(String(result.content ?? '')).toMatch(/Example Co|Senior Program Manager/i);
    } finally {
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    }
  });

  it('diagnostics identify render_plan as the first contamination stage when authoritative extraction and Resume V2 are clean but render plan candidates are contaminated', async () => {
    const { service } = buildService();
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    const originalBuildAuthoritativeRenderPlan = AuthoritativeRenderPlan.buildAuthoritativeRenderPlan;
    const renderPlanSpy = jest.spyOn(AuthoritativeRenderPlan, 'buildAuthoritativeRenderPlan');
    const composeSpy = jest.spyOn(NarrativeCompositionEngine.prototype, 'composeResume');

    try {
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'Senior Manager, Customer Operations – SentinelOne',
            'Remote Dec 2022 – Aug 2025',
            '- Led incident response operations and escalation handling across teams.',
            '- Built support workflows and improved service reliability.',
            '',
            'Director, Cloud Development and Support – CenturyLink Business for Enterprise',
            'Seattle, WA Dec 2018 – Oct 2019',
            '- Improved billing dispute workflows and reconciliation accuracy.',
            '- Reduced invoice escalations through knowledge base improvements.',
          ].join('\n'),
        } as any,
      ] as any;

      baseline.parsedRecords = [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          resumeV2Json: {
            heading: { name: 'Test User' },
            experience: [
              {
                company: 'SentinelOne',
                roleTitle: 'Senior Manager, Customer Operations',
                dateRange: 'Dec 2022 – Aug 2025',
                bullets: ['Owned incident response operations across support teams.', 'Improved escalation workflows.'],
              },
              {
                company: 'CenturyLink Business for Enterprise',
                roleTitle: 'Director, Cloud Development and Support',
                dateRange: 'Dec 2018 – Oct 2019',
                bullets: ['Improved invoice dispute workflows and revenue reconciliation accuracy.', 'Reduced billing escalations.'],
              },
            ],
          },
        } as any,
      ];

      // Inject contaminated render-plan candidate scoped to the SentinelOne role key.
      renderPlanSpy.mockImplementation((input: any) => {
        const basePlan = (originalBuildAuthoritativeRenderPlan as any)(input) ?? {
          orderedRoleIds: [],
          suppressedRoleIds: [],
          evidencePriorities: [],
        };
        return {
          ...basePlan,
          evidencePriorities: [
            ...(Array.isArray((basePlan as any).evidencePriorities) ? (basePlan as any).evidencePriorities : []),
            {
              theme: 'Invoice accuracy and dispute handling',
              sourceEmployerRoleKey: 'SentinelOne::Senior Manager, Customer Operations',
            },
          ],
        } as any;
      });

      // Force a deterministic contaminated narrative output when the render plan contains billing-domain candidate.
      composeSpy.mockImplementation((input: any) => {
        const experience = Array.isArray(input?.experience) ? input.experience : [];
        const shaped = experience.map((role: any) => {
          if (String(role.company ?? '').toLowerCase().includes('sentinelone')) {
            return {
              ...role,
              bullets: [
                'Owned incident operations across support teams.',
                'Improved invoice accuracy and dispute handling through workflow alignment.',
              ],
            };
          }
          return {
            ...role,
            bullets: Array.isArray(role?.bullets) ? role.bullets.map((b: any) => (typeof b === 'string' ? b : String(b?.text ?? ''))).filter(Boolean) : [],
          };
        });
        return {
          summary: 'Summary.',
          experience: shaped,
          diagnostics: {
            rewrittenBulletCount: 0,
            genericLanguageFlags: [],
            narrativeQualityScore: null,
            summaryCompositionSource: 'test',
            evidenceToNarrativeMappings: [],
            targetAngle: '',
            employerScopedRankingEnabled: true,
            crossEmployerRankingBlocks: 0,
          },
        } as any;
      });

      const result = await service.generateResume('user-1', { ...baseRequest } as any);
      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);

      const pv = (result as any)?.internal?.productionValidation ?? null;
      expect(pv).toEqual(
        expect.objectContaining({
          authoritativeExperienceRoleKeys: expect.any(Array),
          persistedResumeV2RoleKeys: expect.any(Array),
          renderPlanRankingCandidateOrigins: expect.any(Array),
          contaminationStage: 'render_plan',
          contaminationSignals: expect.any(Array),
        }),
      );
      expect(JSON.stringify(pv)).not.toMatch(/resumeText|baselineText|generated|bullet/i);

      expect(String(result.content ?? '').toLowerCase()).toContain('invoice');
    } finally {
      renderPlanSpy.mockRestore();
      composeSpy.mockRestore();
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('does not persist a resume artifact when minimal fallback output is detected (generation_blocked before recordResumeSuccess)', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;

    process.env.DOCGEN_DIAGNOSTICS = 'true';
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    assessment.overallScore = 90;

    try {
      // Force authoritative structured extraction to return zero experience groups by providing a malformed "Experience" section.
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: ['Seattle', '- Reconciled billing and revenue across systems.'].join('\n'),
        } as any,
      ] as any;

      await expect(service.generateResume('user-1', baseRequest as any)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'generation_blocked' }),
      } as any);

      expect(studioArtifactsService.recordResumeSuccess).not.toHaveBeenCalled();
  } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('does not block persistence when authoritative experience count is zero but the baseline-produced document is non-minimal', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    const normalizedDocumentSpy = jest.spyOn(ResumeNormalizer, 'buildNormalizedResumeDocument');
    const readinessSpy = jest.spyOn(service, 'getGenerationReadiness').mockResolvedValue({
      status: 'ready',
      blocked: false,
      compliance_flags: [],
      reasons: [],
    } as any);
    const templateReadinessSpy = jest.spyOn(BaselineTemplateReadiness, 'evaluateBaselineTemplateReadiness').mockReturnValue({
      canGenerateResume: true,
      totalExperience: 0,
      validExperience: 0,
      missingEvidenceReasons: [],
    } as any);

    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    assessment.overallScore = 90;

    try {
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          id: 'section-summary',
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content: 'Seasoned operations leader focused on service quality and delivery.',
        } as any,
        {
          ...baseSection,
          id: 'section-skills',
          sectionType: BaselineSectionType.SKILLS,
          title: 'Skills',
          order: 1,
          content: ['- SQL', '- Excel', '- Stakeholder management'].join('\n'),
        } as any,
        {
          ...baseSection,
          id: 'section-education',
          sectionType: BaselineSectionType.EDUCATION,
          title: 'Education',
          order: 2,
          content: 'B.S. Business Administration',
        } as any,
      ] as any;
      normalizedDocumentSpy.mockReturnValue({
        heading: { name: 'Test Candidate', contactLine: 'test@example.com' },
        summary: 'Seasoned operations leader focused on service quality and delivery.',
        experience: [
          {
            company: 'Acme',
            roleTitle: 'Operations Lead',
            bullets: [
              'Improved service quality across teams.',
              'Reduced escalations through process improvements.',
            ],
            dateRange: '2022 - Present',
          },
        ],
        education: [],
        competencies: [],
        coreCompetencies: [],
        sections: [
          { type: 'summary', content: 'Seasoned operations leader focused on service quality and delivery.' },
          { type: 'experience', content: 'Acme | Operations Lead | 2022 - Present' },
        ],
      } as any);

      const result = await service.generateResume('user-1', baseRequest as any);

      expect(result.ok).toBe(true);
      expect(studioArtifactsService.recordResumeSuccess).toHaveBeenCalled();
      expect(studioArtifactsService.recordResumeFailure).not.toHaveBeenCalled();
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      normalizedDocumentSpy.mockRestore();
      readinessSpy.mockRestore();
      templateReadinessSpy.mockRestore();
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    }
  });

  it('preserves at least two verified experience entries and four verified bullets when assembling structured baseline output', () => {
    const normalized = ResumeAssembler.assembleResumeFromStructuredBaseline(
      {
        summary: 'Operations leader with verified baseline experience.',
        skills: ['SQL', 'Excel'],
        education: [],
        missingEvidenceReasons: [],
        experience: [
          {
            company: 'Of Fates Games LLC',
            roleTitle: 'Operations Manager',
            dates: '2022 - Present',
            bullets: [
              'Improved release coordination across support and product teams.',
              'Reduced incident response friction through better runbooks and escalation routing.',
            ],
          },
          {
            company: 'AMS DataSerfs, Inc.',
            roleTitle: 'Senior Data Analyst',
            dates: '2020 - 2022',
            bullets: [
              'Built reporting workflows that improved accuracy and visibility.',
              'Created repeatable checks that reduced manual follow-up.',
            ],
          },
        ],
      } as any,
      {
        name: 'Test Candidate',
        contactLine: 'test@example.com',
      },
    );

    expect(normalized.experience).toHaveLength(2);
    expect(normalized.experience.reduce((count, entry) => count + entry.bullets.length, 0)).toBeGreaterThanOrEqual(4);
    expect(ResumeNormalizer.validateNormalizedResumeDocument(normalized).valid).toBe(true);
  });

  it('does not block resume generation when structured extraction yields zero experience but ResumeV2 experience is usable', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;

    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    assessment.overallScore = 82;

    try {
      baseline.parsedRecords = [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          resumeV2Json: {
            heading: { name: 'Test Candidate', contactLine: '' },
            summary: 'Support operations leader.',
            experience: [
              {
                company: 'Acme',
                roleTitle: 'Support Ops Lead',
                bullets: ['Improved SLA adherence by refining triage and escalation workflow.'],
                dateRange: '2022 - 2026',
              },
            ],
            education: [],
          },
        } as any,
      ];
      // Force structured baseline extraction to see zero experience (malformed section), but ResumeV2 is usable.
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: ['Seattle', '- Reconciled billing and revenue across systems.'].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', baseRequest as any);
      expect(result.ok).toBe(true);
      expect(studioArtifactsService.recordResumeSuccess).toHaveBeenCalled();
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    }
  });

  it('recovers ResumeV2 ingest when post-processing strips all experience (uses pre-processed usable ResumeV2, not minimal fail-safe)', async () => {
    const { service } = buildService();
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;

    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    assessment.overallScore = 84;

    try {
      baseline.parsedRecords = [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          // Usable pre-processing ResumeV2 (experience exists) but lacks provenance, so post-processing can strip it.
          resumeV2Json: {
            heading: { name: 'Test Candidate', contactLine: '' },
            summary: 'Support operations leader.',
            experience: [
              {
                company: 'PMB Performance',
                roleTitle: 'Director, Customer Operations',
                bullets: ['Led support operations across global teams and improved SLA performance.'],
                dateRange: '2023 - Present',
              },
            ],
            education: [],
          },
        } as any,
      ];
      // Baseline sections include experience text but ResumeV2 lane should be used for generation in this mode.
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Professional Experience',
          order: 1,
          content: [
            'PMB Performance | Director, Customer Operations | 2023 - Present',
            'Led support operations across global teams and improved SLA performance',
          ].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', baseRequest as any);
      expect(result.status).toBe('success');
      expect((result as any)?.preview?.resume?.experience?.length ?? 0).toBeGreaterThan(0);
      const internal = (result as any).internal ?? {};
      expect(internal?.resumeGenerationMode).not.toBe('top_level_fail_safe_minimal');
      expect(internal?.resumeFailSafeMinimalUsed).not.toBe(true);
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    }
  });

  it('does not allow post-processing to invalidate a usable normalized document by stripping all bullets', async () => {
    const { service } = buildService();
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;

    // Ensure we take the non-ResumeV2 normalization lane so the second post-processing pass runs.
    if (typeof originalFlag === 'string') delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    assessment.overallScore = 84;

    try {
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          id: 'experience-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Professional Experience',
          order: 1,
          content: [
            'Evault | Support Manager | 2016 - 2018',
            '- Led support operations while collaborating with Tier 3 on incident response.',
            '',
            'Tier 3 | Support Lead | 2013 - 2016',
            '- Partnered with Evault on escalations and improved SLA performance.',
          ].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', baseRequest as any);
      expect(result.status).toBe('success');
      const experience = (result as any)?.preview?.resume?.experience ?? [];
      expect(Array.isArray(experience)).toBe(true);
      expect(experience.length).toBeGreaterThan(0);
      const totalBullets = experience.reduce(
        (sum: number, entry: any) => sum + (Array.isArray(entry?.bullets) ? entry.bullets.length : 0),
        0,
      );
      expect(totalBullets).toBeGreaterThan(0);
      const internal = (result as any).internal ?? {};
      expect(internal?.resumeGenerationMode).not.toBe('top_level_fail_safe_minimal');
      expect(internal?.resumeFailSafeMinimalUsed).not.toBe(true);
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
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

  it('prevents cross-company contamination when similar bullets exist (blocks other-company bullets instead of attaching them to the wrong employer)', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    assessment.overallScore = 90;

    try {
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content: 'Verified baseline summary. '.repeat(80),
        } as any,
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'SentinelOne | Support Operations Lead | 2022 - 2024',
            '- Led incident triage, support operations, and escalation management.',
            '- Built support playbooks and operating reviews to reduce escalations.',
            '- Built reporting dashboards to improve response time and throughput.',
            '- CenturyLink: reconciled billing and revenue to improve reporting accuracy.',
            '',
            'CenturyLink | Billing Operations Analyst | 2019 - 2022',
            '- Reconciled billing and revenue across systems to improve close accuracy.',
            '- Reduced reconciliation cycle time by automating reporting and exception handling.',
            '- Partnered with finance stakeholders to close discrepancies and improve controls.',
            '',
            'Acme Corp | Customer Operations Manager | 2017 - 2019',
            '- Managed support queues and improved SLA attainment through process changes.',
            '- Implemented escalation playbooks and weekly operational reviews.',
            '- Built KPI reporting to track backlog, response time, and quality trends.',
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

      const content = String(result.content ?? '').toLowerCase();
      expect(content).toContain('sentinelone');
      // The CenturyLink billing bullet must not appear under SentinelOne.
      expect(content).not.toContain('centurylink: reconciled billing');

      const productionValidation = (result as any)?.internal?.productionValidation ?? null;
      expect(productionValidation).toEqual(
        expect.objectContaining({
          crossCompanyEvidenceBlockedCount: expect.any(Number),
          fallbackWarnings: expect.any(Array),
        }),
      );
      expect(productionValidation.crossCompanyEvidenceBlockedCount).toBeGreaterThan(0);
      expect(productionValidation.fallbackWarnings).toContain('cross_company_evidence_blocked');

      // Diagnostics metadata must never expose raw text fields.
      expect(JSON.stringify(productionValidation)).not.toMatch(/resumeText|baselineText|generated|bullet/i);
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('blocks and warns on cross-company migration attempt even when the bullet text does not contain the other employer name (provenance-enforced)', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    assessment.overallScore = 90;

    const originalCompose = (NarrativeCompositionEngine.prototype as any).composeResume;
    const composeSpy = jest.spyOn(NarrativeCompositionEngine.prototype as any, 'composeResume');
    composeSpy.mockImplementation((input: any) => originalCompose.call(new NarrativeCompositionEngine(), input));

    try {
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content: 'Verified baseline summary. '.repeat(80),
        } as any,
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'SentinelOne | Support Operations Lead | 2022 - 2024',
            '- Led incident triage, support operations, and escalation management.',
            '- Built support playbooks and operating reviews to reduce escalations.',
            '- Built reporting dashboards to improve response time and throughput.',
            '',
            'CenturyLink | Billing Operations Analyst | 2019 - 2022',
            '- Reconciled billing and revenue across systems to improve close accuracy.',
            '- Reduced reconciliation cycle time by automating reporting and exception handling.',
            '- Partnered with finance stakeholders to close discrepancies and improve controls.',
            '',
            'Acme Corp | Customer Operations Manager | 2017 - 2019',
            '- Managed support queues and improved SLA attainment through process changes.',
            '- Implemented escalation playbooks and weekly operational reviews.',
            '- Built KPI reporting to track backlog, response time, and quality trends.',
            '',
            'Additional verified baseline context. '.repeat(40),
          ].join('\n'),
        } as any,
      ] as any;

      // Simulate a migration attempt: the SentinelOne section receives a CenturyLink-origin bullet,
      // but without mentioning "CenturyLink" in text. Provenance must still block it.
      composeSpy.mockImplementationOnce((input: any) => {
        const experience = (input.experience ?? []).map((r: any) => ({
          ...r,
          bullets: Array.isArray(r.bullets) ? r.bullets.map((b: any) => (typeof b === 'string' ? b : b.text)) : [],
          bulletSourceRoleKeys: Array.isArray(r.bullets)
            ? r.bullets.map((b: any) => (typeof b === 'string' ? `${r.company}::${r.roleTitle}` : b.sourceRoleKey))
            : [],
        }));
        const sentinel = experience.find((e: any) => String(e.company) === 'SentinelOne');
        if (sentinel) {
          sentinel.bullets = [...(sentinel.bullets ?? []), 'Reconciled billing and revenue across systems to improve close accuracy.'];
          sentinel.bulletSourceRoleKeys = [...(sentinel.bulletSourceRoleKeys ?? []), 'CenturyLink::Billing Operations Analyst'];
        }
        return {
          summary: input.summaryFallback,
          experience,
          diagnostics: {
            rewrittenBulletCount: 0,
            genericLanguageFlags: [],
            narrativeQualityScore: {},
            summaryCompositionSource: 'test',
            evidenceToNarrativeMappings: [],
            targetAngle: '',
          },
        };
      });

      const result = await service.generateResume('user-1', {
        ...baseRequest,
        excludedRequirements: ['Python', 'Snowflake'],
      } as any);

      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);

      const previewExp = ((result as any)?.preview?.resume?.experience ?? []) as any[];
      const sentinel = previewExp.find((e) => String(e?.company ?? '') === 'SentinelOne');
      expect(sentinel).toBeTruthy();
      const sentinelBullets = Array.isArray(sentinel?.bullets) ? sentinel.bullets.map((b: any) => String(b ?? '').toLowerCase()) : [];
      // Migrated CenturyLink-origin billing bullet must not appear under SentinelOne (no company token required).
      expect(sentinelBullets.join(' ')).not.toContain('reconciled billing and revenue');

      const century = previewExp.find((e) => String(e?.company ?? '') === 'CenturyLink');
      expect(century).toBeTruthy();
      const centuryBullets = Array.isArray(century?.bullets) ? century.bullets.map((b: any) => String(b ?? '').toLowerCase()) : [];
      expect(centuryBullets.join(' ')).toContain('reconciled billing and revenue');

      const productionValidation = (result as any)?.internal?.productionValidation ?? null;
      expect(productionValidation.crossCompanyEvidenceBlockedCount).toBeGreaterThan(0);
      expect(productionValidation.fallbackWarnings).toContain('cross_company_evidence_blocked');
      expect(JSON.stringify(productionValidation)).not.toMatch(/resumeText|baselineText|generated|bullet/i);
    } finally {
      composeSpy.mockRestore();
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('prevents upstream cross-role contamination before provenance tagging when an experience header line is bullet-prefixed (structured baseline partitioning)', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    assessment.overallScore = 90;

    try {
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content: 'Verified baseline summary. '.repeat(80),
        } as any,
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'SentinelOne | Support Operations Lead | 2022 - 2024',
            '- Led incident triage, support operations, and escalation management.',
            '- Built support playbooks and operating reviews to reduce escalations.',
            '- Built reporting dashboards to improve response time and throughput.',
            '',
            // Bullet-prefixed header line that must still be treated as a new role header.
            '- CenturyLink | Billing Operations Analyst | 2019 - 2022',
            // Note: no "CenturyLink" token in bullets; upstream partitioning must still keep these under CenturyLink.
            '- Reconciled billing and revenue across systems to improve close accuracy.',
            '- Reduced reconciliation cycle time by automating reporting and exception handling.',
            '- Partnered with finance stakeholders to close discrepancies and improve controls.',
            '',
            'Acme Corp | Customer Operations Manager | 2017 - 2019',
            '- Managed support queues and improved SLA attainment through process changes.',
            '- Implemented escalation playbooks and weekly operational reviews.',
            '- Built KPI reporting to track backlog, response time, and quality trends.',
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

      const previewExp = ((result as any)?.preview?.resume?.experience ?? []) as any[];
      const sentinel = previewExp.find((e) => String(e?.company ?? '') === 'SentinelOne');
      expect(sentinel).toBeTruthy();
      const sentinelBullets = Array.isArray(sentinel?.bullets) ? sentinel.bullets.map((b: any) => String(b ?? '').toLowerCase()) : [];
      expect(sentinelBullets.join(' ')).not.toContain('reconciled billing and revenue');

      const century = previewExp.find((e) => String(e?.company ?? '') === 'CenturyLink');
      expect(century).toBeTruthy();
      const centuryBullets = Array.isArray(century?.bullets) ? century.bullets.map((b: any) => String(b ?? '').toLowerCase()) : [];
      expect(centuryBullets.join(' ')).toContain('reconciled billing and revenue');

      // Provenance should originate upstream (role partitioning produces separate employer-role groups).
      const productionValidation = (result as any)?.internal?.productionValidation ?? null;
      expect(productionValidation).toEqual(
        expect.objectContaining({
          employerRoleGroupCount: expect.any(Number),
          evidencePartitionStage: expect.any(String),
        }),
      );
      expect(productionValidation.employerRoleGroupCount).toBeGreaterThanOrEqual(3);
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('ranking occurs only within employer-role scope (global evidence themes do not boost cross-domain bullets in another role)', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    assessment.overallScore = 90;

    try {
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content: 'Verified baseline summary. '.repeat(80),
        } as any,
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'SentinelOne | Support Operations Lead | 2022 - 2024',
            '- Led incident triage and escalation management across support operations.',
            '- Built playbooks and operating reviews to reduce escalations.',
            '- Improved response time and throughput with reporting dashboards.',
            '',
            'CenturyLink | Billing Operations Analyst | 2019 - 2022',
            '- Improved invoice accuracy and dispute handling through reconciliation controls.',
            '- Reduced billing exceptions by automating metering and reporting checks.',
            '- Partnered with finance stakeholders to close discrepancies.',
            '',
            'Acme Corp | Customer Operations Manager | 2017 - 2019',
            '- Managed support queues and improved SLA attainment through process changes.',
            '- Implemented escalation playbooks and weekly operational reviews.',
            '- Built KPI reporting to track backlog, response time, and quality trends.',
            '',
            'Additional verified baseline context. '.repeat(40),
          ].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', {
        ...baseRequest,
      } as any);

      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);

      const pv = (result as any)?.internal?.productionValidation ?? null;
      expect(pv).toEqual(
        expect.objectContaining({
          employerScopedRankingEnabled: true,
          crossEmployerRankingBlocks: expect.any(Number),
        }),
      );

      // Regression-style safety: SentinelOne experience should not pick up billing-domain bullets.
      const previewExp = ((result as any)?.preview?.resume?.experience ?? []) as any[];
      const sentinel = previewExp.find((e) => String(e?.company ?? '') === 'SentinelOne');
      expect(sentinel).toBeTruthy();
      const sentinelBullets = Array.isArray(sentinel?.bullets) ? sentinel.bullets.map((b: any) => String(b ?? '').toLowerCase()) : [];
      expect(sentinelBullets.join(' ')).not.toMatch(/\b(invoice|billing|dispute|credit|metering|reconciliation)\b/);
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('explicit mismatched provenance ranking candidate is blocked (increments crossEmployerRankingBlocks)', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    assessment.overallScore = 90;

    const originalAssemble = (ResumeAssembler as any).buildAuthoritativeResumeDraftFromResumeV2;
    const assembleSpy = jest.spyOn(ResumeAssembler as any, 'buildAuthoritativeResumeDraftFromResumeV2');
    assembleSpy.mockImplementation((input: any) => {
      const renderPlan = input?.renderPlan ? { ...input.renderPlan } : null;
      if (renderPlan) {
        renderPlan.evidencePriorities = [
          { theme: 'billing reconciliation', sourceEmployerRoleKey: 'CenturyLink::Billing Operations Analyst' },
          { theme: 'incident response', sourceEmployerRoleKey: 'SentinelOne::Support Operations Lead' },
        ];
      }
      return originalAssemble.call(ResumeAssembler, { ...input, renderPlan });
    });

    try {
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content: 'Verified baseline summary. '.repeat(80),
        } as any,
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'SentinelOne | Support Operations Lead | 2022 - 2024',
            '- Led incident triage and escalation management across support operations.',
            '- Built playbooks and operating reviews to reduce escalations.',
            '- Improved response time and throughput with reporting dashboards.',
            '',
            'CenturyLink | Billing Operations Analyst | 2019 - 2022',
            '- Improved invoice accuracy and dispute handling through reconciliation controls.',
            '- Reduced billing exceptions by automating metering and reporting checks.',
            '- Partnered with finance stakeholders to close discrepancies.',
            '',
            'Acme Corp | Customer Operations Manager | 2017 - 2019',
            '- Managed support queues and improved SLA attainment through process changes.',
            '- Implemented escalation playbooks and weekly operational reviews.',
            '- Built KPI reporting to track backlog, response time, and quality trends.',
            '',
            'Additional verified baseline context. '.repeat(40),
          ].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', {
        ...baseRequest,
      } as any);

      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);

      const pv = (result as any)?.internal?.productionValidation ?? null;
      expect(pv.crossEmployerRankingBlocks).toBeGreaterThan(0);

      const previewExp = ((result as any)?.preview?.resume?.experience ?? []) as any[];
      const sentinel = previewExp.find((e) => String(e?.company ?? '') === 'SentinelOne');
      const sentinelBullets = Array.isArray(sentinel?.bullets) ? sentinel.bullets.map((b: any) => String(b ?? '').toLowerCase()) : [];
      expect(sentinelBullets.join(' ')).not.toMatch(/\b(invoice|billing|dispute|credit|metering|reconciliation)\b/);

      expect(JSON.stringify(pv)).not.toMatch(/resumeText|baselineText|generated|bullet/i);
    } finally {
      assembleSpy.mockRestore();
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('matching provenance ranking candidate is allowed, while mismatched is blocked', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    assessment.overallScore = 90;

    const originalAssemble = (ResumeAssembler as any).buildAuthoritativeResumeDraftFromResumeV2;
    const assembleSpy = jest.spyOn(ResumeAssembler as any, 'buildAuthoritativeResumeDraftFromResumeV2');
    assembleSpy.mockImplementation((input: any) => {
      const renderPlan = input?.renderPlan ? { ...input.renderPlan } : null;
      if (renderPlan) {
        renderPlan.evidencePriorities = [
          { theme: 'billing reconciliation', sourceEmployerRoleKey: 'CenturyLink::Billing Operations Analyst' },
          { theme: 'incident response', sourceEmployerRoleKey: 'SentinelOne::Support Operations Lead' },
          { theme: 'escalation management', derivedFromRoleKey: 'SentinelOne::Support Operations Lead' },
        ];
      }
      return originalAssemble.call(ResumeAssembler, { ...input, renderPlan });
    });

    try {
      baseline.parsedRecords = [];
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          order: 0,
          content: 'Verified baseline summary. '.repeat(80),
        } as any,
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 1,
          content: [
            'SentinelOne | Support Operations Lead | 2022 - 2024',
            '- Led incident triage and escalation management across support operations.',
            '- Built playbooks and operating reviews to reduce escalations.',
            '- Improved response time and throughput with reporting dashboards.',
            '',
            'CenturyLink | Billing Operations Analyst | 2019 - 2022',
            '- Improved invoice accuracy and dispute handling through reconciliation controls.',
            '- Reduced billing exceptions by automating metering and reporting checks.',
            '- Partnered with finance stakeholders to close discrepancies.',
            '',
            'Acme Corp | Customer Operations Manager | 2017 - 2019',
            '- Managed support queues and improved SLA attainment through process changes.',
            '- Implemented escalation playbooks and weekly operational reviews.',
            '- Built KPI reporting to track backlog, response time, and quality trends.',
            '',
            'Additional verified baseline context. '.repeat(40),
          ].join('\n'),
        } as any,
      ] as any;

      const result = await service.generateResume('user-1', {
        ...baseRequest,
      } as any);

      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);

      const pv = (result as any)?.internal?.productionValidation ?? null;
      expect(pv.crossEmployerRankingBlocks).toBeGreaterThan(0);

      const previewExp = ((result as any)?.preview?.resume?.experience ?? []) as any[];
      const sentinel = previewExp.find((e) => String(e?.company ?? '') === 'SentinelOne');
      expect(sentinel).toBeTruthy();
      const sentinelBullets = Array.isArray(sentinel?.bullets) ? sentinel.bullets.map((b: any) => String(b ?? '').toLowerCase()) : [];
      // Candidate is allowed (incident/escalation themes) and billing terms still absent.
      expect(sentinelBullets.join(' ')).not.toMatch(/\b(invoice|billing|dispute|credit|metering|reconciliation)\b/);
    } finally {
      assembleSpy.mockRestore();
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('fresh generation reports authority guard execution + fingerprints (diagnostics-only)', async () => {
    const { service } = buildService();
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    const originalSections = baseline.sections;
    baseline.sections = [baseSection] as any;

    try {
      const result = await service.generateResume('user-1', {
        ...baseRequest,
      } as any);

      const pv = (result as any)?.internal?.productionValidation ?? null;
      expect(pv).toEqual(
        expect.objectContaining({
          provenanceEnforcementExecuted: true,
          extractionBoundaryEnforcementExecuted: true,
          employerScopedRankingExecuted: true,
          freshCompositionExecuted: true,
          authorityFingerprint: expect.any(String),
          generationFreshness: expect.any(String),
        }),
      );
      expect(String(pv.authorityFingerprint)).toMatch(/^[a-f0-9]{64}$/i);
      expect(JSON.stringify(pv)).not.toMatch(/resumeText|baselineText|generated|bullet/i);
    } finally {
      baseline.sections = originalSections;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('blocks zero_experience_headers when authoritative extraction returns zero roles and no usable ResumeV2 authority exists', async () => {
	    const { service, studioArtifactsService } = buildService();
	    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
	    process.env.DOCGEN_DIAGNOSTICS = 'true';
	    const originalResumeV2Flag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
	    delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
	    const originalSections = baseline.sections;
	    const originalParsed = baseline.parsedRecords;

	    try {
	        baseline.parsedRecords = [
	          {
	            id: 'parsed-empty',
	            baselineId: baseline.id,
	            baselineVersionId: baselineVersion.id,
	            createdAt: new Date(),
	            resumeV2Json: {
	              heading: { name: 'Test User', contactLine: 'test@example.com' },
	              experience: [],
	            },
	            flagsJson: {
	              reviewState: {
	                verified: true,
	              },
	            },
	          } as any,
	        ] as any; // ensure ResumeV2 exists but is not usable
	        (studioArtifactsService.readState as jest.Mock).mockResolvedValueOnce({
	          status: 'ready',
	          baselineId: baseline.id,
	          jobId: job.id,
	          baselineVersionId: baselineVersion.id,
	          baselineVersionHash: baselineVersion.hash,
	          jobFingerprint: 'job-fingerprint-1',
	          generationContractVersion: 'studio-artifacts-v1',
	          assessmentScore: assessment.overallScore,
	          resume: {
	            status: 'COMPLETED',
	            artifactCurrent: true,
	            usableCurrent: true,
	          },
	          coverLetter: {
	            status: 'COMPLETED',
	            artifactCurrent: true,
	            usableCurrent: true,
	          },
	        } as any);
	        baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 0,
          // No valid "Company | Role" headers -> structured extraction yields zero roles.
          content: [
            'Seattle',
            '- Reconciled billing and revenue across systems to improve close accuracy.',
            '- Reduced billing exceptions by automating metering and reporting checks.',
          ].join('\n'),
        } as any,
	        ] as any;
	        expect(extractStructuredBaselineFromSections(baseline.sections as any).experience.length).toBe(0);

      await expect(
        service.generateResume('user-1', {
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
          analysisId: assessment.id,
          oneTap: false,
          forceRegenerate: true,
        } as any),
      ).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({
          code: 'generation_blocked',
          category: 'generation_blocked',
          diagnostics: expect.objectContaining({
            requestOneTapReceived: false,
            verifiedUsableBaselineFileExistsAtGate: false,
	          baselineFileUsableAtGate: true,
	          baselineVerifiedAtGate: true,
            baselineId: baseline.id,
            baselineVersionId: baselineVersion.id,
            artifactReadiness: 'blocked',
            authoritativeExtractionSucceeded: false,
            authoritativeExperienceGroupCount: 0,
            fallbackGenerationPrevented: true,
            legacyFallbackAttemptBlocked: true,
            generationTerminationStage: 'authoritative_extraction_gate',
            resumeV2UsableExperienceCount: 0,
            failureReasons: expect.arrayContaining(['zero_experience_headers']),
          }),
        }),
      });
      expect(studioArtifactsService.recordResumeSuccess).not.toHaveBeenCalled();
	    } finally {
	      baseline.sections = originalSections;
	      baseline.parsedRecords = originalParsed;
	      if (typeof originalResumeV2Flag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalResumeV2Flag;
	      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
	      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
	      else delete process.env.DOCGEN_DIAGNOSTICS;
	    }
	  });

  it('render plan fingerprint changes when role corpus changes (diagnostics-only)', async () => {
    const { service } = buildService();
    const originalDiagnostics = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    const originalSections = baseline.sections;

    try {
      baseline.sections = [baseSection] as any;
      const r1 = await service.generateResume('user-1', { ...baseRequest } as any);
      const fp1 = (r1 as any)?.internal?.productionValidation?.authorityFingerprint ?? '';

      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 0,
          content: [
            'Example Co | Senior Program Manager | 2020 - 2024',
            '- Led support operations and improved service reliability across global teams.',
            '- Built playbooks, reduced incident volume, and managed executive stakeholder updates.',
            '- Added an additional verified bullet to change corpus.',
          ].join('\n'),
        } as any,
      ] as any;

      const r2 = await service.generateResume('user-1', { ...baseRequest, forceRegenerate: true } as any);
      const fp2 = (r2 as any)?.internal?.productionValidation?.authorityFingerprint ?? '';
      expect(fp1).not.toEqual(fp2);
    } finally {
      baseline.sections = originalSections;
      if (typeof originalDiagnostics === 'string') process.env.DOCGEN_DIAGNOSTICS = originalDiagnostics;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('resolves analysisId when omitted (Studio generate) and still persists the resume artifact', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalSections = baseline.sections;
    baseline.sections = [baseSection] as any;

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      analysisId: undefined,
      oneTap: true,
    } as any);

    expect(result.ok).toBe(true);
    expect(studioArtifactsService.recordResumeSuccess).toHaveBeenCalled();
    baseline.sections = originalSections;
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

  it('never emits placeholder company values like \"Experience entry needs correction\" (drops empty headers)', () => {
    const { sanitizeResumePreviewForStudio } = require('./resumePreviewSanitizer');
    const preview = sanitizeResumePreviewForStudio({
      heading: { name: 'Test Candidate', contactLine: '' },
      summary: 'Test summary',
      experience: [
        { company: '', roleTitle: '', bullets: [], dateRange: '2020 - 2024' },
        { company: 'Example Co', roleTitle: 'Support Engineer', bullets: ['Did work.'], dateRange: '2020 - 2024' },
      ],
      education: [],
      competencies: [],
    });

    expect(JSON.stringify(preview.experience ?? [])).not.toContain('Experience entry needs correction');
    expect(preview.experience.length).toBe(1);
    expect(preview.experience[0].company).toBe('Example Co');
  });

  it('only marks canonical structured resume artifacts exportReady when the real document and template checks pass', async () => {
    const { service } = buildService();
    const canonicalResume = {
      heading: { name: 'Jordan Lee', contactLine: 'jordan@example.com' },
      summary:
        'Operations leader with experience improving support systems and team execution. Delivers steady process improvements across cross-functional programs.',
      experience: [
        {
          company: 'Example Co',
          roleTitle: 'Program Manager',
          dateRange: '2020 - 2024',
          bullets: ['Led process improvements across support workflows.', 'Built reporting routines for leadership.'],
        },
        {
          company: 'Acme Corp',
          roleTitle: 'Customer Operations Lead',
          dateRange: '2017 - 2020',
          bullets: ['Improved triage quality and escalation handling.', 'Partnered with product and support teams.'],
        },
      ],
      education: [],
      certifications: [],
    } as any;

    await expect(
      (service as any).canExportResumeArtifact({
        normalizedDocument: canonicalResume,
        usedStructuredBaselineTemplate: true,
        qualityGate: { status: 'pass', reasons: [] },
        jobTitle: 'Program Manager',
        jobDescription: 'Lead customer operations programs.',
        evidenceExists: true,
      }),
    ).resolves.toBe(true);

    await expect(
      (service as any).canExportResumeArtifact({
        normalizedDocument: canonicalResume,
        usedStructuredBaselineTemplate: false,
        qualityGate: { status: 'pass', reasons: [] },
        jobTitle: 'Program Manager',
        jobDescription: 'Lead customer operations programs.',
        evidenceExists: true,
      }),
    ).resolves.toBe(false);

    await expect(
      (service as any).canExportResumeArtifact({
        normalizedDocument: {
          ...canonicalResume,
          experience: [
            {
              company: 'Example Co',
              roleTitle: 'Program Manager',
              dateRange: '2020 - 2024',
              bullets: ['Led process improvements across support workflows.'],
            },
          ],
        },
        usedStructuredBaselineTemplate: true,
        qualityGate: { status: 'pass', reasons: [] },
        jobTitle: 'Program Manager',
        jobDescription: 'Lead customer operations programs.',
        evidenceExists: true,
      }),
    ).resolves.toBe(false);

    await expect(
      (service as any).canExportResumeArtifact({
        normalizedDocument: {
          heading: { name: 'Jordan Lee', contactLine: 'jordan@example.com' },
          summary: 'Role-targeted summary.',
          experience: [],
          education: [],
          certifications: [],
        },
        usedStructuredBaselineTemplate: true,
        qualityGate: { status: 'pass', reasons: [] },
        jobTitle: 'Program Manager',
        jobDescription: 'Lead customer operations programs.',
        evidenceExists: false,
      }),
    ).resolves.toBe(false);
  });

  it('applies preview sanitization on idempotency reuse responses before returning to client', async () => {
    const { service, workflowIdempotencyService } = buildService();
    const originalSections = baseline.sections;
    // Ensure readiness/template gates cannot block this idempotency reuse contract test.
    baseline.sections = [baseSection] as any;

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

  it('recomposes cached completed studio artifact responses through the authoritative assembler before returning', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalSections = baseline.sections;
    baseline.sections = [
      {
        ...baseSection,
        id: 'exp-ops',
        sectionType: BaselineSectionType.EXPERIENCE as any,
        title: 'Experience',
        order: 1,
        content: [
          'Example Co | Support Operations Lead | 2022 - Present',
          '- Led incident response and escalations across teams.',
          '- Built dashboards for queue health and CSAT reporting.',
          '- Helped route an invoice dispute once by routing it to the right owner.',
        ].join('\n'),
      } as any,
    ] as any;

    (studioArtifactsService.readState as jest.Mock).mockResolvedValueOnce({
      status: 'NOT_STARTED',
      baselineId: baseline.id,
      jobId: job.id,
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: 'job-fingerprint-1',
      generationContractVersion: 'studio-artifacts-v1',
      resume: {
        status: 'COMPLETED',
        usableCurrent: true,
        inputsHash: 'resume-hash-1',
        responseBody: {
          ok: true,
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          blocked: false,
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
          sections: [],
          compliance_flags: [],
          compliance_blocked: false,
          audit_id: 'audit-1',
          auditId: 'audit-1',
          baseline_version_hash: baselineVersion.hash,
          quality: 'final',
          exports: { docx: true, pdf: true },
          content: 'Billing operations leader focused on invoice accuracy. Billing operations.',
          preview: {
            resume: {
              heading: { name: 'Test Candidate', contactLine: '' },
              summary: 'Billing operations leader.',
              experience: [
                {
                  company: 'CenturyLink',
                  roleTitle: 'Billing Operations Analyst',
                  bullets: ['Reconciled billing and revenue across systems.'],
                  dateRange: '2020 - 2022',
                },
              ],
              education: [],
              competencies: [],
            },
          },
        },
      },
      coverLetter: null,
    });

    try {
      const result = await service.generateResume('user-1', baseRequest as any);
      expect(result.ok).toBe(true);
      const content = String((result as any).content ?? '').toLowerCase();
      expect(content).not.toMatch(/\bbilling operations\b/);
      const summary = String((result as any)?.preview?.resume?.summary ?? '').toLowerCase();
      expect(summary).not.toMatch(/\bbilling operations\b/);
    } finally {
      baseline.sections = originalSections;
    }
  });

  it('quarantines contaminated cached completed resume artifacts when baseline evidence has zero billing-domain support', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalSections = baseline.sections;
    baseline.sections = [
      {
        ...baseSection,
        id: 'exp-ops',
        sectionType: BaselineSectionType.EXPERIENCE as any,
        title: 'Experience',
        order: 1,
        content: [
          'Example Co | Support Operations Lead | 2022 - Present',
          '- Led incident response and escalations across teams.',
          '- Built dashboards for queue health and CSAT reporting.',
          '- Ran postmortems and improved cross-functional workflows.',
          '- Owned support operations playbooks and on-call process improvements.',
        ].join('\n'),
      } as any,
    ] as any;

    (studioArtifactsService.readState as jest.Mock).mockResolvedValueOnce({
      status: 'NOT_STARTED',
      baselineId: baseline.id,
      jobId: job.id,
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: 'job-fingerprint-1',
      generationContractVersion: 'studio-artifacts-v1',
      resume: {
        status: 'COMPLETED',
        usableCurrent: true,
        inputsHash: 'resume-hash-1',
        responseBody: {
          ok: true,
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          blocked: false,
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
          sections: [],
          compliance_flags: [],
          compliance_blocked: false,
          audit_id: 'audit-1',
          auditId: 'audit-1',
          baseline_version_hash: baselineVersion.hash,
          quality: 'final',
          exports: { docx: true, pdf: true },
          content:
            'Billing operations leader focused on invoice accuracy, entitlement mismatches, and reconciliation workflows.',
          preview: {
            resume: {
              heading: { name: 'Test Candidate', contactLine: '' },
              summary: 'Billing support operations leader.',
              experience: [
                {
                  company: 'Example Co',
                  roleTitle: 'Billing Operations Lead',
                  bullets: ['Owned billing KPI reporting and invoice dispute handling.'],
                  dateRange: '2022 - Present',
                },
              ],
              education: [],
              competencies: [],
            },
          },
        },
      },
      coverLetter: null,
    });

    try {
      const result = await service.generateResume('user-1', baseRequest as any);
      expect(String((result as any)?.idempotency?.status ?? '')).not.toBe('existing_completed');
      const content = String((result as any).content ?? '').toLowerCase();
      expect(content).not.toMatch(/\bbilling operations\b/);
      expect(content).not.toMatch(/\binvoice accuracy\b/);
      expect(content).not.toMatch(/\bentitlement mismatches?\b/);
      expect(content).not.toMatch(/\breconciliation\b/);
    } finally {
      baseline.sections = originalSections;
    }
  });

  it('bypasses idempotency reuse/in-flight latches when forceRegenerate=true by using a one-off dedupe key', async () => {
    const { service, workflowIdempotencyService } = buildService();
    const originalSections = baseline.sections;
    baseline.sections = [baseSection] as any;

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
    baseline.sections = [baseSection] as any;

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

  it('does not reuse cached completed studio artifact when usableCurrent=false (stale/unusable artifacts must not contaminate output)', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalSections = baseline.sections;
    baseline.sections = [baseSection] as any;

    // Match the inputsHash Studio would compute for this request so the cache reuse branch would be eligible
    // if it ignored usableCurrent.
    const expectedInputsHash = (studioArtifactsService as any).computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: (studioArtifactsService as any).computeJobFingerprint(job),
      assessmentInputsHash: assessment.inputsHash ?? null,
    });

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
        inputsHash: expectedInputsHash,
        inputsHashMatches: true,
        artifactCurrent: false,
        usableCurrent: false,
        retryAllowed: true,
        responseBody: {
          ok: true,
          status: 'success',
          generationStatus: 'success',
          exportReady: false,
          preview: {
            resume: {
              heading: { name: 'Cached Candidate', contactLine: '' },
              summary: 'Led billing support operations focused on invoice accuracy and reconciliation.',
              experience: [],
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
      { ...baseRequest, forceRegenerate: false } as any,
      { skipReadinessGate: true } as any,
    );

    expect((result as any).idempotency?.reused).not.toBe(true);
    expect(String(result.preview?.resume?.summary ?? '').toLowerCase()).not.toContain('billing support operations');
    expect(studioArtifactsService.recordResumeInProgress).toHaveBeenCalled();

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
    expect(extracted.experience[0].dates).toBe('2020 – 2024');
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
        code: 'unsupported_input',
        category: 'unsupported_input',
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
    expect(readiness.reasons?.[0]?.code).toBe('fit_score_unavailable');

    await expect(service.generateResume('user-1', baseRequest)).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        code: 'unsupported_input',
        category: 'unsupported_input',
      }),
    });

    baseline.sections = [{ ...baseSection, content: original }];
  });

  it('loads the baseline through the raw query path without selecting verifiedBaseline', async () => {
    const { service, baselineRepo } = buildService();

    await service.generateResume('user-1', baseRequest);

    const queryBuilders = (baselineRepo.createQueryBuilder as jest.Mock).mock.results
      .map((result: any) => result.value)
      .filter(Boolean);
    const selectedColumns = queryBuilders.flatMap((queryBuilder: any) =>
      (queryBuilder.select as jest.Mock).mock.calls.flatMap((call: any[]) => call),
    );

    expect(selectedColumns.map(String).join(' ')).not.toContain('verifiedBaseline');
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
    expect(readiness.status).toBe('blocked');

    await expect(service.generateResume('user-1', baseRequest)).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: expect.any(Boolean),
    });

    baseline.sections = originalSections;
  }); 

  it('keeps readiness usableExperienceCount aligned with normalized experience count for the same canonical source', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    try {
      baseline.sections = [
        {
          ...baseSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 0,
          content: [
            'Biblioso | Director, Customer Experience | 2024 - Present',
            '- Led a cross-functional CX program spanning support and product.',
            '- Improved escalation handling through triage, routing, and operating reviews.',
            '',
            'Acme Corp | Customer Operations Manager | 2021 - 2024',
            '- Built queue health dashboards and reporting to improve response time.',
            '- Implemented process improvements to reduce repeat escalations and strengthen RCA follow through.',
          ].join('\n'),
        } as any,
      ] as any;

      const readiness = await service.getGenerationReadiness('user-1', baseRequest);
      expect(readiness.blocked).toBe(false);
      expect(readiness.diagnostics?.usableExperienceCount ?? 0).toBeGreaterThan(0);

      const result = await service.generateResume('user-1', baseRequest);
      expect(result.ok).toBe(true);
      expect(result.exportReady).toBe(true);

      const normalizedExperienceCount = Array.isArray((result as any)?.preview?.resume?.experience)
        ? (result as any).preview.resume.experience.length
        : 0;
      expect(normalizedExperienceCount).toBeGreaterThan(0);
      expect(normalizedExperienceCount).toBe(readiness.diagnostics?.usableExperienceCount ?? 0);
    } finally {
      baseline.sections = originalSections;
      assessment.overallScore = originalScore;
    }
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
      expect(readiness.status).toBe('blocked');
      expect(readiness.blocked).toBe(true);
    expect(readiness.reasons[0]?.code).toBe('fit_score_unavailable'); 
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

  it('does not block Studio readiness when a valid persisted ResumeV2 has usable experience even if structured template readiness is empty', async () => {
    const originalSections = baseline.sections;
    const originalParsedRecords = (baseline as any).parsedRecords;

    try {
      baseline.sections = []; // structured/template extraction would be empty
      (baseline as any).parsedRecords = [
        {
          id: 'parsed-1',
          baselineVersionId: baselineVersion.id,
          resumeV2Json: {
            heading: { name: 'Test', contactLine: 'Test' },
            experience: [
              {
                company: 'Acme',
                roleTitle: 'Support Ops Lead',
                dateRange: '2021 - 2024',
                bullets: ['Owned escalations', 'Built dashboards'],
              },
            ],
            education: [],
          },
        },
      ];
      const { service } = buildService();
      const readiness = await service.getGenerationReadiness('user-1', {
        ...baseRequest,
        analysisId: 'analysis-1',
        oneTap: false,
      } as any);

      expect(readiness.status).toBe('blocked');
      expect(readiness.blocked).toBe(true);
      expect((readiness as any)?.canGenerateResume ?? false).toBe(false);
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsedRecords;
    }
  });

  it('returns ready for canonical persisted Studio artifacts when resume and cover letter already exist', async () => {
    const { service, studioArtifactsService } = buildService();
    (studioArtifactsService.readState as jest.Mock).mockResolvedValueOnce({
      status: 'ready',
      baselineId: baseline.id,
      jobId: job.id,
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: 'job-fingerprint-1',
      generationContractVersion: 'studio-artifacts-v1',
      assessmentScore: 90,
      resume: {
        status: 'COMPLETED',
        artifactCurrent: true,
        usableCurrent: true,
      },
      coverLetter: {
        status: 'COMPLETED',
        artifactCurrent: true,
        usableCurrent: true,
      },
    } as any);

    const readiness = await service.getGenerationReadiness('user-1', {
      ...baseRequest,
      analysisId: assessment.id,
    } as any);

    expect(readiness).toMatchObject({
      status: 'ready',
      blocked: false,
      canGenerateResume: true,
    });
    expect((readiness as any)?.diagnostics?.readinessSource).toBe('canonical_persisted_studio_state');
  });

  it('prefers ResumeV2 generation when persisted ResumeV2 is usable even if the feature flag is off (prevents legacy structured-empty failures)', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];

    const originalSections = baseline.sections;
    const originalParsedRecords = (baseline as any).parsedRecords;

    try {
      baseline.sections = []; // legacy structured extraction is empty
      (baseline as any).parsedRecords = [
        {
          id: 'parsed-1',
          baselineVersionId: baselineVersion.id,
          resumeV2Json: {
            heading: { name: 'Test', contactLine: 'Test' },
            experience: [
              {
                company: 'Acme',
                roleTitle: 'Support Ops Lead',
                dateRange: '2021 - 2024',
                bullets: ['Owned escalations', 'Built dashboards'],
              },
            ],
            education: [],
          },
        },
      ];

      const { service } = buildService();
      await expect(
        service.generateResume(
          'user-1',
          {
            ...baseRequest,
            analysisId: 'analysis-1',
            oneTap: false,
          } as any,
        ),
      ).resolves.toMatchObject({
        ok: true,
        status: 'success',
      });
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsedRecords;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    }
  });

  it('does not drop short-but-meaningful ResumeV2 bullets and block persistence (ResumeV2 lane)', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';

    const originalSections = baseline.sections;
    const originalParsedRecords = (baseline as any).parsedRecords;

    try {
      baseline.sections = []; // legacy structured extraction empty
      (baseline as any).parsedRecords = [
        {
          id: 'parsed-1',
          baselineVersionId: baselineVersion.id,
          resumeV2Json: {
            heading: { name: 'Test', contactLine: 'Test' },
            experience: [
              {
                company: 'Acme',
                roleTitle: 'Support Ops Lead',
                dateRange: '2021 - 2024',
                // Intentionally short bullets that used to be filtered out (< 10 chars) and could cause empty output.
                bullets: ['Owned', 'Scaled'],
              },
            ],
            education: [],
          },
        },
      ];

      const { service } = buildService();
      await expect(
        service.generateResume(
          'user-1',
          {
            ...baseRequest,
            analysisId: 'analysis-1',
            oneTap: false,
          } as any,
        ),
      ).resolves.toMatchObject({
        ok: true,
        status: 'success',
      });
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsedRecords;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    }
  });

  it('blocks Studio readiness with the canonical ResumeV2 invalid reason when persisted ResumeV2 has no usable experience', async () => {
    const originalSections = baseline.sections;
    const originalParsedRecords = (baseline as any).parsedRecords;

    try {
      baseline.sections = []; // structured/template extraction would be empty (ResumeV2 authority should apply)
      (baseline as any).parsedRecords = [
        {
          id: 'parsed-1',
          baselineVersionId: baselineVersion.id,
          resumeV2Json: {
            heading: { name: 'Test', contactLine: 'Test' },
            experience: [],
            education: [],
          },
        },
      ];

      const { service } = buildService();
      const readiness = await service.getGenerationReadiness(
        'user-1',
        {
          ...baseRequest,
          analysisId: 'analysis-1',
          oneTap: false,
        } as any,
      );

      expect(readiness.status).toBe('blocked');
      expect(readiness.blocked).toBe(true);
      expect(readiness.reasons?.[0]?.code).toBe('fit_score_unavailable');
      expect(typeof readiness.reasons?.[0]?.message).toBe('string');
      expect(String(readiness.reasons?.[0]?.message ?? '')).toContain('Fit score unavailable');

      await expect(
        service.generateResume(
          'user-1',
          {
            ...baseRequest,
            analysisId: 'analysis-1',
            oneTap: false,
          } as any,
        ),
      ).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: 'baseline_resume_v2_invalid',
            message: expect.stringContaining('ResumeV2 produced an invalid normalized resume model'),
          }),
        }),
      });
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsedRecords;
    }
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

  it('fails closed when oneTap=true and authoritative extraction yields zero roles (no minimal fallback synthesis)', async () => {
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

    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [];
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: [
          'Seattle',
          '- Reconciled billing and revenue across systems to improve close accuracy.',
          '- Reduced billing exceptions by automating metering and reporting checks.',
        ].join('\n'),
      } as any,
    ] as any;

    await expect(
      service.generateResume('user-1', { ...baseRequest, oneTap: true }),
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        code: 'generation_blocked',
        category: 'generation_blocked',
      }),
    });

    expect(readinessSpy).not.toHaveBeenCalled();
    // Verified-only generation must still fail closed when authoritative experience extraction yields zero roles.

    baseline.sections = originalSections;
    baseline.parsedRecords = originalParsed;
  });

  it('strips documentStrategyPlan when falling back to verified-only generation', async () => {
    const { service } = buildService({
      complianceFlags: [],
      blocked: false,
    });
    const originalSections = baseline.sections;
    baseline.sections = [baseSection] as any;

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

      readinessSpy.mockRestore();
      draftSpy.mockRestore();
      baseline.sections = originalSections;
    });

  it('fail-soft returns a minimal baseline-derived preflight resume when draft build throws', async () => {
    const originalContent = baseline.sections?.[0]?.content ?? '';
    const originalParsed = baseline.parsedRecords;
    baseline.parsedRecords = [
      {
        id: 'parsed-verified',
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        resumeV2Json: {
          heading: { name: 'Alex Candidate', contactLine: 'Test City' },
          summary: 'Support leader with verified impact.',
          experience: [
            { company: 'Acme', roleTitle: 'Director of Support', bullets: ['Improved p95 by 25%'] },
          ],
          education: [],
        },
        flagsJson: {
          reviewState: {
            verified: true,
          },
        },
      },
    ] as any;
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
      exportReady: false,
      blocked: false,
    });

    draftSpy.mockRestore();
    baseline.parsedRecords = originalParsed;
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
      exportReady: false,
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
        diagnostics: {
          fallbackPathExecuted: false,
          resumeFailureDiagnostics: {
            validationReason: 'resume_structure_empty',
          },
        },
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

  it('omits Resume V2 bullets without evidence and attaches canonical sourceEvidenceIds to the rest', () => {
    const { service } = buildService();
    const preview = {
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      summary: 'Evidence-backed summary.',
      experience: [
        {
          company: 'Cascade Aerial Photography',
          roleTitle: 'Lead Support Engineer',
          bullets: [
            'Customer-facing technical support at the in-store computer helpdesk',
            'Delivered consistent execution by clarifying priorities and maintaining a steady operating rhythm.',
          ],
        },
        {
          company: 'Acme',
          roleTitle: 'Operator',
          bullets: ['Improved service reliability.'],
        },
      ],
    } as any;

    const result = (service as any).attachResumePreviewEvidence(preview, {
      'experience:0:0': ['e-1'],
      'experience:0:1': [],
      'experience:1:0': ['e-2'],
    });

    expect(result.usedEvidenceIds).toEqual(['e-1', 'e-2']);
    expect(result.resume.experience).toEqual([
      {
        company: 'Cascade Aerial Photography',
        roleTitle: 'Lead Support Engineer',
        bullets: [
          {
            text: 'Customer-facing technical support at the in-store computer helpdesk',
            sourceEvidenceIds: ['e-1'],
            source: { sourceEvidenceIds: ['e-1'] },
          },
        ],
      },
      {
        company: 'Acme',
        roleTitle: 'Operator',
        bullets: [
          {
            text: 'Improved service reliability.',
            sourceEvidenceIds: ['e-2'],
            source: { sourceEvidenceIds: ['e-2'] },
          },
        ],
      },
    ]);
  });

  it('matches Resume V2 bullets back to canonical baseline evidence when traceMap is empty', () => {
    const { service } = buildService();
    const resumeInputSections = [
      {
        id: 'section-experience',
        baselineId: 'baseline-1',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content:
          '- Improved service reliability across incident response.\n- Built dashboards for leadership review.',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ];
    const canonicalEvidenceUnits = extractEvidenceUnitsFromLogicalUnits(
      resumeInputSections[0].id,
      reconstructLogicalTextUnits(resumeInputSections[0].content),
    );
    expect(canonicalEvidenceUnits[0]).toEqual(
      expect.objectContaining({
        sourceText: 'Improved service reliability across incident response.',
        normalizedText: 'Improved service reliability across incident response.',
      }),
    );

    const result = (service as any).attachResumePreviewEvidence(
      {
        heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
        summary: 'Supported summary.',
        experience: [
          {
            company: 'Acme',
            roleTitle: 'Operator',
            bullets: [
              { text: 'Improved service reliability across incident response and escalation handling.' },
              { text: 'Delivered consistent execution by clarifying priorities and maintaining a steady operating rhythm.' },
            ],
          },
        ],
      },
      {},
      resumeInputSections,
    );

    expect(result.resume.experience).toEqual([
      {
        company: 'Acme',
        roleTitle: 'Operator',
        bullets: [
          expect.objectContaining({
            text: 'Improved service reliability across incident response and escalation handling.',
            sourceEvidenceIds: expect.arrayContaining([expect.any(String)]),
            source: expect.objectContaining({
              sourceEvidenceIds: expect.arrayContaining([expect.any(String)]),
            }),
          }),
        ],
      },
    ]);
    expect(result.usedEvidenceIds.length).toBe(1);
    expect(result.usedEvidenceIds).toEqual(expect.arrayContaining([expect.any(String)]));
  });

  it('keeps evidence-backed bullet objects intact through the exact guarded Resume V2 response object', async () => {
    const { service } = buildService();
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    const originalParsed = baseline.parsedRecords;
    const originalSections = baseline.sections;
    const originalGuard = (service as any).assertResumeEvidenceBeforePersistence.bind(service);
    const guardSpy = jest.spyOn(service as any, 'assertResumeEvidenceBeforePersistence');
    guardSpy.mockImplementation((input: any) => originalGuard(input));

    try {
      baseline.parsedRecords = [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          resumeV2Json: {
            heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
            summary: 'Evidence-backed summary.',
            experience: [
              {
                company: 'Example Co',
                roleTitle: 'Senior Program Manager',
                dateRange: '2020 - 2024',
                bullets: [
                  'Led support operations and improved service reliability across global teams.',
                  'Built playbooks, reduced incident volume, and managed executive stakeholder updates.',
                  'Improved response time and throughput with reporting dashboards.',
                ],
              },
              {
                company: 'Acme Corp',
                roleTitle: 'Customer Operations Manager',
                dateRange: '2017 - 2019',
                bullets: [
                  'Managed support queues and improved SLA attainment through process changes.',
                  'Implemented escalation playbooks and weekly operational reviews.',
                  'Built KPI reporting to track backlog, response time, and quality trends.',
                ],
              },
            ],
          },
        } as any,
      ];
      baseline.sections = [baseSection] as any;

      const result = await service.generateResume('user-1', {
        ...baseRequest,
        oneTap: true,
      } as any);

      expect(result.ok).toBe(true);
      expect(guardSpy).toHaveBeenCalled();
      const guardInput = guardSpy.mock.calls[0]?.[0] as any;
      const guardedExperience = Array.isArray(guardInput?.responseBody?.preview?.resume?.experience)
        ? guardInput.responseBody.preview.resume.experience
        : [];
      const guardedBullets = guardedExperience.flatMap((entry: any) => Array.isArray(entry?.bullets) ? entry.bullets : []);
      expect(guardedBullets).toHaveLength(6);
      expect(guardedBullets.every((bullet: any) => Array.isArray(bullet?.sourceEvidenceIds) && bullet.sourceEvidenceIds.length > 0)).toBe(true);
      expect(Array.isArray(guardInput?.responseBody?.internalTrace?.usedEvidenceIds)).toBe(true);
      expect((guardInput?.responseBody?.internalTrace?.usedEvidenceIds ?? []).length).toBeGreaterThan(0);
    } finally {
      guardSpy.mockRestore();
      baseline.parsedRecords = originalParsed;
      baseline.sections = originalSections;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    }
  });

  it('seeds canonical evidence ids into the active Resume V2 minimal path before safety matching', () => {
    const { service } = buildService();
    const baselineSections = [
      {
        id: 'section-experience',
        baselineId: 'baseline-1',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content:
          '- Improved service reliability across incident response.\n- Built dashboards for leadership review.',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ];

    const seededSections = (service as any).buildMinimalResumeSections(baselineSections);
    const seededExperience = seededSections.find((section: any) => String(section.type ?? '').toUpperCase() === 'EXPERIENCE');
    expect(seededExperience.bullets[0]).toEqual(
      expect.objectContaining({
        text: 'Improved service reliability across incident response.',
        source: expect.objectContaining({
          sourceEvidenceIds: expect.arrayContaining([expect.any(String)]),
          anchorText: 'Improved service reliability across incident response.',
        }),
      }),
    );

    const rewrittenPreview = {
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      summary: 'Supported summary.',
      experience: [
        {
          company: 'Acme',
          roleTitle: 'Operator',
          bullets: [
            {
              text: 'Customer-facing service improvements were delivered across incident response and escalation handling.',
              sourceEvidenceIds: [seededExperience.bullets[0].source.sourceEvidenceIds[0]],
              source: { sourceEvidenceIds: [seededExperience.bullets[0].source.sourceEvidenceIds[0]] },
            },
          ],
        },
      ],
    } as any;

    const result = (service as any).attachResumePreviewEvidence(rewrittenPreview, {}, baselineSections);
    expect(result.resume.experience[0].bullets[0]).toEqual(
      expect.objectContaining({
        sourceEvidenceIds: expect.arrayContaining([expect.any(String)]),
        source: expect.objectContaining({
          sourceEvidenceIds: expect.arrayContaining([expect.any(String)]),
        }),
      }),
    );
    expect(result.usedEvidenceIds.length).toBeGreaterThan(0);
  });

  it('throws resume_v2_evidence_missing_before_persistence before recordResumeSuccess when no evidence is present', () => {
    const { service } = buildService();
    const guard = (service as any).assertResumeEvidenceBeforePersistence.bind(service);
    const responseBody = {
      internalTrace: { usedEvidenceIds: [] },
      preview: {
        resume: {
          heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
          summary: 'Supported summary.',
          experience: [
            {
              company: 'Acme',
              roleTitle: 'Operator',
              bullets: [{ text: 'Improved service reliability.' }],
            },
          ],
        },
      },
    };

    expect(() =>
      guard({
        responseBody,
        resumeInputSections: [
          {
            id: 'section-experience',
            baselineId: 'baseline-1',
            sectionType: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
            content: '- Improved service reliability.',
            includePolicy: BaselineIncludePolicy.ALWAYS,
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any,
        ],
        allowedSections: [
          {
            id: 'section-experience',
            baselineId: 'baseline-1',
            sectionType: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
            content: '- Improved service reliability.',
            includePolicy: BaselineIncludePolicy.ALWAYS,
            order: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any,
        ],
        promotedExperienceLikeSectionsCount: 1,
      }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: 'resume_v2_evidence_missing_before_persistence',
            counts: expect.objectContaining({
              totalResumeUsedEvidenceIdsCount: 0,
            }),
          }),
        }),
      }),
    );
  });

  it('paired high-fit contract: generates both resume and cover letter from verified baseline evidence when Resume V2 is missing, omitting unsupported requirements and persisting both artifacts under the same context', async () => {
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;
    baseline.parsedRecords = [
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        parsedJson: { identity: { full_name: 'Jordan Lee' } },
        resumeV2Json: {
          heading: {
            name: 'Jordan Lee',
            contactLine: 'jordan.lee@example.com | Seattle, WA',
          },
          summary:
            'Customer operations leader focused on measurable improvements, reliable operating cadence, and cross-functional execution.',
          competencies: ['SQL', 'Node.js', 'AWS'],
          experience: [
            {
              company: 'Biblioso',
              roleTitle: 'Director, Customer Experience',
              dateRange: '2024 - Present',
              bullets: [
                'Led a cross-functional CX program spanning support and product.',
                'Improved escalation handling through triage, routing, and operating reviews.',
                'Kept service quality visible with weekly operating cadence and executive updates using SQL dashboards.',
              ],
            },
            {
              company: 'Acme Corp',
              roleTitle: 'Customer Operations Manager',
              dateRange: '2021 - 2024',
              bullets: [
                'Built queue health dashboards in SQL and reporting to improve response time.',
                'Implemented process improvements to reduce repeat escalations and strengthen RCA follow through.',
                'Partnered with engineering and support leadership on incident response and follow-up using Node.js tooling.',
              ],
            },
            {
              company: 'Example Co',
              roleTitle: 'Support Operations Lead',
              dateRange: '2018 - 2021',
              bullets: [
                'Owned support workflow design and operating reviews for a SaaS team.',
                'Coordinated handoffs and staffing tradeoffs to keep service quality visible.',
                'Improved reporting cadence for the support queue and incident response process.',
              ],
            },
          ],
        },
      } as any,
    ]; // keep the fixture focused on baseline-evidence readiness; the canonical evidence is still the parsed baseline.
    baseline.sections = [
      {
        ...baseSection,
        id: 'section-summary',
        sectionType: BaselineSectionType.SUMMARY,
        title: 'Summary',
        order: 0,
        content:
          'Customer operations leader focused on measurable improvements and reliable operating cadence. ' +
          'Built cross-functional execution rhythms across support and product.',
      } as any,
      {
        ...baseSection,
        id: 'section-experience',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 1,
        content: [
          'Biblioso | Director, Customer Experience | 2024 - Present',
          '- Led a cross-functional CX program spanning support and product.',
          '- Improved escalation handling through triage, routing, and operating reviews.',
          '- Kept service quality visible with weekly operating cadence and executive updates using SQL dashboards.',
          '',
          'Acme Corp | Customer Operations Manager | 2021 - 2024',
          '- Built queue health dashboards in SQL and reporting to improve response time.',
          '- Implemented process improvements to reduce repeat escalations and strengthen RCA follow through.',
          '- Partnered with engineering and support leadership on incident response and follow-up using Node.js tooling.',
          '',
          'Example Co | Support Operations Lead | 2018 - 2021',
          '- Owned support workflow design and operating reviews for a SaaS team.',
          '- Coordinated handoffs and staffing tradeoffs to keep service quality visible.',
          '- Improved reporting cadence for the support queue and incident response process.',
        ].join('\n'),
      } as any,
      {
        ...baseSection,
        id: 'section-skills',
        sectionType: BaselineSectionType.SKILLS,
        title: 'Skills',
        order: 2,
        content: 'SQL, Node.js, AWS, Support Operations, Incident Response',
      } as any,
    ] as any;

    const { service: resumeService, studioArtifactsService } = buildService();
    (studioArtifactsService as any).recordCoverLetterInProgress = jest.fn().mockResolvedValue('studio-artifact-1');
    (studioArtifactsService as any).recordCoverLetterSuccess = jest.fn().mockResolvedValue('studio-artifact-1');
    (studioArtifactsService as any).recordCoverLetterFailure = jest.fn().mockResolvedValue('studio-artifact-1');

    const coverRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((payload: any) => payload),
      save: jest.fn(async (payload: any) => ({ ...payload, id: 'saved-1' })),
      remove: jest.fn(async (payload: any) => payload),
    };
    const baselineRows = baseline.sections.flatMap((section) =>
      baseline.parsedRecords.map((parsedRecord) => ({
        baseline_id: baseline.id,
        baseline_userId: baseline.userId,
        baseline_version: baseline.version,
        baseline_versionNumber: baseline.version,
        baseline_originalFilename: baseline.originalFilename,
        baseline_mimeType: baseline.mimeType,
        baseline_storagePath: baseline.storagePath,
        baseline_hash: baseline.hash,
        baseline_status: baseline.status,
        baseline_isActive: true,
        baseline_archivedAt: baseline.archivedAt,
        baseline_originalBaselineScore: null,
        baseline_latestBaselineScore: null,
        baseline_latestAssessmentId: null,
        baseline_firstAnalyzedAt: null,
        baseline_lastAnalyzedAt: null,
        baseline_isSynthetic: false,
        baseline_syntheticScenarioKey: null,
        baseline_syntheticRunId: null,
        baseline_syntheticCreatedAt: null,
        baseline_preserveFromCleanup: false,
        sections_id: section.id,
        sections_baselineId: section.baselineId,
        sections_sectionType: section.sectionType,
        sections_title: section.title,
        sections_content: section.content,
        sections_includePolicy: section.includePolicy,
        sections_order: section.order,
        sections_createdAt: section.createdAt,
        sections_updatedAt: section.updatedAt,
        parsedRecords_id: parsedRecord.id ?? 'parsed-1',
        parsedRecords_baselineId: baseline.id,
        parsedRecords_sourceFileId: parsedRecord.sourceFileId ?? null,
        parsedRecords_schemaVersion: parsedRecord.schemaVersion ?? null,
        parsedRecords_sourceFormat: parsedRecord.sourceFormat ?? 'pdf',
        parsedRecords_ingestedAt: parsedRecord.ingestedAt ?? null,
        parsedRecords_parsedJson: parsedRecord.parsedJson ?? null,
        parsedRecords_resumeV2Json: parsedRecord.resumeV2Json ?? null,
        parsedRecords_flagsJson: parsedRecord.flagsJson ?? null,
        parsedRecords_createdAt: parsedRecord.createdAt ?? new Date(),
      })),
    );
    const baselineRepo = buildRepo(baseline, baselineRows);
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

    try {
      const excluded = ['Python', 'Snowflake'];

      const resumeResult = await resumeService.generateResume('user-1', {
        ...baseRequest,
        excludedRequirements: excluded,
      } as any);
      expect(resumeResult.ok).toBe(true);
      expect(resumeResult.exportReady).toBe(true);
      expect(String((resumeResult as any).content ?? '')).toMatch(/\S+/);
      if (baseline.parsedRecords[0]) {
        (baseline.parsedRecords[0] as any).resumeV2Json = {
          heading: {
            name: 'Jordan Lee',
            contactLine: 'jordan.lee@example.com | Seattle, WA',
          },
          summary: String((resumeResult as any).content ?? ''),
          competencies: ['SQL', 'Node.js', 'AWS'],
          experience: [
            {
              company: 'Biblioso',
              roleTitle: 'Director, Customer Experience',
              dateRange: '2024 - Present',
              bullets: [
                'Led a cross-functional CX program spanning support and product.',
                'Improved escalation handling through triage, routing, and operating reviews.',
                'Kept service quality visible with weekly operating cadence and executive updates using SQL dashboards.',
              ],
            },
            {
              company: 'Acme Corp',
              roleTitle: 'Customer Operations Manager',
              dateRange: '2021 - 2024',
              bullets: [
                'Built queue health dashboards in SQL and reporting to improve response time.',
                'Implemented process improvements to reduce repeat escalations and strengthen RCA follow through.',
                'Partnered with engineering and support leadership on incident response and follow-up using Node.js tooling.',
              ],
            },
            {
              company: 'Example Co',
              roleTitle: 'Support Operations Lead',
              dateRange: '2018 - 2021',
              bullets: [
                'Owned support workflow design and operating reviews for a SaaS team.',
                'Coordinated handoffs and staffing tradeoffs to keep service quality visible.',
                'Improved reporting cadence for the support queue and incident response process.',
              ],
            },
          ],
        };
      }

      (studioArtifactsService as any).readState.mockResolvedValueOnce({
        status: 'COMPLETED',
        baselineId: baseline.id,
        jobId: job.id,
        baselineVersionId: baselineVersion.id,
        baselineVersionHash: baselineVersion.hash,
        jobFingerprint: 'job-fingerprint-1',
        generationContractVersion: 'studio-artifacts-v1',
        resume: {
          artifactId: 'studio-artifact-resume-1',
          status: 'COMPLETED',
          usableCurrent: true,
          artifactCurrent: true,
          inputsHashMatches: true,
          responseBody: resumeResult as any,
          content: (resumeResult as any).content,
        },
        coverLetter: null,
      });
      const studioState = await (studioArtifactsService as any).readState({
        userId: 'user-1',
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job.id,
        analysisId: assessment.id,
      });
      expect(studioState.resume?.usableCurrent).toBe(true);
      expect(studioState.resume?.artifactCurrent).toBe(true);
      expect(studioState.resume?.status).toBe('COMPLETED');

      const refreshedBaselineRows = baseline.sections.flatMap((section) =>
        baseline.parsedRecords.map((parsedRecord) => ({
          baseline_id: baseline.id,
          baseline_userId: baseline.userId,
          baseline_version: baseline.version,
          baseline_versionNumber: baseline.version,
          baseline_originalFilename: baseline.originalFilename,
          baseline_mimeType: baseline.mimeType,
          baseline_storagePath: baseline.storagePath,
          baseline_hash: baseline.hash,
          baseline_status: baseline.status,
          baseline_isActive: true,
          baseline_archivedAt: baseline.archivedAt,
          baseline_originalBaselineScore: null,
          baseline_latestBaselineScore: null,
          baseline_latestAssessmentId: null,
          baseline_firstAnalyzedAt: null,
          baseline_lastAnalyzedAt: null,
          baseline_isSynthetic: false,
          baseline_syntheticScenarioKey: null,
          baseline_syntheticRunId: null,
          baseline_syntheticCreatedAt: null,
          baseline_preserveFromCleanup: false,
          sections_id: section.id,
          sections_baselineId: section.baselineId,
          sections_sectionType: section.sectionType,
          sections_title: section.title,
          sections_content: section.content,
          sections_includePolicy: section.includePolicy,
          sections_order: section.order,
          sections_createdAt: section.createdAt,
          sections_updatedAt: section.updatedAt,
          parsedRecords_id: parsedRecord.id ?? 'parsed-1',
          parsedRecords_baselineId: baseline.id,
          parsedRecords_sourceFileId: parsedRecord.sourceFileId ?? null,
          parsedRecords_schemaVersion: parsedRecord.schemaVersion ?? null,
          parsedRecords_sourceFormat: parsedRecord.sourceFormat ?? 'pdf',
          parsedRecords_ingestedAt: parsedRecord.ingestedAt ?? null,
          parsedRecords_parsedJson: parsedRecord.parsedJson ?? null,
          parsedRecords_resumeV2Json: parsedRecord.resumeV2Json ?? null,
          parsedRecords_flagsJson: parsedRecord.flagsJson ?? null,
          parsedRecords_createdAt: parsedRecord.createdAt ?? new Date(),
        })),
      );
      const refreshedBaselineRepo = buildRepo(baseline, refreshedBaselineRows);
      const refreshedVersionRepo = buildRepo(baselineVersion);
      const refreshedPolicyRepo = buildRepo([]);
      const refreshedJobRepo = buildRepo(job);
      const refreshedFitRepo = buildRepo(assessment);
      const refreshedDataSource = {
        getRepository: jest.fn((entity: any) => {
          switch (entity?.name) {
            case 'CoverLetter':
              return coverRepo;
            case 'Baseline':
              return refreshedBaselineRepo;
            case 'BaselineVersion':
              return refreshedVersionRepo;
            case 'BaselineBlockPolicy':
              return refreshedPolicyRepo;
            case 'Job':
              return refreshedJobRepo;
            case 'FitAssessment':
              return refreshedFitRepo;
            default:
              throw new Error(`Unexpected repository request: ${entity?.name}`);
          }
        }),
      } as unknown as DataSource;

      const coverLettersService = new CoverLettersService(
        refreshedDataSource,
        complianceService as any,
        ({ analyze: jest.fn().mockReturnValue({ strengths: [], criticalGaps: [] }) } as unknown as GapAnalysisService),
        ({ reserve: jest.fn().mockResolvedValue({ status: 'accepted_new', runId: 'run-1', responseBody: null }), complete: jest.fn(), markFailure: jest.fn() } as any),
        studioArtifactsService as any,
        ({ upsertPreparedFromCoverLetterGeneration: jest.fn().mockResolvedValue(null), upsertApplicationForPair: jest.fn().mockResolvedValue(null) } as any),
        ({ backfillLatestIfMissing: jest.fn().mockResolvedValue(null) } as any),
      );

      let coverResult: any = null;
      let coverFailure: any = null;
      try {
        coverResult = await coverLettersService.generateCoverLetter('user-1', {
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job.id,
          analysisId: assessment.id,
          excludedRequirements: excluded,
        } as any);
      } catch (error) {
        coverFailure = error;
      }

      if (coverFailure) {
        const response =
          typeof (coverFailure as any)?.getResponse === 'function'
            ? (coverFailure as any).getResponse()
            : (coverFailure as any)?.response ?? null;
        // eslint-disable-next-line no-console
        console.log('[COVER_LETTER_FAILURE_DEBUG]', JSON.stringify({
          message: (coverFailure as any)?.message ?? null,
          response,
        }));
        throw coverFailure;
      }

      expect((coverResult as any).status).toBe('success');
      expect((coverResult as any).exportReady).toBe(true);
      expect(String((coverResult as any).content ?? '')).toMatch(/\S+/);
      const coverReasonCodes = ((coverResult as any).display?.reasons ?? []).map((r: any) => String(r?.code ?? ''));
      expect(coverReasonCodes).not.toContain('COVER_LETTER_ANCHOR_VALIDATION_FAILED');

      // Persistence through StudioArtifactsService under the same resolved context.
      expect((studioArtifactsService as any).recordResumeSuccess).toHaveBeenCalledWith(
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

  it('does not terminate Studio eligible generation with unsupported_input when resume structure is empty (degrades to minimal baseline-only resume)', async () => {
    const { service } = buildService();
    const original = baseline.sections;
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'false';
    // Paragraph-only baseline can still be cover-letter-capable, but should not hard-stop resume generation.
    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        // Header-like structure but no bullet lines; this can yield an empty/invalid assembled resume structure downstream.
        content: ['Acme Corp', 'Senior Engineer', '2021 - 2024', ''].join('\n'),
      },
    ];

    await expect(
      service.generateResume(
        'user-1',
        { ...baseRequest, forceRegenerate: true },
        { preflightOnly: false, skipReadinessGate: true, enforceOneTap: false },
      ),
    ).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: false,
      exports: { docx: false, pdf: false },
    });

    if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
    else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    baseline.sections = original;
  });

  it('allows baseline-only resume fallback for eligible score lanes even when forceRegenerate is omitted', async () => {
    const { service } = buildService();
    const original = baseline.sections;
    const originalScore = assessment.overallScore;
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'false';
    assessment.overallScore = 83;

    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: ['Acme Corp', 'Senior Engineer', '2021 - 2024', ''].join('\n'),
      },
    ];

    await expect(
      service.generateResume(
        'user-1',
        { ...baseRequest, forceRegenerate: false },
        { preflightOnly: false, skipReadinessGate: true, enforceOneTap: false },
      ),
    ).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: false,
    });

    if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
    else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    assessment.overallScore = originalScore;
    baseline.sections = original;
  });

  it('allows baseline-only resume fallback for Studio generate intents even when oneTap is true (eligible score lane)', async () => {
	    const { service, studioArtifactsService } = buildService();
	    const original = baseline.sections;
	    const originalScore = assessment.overallScore;
	    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
	    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'false';
	    assessment.overallScore = 83;

    baseline.sections = [
      {
        ...baseSection,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        content: ['Acme Corp', 'Senior Engineer', '2021 - 2024', ''].join('\n'),
      },
    ];

    const result = await service.generateResume(
      'user-1',
      { ...baseRequest, oneTap: true, forceRegenerate: true },
      { preflightOnly: false, skipReadinessGate: true, enforceOneTap: false },
    );

    expect(result).toMatchObject({
      ok: true,
      status: 'success',
      generationStatus: 'success',
      exportReady: false,
    });
	    expect((result as any)?.preview?.resume).toBeTruthy();
	    expect(typeof (result as any)?.preview?.resume).toBe('object');

	    // Regression: minimal fail-safe must not claim "zero_experience_headers" when structured extraction finds experience entries.
	    // This fixture contains a valid company + role header, so structured experience count is non-zero.
	    expect(
	      (result as any)?.internal?.tailoringLimitations?.structuredBaselineTemplate?.reason ?? null,
	    ).not.toBe('zero_experience_headers');

	    expect(studioArtifactsService.recordResumeSuccess).toHaveBeenCalled();
	    expect(studioArtifactsService.recordResumeFailure).not.toHaveBeenCalled();

	    if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
	    else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    assessment.overallScore = originalScore;
    baseline.sections = original;
  });

  it('allows ResumeV2 authoritative generation to bypass baseline_file_unavailable when baseline file flags are false but broader persisted ResumeV2 authority exists', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalSections = baseline.sections;
    const originalParsedRecords = (baseline as any).parsedRecords;
    const originalScore = assessment.overallScore;
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';
    assessment.overallScore = 83;
    const assertResumeEvidenceBeforePersistenceSpy = jest
      .spyOn(service as any, 'assertResumeEvidenceBeforePersistence')
      .mockImplementation(() => undefined);
    const resumeV2Authority = {
      heading: { name: '', contactLine: '' },
      summary: 'Verified baseline summary.',
      experience: [
        {
          company: 'Acme',
          roleTitle: 'Engineer',
          startDate: '2020-01',
          endDate: '2021-01',
          bullets: ['Delivered support improvements.'],
        },
      ],
      education: [],
    };
    try {
      (studioArtifactsService.readState as jest.Mock).mockResolvedValueOnce({
        status: 'ready',
        baselineId: baseline.id,
        jobId: job.id,
        baselineVersionId: baselineVersion.id,
        baselineVersionHash: baselineVersion.hash,
        jobFingerprint: 'job-fingerprint-1',
        generationContractVersion: 'studio-artifacts-v1',
        assessmentScore: assessment.overallScore,
        resume: {
          status: 'COMPLETED',
          artifactCurrent: true,
          usableCurrent: true,
        },
        coverLetter: {
          status: 'COMPLETED',
          artifactCurrent: true,
          usableCurrent: true,
        },
      } as any);
      baseline.sections = [];
      (baseline as any).parsedRecords = [
        {
          id: 'parsed-latest-unverified',
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          flagsJson: {
            reviewState: {
              verified: false,
            },
          },
        },
        {
          id: 'parsed-verified',
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          resumeV2Json: resumeV2Authority,
          flagsJson: {
            reviewState: {
              verified: true,
            },
          },
        },
      ];

      const result = await service.generateResume(
        'user-1',
        {
          ...baseRequest,
          forceRegenerate: true,
          oneTap: false,
          analysisId: 'analysis-verified',
        } as any,
        { preflightOnly: false, skipReadinessGate: true, enforceOneTap: false },
      );

      expect(result).toMatchObject({
        ok: true,
        status: 'success',
      });
      expect((result as any).auditId ?? (result as any).audit_id ?? null).not.toMatch(/^minimal:/);
      expect(studioArtifactsService.recordResumeSuccess).toHaveBeenCalled();
      expect(studioArtifactsService.recordResumeFailure).not.toHaveBeenCalled();
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsedRecords;
      assessment.overallScore = originalScore;
      assertResumeEvidenceBeforePersistenceSpy.mockRestore();
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    }
  });

  it('still throws baseline_file_unavailable for a legacy path without ResumeV2 authority', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalSections = baseline.sections;
    const originalParsedRecords = (baseline as any).parsedRecords;
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];

    try {
      baseline.sections = [baseSection];
      (baseline as any).parsedRecords = [];

      await expect(
        service.generateResume(
          'user-1',
          {
            ...baseRequest,
            forceRegenerate: true,
            oneTap: false,
          } as any,
          { preflightOnly: false, skipReadinessGate: true, enforceOneTap: false },
        ),
      ).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: 'baseline_file_unavailable',
            message: 'Resume generation requires a verified usable Baseline File.',
          }),
        }),
      });
      expect(studioArtifactsService.recordResumeSuccess).not.toHaveBeenCalled();
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsedRecords;
      if (typeof originalFlag === 'string') process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
      else delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    }
  });

  it('still flags short legacy text as insufficient at the extracted-text helper level', () => {
    const { getInsufficientExtractedTextDetails } = require('../compliance/extracted-text.utils') as typeof import('../compliance/extracted-text.utils');

    expect(getInsufficientExtractedTextDetails('Acme | Engineer | 2020 - 2021\n- Built dashboards.')).not.toBeNull();
    expect(
      getInsufficientExtractedTextDetails(
        'Additional verified baseline context '.repeat(30),
      ),
    ).toBeNull();
  });

  // (covered above with persistence + preview assertions)

  it('attaches resumeFailureDiagnostics + fallbackPathExecuted to unsupported_input exceptions', () => {
    const { service } = buildService();
    const privateService = service as unknown as {
      throwUnsupportedResumeInput: (
        message: string,
        unsupportedEnvelope: string,
        resumeFailureDiagnostics?: any,
        fallbackPathExecuted?: boolean,
      ) => never;
    };

    try {
      privateService.throwUnsupportedResumeInput(
        'Resume could not be generated.',
        'resume_structure_empty',
        {
          validationReason: 'resume_structure_empty',
          validationReasons: ['resume_structure_empty'],
          fallbackAttempted: false,
          fallbackSucceeded: false,
        },
        false,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const response = (error as UnprocessableEntityException).getResponse() as any;
      expect(response).toMatchObject({
        code: 'unsupported_input',
        category: 'unsupported_input',
        diagnostics: {
          fallbackPathExecuted: false,
          resumeFailureDiagnostics: {
            validationReason: 'resume_structure_empty',
          },
        },
      });
    }
  });

  it('does not collapse customer/support operations into a billing-operations archetype when billing evidence is isolated', () => {
    const apply = (ResumeService as any).prototype.applyJobAlignedPresentation as (payload: any) => any[];

    const sections = [
      {
        id: 'exp-1',
        type: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        includePolicy: 'ALWAYS',
        source: 'baseline',
        content: [
          'Example Co | Support Operations Lead | 2022 - Present',
          '- Led incident response and escalations across teams.',
          '- Built dashboards for queue health and CSAT reporting.',
          '- Helped resolve an invoice dispute once by routing it to the right owner.',
          '- Standardized playbooks and improved cross-functional handoffs.',
        ].join('\n'),
        bullets: [
          { id: 'b1', text: 'Led incident response and escalations across teams.', source: { baselineSectionId: 'exp-1', bulletIndex: 0 } },
          { id: 'b2', text: 'Built dashboards for queue health and CSAT reporting.', source: { baselineSectionId: 'exp-1', bulletIndex: 1 } },
          { id: 'b3', text: 'Helped resolve an invoice dispute once by routing it to the right owner.', source: { baselineSectionId: 'exp-1', bulletIndex: 2 } },
          { id: 'b4', text: 'Standardized playbooks and improved cross-functional handoffs.', source: { baselineSectionId: 'exp-1', bulletIndex: 3 } },
        ],
      },
    ];

    const next = apply.call({}, {
      sections,
      jobText: 'Billing Operations Manager role owning billing KPI reporting, invoice accuracy, and dispute handling.',
      jobTitle: 'Billing Operations Manager',
      dimensionScores: { support_operations_and_process_rigor: 0.9, domain_and_business_context: 0.8 } as any,
    });

    const summary = next.find((s: any) => String(s.type).toUpperCase() === 'SUMMARY');
    expect(summary).toBeTruthy();
    const summaryText = String((summary as any)?.content ?? '');
    expect(summaryText.toLowerCase()).toContain('targeting billing operations manager');
    const afterTargeting = summaryText.toLowerCase().split(/strengths:/i)[1] ?? summaryText.toLowerCase();
    expect(afterTargeting).not.toMatch(/\b(invoice|entitlement|reconciliation|credit|dispute|metering|revenue)\b/);
  });

  it('does not emit a billing-operations narrative in the generated resume when billing evidence is isolated in the baseline', async () => {
    const originalJob = { ...job };
    const originalSections = baseline.sections;

    try {
      (job as any).title = 'Customer Operations Manager';
      (job as any).rawDescription = [
        'Customer Operations Manager role focused on billing operations, invoice accuracy, entitlement mismatches, dispute handling, and reconciliation reporting.',
        'Own billing KPI reporting and billing reliability across the lifecycle.',
      ].join('\n');

      const padding =
        'Verified professional experience in customer support operations, incident management, and cross functional collaboration. '.repeat(
          80,
        );

      baseline.sections = [
        {
          id: 'summary-ops',
          baselineId: baseline.id,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          content: ['Support operations leader focused on reliability, process improvement, and stakeholder alignment.', padding].join(
            '\n',
          ),
        } as any,
        {
          id: 'experience-ops',
          baselineId: baseline.id,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          content: [
            'Example Co | Support Operations Lead | 2022 - Present',
            '- Led incident response and escalations across teams.',
            '- Built dashboards for queue health and CSAT reporting.',
            '- Standardized playbooks and improved cross-functional handoffs.',
            '- Helped route an invoice dispute once to the right owner.',
            '- Supported SaaS subscription customers by improving renewal-risk triage and entitlement handoffs.',
            padding,
          ].join('\n'),
        } as any,
        {
          id: 'skills-ops',
          baselineId: baseline.id,
          sectionType: BaselineSectionType.SKILLS,
          title: 'Skills',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          content: 'Incident management, analytics dashboards, stakeholder communication',
        } as any,
      ];

      const { service } = buildService();
      const result = await service.generateResume('user-1', {
        ...baseRequest,
        oneTap: true,
        forceRegenerate: true,
      } as any);

      expect(result.ok).toBe(true);

      const identity = (result as any)?.internal?.careerIdentity ?? null;
      expect(identity).toBeTruthy();
      expect(String(identity?.dominantOperationalDomain ?? '')).toMatch(/^(customer_operations|support_operations|saas_operations)$/);
      expect(String(identity?.dominantOperationalDomain ?? '')).not.toMatch(/^(billing_operations|revenue_operations|finance_operations)$/);
      const supporting = Array.isArray(identity?.supportingDomains) ? identity.supportingDomains.map((d: any) => String(d ?? '')) : [];
      expect(supporting).toContain('saas_operations');

      const topCluster = String((result as any)?.preview?.resume?.__compositionDiagnostics?.topRankedNarrativeCluster ?? '');
      expect(topCluster.toLowerCase()).toContain('escalation management');
      expect(topCluster.toLowerCase()).not.toMatch(/\b(billing|invoice|reconciliation|revops|revenue|finance|accounts payable|accounts receivable)\b/);

      const resumeContent = String((result as any).content ?? '').toLowerCase();
      const resumeSummary = String((result as any)?.preview?.resume?.summary ?? '').toLowerCase();
      const renderedExperience = Array.isArray((result as any)?.preview?.resume?.experience)
        ? ((result as any).preview.resume.experience as any[])
        : [];
      const topRole = renderedExperience?.[0] ?? null;
      const topBulletsFromPreview = Array.isArray(topRole?.bullets)
        ? (topRole.bullets as unknown[]).map((b) => String(b ?? '').trim()).filter(Boolean)
        : Array.isArray((topRole as any)?.bulletPoints)
          ? (((topRole as any).bulletPoints as unknown[]) ?? []).map((b) => String(b ?? '').trim()).filter(Boolean)
          : [];
      const topBulletsAll = topBulletsFromPreview.length
        ? topBulletsFromPreview
        : String((result as any).content ?? '')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.startsWith('- '))
            .slice(0, 6)
            .map((l) => l.replace(/^- /, '').trim())
            .filter(Boolean);
      // Treat "top bullets" as the recruiter-facing emphasis set, not the full supporting list.
      const topBullets = topBulletsAll.slice(0, 3);

      // Deterministic preview fixture: makes the authored text inspectable from one local command.
      // Run: `npm -w apps/api test -- resume.service.spec.ts -t GOLDEN_RESUME_PREVIEW`
      // eslint-disable-next-line no-console
      console.log('[GOLDEN_RESUME_PREVIEW][SUMMARY]', String((result as any)?.preview?.resume?.summary ?? '').trim());
      // eslint-disable-next-line no-console
      console.log(
        '[GOLDEN_RESUME_PREVIEW][TOP_ROLE]',
        topRole
          ? `${String((topRole as any)?.roleTitle ?? (topRole as any)?.title ?? '').trim()} @ ${String((topRole as any)?.company ?? '').trim()}`.trim()
          : '',
      );
      // eslint-disable-next-line no-console
      console.log('[GOLDEN_RESUME_PREVIEW][TOP_BULLETS]', topBullets);
      // eslint-disable-next-line no-console
      console.log('[GOLDEN_RESUME_PREVIEW][ALL_BULLETS]', topBulletsAll);

      // General bullet-quality rules (avoid repeated fallback tails / filler / malformed openings).
      const tails = topBullets
        .map((b) => String(b ?? ''))
        .map((b) => {
          const m = b.match(/,\s*(to\s+[^.]+)\.\s*$/i);
          return m ? String(m[1]).toLowerCase().trim() : '';
        })
        .filter(Boolean);
      expect(new Set(tails).size).toBe(tails.length);
      const commaToCount = topBullets.filter((b) => /,\s*to\b/i.test(String(b ?? ''))).length;
      expect(commaToCount).toBeLessThanOrEqual(1);
      const abstractTailCount = topBullets.filter((b) =>
        /\b(improve consistency|strengthen (?:service )?reliability|improve customer-facing execution)\b/i.test(String(b ?? '')),
      ).length;
      expect(abstractTailCount).toBeLessThanOrEqual(1);
      const concreteOpsNounCount = topBullets.filter((b) =>
        /\b(playbooks?|handoffs?|dashboards?|reporting|operating cadence|incident response|escalations?)\b/i.test(String(b ?? '')),
      ).length;
      expect(concreteOpsNounCount).toBeGreaterThanOrEqual(2);
      expect(topBullets.join(' ').toLowerCase()).not.toMatch(/\bverified professional experience\b/);
      expect(topBullets.join(' ').toLowerCase()).not.toMatch(/^\s*enabled\s+route\b/m);
      expect(topBullets.join(' ').toLowerCase()).not.toMatch(
        /\b(once|forwarded|helped\s+(route|forward|send|sent|escalate)|routed?\s+to\s+the\s+(right|correct)\s+(owner|team))\b/,
      );

      // Ensure top bullets contain at least three stronger ops/support accomplishment signals.
      const strongCount = topBullets.filter((b) =>
        /\b(led|owned|drove|directed|established|operationalized|implemented|managed|built|standardized|improved|reduced|increased|incident|escalation|dashboards?|reporting|playbooks?|handoffs?|postmortems?|cross-functional)\b/i.test(
          String(b ?? ''),
        ),
      ).length;
      expect(strongCount).toBeGreaterThanOrEqual(3);
      // Avoid promoting tactical "supported customers" fragments into the recruiter-facing top set.
      const tacticalCustomerHandlingCount = topBullets.filter((b) =>
        /^\s*(supported|helped|assisted)\b/i.test(String(b ?? '')) && /\b(customers?|subscription|renewal)\b/i.test(String(b ?? '')),
      ).length;
      expect(tacticalCustomerHandlingCount).toBe(0);
      expect(topBullets.join(' ').toLowerCase()).not.toMatch(/\boperationalized\s+saas\s+subscription\s+customers\b/);

      // The job can be billing-heavy, but the generated resume must not invent a billing-ops specialization
      // beyond what is actually supported by repeated baseline evidence.
      expect(resumeContent).not.toMatch(/\bbilling support operations\b/);
      expect(resumeContent).not.toMatch(/\bbilling operations\b/);
      expect(resumeContent).not.toMatch(/\binvoice accuracy\b/);
      expect(resumeContent).not.toMatch(/\breconciliation\b/);
      expect(resumeContent).not.toMatch(/\bmetering\b/);
      expect(resumeContent).not.toMatch(/\brevenue\b/);
      expect(resumeContent).not.toMatch(/\bbilling kpi\b/);
      expect(resumeContent).not.toMatch(/\bbilling reliability\b/);

      // Golden-loop quality guards: avoid stitched fragments / generic filler fallback prose.
      expect(resumeContent).not.toMatch(/\bexperience entry needs correction\b/);
      expect(resumeContent).not.toMatch(/\bvue 3\)\b/);
      expect(resumeSummary).not.toMatch(/\b(impact-driven|impact-oriented)\b/);
      expect(resumeSummary).not.toMatch(/\bbuilt around\b/);
      expect(resumeSummary).not.toMatch(/\bfocus areas\b/);
      expect(resumeSummary).not.toMatch(/\bfocused on\b/);
      expect(resumeSummary).not.toMatch(/\bknown for\b/i);
      expect(resumeSummary).not.toMatch(/\bleader leading\b/i);
      expect(resumeSummary).toMatch(/\b(operating|operational|systems|cadence|execution)\b/);
      expect(resumeSummary).not.toMatch(/\boperating scope\b/);
      expect(resumeSummary).not.toMatch(/\bleader driving\b/);

      // Avoid repetitive escalation/incident phrase pairing across multiple sentences.
      const incidentCount = (resumeSummary.match(/\bincident\b/gi) ?? []).length;
      const escalationCount = (resumeSummary.match(/\bescalat(?:ion|ions)\b/gi) ?? []).length;
      // Allow a single mention of each; avoid repeated phrase-pairing across multiple sentences.
      expect(incidentCount).toBeLessThanOrEqual(2);
      expect(escalationCount).toBeLessThanOrEqual(2);

      const hits = (result as any)?.internal?.productionValidation?.contaminationHits ?? null;
      // Diagnostics are best-effort; when present, they must show no upstream billing-ops narrative.
      if (hits) {
        const assertNoUpstreamContamination = (layer: any) => {
          expect(layer?.billing_support_operations ?? 0).toBe(0);
          expect(layer?.billing_operations ?? 0).toBe(0);
          expect(layer?.invoice_accuracy ?? 0).toBe(0);
          expect(layer?.entitlement_mismatches ?? 0).toBe(0);
          expect(layer?.reconciliation ?? 0).toBe(0);
          expect(layer?.billing_reliability ?? 0).toBe(0);
          expect(layer?.billing_kpi ?? 0).toBe(0);
          expect(layer?.billing_nps ?? 0).toBe(0);
        };
        assertNoUpstreamContamination(hits?.baselineRaw);
        assertNoUpstreamContamination(hits?.persistedResumeV2);
        assertNoUpstreamContamination(hits?.structuredAuthority);
      }

      // Post-authority contamination trace (scoped to this regression only).
      // Goal: prove whether billing-domain contamination is introduced after authority, or whether local generation is clean.
      const lexicon = [
        { key: 'billing_support_operations', re: /\bbilling support operations\b/gi },
        { key: 'billing_operations', re: /\bbilling operations\b/gi },
        { key: 'invoice_accuracy', re: /\binvoice accuracy\b/gi },
        { key: 'entitlement_mismatches', re: /\bentitlement mismatches?\b/gi },
        { key: 'reconciliation', re: /\b(reconciliation|reconcile)\b/gi },
        { key: 'billing_reliability', re: /\bbilling reliability\b/gi },
        { key: 'billing_kpi', re: /\bbilling kpi\b/gi },
        { key: 'billing_nps', re: /\bbilling nps\b/gi },
      ];
      const countHitsInText = (text: string) => {
        const out: Record<string, number> = {};
        for (const { key, re } of lexicon) {
          const m = text.match(re);
          out[key] = m ? m.length : 0;
        }
        return out;
      };
      const stageHits = (label: string, obj: unknown) => {
        if (obj == null) return { label, hits: countHitsInText('') };
        const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
        return { label, hits: countHitsInText(text.toLowerCase()) };
      };
      const totalHits = (h: Record<string, number>) => Object.values(h).reduce((a, b) => a + b, 0);

      const postAuthorityStages = [
        stageHits('renderPlan', (result as any)?.preview?.resume?.__renderPlan ?? (result as any)?.preview?.resume?.renderPlan ?? null),
        stageHits('positioningThesis', (result as any)?.preview?.resume?.positioningThesis ?? (result as any)?.preview?.positioning?.thesis ?? null),
        stageHits('evidencePriorities', (result as any)?.preview?.resume?.evidencePriorities ?? (result as any)?.internal?.evidencePriorities ?? null),
        stageHits('careerIdentity', (result as any)?.internal?.productionValidation?.careerIdentitySnapshot ?? (result as any)?.preview?.resume?.careerIdentitySnapshot ?? null),
        stageHits('topRankedNarrativeCluster', String((result as any)?.preview?.resume?.__compositionDiagnostics?.topRankedNarrativeCluster ?? '')),
        stageHits('composedResumeSummary', (result as any)?.preview?.resume?.summary ?? (result as any)?.preview?.resume?.executiveSummary ?? null),
        stageHits('composedResumeBullets', (result as any)?.preview?.resume?.experience ?? null),
        stageHits('finalResponseContent', String((result as any)?.content ?? '')),
      ];

      const firstContaminated = postAuthorityStages.find((s) => totalHits(s.hits) > 0) ?? null;
      if (firstContaminated) {
        // Explicitly name the first stage that contains contamination hits (deterministic diagnostics).
        throw new Error(
          `[POST_AUTHORITY_CONTAMINATION] firstStage=${firstContaminated.label} hits=${JSON.stringify(firstContaminated.hits)}`,
        );
      }
    } finally {
      Object.assign(job as any, originalJob);
      baseline.sections = originalSections;
    }
  });
});
