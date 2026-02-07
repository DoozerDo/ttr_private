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
import { validateComplianceWithFallback } from '../compliance/compliance-error.utils';
import { ComplianceAction } from '../compliance/compliance.types';
import { Job } from '../jobs/job.entity';
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
        DEFAULT_RESUME_TEMPLATE_KEY,
      );
      const renderContext: DocxRenderContextBase = {
        templateKey: DEFAULT_RESUME_TEMPLATE_KEY,
        font: 'Calibri',
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      };
      buffer = (await template.render(model, renderContext)).buffer;
    }

    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const filename = `resume.${format}`;

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

    const job = generation.jobId
      ? await this.jobsRepository.findOne({
          where: { id: generation.jobId, userId },
        })
      : null;

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
      contentType,
      filename,
      auditId: audit.id,
      baselineVersionHash: audit.baselineVersionHash,
    };
  }
}
