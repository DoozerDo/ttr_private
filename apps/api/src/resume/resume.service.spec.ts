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
import { ComplianceService } from '../compliance/compliance.service';
import type { ValidateAndAuditResult } from '../compliance/compliance.service';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from '../compliance/compliance.types';
import { AUTO_GENERATE_THRESHOLD } from '../config/autoGenerateThreshold';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { ApplicationsService } from '../applications/applications.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ResumeService, GenerateResumeRequest } from './resume.service';

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
    detectScopeInflation: jest.fn().mockReturnValue([]),
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
      id: 'fit-1',
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

  const service = new ResumeService(
    baselineRepository,
    baselineVersionRepository,
    baselineBlockPolicyRepository,
    jobsRepository,
    fitAssessmentRepository,
    complianceService,
    applicationsService as ApplicationsService,
    opportunitiesService as OpportunitiesService,
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
      expect(documentXml).toContain('PROFESSIONAL SUMMARY');
      expect(documentXml).toContain('CORE COMPETENCIES');
      expect(documentXml).toContain('PROFESSIONAL EXPERIENCE');
      expect(documentXml).toContain('EDUCATION');
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
      expect(documentXml).toContain('ListBullet');
      expect(documentXml).toContain('• ');
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

  it('allows one-tap generation when score meets threshold', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD);

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.ok).toBe(true);
    expect(result.sections).toHaveLength(4);
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
    expect(documentXml.indexOf('John Candidate')).toBeLessThan(
      documentXml.indexOf('CORE COMPETENCIES'),
    );
    expect(documentXml).toContain('CORE COMPETENCIES');
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

    const skillMatches = documentXml.match(/CORE COMPETENCIES/g) ?? [];
    const experienceMatches = documentXml.match(/PROFESSIONAL EXPERIENCE/g) ?? [];
    const headerMatches = documentXml.match(/John Candidate/g) ?? [];

    expect(skillMatches).toHaveLength(1);
    expect(experienceMatches).toHaveLength(1);
    expect(headerMatches).toHaveLength(1);
    expect(documentXml).toContain('ListBullet');
  });

  it('exports PDF content with valid header', async () => {
    const { service } = buildService(95, []);

    const exportResult = await service.exportResume('user-1', baseRequest, 'pdf');
    expect(exportResult.contentType).toBe('application/pdf');
    expect(exportResult.filename).toMatch(/^Example-Co-\d{2}-\d{2}-\d{4}\.pdf$/);
    expect(exportResult.buffer.byteLength).toBeGreaterThan(10);
    expect(exportResult.buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
    const pdfText = exportResult.buffer.toString('utf8');
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
â€¢ First bullet with detailed leadership outcomes across multi-quarter planning and execution.
• Second bullet covering cross-functional operations, stakeholder alignment, and measurable program impact.
&&¢ Third bullet focused on systems improvement, delivery quality, and coaching outcomes.
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
    );

    const exportResult = await service.exportResume('user-1', baseRequest, 'pdf');
    const latin1Text = exportResult.buffer.toString('latin1');
    expect(latin1Text).toContain('First bullet');
    expect(latin1Text).toContain('Second bullet');
    expect(latin1Text).toContain('Third bullet');
    expect(latin1Text).toContain('- First bullet');
    expect(latin1Text).toContain('- Second bullet');
    expect(latin1Text).toContain('- Third bullet');
    expect(latin1Text).not.toContain('â€¢');
    expect(latin1Text).not.toContain('&&¢');
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
    const { service } = buildService(95, inventedFlag);

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.compliance_blocked).toBe(true);
    expect(result.compliance_flags).toEqual(inventedFlag);
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
      detectScopeInflation: jest.fn().mockReturnValue([]),
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
      },
    ];

    const { service } = buildService(95, [], mockBaselineVersion, {
      detectScopeInflation: jest.fn().mockReturnValue(scopeFlag),
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
    expect(result.compliance_blocked).toBe(true);
    expect(result.compliance_flags).toEqual(scopeFlag);
  });
});
