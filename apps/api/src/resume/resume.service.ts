import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { ComplianceService } from '../compliance/compliance.service';
import {
  getInsufficientExtractedTextDetails,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
} from '../compliance/extracted-text.utils';
import { validateComplianceWithFallback } from '../compliance/compliance-error.utils';
import { ComplianceAction } from '../compliance/compliance.types';
import { Job } from '../jobs/job.entity';
import { ApplicationsService } from '../applications/applications.service';
import type { CxFitScoreSnapshot } from '../applications/applications.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { AUTO_GENERATE_THRESHOLD } from '../config/autoGenerateThreshold';
import '../docx-templates/templates';
import {
  mapResumeSectionsToDocxModel,
  ResumeExportSection,
} from '../docx-templates/mappers/resume-sections-to-model';
import {
  DocxRenderContextBase,
  ResumeDocxModel,
} from '../docx-templates/docx-template.types';
import {
  DEFAULT_RESUME_TEMPLATE_KEY,
  getDocxTemplate,
} from '../docx-templates/docx-template.registry';
import { resolveBaselineIdentity } from '../baseline/baseline-identity.utils';

export type GenerateResumeRequest = {
  baselineId: string;
  baselineVersionId?: string;
  jobId?: string | null;
  oneTap?: boolean;
};

export type GenerateResumeOptions = {
  enforceOneTap?: boolean;
};

@Injectable()
export class ResumeService {
  constructor(
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    private readonly complianceService: ComplianceService,
    private readonly applicationsService: ApplicationsService,
    private readonly opportunitiesService: OpportunitiesService,
  ) {}

  private async findLatestAssessment(userId: string, jobId: string) {
    return this.fitAssessmentRepository.findOne({
      where: { userId, jobId },
      order: { createdAt: 'DESC' },
    });
  }

  private ensureOneTapAllowed(assessment?: FitAssessment | null) {
    if (!assessment || assessment.overallScore < AUTO_GENERATE_THRESHOLD) {
      throw new UnprocessableEntityException({
        error: {
          code: 'fit_score_too_low',
          message: `One tap resume generation requires fit score >= ${AUTO_GENERATE_THRESHOLD}.`,
          details: { last_score: assessment?.overallScore ?? null },
        },
      });
    }
  }

  private buildResumeText(
    sections: Array<{ title: string | null; content: string }>,
  ) {
    return sections
      .map((section) => {
        const title = section.title ? `${section.title}\n` : '';
        return `${title}${section.content}`.trim();
      })
      .join('\n\n');
  }

  private buildPdfBuffer(content: string) {
    const normalizePdfText = (value: string) => {
      const normalizedChars = value
        // Normalize common Unicode punctuation to WinAnsi-safe text.
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00a0/g, ' ')
        // Keep visible bullet glyph in plain text while normalizing variants.
        .replace(/[\u25CF\u25E6\u2043\u2219]/g, '•')
        // Repair common mojibake sequences when UTF-8 punctuation was decoded as Latin-1.
        .replace(/â€¢/g, '•')
        .replace(/â€“|â€”/g, '-')
        .replace(/â€˜|â€™/g, "'")
        .replace(/â€œ|â€/g, '"')
        .replace(/â€¦/g, '...');

      return normalizedChars
        .split('\n')
        .map((line) => {
          // Some inputs still encode bullets as leading "&"; normalize only at line start.
          if (/^\s*&&+¢\s+/.test(line)) {
            return line.replace(/^\s*&&+¢\s+/, '- ');
          }
          if (/^\s*&\s+/.test(line)) {
            return line.replace(/^\s*&\s+/, '- ');
          }
          if (/^\s*•\s+/.test(line)) {
            return line.replace(/^\s*•\s+/, '- ');
          }
          return line;
        })
        .join('\n');
    };

    const sanitizeForPdf = (value: string) =>
      value
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');

    const wrapLine = (line: string, maxChars: number) => {
      if (!line.trim()) return [''];
      const words = line.trim().split(/\s+/);
      const wrapped: string[] = [];
      let current = '';

      for (const word of words) {
        if (!current.length) {
          current = word;
          continue;
        }
        if (`${current} ${word}`.length <= maxChars) {
          current = `${current} ${word}`;
          continue;
        }
        wrapped.push(current);
        current = word;
      }

      if (current.length) wrapped.push(current);
      return wrapped;
    };

    const normalized = normalizePdfText(
      content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    );
    const wrappedLines = normalized
      .split('\n')
      .flatMap((line) => wrapLine(line, 95));
    const lines = wrappedLines.length ? wrappedLines : [''];

    const lineHeight = 14;
    const maxLinesPerPage = 48;
    const pageChunks: string[][] = [];
    for (let i = 0; i < lines.length; i += maxLinesPerPage) {
      pageChunks.push(lines.slice(i, i + maxLinesPerPage));
    }

    const objectBodies: string[] = [];
    const pageObjectNumbers: number[] = [];
    objectBodies.push('<< /Type /Catalog /Pages 2 0 R >>'); // 1
    objectBodies.push(''); // 2 (filled after page refs are known)

