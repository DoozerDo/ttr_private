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
import { ComplianceAction } from '../compliance/compliance.types';
import { Job } from '../jobs/job.entity';
import { AUTO_GENERATE_THRESHOLD } from '../config/autoGenerateThreshold';

export type GenerateResumeRequest = {
  baselineId: string;
  baselineVersionId?: string;
  jobId?: string | null;
  oneTap?: boolean;
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

  private buildDocxBuffer(content: string) {
    const header = 'PK\u0003\u0004';
    const body = `Resume\n\n${content}`;
    return Buffer.from(header + body, 'utf-8');
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

  async generateResume(userId: string, request: GenerateResumeRequest) {
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

    const sections = sectionsWithPolicies.map((section) => ({
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

    if (request.oneTap && jobId) {
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
      await this.complianceService.validateAndAudit({
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
    const generation = await this.generateResume(userId, request);
    const text = this.buildResumeText(
      generation.sections.map((section) => ({
        title: section.title,
        content: section.content,
      })),
    );

    const buffer =
      format === 'pdf' ? this.buildPdfBuffer(text) : this.buildDocxBuffer(text);

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
          .update(`${format}:${text}`)
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
