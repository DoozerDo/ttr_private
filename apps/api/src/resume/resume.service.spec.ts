import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  ResumeService,
  GenerateResumeRequest,
  buildFailSafeExperienceContentFromStructuredAndBaseline,
  resolveCanonicalResumeIdentity,
} from './resume.service';
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
import { resolveBaselineSectionsForGeneration } from '../baseline/baseline-section-source';
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

  const baselineRecoveryService = {
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
    baselineRecoveryService,
  );

  return {
    service,
    baselineRepo,
    assessmentRepo,
    complianceService,
    applicationsService,
    opportunitiesService,
    studioArtifactsService,
    workflowIdempotencyService,
  };
};

describe('resolveCanonicalResumeIdentity', () => {
  it('prefers canonical resume authority heading contact details over empty baseline identity fields', () => {
    expect(
      resolveCanonicalResumeIdentity({
        baselineIdentity: { fullName: null, contactLine: null, links: [] },
        resumeAuthorityHeading: {
          name: 'Test Candidate',
          contactLine: 'test@example.com | Seattle, WA',
          links: ['https://example.com'],
        },
      }),
    ).toEqual({
      name: 'Test Candidate',
      contactLine: 'test@example.com | Seattle, WA',
      links: ['https://example.com'],
    });
  });
});

describe('ResumeService contract', () => {



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

    const result = await service.generateResume(
      'user-1',
      { ...baseRequest, oneTap: true } as any,
      { skipReadinessGate: true, enforceOneTap: true } as any,
    );
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

    const result = await service.generateResume(
      'user-1',
      { ...baseRequest, oneTap: true } as any,
      { skipReadinessGate: true, enforceOneTap: true } as any,
    );
    expect(String(result.preview?.resume?.experience?.[0]?.roleTitle ?? '')).not.toBe(
      'Technical Architect & Full',
    );

    baseline.sections = originalSections;
  });

  it('rebuilds the canonical preview from populated success sections and drops stale reuse errors', async () => {
    const { service, workflowIdempotencyService } = buildService();
    const originalSections = baseline.sections;
    baseline.sections = [baseSection] as any;

    (workflowIdempotencyService.reserve as jest.Mock).mockResolvedValueOnce({
      status: 'existing_completed',
      runId: 'audit-1',
      responseBody: {
        ok: true,
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        blocked: false,
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
        sections: [
          {
            id: 'exp-1',
            type: 'EXPERIENCE',
            title: 'Experience',
            order: 1,
            content: [
              'Example Co | Support Operations Lead | 2022 - Present',
              '- Led incident response and escalations across teams.',
              '- Built dashboards for queue health and CSAT reporting.',
            ].join('\n'),
          },
        ],
        compliance_flags: [],
        compliance_blocked: false,
        audit_id: 'audit-1',
        auditId: 'audit-1',
        baseline_version_hash: 'hash-1',
        quality: 'draft',
        exports: { docx: true, pdf: true },
        error: "We couldn't generate a clean document...",
        preview: {
          resume: {
            heading: { name: 'Test Candidate', contactLine: '' },
            summary: 'Test summary',
            experience: [],
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

    try {
      const result = await service.generateResume(
        'user-1',
        { ...baseRequest, oneTap: true } as any,
        { skipReadinessGate: true, enforceOneTap: true } as any,
      );
      expect(result.ok).toBe(true);
      expect((result as any).error).toBeUndefined();
      expect(Array.isArray((result as any)?.preview?.resume?.experience)).toBe(true);
      expect((result as any)?.preview?.resume?.experience?.length).toBeGreaterThan(0);
      expect(String((result as any)?.preview?.resume?.experience?.[0]?.company ?? '')).toBe('Example Co');
    } finally {
      baseline.sections = originalSections;
    }
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


  it('resolves the latest assessment by baselineId instead of treating the baseline as an assessmentId', async () => {
    const { service, assessmentRepo } = buildService();
    const observed: { clauses: string[] } = { clauses: [] };
    const qb: Record<string, jest.Mock> = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockImplementation((clause: string) => {
        observed.clauses.push(clause);
        return qb;
      }),
      orderBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockImplementation(async () => {
        const usesAssessmentIdFilter = observed.clauses.some((clause) =>
          clause.includes('assessment.id = :assessmentId'),
        );
        if (usesAssessmentIdFilter) return null;
        return {
          assessment_id: assessment.id,
          assessment_userId: assessment.userId,
          assessment_jobId: assessment.jobId,
          assessment_baselineId: assessment.baselineId,
          assessment_baselineVersion: assessment.baselineVersion,
          assessment_overallScore: assessment.overallScore,
          assessment_verdict: assessment.verdict,
          assessment_dimensionScores: assessment.dimensionScores,
          assessment_strengths: assessment.strengths,
          assessment_gaps: assessment.gaps,
          assessment_complianceFlags: assessment.complianceFlags,
          assessment_confidenceScore: assessment.confidenceScore,
          assessment_confidenceReasons: assessment.confidenceReasons,
          assessment_scoringReliability: assessment.scoringReliability,
          assessment_scoringReliabilityReason: assessment.scoringReliabilityReason,
          assessment_scoringV2: assessment.scoringV2,
          assessment_inputsHash: assessment.inputsHash,
          assessment_createdAt: assessment.createdAt,
        };
      }),
    };
    assessmentRepo.createQueryBuilder = jest.fn().mockReturnValue(qb) as any;

    const latestAssessment = await (service as any).findLatestAssessment(
      'user-1',
      'job-1',
      baseline.id,
    );

    expect(observed.clauses).toContain('assessment.baselineId = :baselineId');
    expect(observed.clauses).not.toContain('assessment.id = :assessmentId');
    expect(latestAssessment?.overallScore).toBe(assessment.overallScore);
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






  // Note: analysisId is required for generation requests. Readiness recovery is handled by
  // verified-only generation (`oneTap`) rather than allowing analysis-less execution.





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






  it('does not fail the canonical persistence guard when internal trace evidence is missing but resume input evidence exists', () => {
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
    const resumeInputSections = [
      {
        id: 'section-experience',
        baselineId: 'baseline-1',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Acme | Operator | 2020 - 2022',
          '- Improved service reliability.',
        ].join('\n'),
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ];

    expect(() =>
      guard({
        responseBody,
        resumeInputSections,
        allowedSections: resumeInputSections,
        promotedExperienceLikeSectionsCount: 1,
      }),
    ).not.toThrow();
  });











  // (covered above with persistence + preview assertions)


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

});
