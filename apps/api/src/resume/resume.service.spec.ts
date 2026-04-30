import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ResumeService, GenerateResumeRequest } from './resume.service';
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
import { extractEvidenceUnitsFromLogicalUnits, reconstructLogicalTextUnits } from './resume-draft-bullets';
import * as ResumeDraftBullets from './resume-draft-bullets';

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
  content:
    `Senior Program Manager at Example Co from 2020 to 2024. Led support operations and improved service reliability across global teams. Built playbooks, reduced incident volume, and managed executive stakeholder updates. `.repeat(
      25,
    ),
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
    recordResumeInProgress: jest.fn().mockResolvedValue(undefined),
    recordResumeFailure: jest.fn().mockResolvedValue(undefined),
    recordResumeSuccess: jest.fn().mockResolvedValue(undefined),
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

    baseline.sections = [{ ...baseSection, content: original }];
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
    expect(result.preview?.resume?.experience?.[0]?.roleTitle ?? '').toBe('');
  });

  it('marks resume as not export-ready when experience headers are malformed (sentence-like title/company)', async () => {
    const { service } = buildService();

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
    expect(result.exportReady).toBe(false);
    expect(result.exports).toEqual({ docx: false, pdf: false });
    expect(result.qualityGate?.status).toBe('needs_refinement');
    expect(result.qualityGate?.reasons ?? []).toEqual(
      expect.arrayContaining(['malformed_experience_header:role_title']),
    );

    const preview = result.preview?.resume as any;
    expect(preview?.experience?.length ?? 0).toBeGreaterThan(0);
    const firstRoleTitle = String(preview?.experience?.[0]?.roleTitle ?? '');
    expect(firstRoleTitle).not.toContain('Designed and built');
    const firstBullets = (preview?.experience?.[0]?.bullets ?? []).map((b: unknown) => String(b ?? ''));
    expect(firstBullets.join(' ')).toContain('Designed and built a full-stack production platform for Conquest of Fates');

    const secondRoleTitle = String(preview?.experience?.[1]?.roleTitle ?? '');
    expect(secondRoleTitle).toBe('');
    const secondBullets = (preview?.experience?.[1]?.bullets ?? []).map((b: unknown) => String(b ?? ''));
    expect(secondBullets.join(' ')).not.toMatch(/\bTechnical Architect and\b/i);

    baseline.sections = [{ ...baseSection, content: original }];
  });
  it('does not require baselineVersionId (service resolves latest version)', async () => {
    const { service } = buildService();
    await expect(
      service.generateResume('user-1', { ...baseRequest, baselineVersionId: '' }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: expect.any(Boolean),
    });
  });

  it('returns canonical unsupported_input when the resume fixture lacks supported structure', async () => {
    const { service } = buildService();
    const readiness = await service.getGenerationReadiness('user-1', baseRequest);
    expect(readiness.status).toBe('ready');

    await expect(service.generateResume('user-1', baseRequest)).resolves.toMatchObject({
      ok: true,
      status: 'success',
    });
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

    const readiness = await service.getGenerationReadiness('user-1', baseRequest);
    expect(readiness.status).toBe('limited');

    await expect(service.generateResume('user-1', baseRequest)).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: expect.any(Boolean),
    });
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
 
    const readiness = await service.getGenerationReadiness('user-1', baseRequest); 
    expect(readiness.status).toBe('limited'); 
    expect(readiness.blocked).toBe(false); 
    expect(readiness.reasons[0]?.code).toBe('verified_only_generation'); 
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

    await expect(service.generateResume('user-1', baseRequest)).resolves.toMatchObject({
      ok: true,
      status: 'success',
      exportReady: true,
    });

    expect(applicationsService.upsertPreparedFromResumeGeneration).not.toHaveBeenCalled();
    expect(opportunitiesService.createFromResumeStudio).not.toHaveBeenCalled();
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
});
