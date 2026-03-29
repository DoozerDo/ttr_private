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
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
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
import { shapeComplianceForUi } from '../compliance/compliance-ui-shaping';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceTextSection,
  DocumentType,
  GeneratedTextSourceType,
  JobApplicationContext,
} from '../compliance/compliance.types';
import {
  getInsufficientExtractedTextDetails,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
} from '../compliance/extracted-text.utils';
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
  CoverLetterGenerationResult,
  CoverLetterGenerator,
} from './generators/cover-letter-generator.interface';
import { TemplateCoverLetterGenerator } from './generators/template-cover-letter.generator';
import {
  COVER_LETTER_BULLET_PATTERN,
  COVER_LETTER_FORBIDDEN_PHRASES,
  COVER_LETTER_GENERIC_FILLER_PHRASES,
  COVER_LETTER_MAX_BODY_PARAGRAPHS,
  COVER_LETTER_MAX_PARAGRAPH_WORDS,
  COVER_LETTER_PHRASE_REWRITES,
  COVER_LETTER_REQUIRED_SALUTATION,
  COVER_LETTER_RESUME_ARTIFACT_PATTERNS,
  COVER_LETTER_SIGNOFF,
  COVER_LETTER_WORD_LIMITS,
} from './generators/cover-letter-writing-contract';
import { CoverLetterComplianceConstraints } from './types/cover-letter-compliance-constraints';
import '../docx-templates/templates';
import {
  DEFAULT_COVER_LETTER_TEMPLATE_KEY,
  getDocxTemplate,
} from '../docx-templates/docx-template.registry';
import { mapCoverLetterResultToModel } from '../docx-templates/mappers/cover-letter-result-to-model';
import {
  CoverLetterDocxModel,
  DocxRenderContextBase,
} from '../docx-templates/docx-template.types';
import { resolveBaselineIdentity } from '../baseline/baseline-identity.utils';
import { resolveBaselineSectionsForGeneration } from '../baseline/baseline-section-source';
import {
  extractEvidenceUnitsFromLogicalUnits,
  reconstructLogicalTextUnits,
  type ResumeEvidenceUnit,
} from '../resume/resume-draft-bullets';
import type {
  DocumentGenerationExports,
  UserSafeDisplayPayload,
} from '../documents/normalized-document.models';
import { validateAnalysisContext } from '../common/analysis-context-binding';
import { filterComplianceFlagsByCanonicalClaims } from '../common/readiness-claim-truth';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';
import { applySyntheticMetadata } from '../synthetic/synthetic-metadata.util';
import type { ArtifactTraceAudit } from '../generation/artifact-trace-audit';
import { buildArtifactFailurePayload } from '../generation/artifact-failure';

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
  generation: CoverLetterGenerationResult;
  complianceResult: {
    normalizedContent: string;
    complianceFlags: ComplianceFlag[];
    blocked: boolean;
    audit: ValidateAndAuditResult['audit'];
  };
  analysisAssessment: FitAssessment;
};

type ComplianceEvaluationResult = {
  normalizedContent: string;
  complianceFlags: ComplianceFlag[];
  blocked: boolean;
  audit: ValidateAndAuditResult['audit'];
  writingFlags: ComplianceFlag[];
  scopeFlags: ComplianceFlag[];
};

type CoverLetterQualityResult = {
  generation: CoverLetterGenerationResult;
  flags: string[];
};

export type CoverLetterGenerationResponse = {
} & CoverLetter & {
  status: 'success';
  generationStatus: 'success';
  exportReady: boolean;
  baselineId: string;
  baselineVersionId: string;
  jobId: string;
  content: string;
  generatorType: string;
  generatorVersion: string;
  closingTemplateKey: string;
  generationInputsHash: string | null;
  preview: {
    coverLetter: CoverLetterGenerationResult['document'];
  };
  compliance_flags: ComplianceFlag[];
  audit_id: string;
  auditId: string;
  baseline_version_hash: string | null;
  exports: DocumentGenerationExports;
  display: UserSafeDisplayPayload;
  safeDisplay: UserSafeDisplayPayload;
  traceMap: ArtifactTraceAudit['traceMap'];
  debugTrace: ArtifactTraceAudit['debugTrace'];
  internal: {
    auditId: string;
    baselineVersionHash: string | null;
    complianceFlags: ComplianceFlag[];
  };
};

