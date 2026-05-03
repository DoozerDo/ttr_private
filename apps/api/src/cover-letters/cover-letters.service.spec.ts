import { UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CoverLettersService } from './cover-letters.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { ComplianceAction, ComplianceFlagSeverity } from '../compliance/compliance.types';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { BaselineIncludePolicy, BaselineSectionType } from '../baseline/baseline-section.entity';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';

const baseline: Partial<Baseline> = {
  id: 'baseline-1',
  userId: 'user-1',
  sections: [
    {
      id: 'section-1',
      title: 'Experience',
      content:
        `Led enterprise support modernization across global teams. Improved escalation readiness, incident response quality, and KPI governance using repeatable operational systems and executive communication. `.repeat(
          20,
        ),
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      sectionType: BaselineSectionType.EXPERIENCE,
    },
  ],
  parsedRecords: [],
};

const baselineVersion: Partial<BaselineVersion> = {
  id: 'baseline-version-1',
  baselineId: 'baseline-1',
  hash: 'hash-1',
};

const assessment: Partial<FitAssessment> = {
  id: 'analysis-1',
  userId: 'user-1',
  jobId: 'job-1',
  baselineId: 'baseline-1',
  overallScore: 88,
  baselineVersion: 1,
};

const job: Partial<Job> = {
  id: 'job-1',
  userId: 'user-1',
  title: 'Program Manager',
  company: 'Example Co',
  normalizedResponsibilities: ['Drive operational execution'],
  normalizedRequirements: ['Deliver measurable outcomes'],
};

const createRepo = (value: unknown) => ({
  findOne: jest.fn().mockResolvedValue(value),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((payload: Record<string, unknown>) => payload),
  save: jest.fn(async (payload: Record<string, unknown>) => ({ ...payload, id: 'saved-1' })),
  remove: jest.fn(async (payload: unknown) => payload),
});

