import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceService } from '../compliance/compliance.service';
import type { ValidateAndAuditResult } from '../compliance/compliance.service';
import { validateComplianceWithFallback } from '../compliance/compliance-error.utils';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceTextSection,
  DocumentType,
  JobApplicationContext,
} from '../compliance/compliance.types';
import { Job } from '../jobs/job.entity';
import {
  COVER_LETTER_CLOSING_TEMPLATES,
  DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY,
  resolveClosingTemplate,
} from './closing-templates';
import { CoverLetter } from './cover-letter.entity';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';
import {
  AllowedBaselineBlock,
  CoverLetterGenerator,
} from './generators/cover-letter-generator.interface';
import { TemplateCoverLetterGenerator } from './generators/template-cover-letter.generator';

type CoverLetterDraft = {
  baseline: Baseline;
  baselineVersion: BaselineVersion;
  job: Job;
  allowedBlocks: AllowedBaselineBlock[];
  jobContext: {
    id: string;
    title: string | null;
    company: string | null;
    responsibilities: string[];
    requirements: string[];
  };
  jobContextAllowlist: JobApplicationContext;
  closingTemplateKey: string;
  generationInputsHash: string;
  complianceResult: {
    normalizedContent: string;
    complianceFlags: ComplianceFlag[];
    blocked: boolean;
    audit: ValidateAndAuditResult['audit'];
  };
};

type ComplianceEvaluationResult = {
  normalizedContent: string;
  complianceFlags: ComplianceFlag[];
  blocked: boolean;
  audit: ValidateAndAuditResult['audit'];
  writingFlags: ComplianceFlag[];
  scopeFlags: ComplianceFlag[];
};