    for (const pageLines of pageChunks) {
      const pageObjectNumber = objectBodies.length + 1;
      const contentObjectNumber = pageObjectNumber + 1;
      const textCommands = [
        'BT',
        '/F1 11 Tf',
        `${lineHeight} TL`,
        '72 750 Td',
        ...pageLines.flatMap((line, index) => {
          const escaped = sanitizeForPdf(line);
          if (index === 0) return [`(${escaped}) Tj`];
          return ['T*', `(${escaped}) Tj`];
        }),
        'ET',
      ].join('\n');

      const contentStream =
        `<< /Length ${Buffer.byteLength(textCommands, 'latin1')} >>\n` +
        `stream\n${textCommands}\nendstream`;

      pageObjectNumbers.push(pageObjectNumber);
      objectBodies.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjectNumber} 0 R /Resources << /Font << /F1 ${pageChunks.length * 2 + 3} 0 R >> >> >>`,
      );
      objectBodies.push(contentStream);
    }

    const kids = pageObjectNumbers.map((number) => `${number} 0 R`).join(' ');
    objectBodies[1] = `<< /Type /Pages /Kids [${kids}] /Count ${pageObjectNumbers.length} >>`;

    objectBodies.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];

    objectBodies.forEach((body, index) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objectBodies.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objectBodies.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf +=
      `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'latin1');
  }

  private buildExportFilename(format: 'docx' | 'pdf', company?: string | null) {
    const safeCompany = (company ?? 'resume')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'resume';
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    return `${safeCompany}-${mm}-${dd}-${yyyy}.${format}`;
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

  async generateResume(
    userId: string,
    request: GenerateResumeRequest,
    options?: GenerateResumeOptions,
  ) {
    const baselineId = request.baselineId?.trim();
    const baselineVersionId = request.baselineVersionId?.trim();
    const jobId = request.jobId?.trim();

    if (!baselineId) {
      throw new BadRequestException('baselineId is required');
    }
    if (!baselineVersionId) {
      throw new BadRequestException('baselineVersionId is required');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId, baselineId: baseline.id },
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

    const sectionsWithPolicies = this.applyPoliciesToSections(
      baseline.sections ?? [],
      policies,
    );

    const allowedSections = sectionsWithPolicies.filter(
      (section) =>
        (section.includePolicy ?? BaselineIncludePolicy.OPTIONAL) !==
        BaselineIncludePolicy.NEVER,
    );

    const baselineText = allowedSections
      .map((section) => section.content ?? '')
      .join('\n');
    const insufficientBaselineDetails =
      getInsufficientExtractedTextDetails(baselineText);
    if (insufficientBaselineDetails) {
      const payload = {
        errorCode: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
        code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
        message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
        details: insufficientBaselineDetails,
        error: {
          code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
          message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
          details: insufficientBaselineDetails,
        },
      };
      throw new UnprocessableEntityException(payload);
    }

    const sections = allowedSections.map((section) => ({
      id: section.id,
      type: section.sectionType,
      title: section.title,
      content: section.content,
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      order: section.order,
      source: 'baseline',
    }));

    const normalizedBaselineSections =
      this.complianceService.normalizeSectionsForOutput(
        baseline.sections ?? [],
      );

    const job = jobId
      ? await this.jobsRepository.findOne({
          where: { id: jobId, userId },
        })
      : null;

    if (jobId && !job) {
      throw new NotFoundException('Job not found');
    }

    const latestAssessment = jobId
      ? await this.findLatestAssessment(userId, jobId)
      : null;
    const cxFitScoreSnapshot = this.buildCxFitScoreSnapshot(latestAssessment);

    const shouldEnforceOneTap = options?.enforceOneTap ?? true;

    if (request.oneTap && jobId && shouldEnforceOneTap) {
      this.ensureOneTapAllowed(latestAssessment);
    }

    const outputHash = createHash('sha256')
      .update(
        JSON.stringify(
          this.complianceService.normalizeSectionsForOutput(sections),
        ),
      )
      .digest('hex');

    const writingFlags = this.complianceService.enforceResumeWritingRules({
      baselineSections: baseline.sections ?? [],
      generatedSections: sections,
    });

    const scopeFlags = this.complianceService.detectScopeInflation({
      baselineSections: sections,
      generatedSections: sections,
    });

    const normalizedSections =
      this.complianceService.normalizeSectionsForOutput(sections);

      const { complianceFlags, blocked, audit } =
        await validateComplianceWithFallback(this.complianceService, {
          action: ComplianceAction.RESUME_GENERATION,
          actorId: userId,
          baselineVersion,
          job,
          outputHash,
          scopeInflationDetected: false,
          extraFlags: [...writingFlags, ...scopeFlags],
          baselineSections: normalizedBaselineSections,
          generatedSections: normalizedSections,
        });

    const complianceBlocked = blocked;

    const trackerEntry = await this.applicationsService.upsertPreparedFromResumeGeneration({
      userId,
      jobId: job?.id ?? null,
      companyName: job?.company ?? null,
      roleTitle: job?.title ?? null,
      jobUrl: job?.canonicalUrl ?? job?.sourceUrl ?? null,
      jobText: job?.rawDescription ?? null,
      baselineVersionId: baselineVersion.id,
      cxFitScoreSnapshot,
      resumeArtifactId: audit.id,
      resumeArtifactType: 'resume',
    });
    const opportunity = await this.opportunitiesService.createFromResumeStudio(
      userId,
      {
        companyName: job?.company ?? 'Unknown company',
        jobTitle: job?.title ?? 'Untitled role',
        fitScore: latestAssessment?.overallScore ?? 0,
        baselineVersionUsed: baselineVersion.id,
      },
    );

    const quality =
        latestAssessment &&
        latestAssessment.overallScore >= AUTO_GENERATE_THRESHOLD
          ? 'optimized'
          : 'draft';

    return {
      ok: true,
      baselineId: baseline.id,
      baselineVersionId: baselineVersion.id,
      jobId: jobId ?? null,
      sections: normalizedSections,
      compliance_flags: complianceFlags,
      compliance_blocked: complianceBlocked,
      audit_id: audit.id,
      auditId: audit.id,
      baseline_version_hash: audit.baselineVersionHash,
      quality,
      trackerEntryId: trackerEntry.id,
      trackerStatus: trackerEntry.status,
      opportunityId: opportunity?.id ?? null,
    };
  }

  private buildCxFitScoreSnapshot(
    assessment?: FitAssessment | null,
  ): CxFitScoreSnapshot | undefined {
    if (!assessment) {
      return undefined;
    }

    const createdAt = assessment.createdAt ? assessment.createdAt : new Date(0);

    return {
      overallScore: assessment.overallScore,
      verdict: assessment.verdict,
      dimensionScores: assessment.dimensionScores,
      weights: assessment.scoringV2?.rubric?.weights,
      scoringContractVersion: assessment.scoringV2?.rubric?.id,
      createdAt: createdAt.toISOString(),
    };
  }

  async exportResume(
    userId: string,
    request: GenerateResumeRequest,
    format: 'docx' | 'pdf',
  ) {
    const generation = await this.generateResume(userId, request, {
      enforceOneTap: false,
    });
    const sectionFragments = generation.sections.map((section) => ({
      title: section.title,
      content: section.content,
    }));

    let buffer: Buffer;
    let pdfText: string | undefined;
    if (format === 'pdf') {
      pdfText = this.buildResumeText(sectionFragments);
      buffer = this.buildPdfBuffer(pdfText);
    } else {
      const baselineForHeader = await this.baselineRepository.findOne({
        where: { id: generation.baselineId, userId },
        relations: ['parsedRecords'],
        order: { parsedRecords: { createdAt: 'DESC' } },
      });
      if (!baselineForHeader) {
        throw new NotFoundException('Baseline not found');
      }
      const identity = resolveBaselineIdentity(baselineForHeader);
      const model = mapResumeSectionsToDocxModel(
        generation.sections as ResumeExportSection[],
        identity,
      );
      const template = getDocxTemplate<ResumeDocxModel>(
        'resume',
        'resume_v1',
      );
      const renderContext: DocxRenderContextBase = {
        templateKey: DEFAULT_RESUME_TEMPLATE_KEY,
        font: 'Calibri',
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      };
      buffer = (await template.render(model, renderContext)).buffer;
    }

    const job = generation.jobId
      ? await this.jobsRepository.findOne({
          where: { id: generation.jobId, userId },
        })
      : null;

    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const filename = this.buildExportFilename(format, job?.company);

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: {
        id: generation.baselineVersionId,
        baselineId: generation.baselineId,
      },
    });

    if (!baselineVersion) {
      throw new NotFoundException('Baseline version not found');
    }
    if (!baselineVersion.hash) {
      throw new BadRequestException('Baseline version hash missing');
    }

    const { complianceFlags, blocked, audit } =
      await this.complianceService.validateAndAudit({
        action: ComplianceAction.RESUME_EXPORT,
        actorId: userId,
        baselineVersion,
        job,
        outputHash: createHash('sha256')
          .update(
            `${format}:${
              format === 'pdf'
                ? pdfText ?? ''
                : JSON.stringify(sectionFragments)
            }`,
          )
          .digest('hex'),
        baselineSections: generation.sections,
        generatedSections: generation.sections,
      });

    const blockingFlags = complianceFlags.filter(
      (flag) => flag.severity === 'block',
    );

    if (blocked && blockingFlags.length > 0) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Compliance validation failed.',
          details: {
            compliance_flags: blockingFlags,
            audit_id: audit.id,
            baseline_version_hash: audit.baselineVersionHash,
          },
        },
      });
    }

    return {
      buffer,
      contentType,
      filename,
      auditId: audit.id,
      baselineVersionHash: audit.baselineVersionHash,
    };
  }
}
