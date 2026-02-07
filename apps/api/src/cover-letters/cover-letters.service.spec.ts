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
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from '../compliance/compliance.types';
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
    sections: [
      {
        id: 'section-1',
        title: 'Experience',
        content: 'Delivered 15% efficiency improvement with verified metrics.',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        sectionType: BaselineSectionType.EXPERIENCE,
      },
    ],
  });
  const baselineVersionRepository = buildRepository<any>({
    id: 'baseline-version-1',
    baselineId: 'baseline-1',
    hash: 'baseline-hash',
  });
  const baselineBlockPolicyRepository = buildRepository<any>();
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
    detectScopeInflation: jest.fn().mockReturnValue([]),
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
        case 'Job':
          return jobRepository;
        default:
          throw new Error(`Unexpected repository request: ${entity?.name}`);
      }
    }),
  } as unknown as DataSource;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists a chosen closing template and reuses it for the next generation', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
    );

    await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
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
    });

    expect(second.closingTemplateKey).toBe('collaborative');
    expect(second.audit_id).toBe('audit-1');
  });

  it('returns compliance flags when invented metrics are flagged', async () => {
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
    );

    const result = await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
    });

    expect(result.compliance_flags).toHaveLength(1);
    expect(result.compliance_flags?.[0].code).toBe(
      ComplianceFlagCode.INVENTED_METRIC,
    );
    expect(result.content).toContain('Dear Hiring Team,');

    expect(complianceService.validateAndAudit).toHaveBeenCalled();
  });

  it('returns compliance flags when scope inflation is detected', async () => {
    complianceService.detectScopeInflation.mockReturnValueOnce([
      {
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Scope exceeds baseline.',
      },
    ]);

    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
    );

    const result = await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
    });

    expect(result.compliance_flags).toHaveLength(1);
    expect(result.compliance_flags?.[0].code).toBe(
      ComplianceFlagCode.SCOPE_INFLATION,
    );
    expect(result.content).toContain('Dear Hiring Team,');

    expect(complianceService.validateAndAudit).toHaveBeenCalled();
  });

  it('rejects generation without a baseline version id', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
    );

    await expect(
      service.generateCoverLetter('user-1', {
        baselineId: 'baseline-1',
        jobId: 'job-1',
        baselineVersionId: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exports cover letter content with compliance audit headers', async () => {
    const service = new CoverLettersService(
      dataSource,
      complianceService as any,
    );

    const result = await service.exportCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
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
    );

    const result = await service.exportCoverLetter(
      'user-1',
      {
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
      },
      'docx',
    );

    const paragraphs = await extractDocxParagraphTexts(result.buffer);
    const greetingIndex = paragraphs.findIndex(
      (paragraph) => paragraph === 'Dear Hiring Team,',
    );
    expect(greetingIndex).toBeGreaterThanOrEqual(0);
    const closingIndex = paragraphs.length - 1;
    const bodyParagraphs = paragraphs.slice(greetingIndex + 1, closingIndex);
    expect(bodyParagraphs.length).toBeGreaterThanOrEqual(2);
  });

  it('exports PDF cover letter content with valid header', async () => {
    const service = new CoverLettersService(dataSource, complianceService as any);

    const result = await service.exportCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
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
    );

    try {
      await service.exportCoverLetter('user-1', {
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
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
});