@Injectable()
export class CoverLettersService {
  private readonly coverLetterRepository: Repository<CoverLetter>;
  private readonly baselineRepository: Repository<Baseline>;
  private readonly baselineVersionRepository: Repository<BaselineVersion>;
  private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>;
  private readonly jobRepository: Repository<Job>;
  private readonly generator: CoverLetterGenerator;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly complianceService: ComplianceService,
  ) {
    this.coverLetterRepository = this.dataSource.getRepository(CoverLetter);
    this.baselineRepository = this.dataSource.getRepository(Baseline);
    this.baselineVersionRepository =
      this.dataSource.getRepository(BaselineVersion);
    this.baselineBlockPolicyRepository =
      this.dataSource.getRepository(BaselineBlockPolicy);
    this.jobRepository = this.dataSource.getRepository(Job);
    this.generator = new TemplateCoverLetterGenerator();
  }

  async generateCoverLetter(userId: string, input: GenerateCoverLetterDto) {
    const draft = await this.buildCoverLetterDraft(userId, input);

    await this.ensureNoDuplicateCoverLetter(
      userId,
      draft.baseline.id,
      draft.job.id,
      draft.generationInputsHash,
    );

    const coverLetter = this.coverLetterRepository.create({
      userId,
      baselineId: draft.baseline.id,
      jobId: draft.job.id,
      generatorType: 'template',
      generatorVersion: 'v1',
      closingTemplateKey: draft.closingTemplateKey,
      content: draft.complianceResult.normalizedContent,
      generationInputsHash: draft.generationInputsHash,
    });

    const savedCoverLetter = await this.coverLetterRepository.save(coverLetter);

    return {
      ...savedCoverLetter,
      compliance_flags: draft.complianceResult.complianceFlags,
      audit_id: draft.complianceResult.audit.id,
      auditId: draft.complianceResult.audit.id,
      baseline_version_hash: draft.complianceResult.audit.baselineVersionHash,
    };
  }

  async exportCoverLetter(
    userId: string,
    input: GenerateCoverLetterDto,
    format: 'docx' | 'pdf',
  ) {
    const draft = await this.buildCoverLetterDraft(userId, input);
    const text = draft.complianceResult.normalizedContent;
    const buffer =
      format === 'pdf' ? this.buildPdfBuffer(text) : this.buildDocxBuffer(text);

    const baselineSections = draft.allowedBlocks.map((block) => ({
      title: block.title,
      content: block.content,
    }));
    const generatedSections: ComplianceTextSection[] = [
      { title: 'Cover Letter', content: text },
    ];

    const { complianceFlags, blocked, audit } =
      await this.complianceService.validateAndAudit({
        action: ComplianceAction.COVER_LETTER_EXPORT,
        actorId: userId,
        baselineVersion: draft.baselineVersion,
        job: draft.job,
        outputHash: createHash('sha256')
          .update(`${format}:${text}`)
          .digest('hex'),
        baselineSections,
        generatedSections,
        extraFlags: draft.complianceResult.complianceFlags,
        scopeInflationDetected: false,
        jobContext: draft.jobContextAllowlist,
        documentType: DocumentType.COVER_LETTER,
      });

    if (blocked) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Compliance validation failed.',
          details: {
            compliance_flags: complianceFlags,
            audit_id: audit.id,
            baseline_version_hash: audit.baselineVersionHash,
          },
        },
      });
    }

    return {
      buffer,
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: `cover-letter.${format}`,
      auditId: audit.id,
      baselineVersionHash: audit.baselineVersionHash,
    };
  }

  private async buildCoverLetterDraft(
    userId: string,
    input: GenerateCoverLetterDto,
  ): Promise<CoverLetterDraft> {
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    if (!input.baselineVersionId?.trim()) {
      throw new BadRequestException('baselineVersionId is required');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: input.baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const job = await this.jobRepository.findOne({
      where: { id: input.jobId, userId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { baselineId: baseline.id, id: input.baselineVersionId.trim() },
    });

    if (!baselineVersion) {
      throw new NotFoundException('Baseline version not found');
    }
    if (!baselineVersion.hash) {
      throw new BadRequestException('Baseline version hash missing');
    }

    const policies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: baselineVersion.id },
      relations: ['baselineSection'],
      order: { order: 'ASC' },
    });

    const sections = this.applyPoliciesToSections(
      baseline.sections ?? [],
      policies,
    );

    const closingTemplateKey = await this.resolveClosingTemplateKey(
      userId,
      input.closingTemplateKey,
    );
    const closingTemplate = resolveClosingTemplate(closingTemplateKey);

    const allowedSections = sections.filter(
      (section) =>
        (section.includePolicy ?? BaselineIncludePolicy.OPTIONAL) !==
        BaselineIncludePolicy.NEVER,
    );

    const allowedBlocks = this.mapToAllowedBlocks(allowedSections);
    const jobContext = {
      id: job.id,
      title: this.cleanText(job.title),
      company: this.cleanText(job.company),
      responsibilities: this.sanitizeList(job.normalizedResponsibilities),
      requirements: this.sanitizeList(job.normalizedRequirements),
    };

    const generationInputsHash = this.computeGenerationInputsHash(
      baseline.id,
      job.id,
      allowedBlocks,
      jobContext,
      closingTemplateKey,
    );

    const complianceBaselineSections = this.buildComplianceBaselineSections(
      allowedBlocks,
      jobContext,
    );

    let generation = this.generator.generate({
      baselineId: baseline.id,
      jobId: job.id,
      allowedBaselineBlocks: allowedBlocks,
      job: jobContext,
      closingTemplate,
      maxWords: input.maxWords,
      tone: input.tone,
    });

    const requestedJobContext = this.normalizeRequestedJobContext(
      input.jobContext,
    );

    const fallbackJobContext: JobApplicationContext = {
      allowedCompanies: jobContext.company ? [jobContext.company] : [],
      allowedRoleTitles: jobContext.title ? [jobContext.title] : [],
    };

    const jobContextAllowlist = requestedJobContext ?? fallbackJobContext;
    const documentTypeForCompliance = this.normalizeRequestedDocumentType(
      input.documentType ?? input.documentTypeKey,
    );

    let complianceResult = await this.evaluateCompliance(
      generation.content,
      allowedBlocks,
      complianceBaselineSections,
      job,
      baselineVersion,
      userId,
      jobContextAllowlist,
      documentTypeForCompliance,
    );

    if (complianceResult.blocked) {
      generation = this.generator.generate({
        baselineId: baseline.id,
        jobId: job.id,
        allowedBaselineBlocks: allowedBlocks,
        job: jobContext,
        closingTemplate,
        maxWords: input.maxWords,
        tone: input.tone,
        safeMode: true,
      });

      complianceResult = await this.evaluateCompliance(
        generation.content,
        allowedBlocks,
        complianceBaselineSections,
        job,
        baselineVersion,
        userId,
        jobContextAllowlist,
        documentTypeForCompliance,
        {
          writingFlags: complianceResult.writingFlags,
          scopeFlags: complianceResult.scopeFlags,
        },
      );
    }

    return {
      baseline,
      baselineVersion,
      job,
      allowedBlocks,
      jobContext,
      jobContextAllowlist,
      closingTemplateKey,
      generationInputsHash,
      complianceResult,
    };
  }

  async listCoverLetters(userId: string) {
    return this.coverLetterRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getCoverLetter(userId: string, id: string) {
    const coverLetter = await this.coverLetterRepository.findOne({
      where: { id, userId },
    });

    if (!coverLetter) {
      throw new NotFoundException('Cover letter not found');
    }

    return coverLetter;
  }

  async deleteCoverLetter(userId: string, id: string) {
    const coverLetter = await this.coverLetterRepository.findOne({
      where: { id, userId },
    });

    if (!coverLetter) {
      throw new NotFoundException('Cover letter not found');
    }

    await this.coverLetterRepository.remove(coverLetter);

    return { deleted: true, id };
  }

  private applyPoliciesToSections(
    sections: BaselineSection[],
    policies: BaselineBlockPolicy[],
  ) {
    if (!policies.length) {
      return [...sections].sort((a, b) => a.order - b.order);
    }

    const policyMap = new Map<string, BaselineBlockPolicy>(
      policies.map((policy) => [policy.baselineSectionId, policy]),
    );

    return [...sections]
      .map((section) => {
        const policy = policyMap.get(section.id);
        return {
          ...section,
          includePolicy: policy?.includePolicy ?? section.includePolicy,
          order: policy?.order ?? section.order,
          sectionType: section.sectionType ?? section.type,
        } as BaselineSection;
      })
      .sort((a, b) => a.order - b.order);
  }

  private mapToAllowedBlocks(
    sections: BaselineSection[],
  ): AllowedBaselineBlock[] {
    return sections.map((section, index) => ({
      id: section.id,
      title: this.cleanText(section.title ?? null) || null,
      content: this.cleanText(section.content),
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      order: section.order ?? index,
      sectionType:
        section.sectionType ?? section.type ?? BaselineSectionType.OTHER,
    }));
  }

  private cleanText(content?: string | null) {
    if (!content) {
      return '';
    }

    return content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private sanitizeList(values?: string[] | null) {
    return (values ?? [])
      .map((value) => this.cleanText(value))
      .filter((value) => value.length > 0);
  }

  private buildPdfBuffer(content: string) {
    const sanitized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const escaped = sanitized
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
    const textObject = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    const contentStream = `<< /Length ${textObject.length} >>\nstream\n${textObject}\nendstream`;
    const pdfParts = [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      `4 0 obj ${contentStream} endobj`,
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      'xref',
      '0 6',
      '0000000000 65535 f ',
      'trailer << /Size 6 /Root 1 0 R >>',
      'startxref',
      '0',
      '%%EOF',
    ];

    return Buffer.from(pdfParts.join('\n'));
  }

  private buildDocxBuffer(content: string) {
    const header = 'PK\u0003\u0004';
    const body = `Cover Letter\n\n${content}`;
    return Buffer.from(header + body, 'utf-8');
  }

  private normalizeRequestedJobContext(
    context?: JobApplicationContext | null,
  ): JobApplicationContext | undefined {
    if (!context) return undefined;

    const allowedCompanies = this.normalizeJobContextValues(
      context.allowedCompanies,
    );
    const allowedRoleTitles = this.normalizeJobContextValues(
      context.allowedRoleTitles,
    );

    if (!allowedCompanies.length && !allowedRoleTitles.length) {
      return undefined;
    }

    const normalized: JobApplicationContext = {};
    if (allowedCompanies.length) {
      normalized.allowedCompanies = allowedCompanies;
    }
    if (allowedRoleTitles.length) {
      normalized.allowedRoleTitles = allowedRoleTitles;
    }
    return normalized;
  }

  private normalizeJobContextValues(values?: string[] | null): string[] {
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const raw of values) {
      const cleaned = this.normalizeJobContextField(raw);
      if (!cleaned) continue;
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      normalized.push(cleaned);
    }

    return normalized;
  }

  private normalizeJobContextField(value?: string | null): string | undefined {
    if (!value) return undefined;
    const collapsed = value
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    return collapsed.length ? collapsed : undefined;
  }

  private normalizeRequestedDocumentType(
    value?: DocumentType | string | null,
  ): DocumentType {
    if (value === DocumentType.COVER_LETTER) {
      return DocumentType.COVER_LETTER;
    }

    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!normalized) {
      return DocumentType.COVER_LETTER;
    }

    const normalizedKey = normalized.replace(/[^a-z]/g, '_');
    if (normalizedKey === 'cover_letter' || normalizedKey === 'coverletter') {
      return DocumentType.COVER_LETTER;
    }

    return DocumentType.COVER_LETTER;
  }

  private computeGenerationInputsHash(
    baselineId: string,
    jobId: string,
    allowedBlocks: AllowedBaselineBlock[],
    job: {
      id: string;
      title: string | null;
      company: string | null;
      responsibilities: string[];
      requirements: string[];
    },
    closingTemplateKey: string,
  ) {
    const normalizedBaseline = allowedBlocks
      .map((block, index) => ({
        id: block.id,
        title: block.title ?? null,
        order: block.order ?? index,
        includePolicy: block.includePolicy,
        sectionType: block.sectionType,
        content: this.cleanText(block.content),
      }))
      .sort((a, b) => a.order - b.order);

    const normalizedJob = {
      id: job.id,
      title: this.cleanText(job.title),
      company: this.cleanText(job.company),
      responsibilities: this.sanitizeList(job.responsibilities),
      requirements: this.sanitizeList(job.requirements),
    };

    const normalizedString = [
      `baselineId:${baselineId}`,
      `jobId:${jobId}`,
      `baseline:${JSON.stringify(normalizedBaseline)}`,
      `job:${JSON.stringify(normalizedJob)}`,
      `closing:${closingTemplateKey}`,
    ].join('|');

    return createHash('sha256').update(normalizedString).digest('hex');
  }

  private async resolveClosingTemplateKey(
    userId: string,
    requested?: string | null,
  ) {
    const validRequested = this.normalizeClosingTemplateKey(requested);
    if (validRequested) {
      return validRequested;
    }

    const lastCoverLetter = await this.coverLetterRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const lastKey = this.normalizeClosingTemplateKey(
      lastCoverLetter?.closingTemplateKey,
    );

    return lastKey ?? DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY;
  }

  private normalizeClosingTemplateKey(key?: string | null) {
    if (!key) return null;
    return COVER_LETTER_CLOSING_TEMPLATES.some(
      (template) => template.key === key,
    )
      ? key
      : null;
  }

  private buildComplianceBaselineSections(
    allowedBlocks: AllowedBaselineBlock[],
    job: {
      title: string | null;
      company: string | null;
    },
  ) {
    const baselineSections = allowedBlocks.map((block) => ({
      title: this.cleanText(block.title),
      content: this.cleanText(block.content),
    }));

    const jobContext = [job.title, job.company]
      .map((value) => this.cleanText(value))
      .filter(Boolean)
      .join(' ');

    if (jobContext.length > 0) {
      baselineSections.push({ title: 'Job Context', content: jobContext });
    }

    return baselineSections;
  }

  private async ensureNoDuplicateCoverLetter(
    userId: string,
    baselineId: string,
    jobId: string,
    generationInputsHash?: string,
  ) {
    const existing = await this.coverLetterRepository.findOne({
      where: {
        userId,
        baselineId,
        jobId,
      },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      if (
        generationInputsHash &&
        existing.generationInputsHash === generationInputsHash
      ) {
        return;
      }
      throw new ConflictException({
        error: {
          code: 'COVER_LETTER_DUPLICATE',
          message:
            'A cover letter for this baseline and job already exists. Select the existing one instead of generating another.',
          existingCoverLetterId: existing.id,
        },
      });
    }
  }

  private async evaluateCompliance(
    content: string,
    allowedBlocks: AllowedBaselineBlock[],
    complianceBaselineSections: { title: string; content: string }[],
    job: Job,
    baselineVersion: BaselineVersion,
    userId: string,
    jobContextAllowlist: JobApplicationContext,
    documentType: DocumentType,
    reuseFlags?: {
      writingFlags?: ComplianceFlag[];
      scopeFlags?: ComplianceFlag[];
    },
  ): Promise<ComplianceEvaluationResult> {
    const normalizedContent = this.complianceService.normalizeText(content);
    const writingFlags =
      reuseFlags?.writingFlags ??
      this.complianceService.enforceResumeWritingRules({
        baselineSections: complianceBaselineSections,
        generatedSections: [{ title: 'Cover Letter', content }],
      });
    const scopeFlags =
      reuseFlags?.scopeFlags ??
      this.complianceService.detectScopeInflation({
        baselineSections: allowedBlocks.map((block) => ({
          title: block.title,
          content: block.content,
          sectionType: block.sectionType,
        })),
        generatedSections: [{ title: 'Cover Letter', content }],
        jobContext: jobContextAllowlist,
        documentType,
      });

    const { complianceFlags, blocked, audit } =
      await validateComplianceWithFallback(this.complianceService, {
        action: ComplianceAction.COVER_LETTER_GENERATION,
        actorId: userId,
        baselineVersion,
        job,
        outputHash: createHash('sha256')
          .update(normalizedContent)
          .digest('hex'),
        baselineSections: complianceBaselineSections,
        generatedSections: [
          { title: 'Cover Letter', content: normalizedContent },
        ],
        extraFlags: [...writingFlags, ...scopeFlags],
        scopeInflationDetected: false,
        jobContext: jobContextAllowlist,
        documentType,
      });

    return {
      normalizedContent,
      complianceFlags,
      blocked,
      audit,
      writingFlags,
      scopeFlags,
    };
  }
}