@Injectable()
export class CoverLettersService {
  private readonly coverLetterRepository: Repository<CoverLetter>;
  private readonly baselineRepository: Repository<Baseline>;
  private readonly baselineVersionRepository: Repository<BaselineVersion>;
  private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>;
  private readonly jobRepository: Repository<Job>;
  private readonly generator: CoverLetterGenerator;
  private readonly fitAssessmentRepository: Repository<FitAssessment>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly complianceService: ComplianceService,
    private readonly gapAnalysisService: GapAnalysisService,
  ) {
    this.coverLetterRepository = this.dataSource.getRepository(CoverLetter);
    this.baselineRepository = this.dataSource.getRepository(Baseline);
    this.baselineVersionRepository =
      this.dataSource.getRepository(BaselineVersion);
    this.baselineBlockPolicyRepository =
      this.dataSource.getRepository(BaselineBlockPolicy);
    this.jobRepository = this.dataSource.getRepository(Job);
    this.fitAssessmentRepository = this.dataSource.getRepository(FitAssessment);
    this.generator = new TemplateCoverLetterGenerator();
  }

  private throwGenerationBlockedError(blockers: Array<{ code: string; message: string }>): never {
    throw new UnprocessableEntityException(buildArtifactFailurePayload({
      code: 'generation_blocked',
      category: 'generation_blocked',
      message:
        'Generation is not available for this role due to insufficient verified evidence.',
      detail: 'Readiness or compliance gates blocked generation.',
      retryable: false,
      userAction: {
        title: 'Review baseline readiness',
        description: 'Complete the missing verified requirements before generating again.',
      },
      diagnostics: {
        failureReasons: blockers.slice(0, 3).map((blocker) => `${blocker.code}: ${blocker.message}`),
        missingRequirements: blockers.slice(0, 3).map((blocker) => blocker.message),
      },
    }));
  }

  async generateCoverLetter(
    userId: string,
    input: GenerateCoverLetterDto,
    syntheticMetadata?: SyntheticMetadataInput,
  ): Promise<CoverLetterGenerationResponse> {
    let draft: CoverLetterDraft;
    try {
      draft = await this.buildCoverLetterDraft(userId, input);
    } catch (error) {
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message) as { category?: string; message?: string; detail?: string };
          if (parsed?.category === 'unsupported_input') {
            throw new UnprocessableEntityException(parsed);
          }
        } catch {
          // fall through to original error
        }
      }
      throw error;
    }
    const readiness = this.buildReadinessFromFlags(
      filterComplianceFlagsByCanonicalClaims(
        draft.complianceResult.complianceFlags ?? [],
        draft.analysisAssessment,
      ),
    );
    if (readiness.status !== 'ready') {
      this.throwGenerationBlockedError(
        readiness.reasons.map((reason) => ({
          code: reason.code,
          message: reason.message,
        })),
      );
    }

    if (draft.complianceResult.blocked) {
      this.throwGenerationBlockedError(
        draft.complianceResult.complianceFlags.slice(0, 3).map((flag) => ({
          code: flag.code ?? 'generation_blocked',
          message:
            flag.message ||
            'Some claims required for tailored generation could not be verified against your baseline.',
        })),
      );
    }

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
    if (syntheticMetadata?.isSynthetic) {
      applySyntheticMetadata(coverLetter, syntheticMetadata);
    }

    const savedCoverLetter = await this.coverLetterRepository.save(coverLetter);

    const display = this.buildSuccessDisplayPayload();
    const exports: DocumentGenerationExports = { docx: true, pdf: true };
    return {
      status: 'success',
      generationStatus: 'success',
      exportReady: true,
      ...savedCoverLetter,
      baselineVersionId: draft.baselineVersion.id,
      exports,
      preview: {
        coverLetter: draft.generation.document,
      },
      compliance_flags: draft.complianceResult.complianceFlags,
      audit_id: draft.complianceResult.audit.id,
      auditId: draft.complianceResult.audit.id,
      baseline_version_hash: draft.complianceResult.audit.baselineVersionHash,
      traceMap: draft.generation.traceMap,
      debugTrace: draft.generation.debugTrace ?? {
        passed: true,
        failures: [],
        traceCoverage: 100,
        unusedEvidence: [],
        selectedEvidence: [],
      },
      display,
      safeDisplay: display,
      internal: {
        auditId: draft.complianceResult.audit.id,
        baselineVersionHash: draft.complianceResult.audit.baselineVersionHash,
        complianceFlags: draft.complianceResult.complianceFlags,
      },
    };
  }

  async exportCoverLetter(
    userId: string,
    input: GenerateCoverLetterDto,
    format: 'docx' | 'pdf',
  ) {
    const draft = await this.buildCoverLetterDraft(userId, input);

    if (draft.complianceResult.blocked) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Compliance validation failed.',
          details: {
            blocked: true,
            compliance_flags: draft.complianceResult.complianceFlags,
            audit_id: draft.complianceResult.audit.id,
            baseline_version_hash: draft.complianceResult.audit.baselineVersionHash,
          },
        },
      });
    }

    const text = this.buildNormalizedCoverLetterText(draft.generation);
    let buffer: Buffer;
    if (format === 'pdf') {
      buffer = this.buildPdfBuffer(text);
    } else {
      const identity = resolveBaselineIdentity(draft.baseline);
      const model = mapCoverLetterResultToModel(
        draft.generation,
        identity,
        draft.jobContext,
      );
      const template = getDocxTemplate<CoverLetterDocxModel>(
        'cover_letter',
        DEFAULT_COVER_LETTER_TEMPLATE_KEY,
      );
      const renderContext: DocxRenderContextBase = {
        templateKey: DEFAULT_COVER_LETTER_TEMPLATE_KEY,
        font: 'Calibri',
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      };
      buffer = (await template.render(model, renderContext)).buffer;
    }

    const baselineSections = draft.allowedBlocks.map((block) => ({
      title: block.title,
      content: block.content,
    }));
    const generatedSections: ComplianceTextSection[] =
      this.buildCoverLetterGeneratedSectionsForCompliance(draft.generation);

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

  async getGenerationReadiness(userId: string, input: GenerateCoverLetterDto) {
    const draft = await this.buildCoverLetterDraft(userId, input);
    const flags = filterComplianceFlagsByCanonicalClaims(
      draft.complianceResult.complianceFlags ?? [],
      draft.analysisAssessment,
    );
    return this.buildReadinessFromFlags(flags);
  }

  private buildReadinessFromFlags(flags: ComplianceFlag[]) {
    const blocked = flags.some((flag) => flag.severity === 'block');
    const warningFlags = flags.filter((flag) => flag.severity === 'warn');
    return {
      status: blocked ? 'blocked' : warningFlags.length > 0 ? 'limited' : 'ready',
      blocked,
      compliance_flags: flags,
      reasons:
        blocked
          ? [
              {
                code: 'full_block',
                message:
                  'Some claims required for tailored generation could not be verified against your baseline.',
              },
            ]
          : warningFlags.length > 0
            ? [
                {
                  code: 'personalization_limitation',
                  message:
                    'This role scored highly, but document generation is currently limited by verification constraints.',
                },
              ]
            : [],
    } as const;
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
    if (!input.analysisId?.trim()) {
      throw new BadRequestException({
        error: {
          code: 'analysis_context_mismatch',
          message: 'Generation request does not match the analyzed context.',
          details: {
            expected: {
              jobId: input.jobId,
              baselineId: input.baselineId,
              baselineVersionId: input.baselineVersionId,
            },
            received: {
              jobId: input.jobId,
              baselineId: input.baselineId,
              baselineVersionId: input.baselineVersionId,
            },
          },
        },
      });
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: input.baselineId, userId },
      relations: ['sections', 'parsedRecords'],
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

    const analysisAssessment = await validateAnalysisContext({
      analysisRepository: this.fitAssessmentRepository,
      baselineVersionRepository: this.baselineVersionRepository,
      analysisId: input.analysisId.trim(),
      userId,
      jobId: job.id,
      baselineId: baseline.id,
      baselineVersionId: baselineVersion.id,
    });

    const policies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: baselineVersion.id },
      relations: ['baselineSection'],
      order: { order: 'ASC' },
    });

    const sourceSections = resolveBaselineSectionsForGeneration(baseline);
    const sections = this.applyPoliciesToSections(
      sourceSections,
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

    const baselineText = allowedSections
      .map((section) => section.content ?? '')
      .join('\n');
    const insufficientBaselineDetails =
      getInsufficientExtractedTextDetails(baselineText);
    if (insufficientBaselineDetails) {
      throw new UnprocessableEntityException(buildArtifactFailurePayload({
        code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
        category: 'unsupported_input',
        message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
        detail: 'The current cover letter input cannot be grounded into a supported artifact.',
        retryable: false,
        userAction: {
          title: 'Add stronger baseline evidence',
          description: 'Include clearer accomplishment bullets and fuller role details before generating again.',
        },
        diagnostics: {
          unsupportedEnvelope: 'insufficient_extracted_text',
          missingRequirements: insufficientBaselineDetails.tips,
        },
      }));
    }

    const allowedBlocks = this.mapToAllowedBlocks(allowedSections);
    const jobContext = {
      id: job.id,
      title: this.cleanText(job.title),
      company: this.cleanText(job.company),
      responsibilities: this.sanitizeList(job.normalizedResponsibilities),
      requirements: this.sanitizeList(job.normalizedRequirements),
    };
    const baselineIdentity = resolveBaselineIdentity(baseline);
    const candidateName = this.cleanText(baselineIdentity?.fullName);

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

    const complianceConstraints = this.normalizeComplianceConstraints(
      input.complianceConstraints,
    );
    const requestSafeMode = complianceConstraints?.mode === 'strict';
    const latestAssessment = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId: job.id, baselineId: baseline.id },
      order: { createdAt: 'DESC' },
    });
    const gapInsights = this.gapAnalysisService.analyze({
      baselineSections: allowedSections.map((section) => ({
        content: section.content ?? '',
      })),
      jobRequirements: job.normalizedRequirements ?? [],
      jobResponsibilities: job.normalizedResponsibilities ?? [],
      dimensionPercents:
        latestAssessment?.scoringV2?.rubric?.dimensionPercents ?? undefined,
    });

    let generation: CoverLetterGenerationResult;
    try {
      generation = this.generator.generate({
        baselineId: baseline.id,
        jobId: job.id,
        allowedBaselineBlocks: allowedBlocks,
        job: jobContext,
        candidateName,
        closingTemplate,
        maxWords: input.maxWords,
        tone: input.tone,
        safeMode: requestSafeMode,
        complianceConstraints,
        gapAnalysis: {
          strengths: gapInsights.strengths,
          criticalGaps: gapInsights.criticalGaps,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message) as { category?: string; message?: string; detail?: string };
          if (parsed?.category === 'unsupported_input') {
            throw new UnprocessableEntityException(parsed);
          }
        } catch {
          if (
            /Cover letter generation failed validation: insufficient baseline evidence\./i.test(
              error.message,
            )
          ) {
            throw new UnprocessableEntityException(
              buildArtifactFailurePayload({
                code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
                category: 'unsupported_input',
                message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
                detail:
                  'The current cover letter input cannot be grounded into a supported artifact.',
                retryable: false,
                userAction: {
                  title: 'Add stronger baseline evidence',
                  description:
                    'Include clearer accomplishment bullets and fuller role details before generating again.',
                },
                diagnostics: {
                  unsupportedEnvelope: 'insufficient_extracted_text',
                },
              }),
            );
          }
        }
      }
      throw error;
    }

    let qualityResult = this.applyCoverLetterPostProcessing(
      generation,
      jobContext,
      candidateName,
    );
    generation = qualityResult.generation;

    if (qualityResult.flags.length > 0) {
      generation = this.generator.generate({
        baselineId: baseline.id,
        jobId: job.id,
        allowedBaselineBlocks: allowedBlocks,
        job: jobContext,
        candidateName,
        closingTemplate,
        maxWords: input.maxWords,
        tone: input.tone,
        safeMode: true,
        complianceConstraints,
        gapAnalysis: {
          strengths: gapInsights.strengths,
          criticalGaps: gapInsights.criticalGaps,
        },
      });
      qualityResult = this.applyCoverLetterPostProcessing(
        generation,
        jobContext,
        candidateName,
      );
      generation = qualityResult.generation;
    }
    if (qualityResult.flags.length > 0) {
      this.throwCoverLetterQualityError(qualityResult.flags, 'post_processing');
    }

    let paragraphAnchorValidation = this.validateCoverLetterParagraphAnchors(
      generation,
      allowedBlocks,
    );
    if (!paragraphAnchorValidation.valid) {
      generation = this.generator.generate({
        baselineId: baseline.id,
        jobId: job.id,
        allowedBaselineBlocks: allowedBlocks,
        job: jobContext,
        candidateName,
        closingTemplate,
        maxWords: input.maxWords,
        tone: input.tone,
        safeMode: true,
        complianceConstraints,
        gapAnalysis: {
          strengths: gapInsights.strengths,
          criticalGaps: gapInsights.criticalGaps,
        },
      });
      qualityResult = this.applyCoverLetterPostProcessing(
        generation,
        jobContext,
        candidateName,
      );
      generation = qualityResult.generation;
      paragraphAnchorValidation = this.validateCoverLetterParagraphAnchors(
        generation,
        allowedBlocks,
      );
    }

    if (!paragraphAnchorValidation.valid) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COVER_LETTER_ANCHOR_VALIDATION_FAILED',
          message:
            'Cover letter could not be generated because drafted paragraphs could not be verified against baseline evidence.',
          details: {
            stage: 'anchor_validation',
            reason: 'cover_letter_anchor_validation_failed',
            reasons: paragraphAnchorValidation.reasons.slice(0, 6),
          },
        },
      });
    }

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
      this.buildNormalizedCoverLetterText(generation),
      allowedBlocks,
      this.buildCoverLetterGeneratedSectionsForCompliance(generation),
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
        candidateName,
        closingTemplate,
        maxWords: input.maxWords,
        tone: input.tone,
        safeMode: true,
        complianceConstraints,
        gapAnalysis: {
          strengths: gapInsights.strengths,
          criticalGaps: gapInsights.criticalGaps,
        },
      });
      qualityResult = this.applyCoverLetterPostProcessing(
        generation,
        jobContext,
        candidateName,
      );
      generation = qualityResult.generation;
      if (qualityResult.flags.length > 0) {
        this.throwCoverLetterQualityError(qualityResult.flags, 'strict_retry_post_processing');
      }
      const strictAnchorValidation = this.validateCoverLetterParagraphAnchors(
        generation,
        allowedBlocks,
      );
      if (!strictAnchorValidation.valid) {
        throw new UnprocessableEntityException({
          error: {
            code: 'COVER_LETTER_ANCHOR_VALIDATION_FAILED',
            message:
              'Cover letter could not be generated because drafted paragraphs could not be verified against baseline evidence.',
            details: {
              stage: 'anchor_validation',
              reason: 'cover_letter_anchor_validation_failed',
              reasons: strictAnchorValidation.reasons.slice(0, 6),
            },
          },
        });
      }

      complianceResult = await this.evaluateCompliance(
        this.buildNormalizedCoverLetterText(generation),
        allowedBlocks,
        this.buildCoverLetterGeneratedSectionsForCompliance(generation),
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
      analysisAssessment,
      allowedBlocks,
      jobContext,
      jobContextAllowlist,
      closingTemplateKey,
      generationInputsHash,
      generation,
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

  private buildBlockedDisplayPayload(flags: ComplianceFlag[]): UserSafeDisplayPayload {
    const shaped = shapeComplianceForUi(flags);
    return {
      title: 'Cover letter blocked by compliance',
      description:
        'Some generated statements could not be verified against your baseline.',
      reasons: shaped.reasons,
      cta: {
        label: 'Review compliance in Results',
        href: '/results',
      },
    };
  }

  private buildSuccessDisplayPayload(): UserSafeDisplayPayload {
    return {
      title: 'Cover letter generated successfully',
      description: 'Your cover letter draft is ready for preview and export.',
      reasons: [],
      cta: {
        label: 'Review results',
        href: '/results',
      },
    };
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

  private buildNormalizedCoverLetterText(
    generation: CoverLetterGenerationResult,
  ) {
    if (!generation.document) {
      return this.complianceService.normalizeText(generation.content);
    }

    return [
      generation.document.salutation,
      generation.document.opening,
      ...generation.document.bodyParagraphs,
      generation.document.closingParagraph,
      generation.document.signoff,
      generation.document.signatureName,
    ]
      .map((line) => this.cleanText(line))
      .filter((line) => line.length > 0)
      .join('\n\n')
      .trim();
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

  private normalizeComplianceConstraints(
    constraints?: CoverLetterComplianceConstraints | null,
  ): CoverLetterComplianceConstraints | undefined {
    if (!constraints || constraints.mode !== 'strict') {
      return undefined;
    }

    const normalizeList = (values?: string[] | null) => {
      if (!Array.isArray(values)) return [];
      const seen = new Set<string>();
      const normalized: string[] = [];
      for (const raw of values) {
        const cleaned = this.cleanText(raw);
        if (!cleaned) continue;
        const normalizedKey = cleaned.toLowerCase();
        if (seen.has(normalizedKey)) continue;
        seen.add(normalizedKey);
        normalized.push(cleaned);
      }
      return normalized;
    };

    const normalized: CoverLetterComplianceConstraints = {
      mode: 'strict',
    };

    const disallowPhrases = normalizeList(constraints.disallowPhrases);
    if (disallowPhrases.length) {
      normalized.disallowPhrases = disallowPhrases;
    }

    const disallowRoleTitles = normalizeList(constraints.disallowRoleTitles);
    if (disallowRoleTitles.length) {
      normalized.disallowRoleTitles = disallowRoleTitles;
    }

    const allowedCompanyNames = normalizeList(constraints.allowedCompanyNames);
    if (allowedCompanyNames.length) {
      normalized.allowedCompanyNames = allowedCompanyNames;
    }

    const allowedRoleTitles = normalizeList(constraints.allowedRoleTitles);
    if (allowedRoleTitles.length) {
      normalized.allowedRoleTitles = allowedRoleTitles;
    }

    const baselineCompanyNames = normalizeList(
      constraints.baselineCompanyNames,
    );
    if (baselineCompanyNames.length) {
      normalized.baselineCompanyNames = baselineCompanyNames;
    }

    const jobCompanyNames = normalizeList(constraints.jobCompanyNames);
    if (jobCompanyNames.length) {
      normalized.jobCompanyNames = jobCompanyNames;
    }

    if (constraints.notes) {
      const notes = this.cleanText(constraints.notes);
      if (notes) {
        normalized.notes = notes;
      }
    }

    return normalized;
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

  private applyCoverLetterPostProcessing(
    generation: CoverLetterGenerationResult,
    jobContext: {
      title: string | null;
      company: string | null;
      responsibilities: string[];
      requirements: string[];
    },
    candidateName: string,
  ): CoverLetterQualityResult {
    const originalText = this.buildNormalizedCoverLetterText(generation);
    const sanitizedText = this.sanitizeCoverLetterText(originalText);
    const sanitizedGeneration = this.hydrateGenerationFromText(
      generation,
      sanitizedText,
      candidateName,
    );

    const flags = this.validateCoverLetterQuality(
      sanitizedGeneration,
      jobContext,
      candidateName,
    );

    return {
      generation: sanitizedGeneration,
      flags,
    };
  }

  private sanitizeCoverLetterText(content: string): string {
    const blocks = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        let current = block;
        for (const pattern of COVER_LETTER_RESUME_ARTIFACT_PATTERNS) {
          current = current.replace(pattern, ' ');
        }
        current = current
          .split('\n')
          .map((line) => line.replace(COVER_LETTER_BULLET_PATTERN, '').trim())
          .filter(Boolean)
          .join(' ');
        return current;
      })
      .filter(Boolean);

    let sanitized = blocks.join('\n\n');
    for (const rewrite of COVER_LETTER_PHRASE_REWRITES) {
      sanitized = sanitized.replace(rewrite.pattern, rewrite.replacement);
    }
    for (const phrase of COVER_LETTER_FORBIDDEN_PHRASES) {
      const pattern = new RegExp(`\\b${this.escapeRegExp(phrase)}\\b`, 'gi');
      sanitized = sanitized.replace(pattern, ' ');
    }

    return sanitized
      .replace(/[\u2013\u2014-]/g, ' ')
      .replace(/[|]+/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\s{2,}/g, ' ')
      .replace(/,{2,}/g, ',')
      .replace(/\s*[,;:]\s*[,;:]+/g, ', ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private hydrateGenerationFromText(
    generation: CoverLetterGenerationResult,
    content: string,
    candidateName: string,
  ): CoverLetterGenerationResult {
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((part) => this.cleanText(part))
      .filter(Boolean);

    if ((paragraphs[0] ?? '').toLowerCase() !== COVER_LETTER_REQUIRED_SALUTATION.toLowerCase()) {
      paragraphs.unshift(COVER_LETTER_REQUIRED_SALUTATION);
    }

    const firstLine = paragraphs.shift() ?? COVER_LETTER_REQUIRED_SALUTATION;
    const signoffIndex = paragraphs.findIndex(
      (line) => line.toLowerCase() === COVER_LETTER_SIGNOFF.toLowerCase(),
    );
    let signatureName = candidateName;
    if (signoffIndex >= 0) {
      if (paragraphs[signoffIndex + 1]) {
        signatureName = this.cleanText(paragraphs[signoffIndex + 1]);
      }
      paragraphs.splice(signoffIndex);
    }

    const opening = paragraphs.shift() ?? generation.document.opening;
    const closingParagraph = paragraphs.pop() ?? generation.document.closingParagraph;
    const bodyParagraphs = paragraphs.slice(0, COVER_LETTER_MAX_BODY_PARAGRAPHS);
    while (bodyParagraphs.length < COVER_LETTER_MAX_BODY_PARAGRAPHS) {
      bodyParagraphs.push(
        this.cleanText(
          bodyParagraphs.length === 0
            ? 'I align execution with role priorities and measurable outcomes.'
            : 'I lead operational delivery with clear ownership and cross-functional coordination.',
        ),
      );
    }

    const document = {
      ...generation.document,
      salutation: COVER_LETTER_REQUIRED_SALUTATION,
      opening,
      bodyParagraphs,
      closingParagraph,
      signoff: COVER_LETTER_SIGNOFF,
      signatureName,
      senderHeading: {
        ...generation.document.senderHeading,
        name: signatureName,
      },
    };

    const normalizedContent = [
      firstLine,
      document.opening,
      ...document.bodyParagraphs,
      document.closingParagraph,
      COVER_LETTER_SIGNOFF,
      document.signatureName,
    ]
      .map((line) => this.cleanText(line))
      .filter((line) => line.length > 0)
      .join('\n\n');

    return {
      ...generation,
      document,
      content: normalizedContent,
      wordCount: this.countWords(normalizedContent),
      greeting: COVER_LETTER_REQUIRED_SALUTATION,
      paragraphs: [document.opening, ...document.bodyParagraphs],
      closingParagraphs: [document.closingParagraph],
      paragraphEvidence: generation.paragraphEvidence,
    };
  }

  private validateCoverLetterQuality(
    generation: CoverLetterGenerationResult,
    jobContext: {
      title: string | null;
      company: string | null;
      responsibilities: string[];
      requirements: string[];
    },
    candidateName: string,
  ): string[] {
    const text = generation.content;
    const lowered = text.toLowerCase();
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((part) => this.cleanText(part))
      .filter(Boolean);
    const contentParagraphs = paragraphs.filter(
      (line) =>
        line.toLowerCase() !== COVER_LETTER_REQUIRED_SALUTATION.toLowerCase() &&
        line.toLowerCase() !== COVER_LETTER_SIGNOFF.toLowerCase() &&
        line.toLowerCase() !== candidateName.toLowerCase(),
    );

    const flags: string[] = [];
    if (!text.startsWith(`${COVER_LETTER_REQUIRED_SALUTATION}\n\n`)) {
      flags.push('missing_required_salutation');
    }
    const salutationCount = (
      text.match(new RegExp(this.escapeRegExp(COVER_LETTER_REQUIRED_SALUTATION), 'gi')) ?? []
    ).length;
    if (salutationCount > 1) {
      flags.push('duplicate_salutation');
    }
    if (text.includes('-')) {
      flags.push('dash_present');
    }
    if (!lowered.includes(COVER_LETTER_SIGNOFF.toLowerCase())) {
      flags.push('missing_signoff');
    }
    const signoffCount = (
      text.match(new RegExp(this.escapeRegExp(COVER_LETTER_SIGNOFF), 'gi')) ?? []
    ).length;
    if (signoffCount > 1) {
      flags.push('duplicate_signoff');
    }
    if (!candidateName || !new RegExp(`\\b${this.escapeRegExp(candidateName)}\\b`, 'i').test(text)) {
      flags.push('missing_candidate_name');
    }
    if (this.countWords(text) < COVER_LETTER_WORD_LIMITS.minimum) {
      flags.push('too_short');
    }
    if (this.countWords(text) > COVER_LETTER_WORD_LIMITS.maximum) {
      flags.push('too_long');
    }
    if (generation.document.bodyParagraphs.length > COVER_LETTER_MAX_BODY_PARAGRAPHS) {
      flags.push('too_many_body_paragraphs');
    }
    if (generation.document.bodyParagraphs.length < COVER_LETTER_MAX_BODY_PARAGRAPHS) {
      flags.push('too_few_body_paragraphs');
    }
    if (contentParagraphs.length !== COVER_LETTER_MAX_BODY_PARAGRAPHS + 2) {
      flags.push(
        contentParagraphs.length > COVER_LETTER_MAX_BODY_PARAGRAPHS + 2
          ? 'too_many_content_paragraphs'
          : 'too_few_content_paragraphs',
      );
    }
    if (
      contentParagraphs.some(
        (paragraph) => this.countWords(paragraph) > COVER_LETTER_MAX_PARAGRAPH_WORDS,
      )
    ) {
      flags.push('paragraph_too_long');
    }
    if (
      COVER_LETTER_FORBIDDEN_PHRASES.some((phrase) =>
        lowered.includes(phrase.toLowerCase()),
      )
    ) {
      flags.push('forbidden_phrase');
    }
    if (
      COVER_LETTER_GENERIC_FILLER_PHRASES.some((phrase) =>
        lowered.includes(phrase.toLowerCase()),
      )
    ) {
      flags.push('generic_filler');
    }
    if (this.detectResumeArtifactLeak(text)) {
      flags.push('resume_artifact');
    }
    if (this.detectKeywordStuffing(contentParagraphs)) {
      flags.push('keyword_stuffing');
    }
    if (!this.includesRoleAndCompanyNaturally(text, jobContext)) {
      flags.push('missing_role_or_company_context');
    }
    if (this.detectJobDescriptionEcho(text, jobContext)) {
      flags.push('jd_echo');
    }
    const anchorValidation = this.validateCoverLetterParagraphAnchors(generation, []);
    if (!anchorValidation.valid) {
      flags.push('paragraph_anchor_validation_failed');
    }
    return flags;
  }

  private throwCoverLetterQualityError(flags: string[], stage: string): never {
    throw new UnprocessableEntityException({
      code: 'generation_failed',
      message: 'Cover letter generation failed validation.',
      details: {
        stage,
        flags: Array.from(new Set(flags)).slice(0, 8),
      },
      error: {
        code: 'generation_failed',
        message: 'Cover letter generation failed validation.',
        details: {
          stage,
          flags: Array.from(new Set(flags)).slice(0, 8),
        },
      },
    });
  }

  private buildCoverLetterEvidenceById(
    allowedBlocks: AllowedBaselineBlock[],
  ): Map<string, ResumeEvidenceUnit> {
    const evidenceById = new Map<string, ResumeEvidenceUnit>();
    for (const block of allowedBlocks) {
      const logicalUnits = reconstructLogicalTextUnits(block.content ?? '');
      const evidenceUnits = extractEvidenceUnitsFromLogicalUnits(block.id, logicalUnits);
      evidenceUnits.forEach((unit) => {
        evidenceById.set(unit.id, unit);
      });
    }
    return evidenceById;
  }

  private normalizeForAnchorMatch(value: string): string {
    return this.cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hasSufficientAnchorOverlap(
    paragraph: string,
    evidence: string,
  ): boolean {
    const paragraphTokens = this.normalizeForAnchorMatch(paragraph)
      .split(' ')
      .filter((token) => token.length >= 3);
    const evidenceTokens = this.normalizeForAnchorMatch(evidence)
      .split(' ')
      .filter((token) => token.length >= 3);
    if (!paragraphTokens.length || !evidenceTokens.length) {
      return false;
    }
    const evidenceSet = new Set(evidenceTokens);
    const overlap = paragraphTokens.filter((token) => evidenceSet.has(token)).length;
    const ratio = overlap / evidenceTokens.length;
    return ratio >= 0.65 || overlap >= 8;
  }

  private validateCoverLetterParagraphAnchors(
    generation: CoverLetterGenerationResult,
    allowedBlocks: AllowedBaselineBlock[],
  ): { valid: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const paragraphEvidence = generation.paragraphEvidence ?? [];
    const evidenceById =
      allowedBlocks.length > 0 ? this.buildCoverLetterEvidenceById(allowedBlocks) : new Map();

    const textByKey: Record<string, string> = {
      opening: generation.document?.opening ?? '',
      body_1: generation.document?.bodyParagraphs?.[0] ?? '',
      body_2: generation.document?.bodyParagraphs?.[1] ?? '',
      body_3: generation.document?.bodyParagraphs?.[2] ?? '',
      closing: generation.document?.closingParagraph ?? '',
    };

    const requiredKeys = ['opening', 'closing'].concat(
      (generation.document?.bodyParagraphs ?? []).map(
        (_paragraph, index) => `body_${index + 1}`,
      ),
    );

    for (const key of requiredKeys) {
      const meta = paragraphEvidence.find((entry) => entry.paragraphKey === key);
      const paragraphText = this.cleanText(textByKey[key] ?? '');
      if (!paragraphText) continue;
      if (!meta) {
        reasons.push(`Paragraph ${key} is missing source evidence references.`);
        continue;
      }
      if (!Array.isArray(meta.sourceEvidenceIds) || meta.sourceEvidenceIds.length === 0) {
        reasons.push(`Paragraph ${key} has no sourceEvidenceIds.`);
        continue;
      }
      if (allowedBlocks.length === 0) {
        continue;
      }
      const evidenceTexts = meta.sourceEvidenceIds
        .map((id) => evidenceById.get(id))
        .filter((entry): entry is ResumeEvidenceUnit => Boolean(entry))
        .map((entry) => this.normalizeForAnchorMatch(entry.normalizedText));
      if (!evidenceTexts.length) {
        reasons.push(`Paragraph ${key} references evidence that was not found in baseline.`);
        continue;
      }
      const normalizedParagraph = this.normalizeForAnchorMatch(paragraphText);
      const hasGroundedEvidence = evidenceTexts.some((evidenceText) =>
        normalizedParagraph.includes(evidenceText) ||
        this.hasSufficientAnchorOverlap(normalizedParagraph, evidenceText),
      );
      if (!hasGroundedEvidence) {
        reasons.push(`Paragraph ${key} is not grounded in the referenced baseline evidence.`);
      }
    }

    const deduped = Array.from(new Set(reasons));
    return {
      valid: deduped.length === 0,
      reasons: deduped.slice(0, 8),
    };
  }

  private includesRoleAndCompanyNaturally(
    text: string,
    jobContext: { title: string | null; company: string | null },
  ) {
    const lowered = text.toLowerCase();
    const mentionsRole =
      !jobContext.title || lowered.includes(jobContext.title.toLowerCase());
    const mentionsCompany =
      !jobContext.company || lowered.includes(jobContext.company.toLowerCase());
    return mentionsRole && mentionsCompany;
  }

  private detectResumeArtifactLeak(text: string) {
    if (text.includes('|')) return true;
    return COVER_LETTER_RESUME_ARTIFACT_PATTERNS.some((pattern) => {
      const testPattern = new RegExp(
        pattern.source,
        pattern.flags.replace(/g/g, ''),
      );
      return testPattern.test(text);
    });
  }

  private detectKeywordStuffing(paragraphs: string[]) {
    const tokenCounts = new Map<string, number>();
    for (const paragraph of paragraphs) {
      const tokens =
        paragraph
          .toLowerCase()
          .match(/[a-z0-9]+/g)
          ?.filter((token) => token.length >= 4) ?? [];
      for (const token of tokens) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }
    return [...tokenCounts.values()].some((count) => count >= 10);
  }

  private detectJobDescriptionEcho(
    text: string,
    jobContext: { responsibilities: string[]; requirements: string[] },
  ) {
    const generatedNgrams = this.buildNgrams(text, 6);
    if (generatedNgrams.size === 0) return false;

    const jobLines = [...jobContext.responsibilities, ...jobContext.requirements]
      .map((line) => this.cleanText(line))
      .filter((line) => line.length >= 20);

    for (const line of jobLines) {
      const jdNgrams = this.buildNgrams(line, 6);
      if (jdNgrams.size === 0) continue;
      let overlap = 0;
      for (const gram of jdNgrams) {
        if (generatedNgrams.has(gram)) {
          overlap += 1;
        }
      }
      const overlapRatio = overlap / jdNgrams.size;
      if (overlapRatio >= 0.45) {
        return true;
      }

      const generatedTokens = this.tokenize(text);
      const jdTokens = this.tokenize(line);
      if (this.longestConsecutiveTokenMatch(generatedTokens, jdTokens) >= 10) {
        return true;
      }
    }
    return false;
  }

  private buildNgrams(text: string, n: number): Set<string> {
    const tokens = this.tokenize(text);
    const grams = new Set<string>();
    if (tokens.length < n) {
      return grams;
    }
    for (let i = 0; i <= tokens.length - n; i += 1) {
      grams.add(tokens.slice(i, i + n).join(' '));
    }
    return grams;
  }

  private longestConsecutiveTokenMatch(
    aTokens: string[],
    bTokens: string[],
  ): number {
    let longest = 0;
    for (let i = 0; i < aTokens.length; i += 1) {
      for (let j = 0; j < bTokens.length; j += 1) {
        let run = 0;
        while (
          i + run < aTokens.length &&
          j + run < bTokens.length &&
          aTokens[i + run] === bTokens[j + run]
        ) {
          run += 1;
        }
        if (run > longest) {
          longest = run;
        }
      }
    }
    return longest;
  }

  private tokenize(text: string): string[] {
    return (
      text
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((token) => token.length >= 2) ?? []
    );
  }

  private countWords(text: string) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private splitIntoSentences(text: string): string[] {
    return String(text ?? '')
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => this.cleanText(sentence))
      .filter((sentence) => sentence.length > 0);
  }

  private buildCoverLetterGeneratedSectionsForCompliance(
    generation: CoverLetterGenerationResult,
  ): ComplianceTextSection[] {
    const paragraphEvidenceMap = new Map(
      (generation.paragraphEvidence ?? []).map((entry) => [
        entry.paragraphKey,
        (entry.anchorTexts ?? [])
          .map((text) => this.normalizeForAnchorMatch(text))
          .filter(Boolean),
      ]),
    );

    const classifySentenceSource = (
      sentence: string,
      paragraphKey: 'opening' | 'body_1' | 'body_2' | 'body_3' | 'closing',
    ): GeneratedTextSourceType => {
      const normalizedSentence = this.normalizeForAnchorMatch(sentence);
      const anchors = paragraphEvidenceMap.get(paragraphKey) ?? [];
      if (
        /\b(?:posting for|your posting|applying for|apply for|role at|opportunity at)\b/i.test(
          sentence,
        )
      ) {
        return GeneratedTextSourceType.JD_REFERENCE;
      }
      if (
        anchors.some(
          (anchor) =>
            normalizedSentence.includes(anchor) || anchor.includes(normalizedSentence),
        )
      ) {
        return GeneratedTextSourceType.BASELINE_EVIDENCE;
      }
      return GeneratedTextSourceType.CONNECTIVE_LANGUAGE;
    };

    const sentenceSources = [
      ...this.splitIntoSentences(generation.document.opening).map((sentence) => ({
        text: sentence,
        sourceType: classifySentenceSource(sentence, 'opening'),
      })),
      ...generation.document.bodyParagraphs.flatMap((paragraph, index) =>
        this.splitIntoSentences(paragraph).map((sentence) => ({
          text: sentence,
          sourceType: classifySentenceSource(
            sentence,
            (`body_${index + 1}` as 'body_1' | 'body_2' | 'body_3'),
          ),
        })),
      ),
      ...this.splitIntoSentences(generation.document.closingParagraph).map((sentence) => ({
        text: sentence,
        sourceType: classifySentenceSource(sentence, 'closing'),
      })),
      {
        text: generation.document.signoff,
        sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
      },
      {
        text: generation.document.signatureName,
        sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
      },
    ];

    return [
      {
        title: 'Cover Letter',
        content: this.buildNormalizedCoverLetterText(generation),
        sectionType: 'COVER_LETTER',
        sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
        sentenceSources: sentenceSources.map((sentence) => ({
          text: sentence.text,
          sourceType:
            sentence.sourceType ?? GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
        })),
      },
    ];
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async evaluateCompliance(
    content: string,
    allowedBlocks: AllowedBaselineBlock[],
    generatedSections: ComplianceTextSection[],
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
        generatedSections,
      });
    const scopeFlags =
      reuseFlags?.scopeFlags ??
      (await this.complianceService.detectScopeInflation({
        baselineSections: allowedBlocks.map((block) => ({
          title: block.title,
          content: block.content,
          sectionType: block.sectionType,
        })),
        generatedSections,
        jobContext: jobContextAllowlist,
        documentType,
      }));

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
        generatedSections,
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