const buildService = (options?: {
  complianceFlags?: Array<{ code: string; message: string; severity: string }>;
  blocked?: boolean;
}) => {
  const coverRepo = createRepo(null);
  const baselineRepo = createRepo(baseline);
  const versionRepo = createRepo(baselineVersion);
  const policyRepo = createRepo([]);
  const jobRepo = createRepo(job);
  const fitRepo = createRepo(assessment);

  const complianceService = {
    normalizeText: jest.fn((value: string) => value),
    enforceResumeWritingRules: jest.fn().mockReturnValue([]),
    detectScopeInflation: jest.fn().mockResolvedValue([]),
    validateAndAudit: jest.fn().mockResolvedValue({
      complianceFlags: options?.complianceFlags ?? [],
      blocked: options?.blocked ?? false,
      audit: {
        id: 'audit-1',
        baselineVersionHash: 'hash-1',
        action: ComplianceAction.COVER_LETTER_GENERATION,
      },
    }),
    normalizeSectionsForOutput: jest.fn().mockImplementation((sections) => sections),
  };

  const dataSource = {
    getRepository: jest.fn((entity) => {
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

  const gapAnalysis = {
    analyze: jest.fn().mockReturnValue({ strengths: [], criticalGaps: [] }),
  } as unknown as GapAnalysisService;

  const workflowIdempotencyService = {
    reserve: jest.fn().mockResolvedValue({
      status: 'accepted_new',
      runId: 'run-1',
      responseBody: null,
    }),
    complete: jest.fn().mockResolvedValue({ status: 'completed' }),
    markFailure: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<WorkflowIdempotencyService>;

  const studioArtifactsService = {
    computeJobFingerprint: jest.fn().mockReturnValue('job-fingerprint-1'),
    computeCoverLetterInputsHash: jest.fn().mockReturnValue('cover-letter-inputs-hash-1'),
    recordCoverLetterInProgress: jest.fn().mockResolvedValue('studio-artifact-1'),
    recordCoverLetterSuccess: jest.fn().mockResolvedValue('studio-artifact-1'),
    recordCoverLetterFailure: jest.fn().mockResolvedValue('studio-artifact-1'),
  } as any;

  const applicationsService = {
    upsertApplicationForPair: jest.fn().mockResolvedValue({ id: 'app-1' }),
  } as any;

  const service = new CoverLettersService(
    dataSource,
    complianceService as any,
    gapAnalysis,
    workflowIdempotencyService,
    studioArtifactsService,
    applicationsService,
  );
  return { service, complianceService, coverRepo, workflowIdempotencyService, studioArtifactsService };
};

const request = {
  baselineId: 'baseline-1',
  baselineVersionId: 'baseline-version-1',
  jobId: 'job-1',
  analysisId: 'analysis-1',
};

describe('CoverLettersService contract', () => {
  it('blocks cover letter generation with baseline_template_not_ready and does not persist success', async () => {
    const { service, studioArtifactsService } = buildService();
    const original = baseline.sections?.[0]?.content ?? '';

    baseline.sections = [
      {
        title: 'Experience',
        sectionType: 'EXPERIENCE',
        content: [
          'Vue 3), deck builder frontend',
          'Professional Experience',
          '2021 - Present',
          '- Did work.',
          '',
          // Add enough text so this is not rejected as insufficient_extracted_text.
          'Additional verified baseline context '.repeat(60),
        ].join('\n'),
      } as any,
    ];

    try {
      await expect(service.generateCoverLetter('user-1', request as any)).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({
          code: 'baseline_template_not_ready',
        }),
      });
      expect(studioArtifactsService.recordCoverLetterSuccess).not.toHaveBeenCalled();
    } finally {
      baseline.sections = [
        {
          title: 'Experience',
          sectionType: 'EXPERIENCE',
          content: original,
        } as any,
      ];
    }
  });

  it('rejects unresolved placeholder content and does not persist success', async () => {
    const { service, studioArtifactsService } = buildService();
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: '[[company]]\\n\\nI have a specific interest in company.',
        wordCount: 40,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: [],
      },
      complianceResult: {
        normalizedContent: 'I have a specific interest in company. Please see [[company]].',
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    try {
      await expect(service.generateCoverLetter('user-1', request as any)).rejects.toBeTruthy();
      expect(studioArtifactsService.recordCoverLetterSuccess).not.toHaveBeenCalled();
    } finally {
      buildDraftSpy.mockRestore();
    }
  });

  it('allows generation when baselineVersionId is missing', async () => {
    const { service, studioArtifactsService } = buildService();
    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nBody one.\\n\\nBody two.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
        wordCount: 260,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: [],
      },
      complianceResult: {
        normalizedContent: 'This cover letter ends with and',
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    const readiness = await service.getGenerationReadiness('user-1', { ...request, baselineVersionId: null } as any);
    expect(readiness.status).toBe('ready');
  });

  it('returns a controlled blocked readiness when required IDs are missing', async () => {
    const { service, studioArtifactsService } = buildService();
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft');

    const readiness = await service.getGenerationReadiness('user-1', {
      baselineId: '',
      jobId: '',
      analysisId: '',
      baselineVersionId: null,
    } as any);

    expect(buildDraftSpy).not.toHaveBeenCalled();
    expect(readiness.status).toBe('blocked');
    expect(readiness.blocked).toBe(true);
  });

  it('returns readiness ready and allows generation in READY state', async () => {
    const { service, studioArtifactsService } = buildService();
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nBody one.\\n\\nBody two.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
        wordCount: 260,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: [],
      },
      complianceResult: {
        normalizedContent: 'This cover letter is complete and ready for export.',
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    const readiness = await service.getGenerationReadiness('user-1', request as any);
    expect(readiness.status).toBe('ready');

    const result = await service.generateCoverLetter('user-1', request as any);
    expect(result.status).toBe('success');
    expect(result.exportReady).toBe(true);
    expect(result.preview?.coverLetter).toBeTruthy();
    expect((result as any).content).toBeTruthy();
    const content = String((result as any).content);
    for (const line of content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      expect(line).not.toMatch(/\b(?:the|a|an|and|but|because|with|for|to|of|in|on|at|by|from)\s*$/i);
    }
    expect(studioArtifactsService.recordCoverLetterSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/\S/),
        responseBody: expect.objectContaining({
          content: expect.any(String),
        }),
      }),
    );
    buildDraftSpy.mockRestore();
  });

  it('reuses a completed generation request instead of creating a duplicate artifact', async () => {
    const { service, coverRepo, workflowIdempotencyService } = buildService();
    const originalScore = assessment.overallScore;
    assessment.overallScore = 70;
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team',
        wordCount: 260,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: [],
      },
      complianceResult: {
        normalizedContent: ['Line one ends with and', 'Second line ends with with', 'A complete sentence.'].join('\n'),
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });
    workflowIdempotencyService.reserve = jest.fn().mockResolvedValueOnce({
      status: 'existing_completed',
      runId: 'run-1',
      responseBody: {
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        id: 'cover-existing',
        userId: 'user-1',
        baselineId: 'baseline-1',
        jobId: 'job-1',
        content: 'cached',
        generatorType: 'template',
        generatorVersion: 'v1',
        closingTemplateKey: 'default',
        generationInputsHash: 'hash',
        preview: { coverLetter: { salutation: 'Dear Hiring Team,' } },
        compliance_flags: [],
        audit_id: 'audit-1',
        auditId: 'audit-1',
        baseline_version_hash: 'hash-1',
        exports: { docx: true, pdf: true },
        display: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
        safeDisplay: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
        traceMap: {},
        debugTrace: { passed: true, failures: [], traceCoverage: 100, unusedEvidence: [], selectedEvidence: [] },
        internal: {
          auditId: 'audit-1',
          baselineVersionHash: 'hash-1',
          complianceFlags: [],
          generationMode: 'structured_baseline_template',
          templateVersion: 'structured-baseline-v1',
        },
      },
    }) as any;

    const result = await service.generateCoverLetter('user-1', request as any);

    expect(result.id).toBe('cover-existing');
    expect(result.idempotency?.reused).toBe(true);
    expect(coverRepo.save).not.toHaveBeenCalled();
    buildDraftSpy.mockRestore();
    assessment.overallScore = originalScore;
  });

  it('forces regeneration for score >= 80 when an existing completed artifact is legacy', async () => {
    const { service, coverRepo, workflowIdempotencyService } = buildService();
    const assembler = require('./coverLetterTemplateAssembler');
    const assembleSpy = jest.spyOn(assembler, 'assembleCoverLetterFromStructuredBaseline');

    try {
      const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
        baseline,
        baselineVersion,
        job,
        analysisAssessment: assessment,
        allowedBlocks: [],
        templateReadiness: {
          canGenerateResume: true,
          canGenerateCoverLetter: true,
          hardBlockReasons: [],
          warnings: [],
          stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
        },
        jobContext: {
          id: 'job-1',
          title: 'Program Manager',
          company: 'Example Co',
          responsibilities: [],
          requirements: [],
        },
        jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
        closingTemplateKey: 'default',
        generationInputsHash: 'hash',
        generation: {
          document: assembler.assembleCoverLetterFromStructuredBaseline({
            structured: {
              contact: undefined,
              summary: undefined,
              experience: [
                {
                  company: 'Example Co',
                  roleTitle: 'Program Manager',
                  dates: '2020 - 2024',
                  bullets: ['Led enterprise support modernization across global teams.'],
                  source: 'baseline',
                },
              ],
              education: [],
              skills: [],
              missingEvidenceReasons: [],
            },
            senderName: 'Jordan Lee',
            senderContactLine: null,
            jobTitle: job.title,
            companyName: job.company,
          }),
          content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nBody one.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
          wordCount: 120,
          greeting: 'Dear Hiring Team,',
          paragraphs: ['Opening.', 'Body one.'],
          closingParagraphs: ['Closing.'],
          paragraphEvidence: [],
          traceMap: {},
        },
        complianceResult: {
          normalizedContent: 'This cover letter is complete and ready for export.',
          complianceFlags: [],
          blocked: false,
          audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
        },
      });

      const result = await service.generateCoverLetter('user-1', request as any);

      expect(assembleSpy).toHaveBeenCalled();
      expect(workflowIdempotencyService.reserve).not.toHaveBeenCalled();
      expect(result.id).toBeTruthy();
      expect(result.internal?.generationMode).toBe('structured_baseline_template');
      expect(result.internal?.templateVersion).toBe('structured-baseline-v1');
      expect(coverRepo.save).toHaveBeenCalled();
      buildDraftSpy.mockRestore();
    } finally {
      assembleSpy.mockRestore();
    }
  });

  it('returns readiness limited and allows generation', async () => { 
    const { service, coverRepo } = buildService({
      complianceFlags: [
        {
          code: 'personalization_limitation',
          message: 'Generation is limited by verification constraints.',
          severity: ComplianceFlagSeverity.WARN,
        },
      ],
      blocked: false,
    });
    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nBody one.\\n\\nBody two.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
        wordCount: 120,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: [],
      },
      complianceResult: {
        normalizedContent: 'This cover letter is limited by verification constraints but still complete.',
        complianceFlags: [
          {
            code: 'personalization_limitation',
            message: 'Generation is limited by verification constraints.',
            severity: ComplianceFlagSeverity.WARN,
          },
        ],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    const readiness = await service.getGenerationReadiness('user-1', request as any);
    expect(readiness.status).toBe('limited');

    await expect(service.generateCoverLetter('user-1', request as any)).resolves.toBeTruthy(); 
    expect(coverRepo.save).toHaveBeenCalled(); 
  }); 
 
  it('does not return readiness BLOCKED for score >= 80 when verification gaps exist (verified-only lane)', async () => { 
    const { service } = buildService({ 
      complianceFlags: [ 
        { 
          code: 'full_block', 
          message: 'Missing verified evidence for role-critical statements.', 
          severity: ComplianceFlagSeverity.BLOCK, 
        }, 
      ], 
      blocked: true, 
    }); 
    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({ 
      baseline, 
      baselineVersion, 
      job, 
      analysisAssessment: assessment, 
      allowedBlocks: [], 
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: { 
        id: 'job-1', 
        title: 'Program Manager', 
        company: 'Example Co', 
        responsibilities: [], 
        requirements: [], 
      }, 
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] }, 
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nBody one.\\n\\nBody two.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
        wordCount: 120,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: [],
      },
      complianceResult: {
        normalizedContent: 'This cover letter draft is blocked due to missing verification but has content.',
        complianceFlags: [
          {
            code: 'full_block',
            message: 'Missing verified evidence for role-critical statements.',
            severity: ComplianceFlagSeverity.BLOCK, 
          }, 
        ], 
        blocked: true, 
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' }, 
      }, 
    }); 
 
    const readiness = await service.getGenerationReadiness('user-1', request as any); 
    expect(readiness.status).toBe('limited'); 
    expect(readiness.blocked).toBe(false); 
    expect(readiness.reasons[0]?.code).toBe('verified_only_generation'); 
  }); 

  it('falls back to verified-only generation for score >= 70 when readiness is BLOCKED', async () => { 
    const { service, coverRepo } = buildService({ 
      complianceFlags: [ 
        {
          code: 'full_block',
          message: 'Missing verified evidence for role-critical statements.',
          severity: ComplianceFlagSeverity.BLOCK,
        },
      ],
      blocked: true,
    });
    const draftBlocked = {
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: { document: { opening: '', bodyParagraphs: [], closingParagraph: '' } },
      complianceResult: {
        normalizedContent: 'blocked',
        complianceFlags: [
          {
            code: 'full_block',
            message: 'Missing verified evidence for role-critical statements.',
            severity: ComplianceFlagSeverity.BLOCK,
          },
        ],
        blocked: true,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    };
    const draftRecovered = {
      ...draftBlocked,
      complianceResult: {
        normalizedContent: 'This cover letter is limited by verification constraints but still complete.',
        complianceFlags: [
          {
            code: 'personalization_limitation',
            message: 'Generation is limited by verification constraints.',
            severity: ComplianceFlagSeverity.WARN,
          },
        ],
        blocked: false,
        audit: { id: 'audit-2', baselineVersionHash: 'hash-1' },
      },
    };
    jest
      .spyOn(service as any, 'buildCoverLetterDraft')
      .mockResolvedValueOnce(draftBlocked)
      .mockResolvedValueOnce(draftRecovered);

    await expect(service.generateCoverLetter('user-1', request as any)).resolves.toBeTruthy();
    expect(coverRepo.save).toHaveBeenCalled();
  });

  it('returns generation_failed when the cover letter quality gate rejects the draft', async () => {
    const { service } = buildService();
    const originalScore = assessment.overallScore;
    assessment.overallScore = 70;
    const privateService = service as unknown as {
      buildCoverLetterDraft: (userId: string, input: typeof request) => Promise<unknown>;
    };
    const original = baseline.sections?.[0]?.content ?? '';
    baseline.sections = [
      {
        title: 'Experience',
        sectionType: 'EXPERIENCE',
        content: [
          'Example Co | Program Manager | 2020 - 2024',
          '- Led operational programs across teams with measurable outcomes.',
          'Additional verified baseline context '.repeat(40),
        ].join('\n'),
      } as any,
    ];

    try {
      await privateService.buildCoverLetterDraft('user-1', request as any);
      fail('expected insufficient baseline evidence validation error');
    } catch (error) {
      expect(String((error as any)?.message ?? '')).toMatch(/insufficient baseline evidence/i);
    } finally {
      baseline.sections = [
        {
          title: 'Experience',
          sectionType: 'EXPERIENCE',
          content: original,
        } as any,
      ];
      assessment.overallScore = originalScore;
    }
  });

  it('forces structured template regeneration and overwrites an existing legacy artifact when score >= 80', async () => {
    const { service, coverRepo, workflowIdempotencyService } = buildService();
    const assembler = require('./coverLetterTemplateAssembler');

    // Do not allow idempotency reuse at all for score >= 80.
    (workflowIdempotencyService.reserve as jest.Mock).mockResolvedValue({
      status: 'existing_completed',
      runId: 'legacy-run',
      responseBody: { id: 'cover-legacy', internal: {} },
    });

    const existing = {
      id: 'cover-existing',
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      generationInputsHash: 'hash',
      content: 'legacy content',
    };
    (coverRepo.findOne as jest.Mock).mockResolvedValue(existing);
    (coverRepo.save as jest.Mock)
      .mockImplementationOnce(() => {
        const err: any = new Error('duplicate key');
        err.code = '23505';
        throw err;
      })
      .mockImplementationOnce(async (payload: any) => ({ ...payload, id: existing.id }));

    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: {
        document: assembler.assembleCoverLetterFromStructuredBaseline({
          structured: {
            contact: undefined,
            summary: undefined,
            experience: [
              {
                company: 'Example Co',
                roleTitle: 'Program Manager',
                dates: '2020 - 2024',
                bullets: ['Led enterprise support modernization across global teams.'],
                source: 'baseline',
              },
            ],
            education: [],
            skills: [],
            missingEvidenceReasons: [],
          },
          senderName: 'Jordan Lee',
          senderContactLine: null,
          jobTitle: job.title,
          companyName: job.company,
        }),
        content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
        wordCount: 120,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: [],
        traceMap: {},
      },
      complianceResult: {
        normalizedContent: 'This cover letter is complete and ready for export.',
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    const result = await service.generateCoverLetter('user-1', request as any);

    expect(workflowIdempotencyService.reserve).not.toHaveBeenCalled();
    expect(result.id).toBe(existing.id);
    expect(result.id).not.toBe('cover-legacy');
    expect(result.internal?.generationMode).toBe('structured_baseline_template');
    expect(result.internal?.templateVersion).toBe('structured-baseline-v1');
    expect(coverRepo.save).toHaveBeenCalled();
  });

  it('throws generation_failed when output validation is invalid', async () => {
    const { service } = buildService();
    const privateService = service as unknown as {
      throwCoverLetterQualityError: (flags: string[], stage: string) => never;
    };

    expect(() =>
      privateService.throwCoverLetterQualityError(['missing_paragraphs'], 'post_processing'),
    ).toThrow(UnprocessableEntityException);

    try {
      privateService.throwCoverLetterQualityError(['missing_paragraphs'], 'post_processing');
    } catch (error) {
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'generation_failed',
        message: 'Cover letter generation failed validation.',
      });
    }
  });
});
