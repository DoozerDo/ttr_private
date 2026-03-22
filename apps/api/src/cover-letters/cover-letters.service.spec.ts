import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import JSZip from 'jszip';
import { DataSource } from 'typeorm';
import {
  BaselineIncludePolicy,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from '../compliance/compliance.types';
import type { ValidateAndAuditResult } from '../compliance/compliance.service';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { ScopeInflationDetector } from '../compliance/scope-inflation-detector';
import { CoverLettersService } from './cover-letters.service';

type MockRepository<T extends Record<string, any>> = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
};

function buildRepository<T extends Record<string, any>>(
  initial?: T,
): MockRepository<T> {
  let saved = initial;

  return {
    findOne: jest.fn(() => Promise.resolve(saved ?? null)),
    find: jest.fn(() => Promise.resolve([])),
    create: jest.fn((payload: Partial<T>) => ({ ...payload }) as T),
    save: jest.fn((payload: T) => {
      saved = {
        ...payload,
        id: payload['id'] ?? 'saved-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as T;
      return Promise.resolve(saved);
    }),
    remove: jest.fn((payload: T) => Promise.resolve(payload)),
  };
}

async function expectValidDocxZip(buffer: Buffer) {
  expect(buffer.byteLength).toBeGreaterThan(1000);
  expect(buffer[0]).toBe(0x50);
  expect(buffer[1]).toBe(0x4b);
  expect(buffer[2]).toBe(0x03);
  expect(buffer[3]).toBe(0x04);
  const zip = await JSZip.loadAsync(buffer);
  expect(zip.file('[Content_Types].xml')).toBeDefined();
}

async function extractDocxParagraphTexts(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')!.async('text');
  const paragraphs = documentXml
    .split('<w:p')
    .slice(1)
    .map((chunk) => {
      const matches = [];
      const regex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
      let match;
      while ((match = regex.exec(chunk)) !== null) {
        matches.push(match[1]);
      }
      return matches.join('').trim();
    })
    .filter(Boolean);
  return paragraphs;
}

describe('CoverLettersService', () => {
  const coverLetterRepository = buildRepository<any>();
  const baselineRepository = buildRepository<any>({
    id: 'baseline-1',
    userId: 'user-1',
    parsedRecords: [
      {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        parsedJson: {
          identity: {
            full_name: 'Jordan Lee',
            current_title: 'Operations Lead',
          },
        },
      },
    ],
    sections: [
      {
        id: 'section-1',
        title: 'Experience',
        content:
          'Delivered 15% efficiency improvement with verified metrics across multi-quarter programs. ' +
          'Led cross-functional initiatives with measurable outcomes in planning, delivery, risk management, ' +
          'and stakeholder communication. ' +
          'Owned roadmap sequencing, execution governance, and operational reporting for enterprise programs. ' +
          'Drove partner coordination, alignment sessions, milestone tracking, and retrospective improvements. ' +
          'Implemented repeatable playbooks, onboarding workflows, quality checks, and coaching loops that ' +
          'improved reliability and throughput. ' +
          'Collaborated with engineering, product, and operations to prioritize high-impact initiatives and ' +
          'deliver transparent progress communication to leadership.',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        sectionType: BaselineSectionType.EXPERIENCE,
      },
    ],
  });
  const baselineVersionRepository = buildRepository<any>({
    id: 'baseline-version-1',
    baselineId: 'baseline-1',
    versionNumber: 3,
    hash: 'baseline-hash',
  });
  const baselineBlockPolicyRepository = buildRepository<any>();
  const fitAssessmentRepository = buildRepository<any>({
    id: 'analysis-1',
    userId: 'user-1',
    jobId: 'job-1',
    baselineId: 'baseline-1',
    baselineVersion: 3,
    overallScore: 88,
  });
  const jobRepository = buildRepository<any>({
    id: 'job-1',
    userId: 'user-1',
    title: 'Program Manager',
    company: 'Acme Corp',
    normalizedResponsibilities: ['Improve processes by 10%.'],
    normalizedRequirements: ['Deliver measurable impact.'],
  });

  const complianceService = {
    enforceResumeWritingRules: jest.fn().mockReturnValue([]),
    detectScopeInflation: jest.fn().mockResolvedValue([]),
    normalizeText: jest.fn((value: string) => value),
    validateAndAudit: jest.fn((ctx: any) =>
      Promise.resolve({
        complianceFlags: ctx.extraFlags ?? [],
        blocked: (ctx.extraFlags ?? []).some(
          (flag: { severity: ComplianceFlagSeverity }) =>
            flag.severity === ComplianceFlagSeverity.BLOCK,
        ),
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      }),
    ),
  };

  const dataSource = {
    getRepository: jest.fn((entity) => {
      switch (entity?.name) {
        case 'CoverLetter':
          return coverLetterRepository;
        case 'Baseline':
          return baselineRepository;
        case 'BaselineVersion':
          return baselineVersionRepository;
        case 'BaselineBlockPolicy':
          return baselineBlockPolicyRepository;
        case 'FitAssessment':
          return fitAssessmentRepository;
        case 'Job':
          return jobRepository;
        default:
          throw new Error(`Unexpected repository request: ${entity?.name}`);
      }
    }),
  } as unknown as DataSource;

  const gapAnalysisService = {
    analyze: jest.fn().mockReturnValue({
      strengths: [],
      criticalGaps: [],
    }),
  } as Partial<GapAnalysisService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists a chosen closing template and reuses it for the next generation', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
      closingTemplateKey: 'collaborative',
    });

    expect(coverLetterRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ closingTemplateKey: 'collaborative' }),
    );

    // Simulate subsequent call without providing a template key.
    const second = await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(second.status).toBe('success');
    expect(second.generationStatus).toBe('success');
    expect(second.exportReady).toBe(true);
    expect(second.exports).toEqual({ docx: true, pdf: true });
    expect(second.preview?.coverLetter?.salutation).toBe('Dear Hiring Team,');
    expect(second.safeDisplay).toMatchObject({
      title: 'Cover letter generated successfully',
    });
    expect(second.closingTemplateKey).toBe('collaborative');
    expect(second.audit_id).toBe('audit-1');
  });

  it('sanitizes and validates generated cover letter structure and tone', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    const result = await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(result.status).toBe('success');
    expect(result.content.startsWith('Dear Hiring Team,')).toBe(true);
    expect(result.content).not.toContain('-');
    expect(result.content).not.toMatch(
      /\bverified experience\b|\bverified operational experience\b|\bdocumented execution\b|\bdocumented expertise\b|\bclear ownership\b|\bproven expertise\b/i,
    );
    expect(result.content).not.toMatch(/\bpage\s*\d+\s*(\||\/|of)\s*\d+\b/i);
    expect(result.content).not.toContain('â€¢');
    expect(result.content).toContain('Program Manager');
    expect(result.content).toContain('Acme Corp');
    expect(result.content).toContain('\n\nSincerely,\n\nJordan Lee');
    expect(result.content).not.toContain('10%');

    const wordCount = result.content.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeGreaterThanOrEqual(250);
    expect(wordCount).toBeLessThanOrEqual(400);

    const jdLine =
      'Improve processes by 10%'.toLowerCase().replace(/[^\w\s]/g, '');
    const normalizedLetter = result.content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ');
    expect(normalizedLetter.includes(jdLine)).toBe(false);
    expect(
      result.preview?.coverLetter &&
        Array.isArray((result as any).preview?.coverLetter?.bodyParagraphs),
    ).toBe(true);
  });

  it('fails cover letter generation when analysis context mismatches requested job', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );
    fitAssessmentRepository.findOne.mockResolvedValueOnce({
      id: 'analysis-1',
      userId: 'user-1',
      jobId: 'job-other',
      baselineId: 'baseline-1',
      baselineVersion: 3,
      overallScore: 88,
    });

    await expect(
      service.generateCoverLetter('user-1', {
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
        analysisId: 'analysis-1',
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

  it('fails cover letter export when analysis context mismatches baseline version', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );
    baselineVersionRepository.findOne
      .mockResolvedValueOnce({
        id: 'baseline-version-1',
        baselineId: 'baseline-1',
        versionNumber: 3,
        hash: 'baseline-hash',
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.exportCoverLetter(
        'user-1',
        {
          baselineId: 'baseline-1',
          baselineVersionId: 'baseline-version-2',
          jobId: 'job-1',
          analysisId: 'analysis-1',
        },
        'docx',
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

  it('reports blocked readiness when cover-letter compliance preflight would block', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );
    const blockingFlag: ComplianceFlag = {
      code: 'invented_scope',
      message: 'Scope claim is unsupported.',
      severity: 'block',
      confidence: 0.95,
      evidence: [],
    };
    const blockedAuditResult: ValidateAndAuditResult = {
      complianceFlags: [blockingFlag],
      blocked: true,
      audit: {
        id: 'audit-cover-blocked-readiness',
        baselineVersionId: 'baseline-version-1',
        baselineVersionHash: 'hash-1',
        outputHash: '',
        action: ComplianceAction.COVER_LETTER_GENERATION,
        actorId: 'user-1',
        jobId: 'job-1',
        createdAt: new Date().toISOString(),
      },
    };
    complianceService.validateAndAudit
      .mockResolvedValueOnce(blockedAuditResult)
      .mockResolvedValueOnce(blockedAuditResult);

    const readiness = await service.getGenerationReadiness('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(readiness.status).toBe('blocked');
    expect(readiness.blocked).toBe(true);
  });

  it('reports limited readiness when cover-letter compliance returns warnings only', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );
    const warningFlag: ComplianceFlag = {
      code: 'personalization_limited',
      message: 'Draft is safe but personalization is constrained.',
      severity: 'warn',
      confidence: 0.71,
      evidence: [],
    };
    complianceService.validateAndAudit.mockResolvedValueOnce({
      complianceFlags: [warningFlag],
      blocked: false,
      audit: {
        id: 'audit-cover-limited-readiness',
        baselineVersionId: 'baseline-version-1',
        baselineVersionHash: 'hash-1',
        outputHash: '',
        action: ComplianceAction.COVER_LETTER_GENERATION,
        actorId: 'user-1',
        jobId: 'job-1',
        createdAt: new Date().toISOString(),
      },
    } as ValidateAndAuditResult);

    const readiness = await service.getGenerationReadiness('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(readiness.status).toBe('limited');
    expect(readiness.blocked).toBe(false);
  });

  it('reports ready readiness when cover-letter compliance has no issues and generation succeeds', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );
    const readiness = await service.getGenerationReadiness('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(readiness.status).toBe('ready');
    expect(readiness.blocked).toBe(false);

    await expect(
      service.generateCoverLetter('user-1', {
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
        analysisId: 'analysis-1',
      }),
    ).resolves.toMatchObject({ status: 'success' });
  });

  it('rejects freewritten cover letter paragraphs that cannot be anchored to baseline evidence', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    ) as any;

    service.generator = {
      generate: jest.fn().mockReturnValue({
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'I am applying for the Program Manager role at Acme Corp.',
          bodyParagraphs: [
            'I built a global transformation program across twelve countries.',
          ],
          closingParagraph: 'I would welcome a conversation.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content:
          'Dear Hiring Team,\n\nI am applying for the Program Manager role at Acme Corp.\n\nI built a global transformation program across twelve countries.\n\nI would welcome a conversation.\n\nSincerely,\n\nJordan Lee',
        wordCount: 54,
        greeting: 'Dear Hiring Team,',
        paragraphs: [
          'I am applying for the Program Manager role at Acme Corp.',
          'I built a global transformation program across twelve countries.',
        ],
        closingParagraphs: ['I would welcome a conversation.'],
        paragraphEvidence: [
          { paragraphKey: 'opening', sourceEvidenceIds: [], anchorTexts: [] },
          { paragraphKey: 'body_1', sourceEvidenceIds: [], anchorTexts: [] },
          { paragraphKey: 'closing', sourceEvidenceIds: [], anchorTexts: [] },
        ],
      }),
    };

    await expect(
      service.generateCoverLetter('user-1', {
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
      analysisId: 'analysis-1',
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'COVER_LETTER_ANCHOR_VALIDATION_FAILED',
        },
      },
    });
  });

  it('blocks generation and strips content when invented metrics are flagged', async () => {
    complianceService.enforceResumeWritingRules.mockReturnValueOnce([
      {
        code: ComplianceFlagCode.INVENTED_METRIC,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Metric not found in baseline.',
      },
    ]);

    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    const result = await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(result.blocked).toBe(true);
    expect(result.status).toBe('blocked');
    expect(result.generationStatus).toBe('blocked');
    expect(result.exportReady).toBe(false);
    expect(result.compliance_blocked).toBe(true);
    expect(result.exports).toEqual({ docx: false, pdf: false });
    expect(result.preview).toEqual({ coverLetter: null });
    expect(result.compliance_flags).toHaveLength(1);
    expect(result.compliance_flags?.[0].code).toBe(
      ComplianceFlagCode.INVENTED_METRIC,
    );
    expect(result.safeDisplay).toMatchObject({
      title: 'Cover letter blocked by compliance',
    });
    expect(result.internal).toMatchObject({
      auditId: 'audit-1',
    });
    expect(result).not.toHaveProperty('content');
    expect(coverLetterRepository.save).not.toHaveBeenCalled();

    expect(complianceService.validateAndAudit).toHaveBeenCalled();
  });

  it('blocks generation and strips content when scope inflation is detected', async () => {
    complianceService.detectScopeInflation.mockResolvedValueOnce([
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
    ]);

    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    const result = await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(result.blocked).toBe(true);
    expect(result.compliance_blocked).toBe(true);
    expect(result.compliance_flags).toHaveLength(1);
    expect(result.compliance_flags?.[0].code).toBe(
      ComplianceFlagCode.SCOPE_INFLATION,
    );
    expect(result.safeDisplay?.reasons?.[0]).toContain(
      'broader leadership scope than your baseline clearly supports',
    );
    expect(result.safeDisplay?.reasons?.[0]).not.toContain(
      'extreme_scale_without_baseline_match',
    );
    expect((result.internal as any)?.complianceDiagnostics?.[0]?.rawReasons).toContain(
      'extreme_scale_without_baseline_match',
    );
    expect(result).not.toHaveProperty('content');
    expect(coverLetterRepository.save).not.toHaveBeenCalled();

    expect(complianceService.validateAndAudit).toHaveBeenCalled();
  });

  it('does not emit extreme-scale warning when semantic baseline scope evidence exists in cover letter flow', async () => {
    const detector = new ScopeInflationDetector();
    baselineRepository.findOne.mockResolvedValueOnce({
      id: 'baseline-1',
      userId: 'user-1',
      parsedRecords: [
        {
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          parsedJson: {
            identity: {
              full_name: 'Jordan Lee',
            },
          },
        },
      ],
      sections: [
        {
          id: 'section-1',
          title: 'Experience',
          content:
            'Managed global customer support organization performance and staffing operations.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          sectionType: BaselineSectionType.EXPERIENCE,
        },
        {
          id: 'section-2',
          title: 'Summary',
          content:
            'Experienced operations leader with multi year ownership of support reliability, incident governance, stakeholder communication, process optimization, quality controls, and cross functional execution across enterprise environments. '.repeat(
              6,
            ),
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          sectionType: BaselineSectionType.SUMMARY,
        },
      ],
    });

    complianceService.detectScopeInflation.mockImplementationOnce(async (payload: any) =>
      detector.detect(
        payload.baselineSections ?? [],
        [
          ...(payload.generatedSections ?? []),
          {
            title: 'Generated Cover Letter',
            content:
              'Led global customer support organization through reliability improvements.',
          },
        ],
        payload.jobContext,
        payload.documentType,
        {
          embeddingProvider: async (text: string) => {
            const normalized = text.toLowerCase();
            if (
              normalized.includes('global') &&
              normalized.includes('support') &&
              normalized.includes('organization')
            ) {
              return [0.91, 0.08, 0.11];
            }
            return [0.1, 0.1, 0.1];
          },
          similarityThreshold: 0.75,
        },
      ),
    );

    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    const result = await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(result.status).toBe('success');
    expect(result.compliance_flags.map((flag) => flag.code)).not.toContain(
      ComplianceFlagCode.SCOPE_INFLATION,
    );
  });

  it('does not emit extreme_scale_without_baseline_match when baseline has leadership and scale evidence', async () => {
    const detector = new ScopeInflationDetector();
    coverLetterRepository.findOne.mockResolvedValue(null);
    baselineRepository.findOne.mockResolvedValueOnce({
      id: 'baseline-1',
      userId: 'user-1',
      parsedRecords: [
        {
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          parsedJson: {
            identity: {
              full_name: 'Jordan Lee',
            },
          },
        },
      ],
      sections: [
        {
          id: 'section-1',
          title: 'Experience',
          content:
            'Led turnaround of department responsible for mobile test resources (50,000 devices).',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
          sectionType: BaselineSectionType.EXPERIENCE,
        },
        {
          id: 'section-2',
          title: 'Summary',
          content:
            'Operational leader improving cross functional service reliability and delivery quality across enterprise environments. '.repeat(
              6,
            ),
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          sectionType: BaselineSectionType.SUMMARY,
        },
      ],
    });

    complianceService.detectScopeInflation.mockImplementationOnce(async (payload: any) =>
      detector.detect(
        payload.baselineSections ?? [],
        [
          ...(payload.generatedSections ?? []),
          {
            title: 'Generated Cover Letter',
            content: 'Led department managing mobile test infrastructure.',
          },
        ],
        payload.jobContext,
        payload.documentType,
        {
          embeddingProvider: async (text: string) => {
            const normalized = text.toLowerCase();
            if (
              normalized.includes('department') &&
              normalized.includes('mobile test') &&
              normalized.includes('devices')
            ) {
              return [0.87, 0.16, 0.22];
            }
            return [0.1, 0.1, 0.1];
          },
          similarityThreshold: 0.75,
        },
      ),
    );

    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    const result = await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(result.status).toBe('success');
    const scopeFlag = result.compliance_flags.find(
      (flag) => flag.code === ComplianceFlagCode.SCOPE_INFLATION,
    );
    expect(scopeFlag).toBeUndefined();
  });

  it('passes explicit sourceType metadata for all generated compliance spans', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
      jobContext: {
        allowedCompanies: ['Winona'],
        allowedRoleTitles: ['Head of Customer Services'],
      },
    });

    const generateAuditCall = (complianceService.validateAndAudit as jest.Mock).mock.calls
      .map((call) => call[0])
      .find((ctx) => ctx.action === ComplianceAction.COVER_LETTER_GENERATION);
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

  it('rejects generation without a baseline version id', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    await expect(
      service.generateCoverLetter('user-1', {
        baselineId: 'baseline-1',
        jobId: 'job-1',
        analysisId: 'analysis-1',
        baselineVersionId: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exports cover letter content with compliance audit headers', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    const result = await service.exportCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    }, 'docx');

    expect(result.filename).toBe('cover-letter.docx');
    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    await expectValidDocxZip(result.buffer);
    expect(result.baselineVersionHash).toBe('hash-1');

    expect(complianceService.validateAndAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ComplianceAction.COVER_LETTER_EXPORT,
        actorId: 'user-1',
      }),
    );
  });

  it('renders greeting and multiple body paragraphs', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    const result = await service.exportCoverLetter(
      'user-1',
      {
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
      analysisId: 'analysis-1',
      },
      'docx',
    );

    const paragraphs = await extractDocxParagraphTexts(result.buffer);
    const greetingIndex = paragraphs.findIndex(
      (paragraph) => paragraph === 'Dear Hiring Team,',
    );
    expect(greetingIndex).toBeGreaterThanOrEqual(0);
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  it('exports PDF cover letter content with valid header', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    const result = await service.exportCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    }, 'pdf');

    expect(result.filename).toBe('cover-letter.pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(result.buffer.byteLength).toBeGreaterThan(10);
    expect(result.buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('blocks export when compliance validation fails', async () => {
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
      baselineVersionHash: 'hash-2',
      outputHash: '',
      action: ComplianceAction.COVER_LETTER_EXPORT,
      actorId: 'user-1',
      jobId: 'job-1',
      createdAt: new Date().toISOString(),
    };
    complianceService.validateAndAudit.mockImplementation(async (ctx: any) => {
      if (ctx.action === ComplianceAction.COVER_LETTER_EXPORT) {
        return {
          complianceFlags: blockedFlags,
          blocked: true,
          audit: auditRecord,
        } as ValidateAndAuditResult;
      }

      return {
        complianceFlags: [],
        blocked: false,
        audit: {
          id: 'audit-1',
          baselineVersionId: ctx.baselineVersion?.id ?? 'baseline-version-1',
          baselineVersionHash:
            ctx.baselineVersion?.hash ?? ctx.baselineVersion?.fileHash ?? 'hash-1',
          outputHash: ctx.outputHash ?? '',
          action: ctx.action,
          actorId: ctx.actorId ?? 'user-1',
          jobId: ctx.job?.id ?? 'job-1',
          createdAt: new Date().toISOString(),
        },
      } as ValidateAndAuditResult;
    });

    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    try {
      await service.exportCoverLetter('user-1', {
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
      analysisId: 'analysis-1',
      }, 'pdf');
      throw new Error('expected export to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
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

  it('blocks export when generation audit is already compliance blocked', async () => {
    const blockedFlags: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.INVENTED_ROLE,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Role not in baseline.',
      },
    ];

    complianceService.validateAndAudit.mockImplementation(async (ctx: any) => {
      if (ctx.action === ComplianceAction.COVER_LETTER_GENERATION) {
        return {
          complianceFlags: blockedFlags,
          blocked: true,
          audit: {
            id: 'audit-generate',
            baselineVersionId: ctx.baselineVersion?.id ?? 'baseline-version-1',
            baselineVersionHash:
              ctx.baselineVersion?.hash ?? ctx.baselineVersion?.fileHash ?? 'hash-1',
            outputHash: ctx.outputHash ?? '',
            action: ComplianceAction.COVER_LETTER_GENERATION,
            actorId: ctx.actorId ?? 'user-1',
            jobId: ctx.job?.id ?? 'job-1',
            createdAt: new Date().toISOString(),
          },
        } as ValidateAndAuditResult;
      }

      return {
        complianceFlags: [],
        blocked: false,
        audit: {
          id: 'audit-export',
          baselineVersionId: ctx.baselineVersion?.id ?? 'baseline-version-1',
          baselineVersionHash:
            ctx.baselineVersion?.hash ?? ctx.baselineVersion?.fileHash ?? 'hash-1',
          outputHash: ctx.outputHash ?? '',
          action: ctx.action,
          actorId: ctx.actorId ?? 'user-1',
          jobId: ctx.job?.id ?? 'job-1',
          createdAt: new Date().toISOString(),
        },
      } as ValidateAndAuditResult;
    });

    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
      gapAnalysisService as GapAnalysisService,
    );

    await expect(
      service.exportCoverLetter(
        'user-1',
        {
          baselineId: 'baseline-1',
          baselineVersionId: 'baseline-version-1',
          jobId: 'job-1',
          analysisId: 'analysis-1',
        },
        'docx',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(complianceService.validateAndAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: ComplianceAction.COVER_LETTER_GENERATION }),
    );
    expect(complianceService.validateAndAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: ComplianceAction.COVER_LETTER_EXPORT }),
    );
  });
});
