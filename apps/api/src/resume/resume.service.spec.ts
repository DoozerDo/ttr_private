import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import JSZip from 'jszip';
import { Repository } from 'typeorm';
import { BaselineStatus, Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { ComplianceService } from '../compliance/compliance.service';
import type { ValidateAndAuditResult } from '../compliance/compliance.service';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
  DocumentType,
} from '../compliance/compliance.types';
import { detectInventedRole } from '../compliance/detectors';
import { ScopeInflationDetector } from '../compliance/scope-inflation-detector';
import { AUTO_GENERATE_THRESHOLD } from '../config/autoGenerateThreshold';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { ApplicationsService } from '../applications/applications.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { CriticalFlowTrackerService } from '../support/critical-flow-tracker.service';
import { ResumeService, GenerateResumeRequest } from './resume.service';
import * as resumeDraftBullets from './resume-draft-bullets';

const baselineSection: BaselineSection = {
  id: 'section-1',
  baselineId: 'baseline-1',
  sectionType: BaselineSectionType.EXPERIENCE,
  title: 'Experience',
  content: `John Candidate
San Francisco - (555) 555-5555 - john@example.com

Senior Program Manager | Acme Corp | 2020 - 2023

- Led automation efforts that reduced defects.
- Mentored engineers and delivered measurable results.`,
  includePolicy: BaselineIncludePolicy.ALWAYS,
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const summarySection: BaselineSection = {
  id: 'section-2',
  baselineId: 'baseline-1',
  sectionType: BaselineSectionType.SUMMARY,
  title: 'Summary',
  content: `Summary
Experienced program manager leading cross-functional teams focused on measurable ops impact.
- Delivered key orchestration initiatives.

Skills
Technical Strategy, Automation, Analytics, Coaching, Leadership, Stakeholder Management, Process Design
`,
  includePolicy: BaselineIncludePolicy.ALWAYS,
  order: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const skillsSection: BaselineSection = {
  id: 'section-3',
  baselineId: 'baseline-1',
  sectionType: BaselineSectionType.SKILLS,
  title: 'Skills',
  content: `Skills
Technical Strategy, Automation, Analytics, Coaching, Leadership, Stakeholder Management`,
  includePolicy: BaselineIncludePolicy.ALWAYS,
  order: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const extraSection: BaselineSection = {
  id: 'section-4',
  baselineId: 'baseline-1',
  sectionType: BaselineSectionType.EXPERIENCE,
  title: 'Experience',
  content: `Experience
Senior Consultant | Beta Co | 2017 - 2019
- Released quarterly roadmap on time.
- Coordinated with partners for cross-team alignment.

Project Lead | Gamma Inc | 2014 - 2016
- Guided product launches with cross-functional teams.
- Standardized reporting across regions.`,
  includePolicy: BaselineIncludePolicy.ALWAYS,
  order: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockBaseline: Baseline = {
  id: 'baseline-1',
  userId: 'user-1',
  version: 1,
  originalFilename: 'resume.docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  storagePath: '/tmp/resume.docx',
  hash: null,
  status: BaselineStatus.ACTIVE,
  archivedAt: null,
  sections: [baselineSection, summarySection, skillsSection, extraSection],
  parsedRecords: [],
  versions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockBaselineVersion: BaselineVersion = {
  id: 'baseline-version-1',
  baseline: mockBaseline,
  baselineId: 'baseline-1',
  versionNumber: 3,
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

const mockJob: Job = {
  id: 'job-1',
  userId: 'user-1',
  company: 'Example Co',
  rawDescription: 'Job description',
  sourceUrl: null,
  sourceProviderId: null,
  sourceExternalId: null,
  canonicalUrl: null,
  dedupeHash: null,
  normalizedResponsibilities: [],
  normalizedRequirements: [],
  jdIngestionMethod: JobIngestionMethod.PASTE,
  jdParsedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  isArchived: false,
};

const baseRequest: GenerateResumeRequest = {
  baselineId: 'baseline-1',
  baselineVersionId: 'baseline-version-1',
  jobId: 'job-1',
  analysisId: 'analysis-1',
  oneTap: true,
};

type MockedComplianceService = jest.Mocked<ComplianceService>;

const buildRepository = <T>(
  overrides: Partial<Repository<T>> = {},
): Repository<T> =>
  ({
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    ...overrides,
  }) as unknown as Repository<T>;

const createComplianceServiceMock = (
  writingFlags: ComplianceFlag[],
  baselineVersionOverride: Partial<BaselineVersion> | null,
  override: Partial<MockedComplianceService> = {},
): MockedComplianceService => {
  const auditResult: ValidateAndAuditResult = {
    complianceFlags: writingFlags,
    blocked: writingFlags.length > 0,
    audit: {
      id: 'audit-1',
      baselineVersionId: baselineVersionOverride?.id ?? mockBaselineVersion.id,
      baselineVersionHash:
        baselineVersionOverride?.fileHash ??
        baselineVersionOverride?.hash ??
        mockBaselineVersion.fileHash,
      outputHash: '',
      action: ComplianceAction.RESUME_GENERATION,
      actorId: 'user-1',
      jobId: mockJob.id,
      createdAt: new Date().toISOString(),
    },
  };

  return {
    enforceResumeWritingRules: jest.fn().mockReturnValue(writingFlags),
    detectScopeInflation: jest.fn().mockResolvedValue([]),
    normalizeSectionsForOutput: jest
      .fn()
      .mockImplementation((sections) => sections),
    validateAndAudit: jest.fn().mockResolvedValue(auditResult),
    ...override,
  } as MockedComplianceService;
};

const buildService = (
  fitScore: number,
  writingFlags: ComplianceFlag[] = [],
  baselineVersionOverride: Partial<BaselineVersion> | null = mockBaselineVersion,
  complianceOverride: Partial<MockedComplianceService> = {},
) => {
  const baselineRepository = buildRepository<Baseline>({
    findOne: jest.fn().mockResolvedValue(mockBaseline),
  });
  const baselineVersionRepository = buildRepository<BaselineVersion>({
    findOne: jest.fn().mockResolvedValue(baselineVersionOverride),
  });
  const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
    find: jest.fn().mockResolvedValue([]),
  });
  const jobsRepository = buildRepository<Job>({
    findOne: jest.fn().mockResolvedValue(mockJob),
  });
  const fitAssessmentRepository = buildRepository<FitAssessment>({
    findOne: jest.fn().mockResolvedValue({
      id: 'analysis-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'baseline-1',
      baselineVersion: mockBaselineVersion.versionNumber,
      overallScore: fitScore,
    } as FitAssessment),
  });

  const complianceService = createComplianceServiceMock(
    writingFlags,
    baselineVersionOverride,
    complianceOverride,
  );

  const applicationsService = {
    upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
      id: 'tracker-entry',
      status: 'Prepared',
    }),
  } as Partial<ApplicationsService>;
  const opportunitiesService = {
    createFromResumeStudio: jest.fn().mockResolvedValue({
      id: 'opportunity-1',
    }),
  } as Partial<OpportunitiesService>;
  const gapAnalysisService = {
    analyze: jest.fn().mockReturnValue(null),
  } as Partial<GapAnalysisService>;
  const criticalFlowTrackerService = {
    recordCriticalFlowEvent: jest.fn().mockResolvedValue(undefined),
  } as Partial<CriticalFlowTrackerService>;

  const service = new ResumeService(
    baselineRepository,
    baselineVersionRepository,
    baselineBlockPolicyRepository,
    jobsRepository,
    fitAssessmentRepository,
    complianceService,
    applicationsService as ApplicationsService,
    opportunitiesService as OpportunitiesService,
    gapAnalysisService as GapAnalysisService,
    criticalFlowTrackerService as CriticalFlowTrackerService,
  );

  return {
    service,
    complianceService,
    applicationsService: applicationsService as jest.Mocked<ApplicationsService>,
    opportunitiesService: opportunitiesService as jest.Mocked<OpportunitiesService>,
  };
};

async function assertValidDocxZip(
  buffer: Buffer,
  options?: {
    expectParagraphs?: boolean;
    expectBullets?: boolean;
    expectStyles?: boolean;
    expectExperienceHeader?: boolean;
    expectSectionHeaders?: boolean;
    expectExperienceSpacing?: boolean;
  },
) {
  expect(buffer.byteLength).toBeGreaterThan(1000);
  expect(buffer[0]).toBe(0x50);
  expect(buffer[1]).toBe(0x4b);
  expect(buffer[2]).toBe(0x03);
  expect(buffer[3]).toBe(0x04);
  const zip = await JSZip.loadAsync(buffer);
  const contentTypes = zip.file('[Content_Types].xml');
  expect(contentTypes).toBeDefined();

  if (options?.expectParagraphs || options?.expectBullets) {
    const documentXml = await zip.file('word/document.xml')!.async('text');
    if (options?.expectParagraphs) {
      const paragraphMatches = documentXml.match(/<w:p\b/g);
      expect(paragraphMatches?.length ?? 0).toBeGreaterThan(10);
    }
    if (options?.expectStyles) {
      expect(documentXml).toContain('<w:b');
    }
    if (options?.expectSectionHeaders) {
      expect(documentXml).toContain('SUMMARY');
      expect(documentXml).toContain('TECHNICAL SKILLS');
      expect(documentXml).toContain('PROFESSIONAL EXPERIENCE');
    }
    if (options?.expectExperienceHeader) {
      expect(documentXml).toContain('Senior Program Manager');
      expect(documentXml).toContain('Beta Co');
      expect(documentXml).toContain('Gamma Inc');
    }
    if (options?.expectExperienceSpacing) {
      expect(documentXml).toContain('w:after="120"');
    }
    if (options?.expectBullets) {
      expect(documentXml).toContain('<w:numPr>');
    }
  }
}

describe('ResumeService', () => {
  it('rejects one-tap generation when fit score is below the threshold', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD - 1);

    await expect(
      service.generateResume('user-1', baseRequest),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('includes the threshold in the rejection response', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD - 2);

    await expect(
      service.generateResume('user-1', baseRequest),
    ).rejects.toMatchObject({
      response: {
        error: {
          message: `One tap resume generation requires fit score >= ${AUTO_GENERATE_THRESHOLD}.`,
        },
      },
    });
  });

  it('requires a baselineVersionId for generation', async () => {
    const { service } = buildService(95);

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        baselineVersionId: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails export safely when generation does not produce a valid normalized resume model', async () => {
    const { service } = buildService(95);
    jest.spyOn(service, 'generateResume').mockResolvedValue({
      ok: false,
      status: 'error',
      generationStatus: 'error',
      exportReady: false,
      blocked: false,
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      sections: [],
      compliance_flags: [],
      compliance_blocked: false,
      audit_id: null,
      auditId: null,
      baseline_version_hash: 'hash-1',
      quality: 'draft',
      exports: { docx: false, pdf: false },
      preview: { resume: null },
      trackerEntryId: null,
      trackerStatus: null,
      opportunityId: null,
      claimRiskSummary: { high: 0, medium: 0, low: 0 },
      gapAnalysis: null,
      gapGuidance: null,
      display: {
        title: 'Resume generation failed',
        description: 'Unable to generate',
        reasons: [],
        cta: { label: 'Review', href: '/results' },
      },
      safeDisplay: {
        title: 'Resume generation failed',
        description: 'Unable to generate',
        reasons: [],
        cta: { label: 'Review', href: '/results' },
      },
      internal: { complianceFlags: [] },
    } as any);

    await expect(service.exportResume('user-1', baseRequest, 'docx')).rejects.toMatchObject({
      response: {
        error: {
          code: 'NORMALIZATION_FAILED',
        },
      },
    });
  });

  it('allows one-tap generation when score meets threshold', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD);

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('success');
    expect(result.generationStatus).toBe('success');
    expect(result.exportReady).toBe(true);
    expect(result.exports).toEqual({ docx: true, pdf: true });
    expect(result.preview?.resume?.experience?.length ?? 0).toBeGreaterThan(0);
    expect(result.safeDisplay).toMatchObject({
      title: 'Resume generated successfully',
    });
    expect(result.sections).toHaveLength(4);
  });

  it('fails with stage-level anchor diagnostics when drafted bullets cannot map to baseline spans', async () => {
    const { service } = buildService(95);
    const anchorSpy = jest
      .spyOn(resumeDraftBullets, 'validateResumeDraftBulletAnchors')
      .mockReturnValue({
        valid: false,
        reasons: ['Bullet "well as the backend infrastructure" does not map to baseline sentence spans for section section-1.'],
      });

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('error');
    expect(result.safeDisplay?.reasons?.[0]).toContain(
      'Drafted experience bullets could not be anchored',
    );
    expect((result.internal as any)?.normalizationDiagnostics?.stageFailureReason).toContain(
      'Draft bullet anchoring failed before compliance evaluation',
    );
    expect((result.internal as any)?.anchorValidationReasons?.length ?? 0).toBeGreaterThan(0);

    anchorSpy.mockRestore();
  });

  it('generates resume successfully when verified experience uses lowercase single-word company names', async () => {
    const longSummaryBody =
      'Experienced operations leader improving support delivery, cross functional planning, incident governance, onboarding quality, and customer communication across complex programs. '.repeat(
        6,
      );
    const lowercaseCompanyBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          content: [
            'producer | playstudios | 2018 - 2020',
            '- Led social casino release planning and content operations.',
          ].join('\n'),
        },
        {
          ...summarySection,
          content: `Summary\n${longSummaryBody}`,
        },
        skillsSection,
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(lowercaseCompanyBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-1',
        overallScore: 92,
      } as FitAssessment),
    });
    const complianceService = createComplianceServiceMock([], mockBaselineVersion);

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    expect(result.preview?.resume?.experience.length).toBeGreaterThan(0);
    expect(result.preview?.resume?.experience[0]?.company.toLowerCase()).toBe(
      'playstudios',
    );
  });

  it('surfaces stage-level diagnostics when experience is dropped by include policy filtering', async () => {
    const longSummaryBody =
      'Experienced operations leader improving support delivery, cross functional planning, incident governance, onboarding quality, and customer communication across complex programs. '.repeat(
        6,
      );
    const policyDroppedBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          sectionType: BaselineSectionType.OTHER,
          title: 'Work History',
          includePolicy: BaselineIncludePolicy.NEVER,
        },
        {
          ...summarySection,
          content: `Summary\n${longSummaryBody}`,
        },
        skillsSection,
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(policyDroppedBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-1',
        overallScore: 92,
      } as FitAssessment),
    });
    const complianceService = createComplianceServiceMock([], mockBaselineVersion);

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('error');
    expect(result.safeDisplay?.reasons?.[0]).toContain(
      'removed by include policy before resume assembly',
    );
    expect((result.internal as any)?.normalizationDiagnostics).toMatchObject({
      baselineVersionLoaded: true,
      totalBaselineSections: 3,
      candidateExperienceLikeSections: 1,
      candidateExperienceLikeRetainedSections: 0,
      strictTypedExperienceSections: 0,
      allowedExperienceSections: 0,
      sectionTypeHistogram: expect.objectContaining({
        OTHER: 1,
      }),
    });
  });

  it('promotes legacy work-history shaped sections into resume experience inputs', async () => {
    const legacyWorkHistoryBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          sectionType: BaselineSectionType.OTHER,
          title: 'Work History',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content: [
            'Support Operations Manager | acme | 2021 - 2024',
            '- Led incident escalation governance and SLA recovery workflows.',
            '- Improved cross functional queue management and service quality.',
          ].join('\n'),
        },
        {
          ...summarySection,
          content:
            'Summary\nExperienced support operations leader with multi year ownership of escalation systems, workforce planning, and cross functional service quality outcomes across enterprise workflows.'.repeat(
              4,
            ),
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(legacyWorkHistoryBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-1',
        overallScore: 92,
      } as FitAssessment),
    });

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      createComplianceServiceMock([], mockBaselineVersion),
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    expect(result.preview?.resume?.experience.length).toBeGreaterThan(0);
    expect((result.internal as any)?.normalizationDiagnostics).toMatchObject({
      baselineVersionLoaded: true,
      totalBaselineSections: 2,
      candidateExperienceLikeSections: 1,
      strictTypedExperienceSections: 0,
      baselineExperienceSections: 1,
      allowedExperienceSections: 1,
      sectionTypeHistogram: expect.objectContaining({
        OTHER: 1,
      }),
    });
  });

  it('falls back to parsed baseline experience when baseline sections are unavailable', async () => {
    const parsedOnlyBaseline: Baseline = {
      ...mockBaseline,
      sections: [],
      parsedRecords: [
        {
          id: 'parsed-1',
          baselineId: 'baseline-1',
          sourceFileId: 'file-1',
          schemaVersion: '1',
          sourceFormat: 'docx',
          ingestedAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          flagsJson: {},
          parsedJson: {
            experience: [
              {
                company_name: 'Acme Corp',
                role_title: 'Support Operations Manager',
                start_date: '2021',
                end_date: '2024',
                details_text:
                  (
                    'Led incident escalation governance and SLA recovery workflows while coordinating cross functional operations planning and execution. ' +
                    'Built repeatable support intake and triage playbooks with clear ownership, quality checkpoints, and weekly review cadence. '
                  ).repeat(4),
              },
            ],
            identity: { full_name: 'Jordan Lee' },
          },
        } as any,
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(parsedOnlyBaseline),
    });
    const service = new ResumeService(
      baselineRepository,
      buildRepository<BaselineVersion>({
        findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
      }),
      buildRepository<BaselineBlockPolicy>({ find: jest.fn().mockResolvedValue([]) }),
      buildRepository<Job>({ findOne: jest.fn().mockResolvedValue(mockJob) }),
      buildRepository<FitAssessment>({
        findOne: jest.fn().mockResolvedValue({
          id: 'fit-1',
          overallScore: 95,
        } as FitAssessment),
      }),
      createComplianceServiceMock([], mockBaselineVersion),
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    expect(result.preview?.resume?.experience?.length ?? 0).toBeGreaterThan(0);
    expect((result.internal as any)?.normalizationDiagnostics?.baselineExperienceSections).toBeGreaterThan(0);
  });

  it('returns stage-specific diagnostics when no logical units can be reconstructed', async () => {
    const noLogicalUnitBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          content: '',
        },
        {
          ...summarySection,
          content:
            'Summary\nExperienced operations leader with verified planning, delivery, and cross functional execution context across complex support programs.'.repeat(
              5,
            ),
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(noLogicalUnitBaseline),
    });
    const service = new ResumeService(
      baselineRepository,
      buildRepository<BaselineVersion>({
        findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
      }),
      buildRepository<BaselineBlockPolicy>({ find: jest.fn().mockResolvedValue([]) }),
      buildRepository<Job>({ findOne: jest.fn().mockResolvedValue(mockJob) }),
      buildRepository<FitAssessment>({
        findOne: jest.fn().mockResolvedValue({
          id: 'fit-1',
          overallScore: 95,
        } as FitAssessment),
      }),
      createComplianceServiceMock([], mockBaselineVersion),
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('error');
    expect((result.internal as any)?.resumeGenerationReason).toBe(
      'no_logical_units_reconstructed',
    );
    expect((result.internal as any)?.resumeGenerationStage).toBe(
      'logical_unit_reconstruction',
    );
    expect(result.safeDisplay?.description).toContain(
      'no logical experience content could be reconstructed',
    );
  });

  it('returns stage-specific diagnostics when no valid evidence units can be extracted', async () => {
    const noEvidenceBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          content: [
            'Support Operations Manager | Acme Corp | 2021 - 2024',
            'well as the backend infrastructure',
            'and ongoing platform support',
          ].join('\n'),
        },
        {
          ...summarySection,
          content:
            'Summary\nExperienced operations leader with verified planning, delivery, and cross functional execution context across complex support programs.'.repeat(
              5,
            ),
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(noEvidenceBaseline),
    });
    const service = new ResumeService(
      baselineRepository,
      buildRepository<BaselineVersion>({
        findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
      }),
      buildRepository<BaselineBlockPolicy>({ find: jest.fn().mockResolvedValue([]) }),
      buildRepository<Job>({ findOne: jest.fn().mockResolvedValue(mockJob) }),
      buildRepository<FitAssessment>({
        findOne: jest.fn().mockResolvedValue({
          id: 'fit-1',
          overallScore: 95,
        } as FitAssessment),
      }),
      createComplianceServiceMock([], mockBaselineVersion),
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    const experienceSection = result.sections.find(
      (section) => section.type === BaselineSectionType.EXPERIENCE,
    );
    expect(experienceSection?.bullets?.length).toBeGreaterThan(0);
    expect(experienceSection?.bullets?.[0]?.text).toContain(
      'Experienced operations leader with verified planning',
    );
  });

  it('applies role-targeted bullet ordering and keeps export path working', async () => {
    const baselineWithTargetedBullets: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          content: [
            'Director, Support Operations | Acme Corp | 2020 - 2023',
            '- Facilitated cross-team planning sessions.',
            '- Led incident escalation workflows, SLA recovery, and ServiceNow automation.',
          ].join('\n'),
        },
        summarySection,
        skillsSection,
        extraSection,
      ],
    };

    const targetedJob: Job = {
      ...mockJob,
      rawDescription:
        'Own incident escalation, support operations excellence, SLA targets, and ServiceNow automation.',
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(baselineWithTargetedBullets),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(targetedJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-targeted-1',
        overallScore: 92,
      } as FitAssessment),
    });

    const complianceService = createComplianceServiceMock([], mockBaselineVersion);
    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const generated = await service.generateResume('user-1', baseRequest);
    const experienceSection = generated.sections.find(
      (section) => section.type === BaselineSectionType.EXPERIENCE,
    );
    expect(experienceSection?.bullets?.[0]?.text).toContain(
      'incident escalation workflows',
    );

    const exported = await service.exportResume('user-1', baseRequest, 'docx');
    expect(exported.buffer.byteLength).toBeGreaterThan(1000);
  });

  it('runtime generation path suppresses malformed sections and preserves separate experience bullets', async () => {
    const baselineWithBrokenSections: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...summarySection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content: [
            'SUMMARY',
            'â€¢',
            'â€¢',
            'â€¢',
            'Background context line to keep extracted baseline text above minimum validation thresholds by including additional verified narrative about support operations planning, incident governance, and cross-functional coordination.',
          ].join('\n'),
        },
        {
          ...skillsSection,
          sectionType: BaselineSectionType.SKILLS,
          title: 'Core Competencies',
          content: 'â€¢  â€¢  â€¢',
        },
        {
          ...baselineSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Support Operations Manager | Example Co | 2021 - 2025',
            'â€¢ Managed revenue-impacting incident workflows â€¢ Led billing support operations â€¢ Directed two team members',
            'Partnered across product and operations teams to maintain incident response governance and process quality.',
            'Documented operational playbooks, maintained service quality standards, and coordinated weekly readiness reviews for customer-facing escalation channels.',
          ].join('\n'),
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(baselineWithBrokenSections),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-runtime-path-1',
        overallScore: 92,
      } as FitAssessment),
    });

    const complianceService = createComplianceServiceMock([], mockBaselineVersion);
    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const generated = await service.generateResume('user-1', baseRequest);
    const foundSummarySection = generated.sections.find(
      (section) => section.type === BaselineSectionType.SUMMARY,
    );
    if (foundSummarySection) {
      expect((foundSummarySection.content ?? '').trim().toLowerCase()).not.toBe('summary');
      expect(foundSummarySection.content).not.toContain('â€¢  â€¢  â€¢');
    }
    expect(generated.sections.some((section) => section.type === BaselineSectionType.SKILLS)).toBe(false);

    const experienceSection = generated.sections.find(
      (section) => section.type === BaselineSectionType.EXPERIENCE,
    );
    expect(experienceSection).toBeDefined();
    expect(experienceSection?.bullets.map((bullet: { text: string }) => bullet.text)).toEqual([
      'Managed revenue-impacting incident workflows',
      'Led billing support operations',
      'Directed two team members',
    ]);
    expect((experienceSection?.content ?? '').includes('â€¢ Managed revenue-impacting incident workflows')).toBe(true);
    expect((experienceSection?.content ?? '').includes('â€¢  â€¢  â€¢')).toBe(false);

    const exportedPdf = await service.exportResume('user-1', baseRequest, 'pdf');
    const pdfText = exportedPdf.buffer.toString('latin1');
    expect(pdfText).toContain('Managed revenue-impacting incident workflows');
    expect(pdfText).toContain('Led billing support operations');
    expect(pdfText).toContain('Directed two team members');
    expect(pdfText).not.toContain('â€¢  â€¢  â€¢');
  });

  it('runtime generation keeps bullet ranking scoped within each role and preserves role boundaries', async () => {
    const multiRoleBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Director, Support Operations | Alpha Co | 2022 - Present',
            '- Led incident escalation governance and SLA recovery for enterprise support.',
            '- Owned ServiceNow queue operations and support workflow design.',
            'Automation & AI-Enabled Operations',
            'Senior Manager, Customer Support | Beta Co | 2018 - 2022',
            '- Built staffing forecasts and coaching cadence for frontline support teams.',
            '- Improved onboarding process quality across regional support pods.',
          ].join('\n'),
        },
        {
          ...summarySection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content:
            'Experienced support operations leader with verified incident governance, tooling, and process execution responsibilities across enterprise customer environments.',
        },
        skillsSection,
        extraSection,
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(multiRoleBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue({
        ...mockJob,
        rawDescription:
          'Own incident escalation, SLA recovery, support operations governance, and ServiceNow workflows.',
      }),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-runtime-path-role-scoping',
        overallScore: 95,
      } as FitAssessment),
    });

    const complianceService = createComplianceServiceMock([], mockBaselineVersion);
    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const generated = await service.generateResume('user-1', baseRequest);
    const experienceSection = generated.sections.find(
      (section) => section.type === BaselineSectionType.EXPERIENCE,
    );
    expect(experienceSection).toBeDefined();
    expect(experienceSection?.bullets.map((bullet: { text: string }) => bullet.text)).toEqual([
      'Led incident escalation governance and SLA recovery for enterprise support.',
      'Owned ServiceNow queue operations and support workflow design.',
      'Built staffing forecasts and coaching cadence for frontline support teams.',
      'Improved onboarding process quality across regional support pods.',
    ]);
    expect(
      experienceSection?.bullets.map(
        (bullet: { source: { experienceEntryIndex?: number } }) =>
          bullet.source.experienceEntryIndex,
      ),
    ).toEqual([0, 0, 1, 1]);
    expect((experienceSection?.content ?? '')).toContain(
      'Director, Support Operations | Alpha Co | 2022 - Present',
    );
    expect((experienceSection?.content ?? '')).toContain(
      'Senior Manager, Customer Support | Beta Co | 2018 - 2022',
    );
    expect((experienceSection?.content ?? '')).not.toContain(
      'â€¢ Automation & AI-Enabled Operations',
    );

    const exportedPdf = await service.exportResume('user-1', baseRequest, 'pdf');
    const pdfText = exportedPdf.buffer.toString('latin1');
    const firstRoleIndex = pdfText.indexOf(
      'Director, Support Operations | Alpha Co | 2022 - Present',
    );
    const secondRoleIndex = pdfText.indexOf(
      'Senior Manager, Customer Support | Beta Co | 2018 - 2022',
    );
    expect(firstRoleIndex).toBeGreaterThanOrEqual(0);
    expect(secondRoleIndex).toBeGreaterThan(firstRoleIndex);
    expect(pdfText).not.toContain('Automation & AI-Enabled Operations');
  });

  it('pre-export diagnostic snapshot proves structure is clean before export formatting', async () => {
    const baselineWithSentinelOne: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...summarySection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Professional Summary',
          content: 'Summary\nÃ¢â‚¬Â¢\nÃ¢â‚¬Â¢\nÃ¢â‚¬Â¢',
        },
        {
          ...skillsSection,
          sectionType: BaselineSectionType.SKILLS,
          title: 'Core Competencies',
          content: 'Ã¢â‚¬Â¢  Ã¢â‚¬Â¢  Ã¢â‚¬Â¢',
        },
        {
          ...baselineSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Senior Manager, Support Operations | SentinelOne | 2022 - Present',
            '- Led incident escalation governance and SLA recovery workflows.',
            '- Owned ServiceNow queue operations and tooling standards.',
            'Automation & AI-Enabled Operations',
            'Support Operations Manager | Acme Corp | 2019 - 2022',
            '- Built staffing forecasts and coaching cadence for support teams.',
            '- Improved onboarding process quality across regional support pods.',
            'Delivered cross-functional operational planning, established escalation governance, and partnered with product, engineering, and customer success teams to sustain service quality and response standards across enterprise support channels.',
            'Maintained weekly readiness reviews, incident follow-up workflows, and documented runbooks that improved operational consistency, communication quality, and ownership clarity for support operations stakeholders.',
          ].join('\n'),
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(baselineWithSentinelOne),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue({
        ...mockJob,
        rawDescription:
          'Lead support operations, incident escalation governance, and ServiceNow process design.',
      }),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-pre-export-snapshot',
        overallScore: 95,
      } as FitAssessment),
    });

    const complianceService = createComplianceServiceMock([], mockBaselineVersion);
    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const snapshot = await service.getPreExportSnapshotForDiagnostics('user-1', baseRequest);

    expect(snapshot.sections.some((section) => section.type === BaselineSectionType.SUMMARY)).toBe(
      false,
    );
    expect(snapshot.sections.some((section) => section.type === BaselineSectionType.SKILLS)).toBe(
      false,
    );

    const experienceSection = snapshot.sections.find(
      (section) => section.type === BaselineSectionType.EXPERIENCE,
    );
    expect(experienceSection).toBeDefined();
    expect(experienceSection?.content ?? '').toContain(
      'Senior Manager, Support Operations | SentinelOne | 2022 - Present',
    );
    expect(experienceSection?.content ?? '').toContain(
      'Support Operations Manager | Acme Corp | 2019 - 2022',
    );
    expect(experienceSection?.content ?? '').not.toContain(
      'â€¢ Automation & AI-Enabled Operations',
    );

    const experienceDocxSection = snapshot.docxModel.sections.find(
      (section) => section.key === 'experience',
    );
    expect(experienceDocxSection).toBeDefined();
    const experienceItems = (experienceDocxSection?.items ?? []) as Array<{
      role?: string;
      company?: string;
      bullets?: string[];
    }>;
    expect(experienceItems.length).toBeGreaterThanOrEqual(2);
    expect(experienceItems[0]?.company).toContain('SentinelOne');
    expect(experienceItems[1]?.company).toContain('Acme');
    const sentinelBullets = experienceItems[0]?.bullets ?? [];
    const acmeBullets = experienceItems[1]?.bullets ?? [];
    expect(sentinelBullets.some((bullet) => /ServiceNow/i.test(bullet))).toBe(true);
    expect(sentinelBullets.some((bullet) => /staffing forecasts/i.test(bullet))).toBe(false);
    expect(acmeBullets.some((bullet) => /staffing forecasts/i.test(bullet))).toBe(true);
  });

  it('records tracker entry info from resume generation', async () => {
    const { service, applicationsService, opportunitiesService } = buildService(
      AUTO_GENERATE_THRESHOLD,
    );

    const result = await service.generateResume('user-1', baseRequest);

    expect(applicationsService.upsertPreparedFromResumeGeneration).toHaveBeenCalled();
    expect(opportunitiesService.createFromResumeStudio).toHaveBeenCalled();
    expect(result.trackerEntryId).toBe('tracker-entry');
    expect(result.trackerStatus).toBe('Prepared');
    expect(result.opportunityId).toBe('opportunity-1');
  });

  it('returns draft quality when fit score is below threshold', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD - 4);

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });
    expect(result.quality).toBe('draft');
  });

  it('returns optimized quality when fit score is sufficient', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD + 2);

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });
    expect(result.quality).toBe('optimized');
  });

  it('exports DOCX content with headers and audit details', async () => {
    const { service } = buildService(95, []);

    const exportResult = await service.exportResume(
      'user-1',
      baseRequest,
      'docx',
    );
    expect(exportResult.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    await assertValidDocxZip(exportResult.buffer, {
      expectParagraphs: true,
      expectBullets: true,
      expectStyles: true,
      expectExperienceHeader: true,
      expectSectionHeaders: true,
      expectExperienceSpacing: true,
    });
    const zip = await JSZip.loadAsync(exportResult.buffer);
    const documentXml = await zip.file('word/document.xml')!.async('text');
    expect(documentXml).toContain('John Candidate');
    expect(documentXml).toContain('TECHNICAL SKILLS');
    expect(documentXml).not.toContain('Claim risk');
    expect(documentXml).toContain('TECHNICAL SKILLS');
    expect(documentXml).toContain('PROFESSIONAL EXPERIENCE');
    expect(exportResult.filename).toMatch(/^Example-Co-\d{2}-\d{2}-\d{4}\.docx$/);
    expect(exportResult.auditId).toBe('audit-1');
    expect(exportResult.baselineVersionHash).toBe('hash-1');
  });

  it('renders structured sections exactly once', async () => {
    const { service } = buildService(95, []);

    const exportResult = await service.exportResume(
      'user-1',
      baseRequest,
      'docx',
    );

    const zip = await JSZip.loadAsync(exportResult.buffer);
    const documentXml = await zip.file('word/document.xml')!.async('text');

    const skillMatches = documentXml.match(/TECHNICAL SKILLS/g) ?? [];
    const experienceMatches = documentXml.match(/PROFESSIONAL EXPERIENCE/g) ?? [];
    const headerMatches = documentXml.match(/John Candidate/g) ?? [];

    expect(skillMatches).toHaveLength(1);
    expect(experienceMatches).toHaveLength(1);
    expect(headerMatches).toHaveLength(1);
    expect(documentXml).toContain('<w:numPr>');
  });

  it('renders experience bullets as discrete bullet paragraphs in DOCX', async () => {
    const { service } = buildService(95, []);
    const exportResult = await service.exportResume('user-1', baseRequest, 'docx');
    const zip = await JSZip.loadAsync(exportResult.buffer);
    const documentXml = await zip.file('word/document.xml')!.async('text');

    expect(documentXml).toContain('Led automation efforts that reduced defects.');
    expect(documentXml).toContain('Mentored engineers and delivered measurable results.');
    const bulletParagraphs = documentXml.match(/<w:numPr>/g) ?? [];
    expect(bulletParagraphs.length).toBeGreaterThanOrEqual(2);
  });

  it('exports gaming baseline as coherent role blocks without pagination artifacts or duplicated education', async () => {
    const gamingBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
            'Senior Producer | 2K',
            '- Led live operations roadmap delivery across multiple game releases.',
            '- Led live operations roadmap delivery across multiple game releases.',
            'Page 1 3',
            '',
            'MobilityWare | Irvine, CA | 2016 - 2020',
            'Producer',
            '- Drove roadmap execution for multiple mobile titles.',
            'Page 2 3',
          ].join('\n'),
        },
        {
          ...summarySection,
          sectionType: BaselineSectionType.EDUCATION,
          title: 'Education',
          content: [
            'B.A. Media Arts | University of Washington | Seattle, WA',
            'B.A. Media Arts | University of Washington | Seattle, WA',
          ].join('\n'),
        },
        {
          ...skillsSection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content:
            'Production leader with verified cross-functional delivery across live operations, roadmap execution, release quality, and collaboration with engineering, product, and analytics partners.',
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(gamingBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({ overallScore: 95 } as FitAssessment),
    });
    const complianceService = createComplianceServiceMock([], mockBaselineVersion);

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const generation = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });
    expect(generation.preview?.resume?.education).toHaveLength(1);

    const exportResult = await service.exportResume('user-1', baseRequest, 'docx');
    const zip = await JSZip.loadAsync(exportResult.buffer);
    const documentXml = await zip.file('word/document.xml')!.async('text');

    expect(documentXml).toContain('Cat Daddy Games');
    expect(documentXml).toContain('Senior Producer');
    expect(documentXml).toContain('MobilityWare');
    expect(documentXml).not.toContain('Page 1 3');
    expect(documentXml).not.toContain('Page 2 3');

    const duplicateBulletCount =
      documentXml.match(/Led live operations roadmap delivery across multiple game releases\./g)
        ?.length ?? 0;
    expect(duplicateBulletCount).toBe(1);

    expect(documentXml).toContain('B.A. Media Arts');
    expect(documentXml).toContain('University of Washington');
  });

  it('renders Greg-style companies as separate non-bullet paragraphs and dedupes MS/BA education rows', async () => {
    const gregBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
            'Senior Game Designer',
            '- Built economy tuning systems for seasonal live events.',
            '',
            'Monopoly Solitaire | Irvine, CA | 2019 - 2020',
            'Game Designer',
            '- Shipped progression updates for Monopoly Solitaire live content.',
            '',
            'PlayStudios | Las Vegas, NV | 2017 - 2019',
            'Game Designer',
            '- Led social casino release planning and content operations.',
            '',
            'Max Axe | Remote | 2015 - 2017',
            'Designer',
            '- Implemented gameplay tuning dashboards for early stage titles.',
          ].join('\n'),
        },
        {
          ...summarySection,
          sectionType: BaselineSectionType.EDUCATION,
          title: 'Education',
          content: [
            'Master of Science in Interactive Entertainment Design & Production | Master of Science in Interactive Entertainment Design & Production | University of Central Florida, Orlando, FL | University of Central Florida, Orlando, FL',
            'Bachelor of Arts in Art & Visual Technology | Bachelor of Arts in Art & Visual Technology | George Mason University, Fairfax, VA | George Mason University, Fairfax, VA',
          ].join('\n'),
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(gregBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({ overallScore: 95 } as FitAssessment),
    });
    const complianceService = createComplianceServiceMock([], mockBaselineVersion);

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const exportResult = await service.exportResume('user-1', baseRequest, 'docx');
    const zip = await JSZip.loadAsync(exportResult.buffer);
    const documentXml = await zip.file('word/document.xml')!.async('text');

    const companies = ['Cat Daddy Games', 'Monopoly Solitaire', 'PlayStudios', 'Max Axe'];
    const paragraphs = documentXml.match(/<w:p>[\s\S]*?<\/w:p>/g) ?? [];
    for (const company of companies) {
      const paragraph = paragraphs.find((p) => p.includes(company));
      expect(paragraph).toBeDefined();
      expect(paragraph).not.toContain('<w:numPr>');
    }

    const msMatches =
      documentXml.match(/Master of Science in Interactive Entertainment Design &amp; Production/g) ?? [];
    const baMatches = documentXml.match(/Bachelor of Arts in Art &amp; Visual Technology/g) ?? [];
    expect(msMatches).toHaveLength(1);
    expect(baMatches).toHaveLength(1);
  });

  it('produces a clean preview.resume model for problematic gaming baseline runtime shape', async () => {
    const gamingBaseline: Baseline = {
      ...mockBaseline,
      parsedRecords: [
        {
          createdAt: new Date(),
          parsedJson: {
            identity: {
              full_name: 'Alex Candidate',
              location: 'Kirkland, WA | (703) 850-7289',
            },
          },
        } as any,
      ],
      sections: [
        {
          ...baselineSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
            'Senior Producer | 2K',
            '- Led live operations roadmap delivery across multiple game releases.',
            '- Led live operations roadmap delivery across multiple game releases.',
            'mathematical',
            'deployment timelines',
            'Page 1',
            'Page 2',
            '3',
            '',
            'MobilityWare | Irvine, CA | 2016 - 2020',
            'Producer',
            '- Drove roadmap execution for multiple mobile titles.',
          ].join('\n'),
        },
        {
          ...summarySection,
          sectionType: BaselineSectionType.EDUCATION,
          title: 'Education',
          content: [
            'B.A. Media Arts | University of Washington | Seattle, WA',
            'â€¢ B.A. Media Arts | University of Washington | Seattle, WA',
          ].join('\n'),
        },
        {
          ...skillsSection,
          sectionType: BaselineSectionType.RAW,
          title: 'Header',
          content: ['Alex Candidate', 'alex@example.com', '(703) 850-7289'].join('\n'),
        } as any,
        {
          ...summarySection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content:
            'Operations leader with verified delivery across cross-functional game production, release management, quality programs, and stakeholder communication over multi-year roadmaps.',
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(gamingBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({ overallScore: 95 } as FitAssessment),
    });
    const complianceService = createComplianceServiceMock([], mockBaselineVersion);

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    expect(result.preview?.resume).toBeDefined();
    const model = result.preview!.resume!;
    const phoneMatches = model.heading.contactLine.match(/\(703\)\s850-7289/g) ?? [];
    expect(phoneMatches).toHaveLength(1);
    expect(model.experience[0]).toMatchObject({
      company: 'Cat Daddy Games',
      roleTitle: 'Senior Producer',
    });
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain('mathematical');
    expect(serialized).not.toContain('deployment timelines');
    expect(serialized).not.toContain('"2K"');
    expect(serialized).not.toContain('Page 1');
    expect(serialized).not.toContain('Page 2');
    expect(serialized).not.toContain('"3"');
    expect(model.education).toHaveLength(1);
  });

  it('generates preview.resume when experience lines are parsed as location then company then date', async () => {
    const parsedShapeBaseline: Baseline = {
      ...mockBaseline,
      parsedRecords: [
        {
          createdAt: new Date(),
          parsedJson: {
            identity: {
              full_name: 'Alex Candidate',
              location: 'Kirkland, WA | (703) 850-7289',
            },
          },
        } as any,
      ],
      sections: [
        {
          ...baselineSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Kirkland, WA',
            'Cat Daddy Games',
            '2020 - 2025',
            '- Led live operations roadmap delivery across multiple game releases.',
            '2K',
            'mathematical',
            'deployment timelines',
            'Page 1',
            '',
            'Irvine, CA',
            'MobilityWare',
            '2016 - 2020',
            '- Drove roadmap execution for multiple mobile titles.',
            'Page 2',
          ].join('\n'),
        },
        {
          ...summarySection,
          sectionType: BaselineSectionType.EDUCATION,
          title: 'Education',
          content: [
            'B.A. Media Arts | University of Washington | Seattle, WA',
            'B.A. Media Arts | University of Washington | Seattle, WA',
          ].join('\n'),
        },
        {
          ...summarySection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content: Array.from({ length: 8 })
            .map(
              () =>
                'Production leader with verified cross-functional delivery across live operations, release management, roadmap planning, stakeholder communication, and execution quality in game development programs.',
            )
            .join(' '),
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(parsedShapeBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({ overallScore: 95 } as FitAssessment),
    });
    const complianceService = createComplianceServiceMock([], mockBaselineVersion);

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    expect(result.preview?.resume?.experience).toHaveLength(2);
    expect(result.preview?.resume?.experience[0]).toMatchObject({
      company: 'Cat Daddy Games',
      location: 'Kirkland, WA',
    });
    expect(result.preview?.resume?.experience[1]).toMatchObject({
      company: 'MobilityWare',
      location: 'Irvine, CA',
    });
    const serialized = JSON.stringify(result.preview?.resume);
    expect(serialized).not.toContain('Page 1');
    expect(serialized).not.toContain('Page 2');
    expect(serialized).not.toContain('mathematical');
    expect(serialized).not.toContain('deployment timelines');
    expect(serialized).not.toContain('"2K"');
    expect(result.preview?.resume?.education).toHaveLength(1);
  });

  it('returns success with preview.resume when pagination artifacts are the only blocker', async () => {
    const paginationHeavyBaseline: Baseline = {
      ...mockBaseline,
      parsedRecords: [
        {
          createdAt: new Date(),
          parsedJson: {
            identity: {
              full_name: 'Greg Armstrong',
              location: 'Kirkland, WA | Page 1 | (703) 850-7289 | 3',
            },
          },
        } as any,
      ],
      sections: [
        {
          ...baselineSection,
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Cat Daddy Games | Page 1 3 | 2020 - 2025',
            'Senior Producer | Page 2',
            '- Led live operations roadmap delivery across multiple game releases. Page 3',
            '- Improved release quality through test automation and telemetry instrumentation.',
            '',
            'MobilityWare | Irvine, CA | 2016 - 2020',
            'Producer',
            '- Drove roadmap execution for multiple mobile titles. Page 2 3',
          ].join('\n'),
        },
        {
          ...summarySection,
          sectionType: BaselineSectionType.SUMMARY,
          title: 'Summary',
          content: Array.from({ length: 8 })
            .map(
              () =>
                'Production leader with verified cross-functional delivery across live operations, release management, roadmap planning, stakeholder communication, and execution quality in game development programs.',
            )
            .join(' '),
        },
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(paginationHeavyBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({ overallScore: 95 } as FitAssessment),
    });
    const complianceService = createComplianceServiceMock([], mockBaselineVersion);

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    expect(result.preview?.resume).toBeDefined();
    const serialized = JSON.stringify(result.preview?.resume);
    expect(serialized).not.toMatch(/\bPage\s+\d/i);
    expect(serialized).not.toContain('"3"');
  });

  it('uses canonical preview.resume model for DOCX export instead of section fragments', async () => {
    const { service } = buildService(95, []);

    jest.spyOn(service, 'generateResume').mockResolvedValue({
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
          id: 'fragment-section',
          type: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Page 1 3\nCompany\nmathematical\nfragmented text',
          bullets: [],
        },
      ] as any,
      compliance_flags: [],
      compliance_blocked: false,
      audit_id: 'audit-1',
      auditId: 'audit-1',
      baseline_version_hash: 'hash-1',
      quality: 'optimized',
      exports: { docx: true, pdf: true },
      preview: {
        resume: {
          heading: {
            name: 'Alex Candidate',
            contactLine: 'alex@example.com | (703) 850-7289',
          },
          experience: [
            {
              company: 'Cat Daddy Games',
              roleTitle: 'Senior Producer',
              location: 'Kirkland, WA',
              dateRange: '2020 - 2025',
              bullets: [
                'Led live operations roadmap delivery across multiple game releases.',
                'Partnered across product and engineering to improve release quality.',
              ],
            },
          ],
          education: [
            {
              degree: 'B.A. Media Arts',
              institution: 'University of Washington',
              location: 'Seattle, WA',
            },
          ],
        },
      },
      trackerEntryId: 'tracker-entry',
      trackerStatus: 'Prepared',
      opportunityId: 'opportunity-1',
      claimRiskSummary: { high: 0, medium: 0, low: 0 },
      gapAnalysis: null,
      gapGuidance: null,
      display: {
        title: 'Resume generated successfully',
        description: 'Ready for export.',
        reasons: [],
        cta: { label: 'Review results', href: '/results' },
      },
      safeDisplay: {
        title: 'Resume generated successfully',
        description: 'Ready for export.',
        reasons: [],
        cta: { label: 'Review results', href: '/results' },
      },
      internal: {
        auditId: 'audit-1',
        baselineVersionHash: 'hash-1',
        complianceFlags: [],
      },
    } as any);

    const exportResult = await service.exportResume('user-1', baseRequest, 'docx');
    const zip = await JSZip.loadAsync(exportResult.buffer);
    const documentXml = await zip.file('word/document.xml')!.async('text');

    expect(documentXml).toContain('Cat Daddy Games');
    expect(documentXml).toContain('Senior Producer');
    expect(documentXml).toContain('Led live operations roadmap delivery across multiple game releases.');
    expect(documentXml).toContain('Partnered across product and engineering to improve release quality.');
    expect(documentXml).not.toContain('Page 1 3');
    expect(documentXml).not.toContain('fragmented text');
    expect(documentXml).not.toContain('mathematical');
  });

  it('exports PDF content with valid header', async () => {
    const { service } = buildService(95, []);

    const exportResult = await service.exportResume('user-1', baseRequest, 'pdf');
    expect(exportResult.contentType).toBe('application/pdf');
    expect(exportResult.filename).toMatch(/^Example-Co-\d{2}-\d{2}-\d{4}\.pdf$/);
    expect(exportResult.buffer.byteLength).toBeGreaterThan(10);
    expect(exportResult.buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
    const pdfText = exportResult.buffer.toString('utf8');
    expect(pdfText).not.toContain('Claim risk');
    expect(pdfText).toContain('T*');
    expect(pdfText).not.toContain('startxref\n0');
  });

  it('normalizes bullet-like and mojibake characters in PDF content', async () => {
    const baselineWithMojibake: Baseline = {
      ...mockBaseline,
      sections: [
        baselineSection,
        {
          ...summarySection,
          content: `Summary
Ã¢â‚¬Â¢ First bullet with detailed leadership outcomes across multi-quarter planning and execution.
â€¢ Second bullet covering cross-functional operations, stakeholder alignment, and measurable program impact.
&&Â¢ Third bullet focused on systems improvement, delivery quality, and coaching outcomes.
Additional context line to ensure extracted text length remains above validation minimum for PDF generation tests.`,
        },
        skillsSection,
        extraSection,
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(baselineWithMojibake),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({ overallScore: 95 } as FitAssessment),
    });

    const complianceService = createComplianceServiceMock([], mockBaselineVersion);
    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn() } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const exportResult = await service.exportResume('user-1', baseRequest, 'pdf');
    const latin1Text = exportResult.buffer.toString('latin1');
    expect(latin1Text).toContain('Led automation efforts that reduced defects.');
    expect(latin1Text).toContain('Mentored engineers and delivered measurable results.');
    expect(latin1Text).not.toContain('Ã¢â‚¬Â¢');
    expect(latin1Text).not.toContain('&&Â¢');
    expect(latin1Text).not.toContain('\n& ');
  });

  it('blocks generation when baseline hash is missing', async () => {
    const complianceOverride: Partial<MockedComplianceService> = {
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: [
          {
            code: ComplianceFlagCode.MISSING_BASELINE_HASH,
            severity: ComplianceFlagSeverity.BLOCK,
            message: 'Baseline version hash is required.',
          },
        ],
        blocked: true,
        audit: {
          id: 'audit-1',
          baselineVersionId: 'baseline-version-1',
          baselineVersionHash: null,
          outputHash: '',
          action: ComplianceAction.RESUME_GENERATION,
          actorId: 'user-1',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
        },
      } as ValidateAndAuditResult),
    };

    const { service } = buildService(
      95,
      [],
      { ...mockBaselineVersion, fileHash: null, hash: null },
      complianceOverride,
    );

    await expect(
      service.generateResume('user-1', baseRequest),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits resume export actions', async () => {
    const { service, complianceService } = buildService(95);

    await service.exportResume('user-1', baseRequest, 'pdf');

    expect(complianceService.validateAndAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ComplianceAction.RESUME_EXPORT,
        actorId: 'user-1',
        baselineVersion: expect.objectContaining({ id: 'baseline-version-1' }),
        job: expect.objectContaining({ id: 'job-1' }),
        outputHash: expect.any(String),
      }),
    );
  });

  it('returns compliance flags when invented metrics are flagged', async () => {
    const inventedFlag: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.INVENTED_METRIC,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Metric not in baseline.',
      },
    ];
    const { service, applicationsService, opportunitiesService } = buildService(
      95,
      inventedFlag,
    );

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.generationStatus).toBe('blocked');
    expect(result.exportReady).toBe(false);
    expect(result.sections).toEqual([]);
    expect(result.compliance_blocked).toBe(true);
    expect(result.exports).toEqual({ docx: false, pdf: false });
    expect(result.preview).toEqual({ resume: null });
    expect(result.compliance_flags).toEqual(inventedFlag);
    expect(result.safeDisplay).toMatchObject({
      title: 'Resume blocked by compliance',
    });
    expect(result.internal).toMatchObject({
      auditId: 'audit-1',
    });
    expect(applicationsService.upsertPreparedFromResumeGeneration).not.toHaveBeenCalled();
    expect(opportunitiesService.createFromResumeStudio).not.toHaveBeenCalled();
  });

  it('passes explicit sourceType metadata for all generated compliance spans', async () => {
    const { service, complianceService } = buildService(95, []);

    await service.generateResume('user-1', baseRequest);

    const generateAuditCall = (complianceService.validateAndAudit as jest.Mock).mock.calls
      .map((call) => call[0])
      .find((ctx) => ctx.action === ComplianceAction.RESUME_GENERATION);
    expect(generateAuditCall).toBeDefined();

    const generatedSections = (generateAuditCall as { generatedSections?: Array<{ sourceType?: string; sentenceSources?: Array<{ sourceType?: string }> }> }).generatedSections ?? [];
    expect(generatedSections.length).toBeGreaterThan(0);
    for (const section of generatedSections) {
      expect(section.sourceType).toBeDefined();
      const sentenceSources = section.sentenceSources ?? [];
      for (const sentence of sentenceSources) {
        expect(sentence.sourceType).toBeDefined();
      }
    }
  });

  it('end-to-end resume generation does not block on non-asserted role fragments', async () => {
    const fragmentBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          content: [
            'Support Operations Manager | Acme Corp | 2020 - 2023',
            '- Senior Lead IT Engineer on the',
            '- Collaborated closely with multiple partners',
            '- Led incident response execution across support teams.',
          ].join('\n'),
        },
        {
          ...summarySection,
          content:
            'Summary\nExperienced operations leader with incident governance, customer support execution, and cross functional coordination across enterprise environments. '.repeat(
              6,
            ),
        },
        skillsSection,
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(fragmentBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-1',
        overallScore: 95,
      } as FitAssessment),
    });

    const complianceService = createComplianceServiceMock(
      [],
      mockBaselineVersion,
      {
        validateAndAudit: jest.fn().mockImplementation(async (payload: any) => {
          const roleFlags = detectInventedRole({
            baselineSections: payload.baselineSections,
            generatedSections: payload.generatedSections,
            documentType: DocumentType.RESUME,
          });
          const blocked = roleFlags.some(
            (flag) => flag.severity === ComplianceFlagSeverity.BLOCK,
          );
          return {
            complianceFlags: roleFlags,
            blocked,
            audit: {
              id: 'audit-role-fragment',
              outputHash: payload.outputHash ?? '',
              baselineVersionId: mockBaselineVersion.id,
              action: payload.action,
              actorId: payload.actorId ?? 'user-1',
              baselineVersionHash: mockBaselineVersion.hash,
              jobId: mockJob.id,
              createdAt: new Date().toISOString(),
            },
          };
        }),
      },
    );

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    expect(result.compliance_blocked).toBe(false);

    const generateAuditCall = (complianceService.validateAndAudit as jest.Mock).mock.calls
      .map((call) => call[0])
      .find((ctx) => ctx.action === ComplianceAction.RESUME_GENERATION);
    expect(generateAuditCall).toBeDefined();

    const generatedSections =
      (generateAuditCall as { generatedSections?: Array<{ sentenceSources?: Array<{ sourceType?: string; text?: string }> }> })
        .generatedSections ?? [];
    expect(generatedSections.length).toBeGreaterThan(0);
    for (const section of generatedSections) {
      for (const sentence of section.sentenceSources ?? []) {
        expect(sentence.sourceType).toBeDefined();
        expect(sentence.text).not.toBe('Senior Lead IT Engineer on the');
        expect(sentence.text).not.toBe(
          'Collaborated closely with multiple partners',
        );
      }
    }

    const roleFlags = detectInventedRole({
      baselineSections:
        (generateAuditCall as { baselineSections?: any[] }).baselineSections ?? [],
      generatedSections: generatedSections as any,
      documentType: DocumentType.RESUME,
    });
    expect(roleFlags).toHaveLength(0);
  });

  it('merges wrapped role assertions and does not emit dangling role fragments into compliance', async () => {
    const wrappedBaseline: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          content: [
            'Support Operations Manager | Acme Corp | 2020 - 2023',
            '- Served as Senior Lead IT Engineer on the',
            'Cloud Support Engineering team and improved escalation readiness across regions.',
            '- Led incident response execution across support teams.',
          ].join('\n'),
        },
        {
          ...summarySection,
          content:
            'Summary\nExperienced operations leader with incident governance and production escalation ownership across enterprise systems. '.repeat(
              6,
            ),
        },
        skillsSection,
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(wrappedBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-1',
        overallScore: 95,
      } as FitAssessment),
    });

    const complianceService = createComplianceServiceMock(
      [],
      mockBaselineVersion,
      {
        validateAndAudit: jest.fn().mockImplementation(async (payload: any) => {
          const roleFlags = detectInventedRole({
            baselineSections: payload.baselineSections,
            generatedSections: payload.generatedSections,
            documentType: DocumentType.RESUME,
          });
          const blocked = roleFlags.some(
            (flag) => flag.severity === ComplianceFlagSeverity.BLOCK,
          );
          return {
            complianceFlags: roleFlags,
            blocked,
            audit: {
              id: 'audit-role-wrapped',
              outputHash: payload.outputHash ?? '',
              baselineVersionId: mockBaselineVersion.id,
              action: payload.action,
              actorId: payload.actorId ?? 'user-1',
              baselineVersionHash: mockBaselineVersion.hash,
              jobId: mockJob.id,
              createdAt: new Date().toISOString(),
            },
          };
        }),
      },
    );

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    expect(result.compliance_blocked).toBe(false);

    const generateAuditCall = (complianceService.validateAndAudit as jest.Mock).mock.calls
      .map((call) => call[0])
      .find((ctx) => ctx.action === ComplianceAction.RESUME_GENERATION);
    expect(generateAuditCall).toBeDefined();

    const generatedSections =
      (generateAuditCall as { generatedSections?: Array<{ sentenceSources?: Array<{ text?: string }> }> })
        .generatedSections ?? [];
    const statements = generatedSections.flatMap((section) =>
      (section.sentenceSources ?? []).map((sentence) => sentence.text ?? ''),
    );

    expect(statements).not.toContain('Senior Lead IT Engineer on the');
    expect(
      statements.some((text) => /Senior Lead IT Engineer on the$/i.test(text)),
    ).toBe(false);
  });

  it('blocks export when compliance flags block', async () => {
    const blockedFlags: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.INVENTED_METRIC,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Metric not in baseline.',
      },
    ];
    const auditRecord: ValidateAndAuditResult['audit'] = {
      id: 'audit-2',
      baselineVersionId: 'baseline-version-1',
      baselineVersionHash: 'hash-1',
      outputHash: '',
      action: ComplianceAction.RESUME_EXPORT,
      actorId: 'user-1',
      jobId: 'job-1',
      createdAt: new Date().toISOString(),
    };
    const complianceOverride: Partial<MockedComplianceService> = {
      detectScopeInflation: jest.fn().mockResolvedValue([]),
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: blockedFlags,
        blocked: true,
        audit: auditRecord,
      } as ValidateAndAuditResult),
    };
    const { service } = buildService(
      95,
      [],
      mockBaselineVersion,
      complianceOverride,
    );

    try {
      await service.exportResume('user-1', baseRequest, 'docx');
      throw new Error('expected export to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(
        (error as UnprocessableEntityException).getResponse(),
      ).toMatchObject({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Compliance validation failed.',
          details: {
            compliance_flags: blockedFlags,
            audit_id: auditRecord.id,
            baseline_version_hash: auditRecord.baselineVersionHash,
          },
        },
      });
    }
  });

  it('returns compliance flags when scope inflation is detected', async () => {
    const scopeFlag: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Scope exceeds baseline.',
        evidence: [
          {
            baseline: 'Baseline has no matching scope evidence.',
            generated: 'Led global support organization across regions.',
            reason: 'extreme_scale_without_baseline_match',
          } as any,
        ] as any,
      },
    ];

    const { service } = buildService(95, [], mockBaselineVersion, {
      detectScopeInflation: jest.fn().mockResolvedValue(scopeFlag),
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: scopeFlag,
        blocked: true,
        audit: {
          id: 'audit-3',
          baselineVersionId: 'baseline-version-1',
          baselineVersionHash: 'hash-1',
          outputHash: '',
          action: ComplianceAction.RESUME_GENERATION,
          actorId: 'user-1',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
        },
      } as ValidateAndAuditResult),
    });

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.exportReady).toBe(false);
    expect(result.sections).toEqual([]);
    expect(result.compliance_blocked).toBe(true);
    expect(result.compliance_flags).toEqual(scopeFlag);
    expect(result.safeDisplay?.reasons?.[0]).toContain(
      'broader leadership scope than your baseline clearly supports',
    );
    expect(result.safeDisplay?.reasons?.[0]).not.toContain(
      'extreme_scale_without_baseline_match',
    );
    expect((result.internal as any)?.complianceDiagnostics?.[0]?.rawReasons).toContain(
      'extreme_scale_without_baseline_match',
    );
  });

  it('passes real baseline evidence into scope inflation detection during resume generation', async () => {
    const detectScopeInflation = jest.fn().mockResolvedValue([]);
    const { service } = buildService(95, [], mockBaselineVersion, {
      detectScopeInflation,
    });

    await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(detectScopeInflation).toHaveBeenCalled();
    const detectorPayload = detectScopeInflation.mock.calls[0]?.[0] as {
      baselineSections?: Array<{ content?: string; sectionType?: string }>;
      generatedSections?: Array<{ content?: string; sentenceSources?: unknown[] }>;
    };

    const baselineSections = detectorPayload?.baselineSections ?? [];
    const generatedSections = detectorPayload?.generatedSections ?? [];

    expect(baselineSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('John Candidate'),
          sectionType: BaselineSectionType.EXPERIENCE,
        }),
      ]),
    );
    expect(generatedSections.length).toBeGreaterThan(0);
    expect(
      generatedSections.some((section) => Array.isArray(section.sentenceSources)),
    ).toBe(true);
    expect(generatedSections).not.toBe(baselineSections);
  });

  it('enforces analysis context and succeeds when job/baseline/baselineVersion match', async () => {
    const { service } = buildService(95, [], mockBaselineVersion);

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        oneTap: false,
      }),
    ).resolves.toMatchObject({
      status: 'success',
      compliance_blocked: false,
    });
  });

  it('fails resume generation when jobId mismatches analysis context', async () => {
    const { service } = buildService(95, [], mockBaselineVersion);
    const fitAssessmentRepository = (service as any).fitAssessmentRepository as {
      findOne: jest.Mock;
    };
    fitAssessmentRepository.findOne.mockResolvedValueOnce({
      id: 'analysis-1',
      userId: 'user-1',
      jobId: 'job-other',
      baselineId: 'baseline-1',
      baselineVersion: mockBaselineVersion.versionNumber,
      overallScore: 95,
    });

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        oneTap: false,
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'analysis_context_mismatch',
          details: {
            expected: { jobId: 'job-other' },
            received: { jobId: 'job-1' },
          },
        },
      },
    });
  });

  it('fails resume generation when baselineVersionId mismatches analysis context', async () => {
    const { service } = buildService(95, [], mockBaselineVersion);
    const baselineVersionRepository = (service as any).baselineVersionRepository as {
      findOne: jest.Mock;
    };
    baselineVersionRepository.findOne
      .mockResolvedValueOnce(mockBaselineVersion)
      .mockResolvedValueOnce(null);

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        baselineVersionId: 'baseline-version-2',
        oneTap: false,
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'analysis_context_mismatch',
          details: {
            expected: { baselineVersionId: null },
            received: { baselineVersionId: 'baseline-version-1' },
          },
        },
      },
    });
  });

  it('fails resume generation when baselineId mismatches analysis context', async () => {
    const { service } = buildService(95, [], mockBaselineVersion);
    const fitAssessmentRepository = (service as any).fitAssessmentRepository as {
      findOne: jest.Mock;
    };
    fitAssessmentRepository.findOne.mockResolvedValueOnce({
      id: 'analysis-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'baseline-other',
      baselineVersion: mockBaselineVersion.versionNumber,
      overallScore: 95,
    });

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        oneTap: false,
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'analysis_context_mismatch',
          details: {
            expected: { baselineId: 'baseline-other' },
            received: { baselineId: 'baseline-1' },
          },
        },
      },
    });
  });

  it('fails resume export when analysis context mismatches requested baseline version', async () => {
    const { service } = buildService(95, [], mockBaselineVersion);
    const baselineVersionRepository = (service as any).baselineVersionRepository as {
      findOne: jest.Mock;
    };
    baselineVersionRepository.findOne
      .mockResolvedValueOnce(mockBaselineVersion)
      .mockResolvedValueOnce(null);

    await expect(
      service.exportResume(
        'user-1',
        {
          ...baseRequest,
          baselineVersionId: 'baseline-version-2',
          oneTap: false,
        },
        'pdf',
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'analysis_context_mismatch',
          details: {
            expected: { baselineVersionId: null },
            received: { baselineVersionId: 'baseline-version-1' },
          },
        },
      },
    });
  });

  it('fails resume generation when analysis ownership does not match requester', async () => {
    const { service } = buildService(95, [], mockBaselineVersion);
    const fitAssessmentRepository = (service as any).fitAssessmentRepository as {
      findOne: jest.Mock;
    };
    fitAssessmentRepository.findOne.mockResolvedValueOnce({
      id: 'analysis-1',
      userId: 'another-user',
      jobId: 'job-1',
      baselineId: 'baseline-1',
      baselineVersion: mockBaselineVersion.versionNumber,
      overallScore: 95,
    });

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        oneTap: false,
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'analysis_not_owned',
          details: { analysisId: 'analysis-1' },
        },
      },
    });
  });

  it('fails resume generation when analysis does not exist', async () => {
    const { service } = buildService(95, [], mockBaselineVersion);
    const fitAssessmentRepository = (service as any).fitAssessmentRepository as {
      findOne: jest.Mock;
    };
    fitAssessmentRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        oneTap: false,
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'analysis_not_found',
          details: { analysisId: 'analysis-1' },
        },
      },
    });
  });

  it('reports blocked readiness when compliance preflight would block generation', async () => {
    const blockingFlag: ComplianceFlag = {
      code: 'invented_metric',
      message: 'Metric cannot be verified.',
      severity: 'block',
      confidence: 0.96,
      evidence: [],
    };
    const { service } = buildService(95, [blockingFlag], mockBaselineVersion);

    const readiness = await service.getGenerationReadiness('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(readiness.status).toBe('blocked');
    expect(readiness.blocked).toBe(true);
    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        oneTap: false,
      }),
    ).resolves.toMatchObject({ status: 'blocked' });
  });

  it('reports limited readiness when compliance has warnings only', async () => {
    const warningFlag: ComplianceFlag = {
      code: 'light_personalization_risk',
      message: 'Personalization constrained by available evidence.',
      severity: 'warn',
      confidence: 0.7,
      evidence: [],
    };
    const { service } = buildService(95, [], mockBaselineVersion, {
      enforceResumeWritingRules: jest.fn().mockReturnValue([]),
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: [warningFlag],
        blocked: false,
        audit: {
          id: 'audit-readiness-limited',
          baselineVersionId: mockBaselineVersion.id,
          baselineVersionHash: mockBaselineVersion.fileHash,
          outputHash: '',
          action: ComplianceAction.RESUME_GENERATION,
          actorId: 'user-1',
          jobId: mockJob.id,
          createdAt: new Date().toISOString(),
        },
      }),
    });

    const readiness = await service.getGenerationReadiness('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(readiness.status).toBe('limited');
    expect(readiness.blocked).toBe(false);
  });

  it('reports ready readiness when compliance has no issues and matches generation outcome', async () => {
    const { service } = buildService(95, [], mockBaselineVersion);

    const readiness = await service.getGenerationReadiness('user-1', {
      ...baseRequest,
      oneTap: false,
    });
    expect(readiness.status).toBe('ready');
    expect(readiness.blocked).toBe(false);

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        oneTap: false,
      }),
    ).resolves.toMatchObject({
      status: 'success',
      compliance_blocked: false,
    });
  });

  it('does not emit scope inflation when semantic baseline evidence supports phrasing variation', async () => {
    const detector = new ScopeInflationDetector();
    const baselineWithScope: Baseline = {
      ...mockBaseline,
      sections: [
        {
          ...baselineSection,
          content:
            'Support Operations Manager | Acme Corp | 2020 - 2023\n' +
            '- Managed team of 23 engineers supporting automation platform operations.',
        },
        {
          ...summarySection,
          content:
            'Summary\nExperienced operations leader responsible for incident governance, escalation readiness, cross functional delivery, and measurable service reliability outcomes across enterprise environments. '.repeat(
              8,
            ),
        },
        skillsSection,
      ],
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(baselineWithScope),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue(mockJob),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-1',
        overallScore: 95,
      } as FitAssessment),
    });

    const complianceService = createComplianceServiceMock([], mockBaselineVersion, {
      detectScopeInflation: jest.fn().mockImplementation(async (payload: any) =>
        detector.detect(
          payload.baselineSections ?? [],
          [
            {
              title: 'Generated Resume',
              content:
                'Led engineering team responsible for automation platform reliability.',
            },
          ],
          undefined,
          undefined,
          {
            embeddingProvider: async (text: string) => {
              const normalized = text.toLowerCase();
              if (
                normalized.includes('team') &&
                normalized.includes('engineer') &&
                normalized.includes('automation')
              ) {
                return [0.9, 0.1, 0.2];
              }
              return [0.1, 0.1, 0.1];
            },
            similarityThreshold: 0.76,
          },
        ),
      ),
    });

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      { analyze: jest.fn().mockReturnValue(null) } as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.status).toBe('success');
    expect(result.compliance_flags.map((flag) => flag.code)).not.toContain(
      ComplianceFlagCode.SCOPE_INFLATION,
    );
  });

  it('blocks export when generation is already compliance blocked', async () => {
    const blockedFlags: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.INVENTED_ROLE,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Role not found in baseline.',
      },
    ];
    const { service, complianceService } = buildService(95, blockedFlags);

    await expect(
      service.exportResume('user-1', baseRequest, 'pdf'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(complianceService.validateAndAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: ComplianceAction.RESUME_GENERATION }),
    );
    expect(complianceService.validateAndAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: ComplianceAction.RESUME_EXPORT }),
    );
  });

  it('returns compact deduplicated gap guidance for Studio payloads', async () => {
    const longEvidence =
      'Global offices across multiple continents and regions with baseline operating detail '.repeat(
        12,
      );
    const duplicateGap = {
      gapId: 'gap-1',
      title: 'Operations Leadership',
      description: 'Gap',
      severityScore: 0.8,
      requirementEvidence: 'Own incident command and governance for executive escalations.',
      baselineEvidence: longEvidence,
      reasoning: longEvidence,
    };

    const baselineRepository = buildRepository<Baseline>({
      findOne: jest.fn().mockResolvedValue(mockBaseline),
    });
    const baselineVersionRepository = buildRepository<BaselineVersion>({
      findOne: jest.fn().mockResolvedValue(mockBaselineVersion),
    });
    const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
      find: jest.fn().mockResolvedValue([]),
    });
    const jobsRepository = buildRepository<Job>({
      findOne: jest.fn().mockResolvedValue({
        ...mockJob,
        normalizedRequirements: ['Salary range is $120,000 - $140,000.'],
        normalizedResponsibilities: ['Own incident command and governance.'],
      }),
    });
    const fitAssessmentRepository = buildRepository<FitAssessment>({
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-1',
        overallScore: 91,
      } as FitAssessment),
    });
    const complianceService = createComplianceServiceMock([], mockBaselineVersion);
    const gapAnalysisService = {
      analyze: jest.fn().mockReturnValue({
        strengths: ['Incident management', 'Incident management'],
        criticalGaps: [duplicateGap, duplicateGap],
        recommendedActions: [],
        interviewRisks: [],
      }),
    } as Partial<GapAnalysisService>;

    const service = new ResumeService(
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      jobsRepository,
      fitAssessmentRepository,
      complianceService,
      {
        upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({
          id: 'tracker-entry',
          status: 'Prepared',
        }),
      } as ApplicationsService,
      { createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opportunity-1' }) } as OpportunitiesService,
      gapAnalysisService as GapAnalysisService,
    );

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });

    expect(result.gapGuidance?.strengthSignals).toEqual(['Incident management']);
    expect(result.gapGuidance?.gapSignals.some((signal) => /salary/i.test(signal))).toBe(false);
    expect(result.gapGuidance?.reframingPriorities[0]?.baselineEvidence?.length ?? 0).toBeLessThanOrEqual(180);
  });
});
