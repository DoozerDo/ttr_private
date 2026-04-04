import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
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

  const service = new CoverLettersService(dataSource, complianceService as any, gapAnalysis);
  return { service, complianceService, coverRepo };
};

const request = {
  baselineId: 'baseline-1',
  baselineVersionId: 'baseline-version-1',
  jobId: 'job-1',
  analysisId: 'analysis-1',
};

describe('CoverLettersService contract', () => {
  it('throws BadRequest when baselineVersionId is missing', async () => {
    const { service } = buildService();
    await expect(
      service.generateCoverLetter('user-1', { ...request, baselineVersionId: '' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns readiness ready and allows generation in READY state', async () => {
    const { service } = buildService();
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
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
        normalizedContent: 'valid',
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
    buildDraftSpy.mockRestore();
  });

  it('returns readiness limited but blocks generation with generation_blocked', async () => {
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
    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
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
        normalizedContent: 'limited',
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

    await expect(service.generateCoverLetter('user-1', request as any)).rejects.toMatchObject({
      response: {
        code: 'generation_blocked',
        message:
          'Generation is not available for this role due to insufficient verified evidence.',
      },
      status: 422,
    });
  });

  it('throws generation_blocked for BLOCKED readiness', async () => {
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
    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
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
    });

    await expect(service.generateCoverLetter('user-1', request as any)).rejects.toMatchObject({
      response: {
        code: 'generation_blocked',
        category: 'generation_blocked',
        retryable: false,
        diagnostics: {
          failureReasons: [expect.stringContaining('full_block')],
        },
      },
      status: 422,
    });

    expect(coverRepo.save).not.toHaveBeenCalled();
  });

  it('returns canonical unsupported_input for unsupported cover letter envelopes', async () => {
    const { service } = buildService();
    const privateService = service as unknown as {
      buildCoverLetterDraft: (userId: string, input: typeof request) => Promise<unknown>;
    };

    try {
      await privateService.buildCoverLetterDraft('user-1', request as any);
      fail('expected unsupported_input rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'insufficient_extracted_text',
        category: 'unsupported_input',
        retryable: false,
      });
    }
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
