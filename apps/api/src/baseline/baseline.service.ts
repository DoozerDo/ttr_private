import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Not, Repository } from 'typeorm';
import type { Express } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  BaselineSection,
  BaselineSectionType,
  BaselineIncludePolicy,
} from './baseline-section.entity';
import type { ParsedSection } from './baseline-parser.service';
import { Baseline, BaselineStatus } from './baseline.entity';
import { BaselineParsed } from './baseline-parsed.entity';
import {
  BaselineIngestionResult,
  BaselineIngestionService,
  BaselineSourceFormat,
} from './baseline-ingestion.service';
import {
  BaselineSchema,
  BaselineSchemaCore,
  BaselineSchemaCoreShape,
} from './baseline-schema';
import { BaselineVersion } from './baseline-version.entity';
import { BaselineBlockPolicy } from './baseline-block-policy.entity';
import { buildBaselineAllowlistSnapshot } from '../compliance/baseline-allowlist';
import {
  GeneratedTextSourceType,
  type ComplianceTextSection,
} from '../compliance/compliance.types';
import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';
import { evaluateBaselineTemplateReadiness } from './baselineTemplateReadiness';
import {
  getInsufficientExtractedTextDetails,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
} from '../compliance/extracted-text.utils';
import { EmbeddingService } from '../ai/embedding.service';
import { FitAssessment, FitAssessmentVerdict } from '../analysis/fit-assessment.entity';
import {
  FIT_REVIEW_DIMENSION_LABELS,
  type FitReviewDimensionKey,
} from './fit-review-dimensions';
import {
  classifyStrengtheningImpact,
  type StrengtheningImpactResult,
} from './strengthening-impact';
import { buildValidatedResumeV2FromParsedBaseline } from './baseline-resume-v2';

export type FileMetadata = {
  originalname: string;
  mimetype: string;
  path: string;
};

type BaselineBlockUpdate = {
  id: string;
  include_tag: BaselineIncludePolicy;
  order_index?: number;
};

type BaselineBlocksResponse = {
  baseline_version_id: string;
  baseline_version_hash: string | null;
  blocks: Array<{
    id: string;
    section_type: BaselineSectionType;
    title: string | null;
    content: string;
    include_tag: BaselineIncludePolicy;
    order_index: number;
  }>;
};

type PolicyState = {
  baselineSectionId: string;
  includePolicy: BaselineIncludePolicy;
  order: number;
};

type BaselineFileParseResult = {
  sections: Partial<BaselineSection>[];
  ingestion: BaselineIngestionResult;
};

type PolicySectionInput = {
  id: string;
  includePolicy?: BaselineIncludePolicy | null;
  order?: number | null;
};

export type BaselineCreationResult = {
  baselineId: string;
  baseline: Baseline;
  ingestion?: BaselineIngestionResult;
  normalization?: CanonicalNormalizationResult;
};

export const BASELINE_LIBRARY_CAP = 3;
export const BASELINE_LIBRARY_CAP_ERROR_CODE = 'BASELINE_LIBRARY_CAP_REACHED';

const BASELINE_CAPABILITY_THRESHOLDS = {
  targetReadyMinReadinessScore: 70,
  studioReadyMinReadinessScore: 80,
  highConfidenceMinReadinessScore: 90,
} as const;

export type BaselineAssessmentSummary = {
  latestAssessmentId: string | null;
  latestAssessmentCreatedAt: Date | null;
  latestFitScore: number | null;
  hasCompletedAssessment: boolean;
};

export type BaselineCapabilityState = {
  readinessScore: number | null;
  accepted: boolean;
  targetReady: boolean;
  studioReady: boolean;
  highConfidence: boolean;
  details: {
    hasParsedRecord: boolean;
    hasJobAssessment: boolean;
    templateReadiness: null | {
      canGenerateResume: boolean;
      evidenceThreshold: 'insufficient' | 'usable' | 'strong';
      degraded: boolean;
    };
  };
};

export type BaselineWithAssessmentSummary = Baseline & {
  latestAssessmentSummary: BaselineAssessmentSummary;
  capability?: BaselineCapabilityState;
};

export type BaselineAssessmentDebugState = {
  baselineId: string;
  latestPersistedAssessment: {
    id: string;
    userId: string;
    baselineId: string;
    createdAt: Date;
    score: number;
  } | null;
  summary: BaselineAssessmentSummary;
};

export type BaselineAnalysisTrace = {
  baselineId: string;
  userId: string;
  persistedAssessment: {
    exists: boolean;
    assessmentId?: string;
    baselineId?: string;
    userId?: string;
    createdAt?: string;
    score?: number;
  };
  baselineSummary: {
    baselineId: string;
    latestAssessmentId?: string;
    hasCompletedAssessment: boolean;
    latestFitScore?: number;
    latestAssessmentCreatedAt?: string;
  };
};

export type BaselineStrengtheningResult = {
  baseline: Baseline;
  impactType: StrengtheningImpactResult['impactType'];
  changeClassification: 'no_change_duplicate' | 'refined_existing_signal' | 'new_signal_added';
  scoreDelta: number;
  explanation: string;
  matchedRequirement: string | null;
};

 type CanonicalNormalizationResult = {
   canonical: BaselineSchemaCoreShape;
   roleCount: number;
   toolCount: number;
   flagsSummary: {
     missingFieldsCount: number;
     ambiguityCount: number;
     lowConfidenceCount: number;
   };
 };

const normalizeExtractedToCanonicalV1 = (
  raw: unknown,
): CanonicalNormalizationResult => {
  const canonical = BaselineSchemaCore.parse(raw);
  const flags = canonical.system_generated_read_only;
  return {
    canonical,
    roleCount: canonical.experience.length,
    toolCount: canonical.skills_and_tools.tools.length,
    flagsSummary: {
      missingFieldsCount: flags.missing_fields.length,
      ambiguityCount: flags.ambiguity_flags.length,
      lowConfidenceCount: flags.low_confidence_extractions.length,
    },
  };
};

@Injectable()
export class BaselineService {
  private readonly logger = new Logger(BaselineService.name);

  constructor(
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    @InjectRepository(BaselineParsed)
    private readonly baselineParsedRepository: Repository<BaselineParsed>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    private readonly embeddingService: EmbeddingService,
    private readonly baselineIngestionService: BaselineIngestionService,
  ) {}

  private deriveCapabilityState(input: {
    baseline: Baseline;
    readinessScore: number | null;
    hasParsedRecord: boolean;
    hasJobAssessment: boolean;
    templateReadiness: BaselineCapabilityState['details']['templateReadiness'];
  }): BaselineCapabilityState {
    const readinessScore = input.readinessScore;
    const accepted = input.hasParsedRecord;

    const targetReady =
      accepted &&
      typeof readinessScore === 'number' &&
      readinessScore >= BASELINE_CAPABILITY_THRESHOLDS.targetReadyMinReadinessScore;

    const highConfidence =
      accepted &&
      typeof readinessScore === 'number' &&
      readinessScore >= BASELINE_CAPABILITY_THRESHOLDS.highConfidenceMinReadinessScore;

    // Composite rule:
    // - baseline readiness is primary baseline-owned authority (latestBaselineScore)
    // - template readiness + completed analysis are additional Studio qualifiers
    const studioReadinessThresholdMet =
      accepted &&
      typeof readinessScore === 'number' &&
      readinessScore >= BASELINE_CAPABILITY_THRESHOLDS.studioReadyMinReadinessScore;

    const templateEligible =
      input.templateReadiness?.canGenerateResume === true;

    const studioReady =
      studioReadinessThresholdMet && templateEligible && input.hasJobAssessment;

    return {
      readinessScore,
      accepted,
      targetReady,
      studioReady,
      highConfidence,
      details: {
        hasParsedRecord: input.hasParsedRecord,
        hasJobAssessment: input.hasJobAssessment,
        templateReadiness: input.templateReadiness,
      },
    };
  }

  private async enforceBaselineLimit(manager: EntityManager, userId: string) {
    const baselineCount = await manager.count(Baseline, {
      where: { userId, status: BaselineStatus.ACTIVE },
    });

    if (baselineCount >= BASELINE_LIBRARY_CAP) {
      throw new ConflictException({
        error: {
          code: BASELINE_LIBRARY_CAP_ERROR_CODE,
          message: `You can store up to ${BASELINE_LIBRARY_CAP} active resumes in your library.`,
          details: {
            activeCount: baselineCount,
            maxCount: BASELINE_LIBRARY_CAP,
          },
        },
      });
    }
  }

  private extractUnmetRequirements(latestAssessment: FitAssessment | null) {
    return (
      latestAssessment?.scoringV2?.debug?.bundle?.inputs?.normalizedJob?.requirements
        ?.map((requirement) => requirement.snippet?.trim())
        .filter((requirement): requirement is string => Boolean(requirement && requirement.length > 0)) ??
      []
    );
  }

  private sanitizeSectionContent(content?: string | null) {
    if (!content) {
      return 'Uploaded file content';
    }

    // Strip out null bytes and non-printable control chars while preserving
    // structural whitespace (newline/tab/carriage return) needed for parsing.
    const controlCharClass =
      String.fromCharCode(0) +
      String.fromCharCode(8) +
      String.fromCharCode(11) +
      String.fromCharCode(12) +
      String.fromCharCode(14) +
      '-' +
      String.fromCharCode(31) +
      String.fromCharCode(127);
    const nonPrintableControlChars = new RegExp(`[${controlCharClass}]`, 'g');
    return content
      .replace(nonPrintableControlChars, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  private getSectionTitle(
    sectionType?: BaselineSectionType | null,
    title?: string | null,
  ): string | null {
    const trimmedTitle = title?.trim();

    if (trimmedTitle && !/^other$/i.test(trimmedTitle)) {
      return trimmedTitle;
    }

    switch (sectionType) {
      case BaselineSectionType.RAW:
        return 'Raw';
      case BaselineSectionType.SUMMARY:
      case BaselineSectionType.OTHER:
        return 'Summary';
      case BaselineSectionType.EXPERIENCE:
        return 'Professional Experience';
      case BaselineSectionType.SKILLS:
        return 'Technical Skills';
      case BaselineSectionType.EDUCATION:
        return 'Education';
      case BaselineSectionType.PROJECT:
        return 'Projects';
      default:
        return trimmedTitle ?? null;
    }
  }

  private buildSections(
    rawText: string,
    parsedSections: ParsedSection[],
  ): Partial<BaselineSection>[] {
    const sanitizedRaw = this.sanitizeSectionContent(rawText);

    const structuredSections = parsedSections.map((section, index) => ({
      sectionType: section.sectionType,
      title: this.getSectionTitle(section.sectionType, section.title),
      content: this.sanitizeSectionContent(section.content),
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      // ensure RAW stays first; fall back to index if section.order is undefined
      order: (section.order ?? index) + 1,
    }));

    return [
      {
        sectionType: BaselineSectionType.RAW,
        title: 'Raw',
        content: sanitizedRaw,
        includePolicy: BaselineIncludePolicy.NEVER,
        order: 0,
      },
      ...structuredSections,
    ];
  }

  private async attachEmbeddingsToSections(
    sections: Array<{ content?: string | null; embedding?: number[] | null }>,
  ) {
    if (!sections.length) {
      return;
    }

    await Promise.all(
      sections.map(async (section) => {
        section.embedding =
          (await this.embeddingService.embed(section.content ?? '')) ?? null;
      }),
    );
  }

  private async computeFileHash(filePath: string): Promise<string> {
    try {
      const fileBuffer = await readFile(filePath);
      return createHash('sha256').update(fileBuffer).digest('hex');
    } catch {
      throw new BadRequestException('Unable to compute file hash');
    }
  }

  private buildVersionHash(
    baselineHash: string | null,
    policies: PolicyState[],
    additions: string[] = [],
  ) {
    const normalized = [...policies]
      .map((policy) => ({
        id: policy.baselineSectionId,
        includePolicy: policy.includePolicy,
        order: policy.order,
      }))
      .sort((a, b) => {
        const delta = a.id.localeCompare(b.id);
        if (delta !== 0) return delta;
        return a.order - b.order;
      });

    const normalizedAdditions = [...additions].sort((a, b) =>
      a.localeCompare(b),
    );

    return createHash('sha256')
      .update(
        JSON.stringify({
          baselineHash: baselineHash ?? null,
          policies: normalized,
          additions: normalizedAdditions,
        }),
      )
      .digest('hex');
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

  private async getBaselineWithSections(baselineId: string, userId: string) {
    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId },
        order: { order: 'ASC' },
      });
    }

    return baseline;
  }

  private async getLatestVersionForBaseline(baselineId: string) {
    return this.baselineVersionRepository.findOne({
      where: { baselineId },
      order: { versionNumber: 'DESC', createdAt: 'DESC' },
    });
  }

  private async getNextBaselineVersionNumber(userId: string) {
    const latestBaseline = await this.baselineRepository.findOne({
      where: { userId },
      order: { versionNumber: 'DESC', version: 'DESC', createdAt: 'DESC' },
    });

    return (latestBaseline?.versionNumber ?? latestBaseline?.version ?? 0) + 1;
  }

  private async setSingleActiveBaseline(
    manager: EntityManager,
    userId: string,
    activeBaselineId: string,
  ) {
    await manager.update(Baseline, { userId }, { isActive: false });
    await manager.update(
      Baseline,
      { id: activeBaselineId, userId },
      { isActive: true },
    );
  }

  async getLatestParsedBaseline(baselineId: string) {
    return this.baselineParsedRepository.findOne({
      where: { baselineId },
      order: { createdAt: 'DESC' },
    });
  }

  private normalizePoliciesFromSections(
    sections: PolicySectionInput[],
  ): PolicyState[] {
    return sections.map((section, index) => ({
      baselineSectionId: section.id,
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      order: section.order ?? index,
    }));
  }

  private raiseConflict(
    currentVersion: BaselineVersion,
    hash?: string | null,
  ): never {
    throw new ConflictException({
      error: {
        code: 'BASELINE_VERSION_CONFLICT',
        message: 'Baseline version is out of date.',
        details: {
          baseline_version_id: currentVersion.id,
          baseline_version_hash: hash ?? currentVersion.fileHash,
        },
      },
    });
  }

  async createBaseline(
    userId: string,
    file: FileMetadata,
    parseResult: BaselineFileParseResult,
  ) {
    try {
      const fileHash = await this.computeFileHash(file.path);

      if (!fileHash) {
        throw new BadRequestException('Baseline file hash is required');
      }

      const existingByHash = await this.findBaselineByUserAndHash(userId, fileHash);
      if (existingByHash) {
        if (existingByHash.status === BaselineStatus.ARCHIVED) {
          return await this.baselineRepository.manager.transaction(async (manager) => {
            const activePointerCount = await manager.count(Baseline, {
              where: { userId, status: BaselineStatus.ACTIVE, isActive: true },
            });
            const shouldBecomeActive = activePointerCount === 0;
            if (shouldBecomeActive) {
              await this.setSingleActiveBaseline(manager, userId, existingByHash.id);
            }
            await manager.update(
              Baseline,
              { id: existingByHash.id, userId },
              {
                status: BaselineStatus.ACTIVE,
                archivedAt: null,
                isActive: shouldBecomeActive ? true : existingByHash.isActive,
              },
            );
            const revived = await manager.findOne(Baseline, {
              where: { id: existingByHash.id, userId },
              relations: ['sections'],
              order: { sections: { order: 'ASC' } },
            });
            return {
              baseline:
                revived ??
                ({ ...existingByHash, status: BaselineStatus.ACTIVE, archivedAt: null } as Baseline),
              baselineId: existingByHash.id,
              ingestion: parseResult?.ingestion,
            } as BaselineCreationResult;
          });
        }

        throw new ConflictException({
          error: {
            code: 'BASELINE_DUPLICATE',
            message: 'This file has already been uploaded.',
            existingBaselineId: existingByHash.id,
          },
        });
      }

      try {
        return await this.baselineRepository.manager.transaction(async (manager) => {
          await this.enforceBaselineLimit(manager, userId);

          return this.createBaselineRecord(
            manager,
            userId,
            file,
            fileHash,
            parseResult,
          );
        });
      } catch (error) {
        if (this.isPostgresUniqueViolation(error, 'UQ_baselines_user_hash')) {
          const existing = await this.findBaselineByUserAndHash(userId, fileHash);
          if (existing) {
            return {
              baseline: existing,
              baselineId: existing.id,
              ingestion: parseResult?.ingestion,
            } as BaselineCreationResult;
          }
        }
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[BASELINE][CREATE_ERROR] userId=${userId} message=${message}`,
        stack,
      );
      throw error;
    }
  }

  async cloneBaselineForFitReview(
    userId: string,
    baselineId: string,
    jobId: string,
    additions: Array<{ dimensionId: FitReviewDimensionKey; approvedText: string }>,
  ) {
    const trimmedBaselineId = baselineId?.trim();
    if (!trimmedBaselineId) {
      throw new BadRequestException("Baseline is required");
    }

    const trimmedJobId = jobId?.trim();
    if (!trimmedJobId) {
      throw new BadRequestException("Job ID is required");
    }

    const normalizedAdditions = (additions ?? [])
      .map((addition) => ({
        dimensionId: addition.dimensionId,
        approvedText: addition.approvedText.trim(),
      }))
      .filter((addition) => addition.approvedText.length > 0);

    if (!normalizedAdditions.length) {
      throw new BadRequestException("At least one approved addition is required");
    }

    const baseline = await this.getBaselineWithSections(trimmedBaselineId, userId);

    return this.baselineRepository.manager.transaction(async (manager) => {
      await this.enforceBaselineLimit(manager, userId);

      const baselineSectionPartials: Array<
        Pick<BaselineSection, 'sectionType' | 'title' | 'content' | 'includePolicy' | 'order'>
      > = baseline.sections.map((section) => ({
        sectionType: section.sectionType,
        title: section.title,
        content: section.content,
        includePolicy: section.includePolicy,
        order: section.order,
      }));

      const additionLines = normalizedAdditions.map((addition) => {
        const label = FIT_REVIEW_DIMENSION_LABELS[addition.dimensionId];
        return `• ${label} (${addition.dimensionId}): ${addition.approvedText}`;
      });

      baselineSectionPartials.push({
        sectionType: BaselineSectionType.OTHER,
        title: "Fit Review Additions",
        content: additionLines.join("\n"),
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: baselineSectionPartials.length,
      });

      await this.attachEmbeddingsToSections(baselineSectionPartials);

      const cloneBaseline = manager.create(Baseline, {
        userId,
        originalFilename: `${baseline.originalFilename} (Fit Review)`,
        mimeType: baseline.mimeType,
        storagePath: baseline.storagePath,
        hash: baseline.hash,
        status: BaselineStatus.ACTIVE,
        archivedAt: null,
        isActive: true,
        sections: baselineSectionPartials,
      });

      const savedBaseline = await manager.save(cloneBaseline);

      const nextVersionNumber = (savedBaseline.version ?? 0) + 1;

      const persistedSections = await manager.find(BaselineSection, {
        where: { baselineId: savedBaseline.id },
        order: { order: "ASC" },
      });

      const policySectionInputs: PolicySectionInput[] = persistedSections.map((section) => ({
        id: section.id ?? randomUUID(),
        includePolicy: section.includePolicy,
        order: section.order,
      }));

      const policyState = this.normalizePoliciesFromSections(policySectionInputs);

      const versionHash = this.buildVersionHash(
        baseline.hash,
        policyState,
        additionLines,
      );

      const complianceTextSections: ComplianceTextSection[] = baselineSectionPartials.map(
        (section) => ({
          title: section.title,
          content: section.content,
          sectionType: section.sectionType ?? null,
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        }),
      );

      const allowlistSnapshot = buildBaselineAllowlistSnapshot(complianceTextSections);

      const versionRecord = manager.create(BaselineVersion, {
        baselineId: savedBaseline.id,
        versionNumber: nextVersionNumber,
        fileHash: versionHash,
        storagePath: savedBaseline.storagePath,
        verifiedAdditions: additionLines,
        additionDiff: {
          jobId: trimmedJobId,
          additions: normalizedAdditions,
        },
        promotedFromInterviewId: null,
        allowedCompanies: allowlistSnapshot.allowedCompanies,
        allowedRoles: allowlistSnapshot.allowedRoles,
        allowedTechnologies: allowlistSnapshot.allowedTechnologies,
        allowedMetricTokens: allowlistSnapshot.allowedMetricTokens,
      });

      const savedVersion = await manager.save(versionRecord);

      const policyEntities = policyState.map((policy) =>
        manager.create(BaselineBlockPolicy, {
          baselineVersionId: savedVersion.id,
          baselineSectionId: policy.baselineSectionId,
          includePolicy: policy.includePolicy,
          order: policy.order,
        }),
      );

      if (policyEntities.length) {
        await manager.save(policyEntities);
      }

      savedBaseline.version = nextVersionNumber;
      savedBaseline.versionNumber = nextVersionNumber;
      savedBaseline.isActive = true;
      await manager.save(savedBaseline);

      return savedBaseline.id;
    });
  }

  private async findDuplicateBaseline(
    userId: string,
    hash: string,
  ): Promise<Baseline | null> {
    return this.baselineRepository.findOne({
      where: {
        userId,
        hash,
        status: BaselineStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });
  }

  private async findBaselineByUserAndHash(
    userId: string,
    hash: string,
  ): Promise<Baseline | null> {
    return this.baselineRepository.findOne({
      where: { userId, hash },
      order: { createdAt: 'DESC' },
    });
  }

  private isPostgresUniqueViolation(error: unknown, constraintName: string): boolean {
    const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
    const code = record?.code;
    const constraint = record?.constraint;
    return code === '23505' && constraint === constraintName;
  }

  private async createBaselineRecord(
    manager: EntityManager,
    userId: string,
    file: FileMetadata,
    fileHash: string,
    parseResult?: BaselineFileParseResult,
  ): Promise<BaselineCreationResult> {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[BASELINE][CREATE_START]', { userId });
    }

    const activePointerCount = await manager.count(Baseline, {
      where: {
        userId,
        status: BaselineStatus.ACTIVE,
        isActive: true,
      },
    });
    const shouldBecomeActive = activePointerCount === 0;

    const sectionPayloads =
      parseResult?.sections?.map((section, index) => ({
        sectionType: section.sectionType ?? BaselineSectionType.OTHER,
        title: this.getSectionTitle(section.sectionType, section.title),
        content: this.sanitizeSectionContent(section.content),
        includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
        order: section.order ?? index,
      })) ?? [
        {
          sectionType: BaselineSectionType.OTHER,
          title: this.getSectionTitle(BaselineSectionType.OTHER, null),
          content: this.sanitizeSectionContent(),
          includePolicy: BaselineIncludePolicy.OPTIONAL,
          order: 0,
        },
      ];

    await this.attachEmbeddingsToSections(sectionPayloads);

    const baseline = manager.create(Baseline, {
      userId,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      storagePath: file.path,
      hash: fileHash,
      status: BaselineStatus.ACTIVE,
      archivedAt: null,
      isActive: shouldBecomeActive,
      sections: sectionPayloads,
    });

    const savedBaseline = await manager.save(baseline);

    const nextVersionNumber = await this.getNextBaselineVersionNumber(userId);

    const policyState = this.normalizePoliciesFromSections(
      (savedBaseline.sections ?? []) as PolicySectionInput[],
    );
    const versionHash = this.buildVersionHash(fileHash, policyState);
    const allowlistSnapshot = buildBaselineAllowlistSnapshot(
      (savedBaseline.sections ?? []).map((section) => ({
        title: section.title,
        content: section.content,
        sectionType: section.sectionType ?? null,
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
      })),
    );

    const versionRecord = manager.create(BaselineVersion, {
      baselineId: savedBaseline.id,
      versionNumber: nextVersionNumber,
      fileHash: versionHash,
      storagePath: savedBaseline.storagePath,
      verifiedAdditions: [],
      additionDiff: null,
      promotedFromInterviewId: null,
      allowedCompanies: allowlistSnapshot.allowedCompanies,
      allowedRoles: allowlistSnapshot.allowedRoles,
      allowedTechnologies: allowlistSnapshot.allowedTechnologies,
      allowedMetricTokens: allowlistSnapshot.allowedMetricTokens,
    });

    const savedVersion = await manager.save(versionRecord);

    const policyEntities = policyState.map((policy) =>
      manager.create(BaselineBlockPolicy, {
        baselineVersionId: savedVersion.id,
        baselineSectionId: policy.baselineSectionId,
        includePolicy: policy.includePolicy,
        order: policy.order,
      }),
    );

    await manager.save(policyEntities);

    let normalization: CanonicalNormalizationResult | undefined;
    if (parseResult?.ingestion?.canonical) {
      normalization = normalizeExtractedToCanonicalV1(
        parseResult.ingestion.canonical,
      );
      parseResult.ingestion.canonical = normalization.canonical;
    }

    if (parseResult) {
      await this.persistParsedBaseline(
        manager,
        savedBaseline,
        parseResult.ingestion,
      );
    }

    await manager.update(
      Baseline,
      { id: savedBaseline.id, userId },
      {
        version: nextVersionNumber,
        versionNumber: nextVersionNumber,
        status: BaselineStatus.ACTIVE,
        archivedAt: null,
        isActive: shouldBecomeActive,
      },
    );

    if (shouldBecomeActive) {
      await this.setSingleActiveBaseline(manager, userId, savedBaseline.id);
    }

    const finalBaseline = {
      ...savedBaseline,
      version: nextVersionNumber,
      versionNumber: nextVersionNumber,
      status: BaselineStatus.ACTIVE,
      archivedAt: null,
      isActive: shouldBecomeActive,
      versions: [savedVersion],
    } as Baseline;

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[BASELINE][CREATE_SUCCESS]', {
        baselineId: finalBaseline.id,
        isActive: finalBaseline.isActive,
        status: finalBaseline.status,
      });
    }

    return {
      baselineId: finalBaseline.id,
      baseline: finalBaseline,
      normalization,
      ingestion: parseResult?.ingestion,
    };
  }

  private async persistParsedBaseline(
    manager: EntityManager,
    baseline: Baseline,
    ingestion: BaselineIngestionResult,
  ) {
    const ingestedAt = new Date().toISOString();
    const parsedBaseline = BaselineSchema.parse({
      ...ingestion.canonical,
      baseline_id: baseline.id,
      source_file_id: baseline.id,
      source_format: ingestion.sourceFormat,
      ingested_at: ingestedAt,
      user_verified: false,
    });

    if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
      try {
        const experienceCount = Array.isArray((parsedBaseline as any)?.experience) ? (parsedBaseline as any).experience.length : null;
        const sectionSummary = Array.isArray((ingestion.parsedSections ?? []))
          ? (ingestion.parsedSections ?? []).map((s) => ({
              type: String((s as any)?.sectionType ?? ''),
              title: String((s as any)?.title ?? ''),
              chars: typeof (s as any)?.content === 'string' ? (s as any).content.length : 0,
            })).slice(0, 12)
          : [];
        // eslint-disable-next-line no-console
        console.log('[BASELINE_PERSIST][PARSED_JSON_SUMMARY]', {
          baselineId: baseline.id,
          sourceFormat: ingestion.sourceFormat,
          rawTextLength: ingestion.rawText?.length ?? 0,
          parsedSectionCount: ingestion.parsedSections?.length ?? 0,
          parsedSectionPreview: sectionSummary,
          canonicalExperienceCount: experienceCount,
        });
      } catch {
        // ignore
      }
    }

    let resumeV2Json: Record<string, unknown> | null = null;
    try {
      if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
        try {
          // eslint-disable-next-line no-console
          console.log('[BASELINE_PERSIST][RESUME_V2_BUILD_START]', {
            baselineId: baseline.id,
            sourceFormat: ingestion.sourceFormat,
            canonicalExperienceCount: Array.isArray((parsedBaseline as any)?.experience) ? (parsedBaseline as any).experience.length : null,
          });
        } catch {
          // ignore
        }
      }
      resumeV2Json = buildValidatedResumeV2FromParsedBaseline(parsedBaseline as any) as any;
    } catch (error) {
      if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
        try {
          const response = (error as any)?.response as any;
          // eslint-disable-next-line no-console
          console.warn('[BASELINE_PERSIST][RESUME_V2_BUILD_FAILED]', {
            baselineId: baseline.id,
            sourceFormat: ingestion.sourceFormat,
            errorCode: String(response?.error?.code ?? ''),
            parsedExperienceCount: Array.isArray((parsedBaseline as any)?.experience) ? (parsedBaseline as any).experience.length : null,
            parsedWorkHistoryPresent: Boolean((parsedBaseline as any)?.work_history),
          });
        } catch {
          // ignore
        }
      }
      throw error;
    }

    const parsedRecord = manager.create(BaselineParsed, {
      baselineId: baseline.id,
      sourceFileId: baseline.id,
      schemaVersion: parsedBaseline.schema_version,
      sourceFormat: parsedBaseline.source_format,
      ingestedAt: new Date(parsedBaseline.ingested_at),
      parsedJson: parsedBaseline,
      resumeV2Json,
      flagsJson: parsedBaseline.system_generated_read_only,
    });

    await manager.save(parsedRecord);
  }

  // ResumeV2 normalization/validation is implemented in `baseline-resume-v2.ts` for reuse by backfill paths.

  private async buildLatestAssessmentSummaryByBaselineId(
    userId: string,
    baselineIds: string[],
  ): Promise<Map<string, BaselineAssessmentSummary>> {
    const summaryByBaselineId = new Map<string, BaselineAssessmentSummary>();
    for (const baselineId of baselineIds) {
      summaryByBaselineId.set(baselineId, {
        latestAssessmentId: null,
        latestAssessmentCreatedAt: null,
        latestFitScore: null,
        hasCompletedAssessment: false,
      });
    }

    if (!baselineIds.length) {
      return summaryByBaselineId;
    }

    // Completion rule: a baseline is analyzed if there is at least one
    // persisted fit_assessments row for the same userId + exact baselineId.
    const latestPerBaseline = await this.fitAssessmentRepository
      .createQueryBuilder('assessment')
      .distinctOn(['assessment.baselineId'])
      .select('assessment."baselineId"', 'baselineId')
      .addSelect('assessment.id', 'id')
      .addSelect('assessment."createdAt"', 'createdAt')
      .addSelect('assessment."overallScore"', 'overallScore')
      .where('assessment."userId" = :userId', { userId })
      .andWhere('assessment."baselineId" IN (:...baselineIds)', { baselineIds })
      .orderBy('assessment."baselineId"', 'ASC')
      .addOrderBy('assessment."createdAt"', 'DESC')
      .addOrderBy('assessment.id', 'DESC')
      .getRawMany<{
      baselineId: string;
      id: string;
      createdAt: Date | string;
      overallScore: number | string | null;
    }>();

    this.logger.debug(
      `buildLatestAssessmentSummaryByBaselineId userId=${userId} requested=${baselineIds.length} rawResults=${latestPerBaseline.length}`,
    );

    for (const row of latestPerBaseline) {
      const parsedScore =
        typeof row.overallScore === 'number'
          ? row.overallScore
          : typeof row.overallScore === 'string'
            ? Number.parseInt(row.overallScore, 10)
            : null;
      summaryByBaselineId.set(row.baselineId, {
        latestAssessmentId: row.id,
        latestAssessmentCreatedAt: row.createdAt
          ? new Date(row.createdAt)
          : null,
        latestFitScore:
          typeof parsedScore === 'number' && Number.isFinite(parsedScore)
            ? parsedScore
            : null,
        hasCompletedAssessment: true,
      });
    }

    return summaryByBaselineId;
  }

  private toBaselineReadinessSummary(
    baseline: Pick<Baseline, 'latestBaselineScore' | 'lastAnalyzedAt' | 'latestAssessmentId'>,
  ): BaselineAssessmentSummary {
    const hasReadiness =
      typeof baseline.latestBaselineScore === 'number' ||
      baseline.lastAnalyzedAt instanceof Date ||
      Boolean(baseline.latestAssessmentId);

    if (!hasReadiness) {
      return {
        latestAssessmentId: baseline.latestAssessmentId ?? null,
        latestAssessmentCreatedAt: null,
        latestFitScore: null,
        hasCompletedAssessment: false,
      };
    }

    return {
      latestAssessmentId: baseline.latestAssessmentId ?? null,
      latestAssessmentCreatedAt: baseline.lastAnalyzedAt ?? null,
      latestFitScore:
        typeof baseline.latestBaselineScore === 'number'
          ? baseline.latestBaselineScore
          : null,
      hasCompletedAssessment: true,
    };
  }

  async listBaselinesForUser(
    userId: string,
    includeArchived = false,
  ): Promise<BaselineWithAssessmentSummary[]> {
    const statusFilter = includeArchived
      ? {}
      : { status: BaselineStatus.ACTIVE };

    const baselines = await this.baselineRepository.find({
      where: {
        userId,
        ...statusFilter,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    this.logger.debug(
      `listBaselinesForUser userId=${userId} includeArchived=${includeArchived} repositoryCount=${baselines.length}`,
    );

    let summaries: Map<string, BaselineAssessmentSummary> = new Map();
    try {
      summaries = await this.buildLatestAssessmentSummaryByBaselineId(
        userId,
        baselines.map((baseline) => baseline.id),
      );
      this.logger.debug(
        `listBaselinesForUser userId=${userId} receivedAssessments=${summaries.size}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to load fit_assessments summary for baseline list userId=${userId}; returning baselines without assessment summary. message=${message}`,
        stack,
      );
    }

    const baselineIds = baselines.map((baseline) => baseline.id);

    const latestParsedByBaselineId = new Map<string, BaselineParsed>();
    if (
      baselineIds.length &&
      typeof this.baselineParsedRepository?.createQueryBuilder === 'function'
    ) {
      const parsedRows = await this.baselineParsedRepository
        .createQueryBuilder('parsed')
        .distinctOn(['parsed."baselineId"'])
        .where('parsed."baselineId" IN (:...baselineIds)', { baselineIds })
        .orderBy('parsed."baselineId"', 'ASC')
        .addOrderBy('parsed."createdAt"', 'DESC')
        .addOrderBy('parsed.id', 'DESC')
        .getMany();
      parsedRows.forEach((row) =>
        latestParsedByBaselineId.set(row.baselineId, row),
      );
    }

    const sectionsByBaselineId = new Map<string, BaselineSection[]>();
    if (baselineIds.length) {
      const sections = await this.baselineSectionRepository.find({
        where: { baselineId: In(baselineIds) },
        order: { order: 'ASC' },
      });
      for (const section of sections) {
        const existing = sectionsByBaselineId.get(section.baselineId) ?? [];
        existing.push(section);
        sectionsByBaselineId.set(section.baselineId, existing);
      }
    }

    // Studio qualifier: require at least one non-readiness job assessment for this baseline.
    const hasJobAssessmentByBaselineId = new Map<string, boolean>();
    if (
      baselineIds.length &&
      typeof this.fitAssessmentRepository?.createQueryBuilder === 'function'
    ) {
      try {
        const jobAssessments = await this.fitAssessmentRepository
          .createQueryBuilder('assessment')
          .distinctOn(['assessment."baselineId"'])
          .select('assessment."baselineId"', 'baselineId')
          .where('assessment."userId" = :userId', { userId })
          .andWhere('assessment."baselineId" IN (:...baselineIds)', { baselineIds })
          .andWhere('assessment."jobId" <> assessment."baselineId"')
          .orderBy('assessment."baselineId"', 'ASC')
          .addOrderBy('assessment."createdAt"', 'DESC')
          .addOrderBy('assessment.id', 'DESC')
          .getRawMany<{ baselineId: string }>();
        jobAssessments.forEach((row) =>
          hasJobAssessmentByBaselineId.set(row.baselineId, true),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `Failed to load job assessment presence for baselines userId=${userId}; returning baselines with hasJobAssessment=false. message=${message}`,
          stack,
        );
      }
    }

    const rows = baselines.map((baseline) => {
      const latestAssessmentSummary =
        summaries.get(baseline.id)?.hasCompletedAssessment
          ? (summaries.get(baseline.id) as BaselineAssessmentSummary)
          : this.toBaselineReadinessSummary(baseline);

      const hasParsedRecord = latestParsedByBaselineId.has(baseline.id);
      const sections = sectionsByBaselineId.get(baseline.id) ?? [];
      const structured = sections.length
        ? extractStructuredBaselineFromSections(sections as any)
        : null;
      const templateReadiness = structured
        ? evaluateBaselineTemplateReadiness(structured as any)
        : null;

      const capability = this.deriveCapabilityState({
        baseline,
        readinessScore:
          typeof baseline.latestBaselineScore === 'number'
            ? baseline.latestBaselineScore
            : null,
        hasParsedRecord,
        hasJobAssessment: hasJobAssessmentByBaselineId.get(baseline.id) === true,
        templateReadiness: templateReadiness
          ? {
              canGenerateResume: templateReadiness.canGenerateResume,
              evidenceThreshold: templateReadiness.evidence.threshold,
              degraded: templateReadiness.evidence.degraded,
            }
          : null,
      });

      return {
        ...baseline,
        latestAssessmentSummary,
        capability,
      };
    });

    this.logger.debug(
      `listBaselinesForUser userId=${userId} mappedRows=${rows.length}`,
    );
    rows.forEach((baseline) => {
      const summary = baseline.latestAssessmentSummary;
      this.logger.debug(
        `baseline summary userId=${userId} baselineId=${baseline.id} hasCompletedAssessment=${summary.hasCompletedAssessment} latestFitScore=${summary.latestFitScore ?? 'null'}`,
      );
    });

    if (process.env.NODE_ENV !== 'production') {
      rows.forEach((baseline) => {
        this.logger.log(
          `baselines.summary userId=${userId} baselineId=${baseline.id} latestAssessmentId=${baseline.latestAssessmentSummary.latestAssessmentId ?? 'null'} hasCompletedAssessment=${baseline.latestAssessmentSummary.hasCompletedAssessment} latestFitScore=${baseline.latestAssessmentSummary.latestFitScore ?? 'null'}`,
        );
      });
    }

    return rows;
  }

  async getBaselineAssessmentDebugState(
    userId: string,
    baselineId: string,
  ): Promise<BaselineAssessmentDebugState> {
    const trimmedBaselineId = baselineId.trim();
    if (!trimmedBaselineId) {
      throw new BadRequestException('baselineId is required');
    }

    await this.getBaselineByIdForUser(trimmedBaselineId, userId);

    const latestPersistedAssessment = await this.fitAssessmentRepository.findOne({
      where: { userId, baselineId: trimmedBaselineId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    const summaries = await this.buildLatestAssessmentSummaryByBaselineId(userId, [
      trimmedBaselineId,
    ]);
    const summary = summaries.get(trimmedBaselineId) ?? {
      latestAssessmentId: null,
      latestAssessmentCreatedAt: null,
      latestFitScore: null,
      hasCompletedAssessment: false,
    };

    return {
      baselineId: trimmedBaselineId,
      latestPersistedAssessment: latestPersistedAssessment
        ? {
            id: latestPersistedAssessment.id,
            userId: latestPersistedAssessment.userId,
            baselineId: latestPersistedAssessment.baselineId,
            createdAt: latestPersistedAssessment.createdAt,
            score: latestPersistedAssessment.overallScore,
          }
        : null,
      summary,
    };
  }

  async getBaselineAnalysisTrace(
    userId: string,
    baselineId: string,
  ): Promise<BaselineAnalysisTrace> {
    const state = await this.getBaselineAssessmentDebugState(userId, baselineId);

    return {
      baselineId: state.baselineId,
      userId,
      persistedAssessment: state.latestPersistedAssessment
        ? {
            exists: true,
            assessmentId: state.latestPersistedAssessment.id,
            baselineId: state.latestPersistedAssessment.baselineId,
            userId: state.latestPersistedAssessment.userId,
            createdAt: state.latestPersistedAssessment.createdAt.toISOString(),
            score: state.latestPersistedAssessment.score,
          }
        : { exists: false },
      baselineSummary: {
        baselineId: state.baselineId,
        latestAssessmentId: state.summary.latestAssessmentId ?? undefined,
        hasCompletedAssessment: state.summary.hasCompletedAssessment,
        latestFitScore: state.summary.latestFitScore ?? undefined,
        latestAssessmentCreatedAt: state.summary.latestAssessmentCreatedAt
          ? state.summary.latestAssessmentCreatedAt.toISOString()
          : undefined,
      },
    };
  }

  async archiveBaseline(userId: string, baselineId: string) {
    if (process.env.NODE_ENV !== 'production') {
      // Debug logging for archive action (requested for troubleshooting).
      // eslint-disable-next-line no-console
      console.log('[BASELINE][ARCHIVE]', { baselineId, userId });
    }
    return this.updateBaselineStatus(
      userId,
      baselineId,
      BaselineStatus.ARCHIVED,
    );
  }

  async restoreBaseline(userId: string, baselineId: string) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[BASELINE][RESTORE]', { baselineId, userId });
    }
    return this.updateBaselineStatus(userId, baselineId, BaselineStatus.ACTIVE);
  }

  async setCurrentBaseline(userId: string, baselineId: string) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[BASELINE][SET_CURRENT]', { baselineId, userId });
    }

    return this.baselineRepository.manager.transaction(async (manager) => {
      const baseline = await manager.findOne(Baseline, {
        where: { id: baselineId, userId },
      });

      if (!baseline) {
        throw new NotFoundException('Baseline not found');
      }

      if (baseline.status === BaselineStatus.ARCHIVED) {
        throw new BadRequestException('Cannot set an archived baseline as current');
      }

      // Single source of truth for "current baseline" is `Baseline.isActive`.
      await this.setSingleActiveBaseline(manager, userId, baseline.id);

      const updated = await manager.findOne(Baseline, {
        where: { id: baseline.id, userId },
      });

      return updated ?? ({ ...baseline, isActive: true } as Baseline);
    });
  }

  private async updateBaselineStatus(
    userId: string,
    baselineId: string,
    status: BaselineStatus,
  ) {
    try {
      return await this.baselineRepository.manager.transaction(async (manager) => {
        const baseline = await manager.findOne(Baseline, {
          where: { id: baselineId, userId },
        });

        if (!baseline) {
          throw new NotFoundException('Baseline not found');
        }

        if (baseline.status === status) {
          return baseline;
        }

        if (status === BaselineStatus.ARCHIVED && baseline.isActive === true) {
          // If the user is archiving their current baseline, automatically promote the next
          // most recent non-archived baseline to current (if any). If none exist, allow the
          // archive and leave the user with no current baseline until a new upload is created.
        }

        const baselines = await manager.find(Baseline, {
          where: { userId },
          order: { createdAt: 'DESC' },
        });

        const nextActiveBaselineId =
          status === BaselineStatus.ACTIVE
            ? baseline.id
            : baselines.find(
                (item) => item.id !== baseline.id && item.status !== BaselineStatus.ARCHIVED,
              )?.id ?? null;

        this.logger.debug(
          `updateBaselineStatus userId=${userId} baselineId=${baselineId} currentStatus=${baseline.status} currentIsActive=${baseline.isActive === true} targetStatus=${status} baselineCount=${baselines.length} nextActiveBaselineId=${nextActiveBaselineId ?? 'null'}`,
        );

        await manager.update(Baseline, { userId }, { isActive: false });

        if (nextActiveBaselineId) {
          await manager.update(
            Baseline,
            { id: nextActiveBaselineId, userId },
            {
              isActive: true,
              status: BaselineStatus.ACTIVE,
              archivedAt: null,
            },
          );
        }

        await manager.update(
          Baseline,
          { id: baseline.id, userId },
          {
            status,
            isActive: status === BaselineStatus.ACTIVE,
            archivedAt: status === BaselineStatus.ARCHIVED ? new Date() : null,
          },
        );

        const updated = await manager.findOne(Baseline, {
          where: { id: baseline.id, userId },
        });

        return updated ?? baseline;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[BASELINE][STATUS_UPDATE_FAILED] userId=${userId} baselineId=${baselineId} targetStatus=${status} message=${message}`,
        stack,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(message || 'Baseline status update failed');
    }
  }

  async getBaselineByIdForUser(
    id: string,
    userId: string,
  ): Promise<BaselineWithAssessmentSummary> {
    const baseline = await this.baselineRepository.findOne({
      where: { id, userId },
      relations: ['sections'],
      order: {
        sections: {
          order: 'ASC',
        },
      },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    let summary: BaselineAssessmentSummary | undefined;
    try {
      summary = (
        await this.buildLatestAssessmentSummaryByBaselineId(userId, [baseline.id])
      ).get(baseline.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to load fit_assessments summary for baseline detail userId=${userId} baselineId=${id}; returning baseline detail with default summary. message=${message}`,
        stack,
      );
    }

    const readinessScore =
      typeof baseline.latestBaselineScore === 'number'
        ? baseline.latestBaselineScore
        : null;

    const structured = (baseline.sections ?? []).length
      ? extractStructuredBaselineFromSections(baseline.sections as any)
      : null;
    const templateReadinessEvaluation = structured
      ? evaluateBaselineTemplateReadiness(structured as any)
      : null;

    const [latestParsed, jobAssessment] = await Promise.all([
      this.getLatestParsedBaseline(baseline.id),
      typeof this.fitAssessmentRepository?.findOne === 'function'
        ? this.fitAssessmentRepository.findOne({
            where: {
              userId,
              baselineId: baseline.id,
              jobId: Not(baseline.id),
            } as any,
            order: { createdAt: 'DESC', id: 'DESC' },
          })
        : Promise.resolve(null),
    ]);

    return {
      ...baseline,
      latestAssessmentSummary:
        summary?.hasCompletedAssessment
          ? summary
          : this.toBaselineReadinessSummary(baseline),
      capability: this.deriveCapabilityState({
        baseline,
        readinessScore,
        hasParsedRecord: Boolean(latestParsed),
        hasJobAssessment: Boolean(jobAssessment),
        templateReadiness: templateReadinessEvaluation
          ? {
              canGenerateResume: templateReadinessEvaluation.canGenerateResume,
              evidenceThreshold: templateReadinessEvaluation.evidence.threshold,
              degraded: templateReadinessEvaluation.evidence.degraded,
            }
          : null,
      }),
    };
  }

  private deriveBaselineReadinessScore(baseline: Baseline): number {
    const sections = baseline.sections ?? [];
    const nonRawSections = sections.filter(
      (section) => section.sectionType !== BaselineSectionType.RAW,
    );
    const nonRawCount = nonRawSections.length;
    const contentLength = nonRawSections.reduce(
      (total, section) => total + (section.content?.trim().length ?? 0),
      0,
    );

    const sectionSignal = Math.min(20, nonRawCount * 4);
    const contentSignal = Math.min(20, Math.floor(contentLength / 250));
    return Math.max(45, Math.min(92, 50 + sectionSignal + contentSignal));
  }

  async analyzeBaselineReadiness(userId: string, baselineId: string) {
    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const readinessScore = this.deriveBaselineReadinessScore(baseline);
    const analyzedAt = new Date();
    const readinessAssessment = this.fitAssessmentRepository.create({
      userId,
      // Baseline readiness is a baseline-level assessment, so we pin it to the
      // baseline id to satisfy the fit_assessments jobId requirement.
      jobId: baseline.id,
      baselineId,
      baselineVersion: baseline.version ?? null,
      overallScore: readinessScore,
      verdict: this.deriveBaselineReadinessVerdict(readinessScore),
      dimensionScores: {
        experienceAlignment: readinessScore,
        leadershipLevel: readinessScore,
        technicalPlatformFit: readinessScore,
        industryContext: readinessScore,
        strategicTacticalFit: readinessScore,
      },
      strengths: [],
      gaps: [],
      complianceFlags: [],
      inputsHash: null,
    });

    let persistedAssessment: FitAssessment;
    try {
      persistedAssessment = await this.baselineRepository.manager.transaction(
        async (manager) => {
          const savedAssessment = await manager.save(FitAssessment, readinessAssessment);
          if (!savedAssessment?.id) {
            throw new InternalServerErrorException(
              'Baseline readiness assessment was saved without an id',
            );
          }

          await manager.update(
            Baseline,
            { id: baselineId, userId },
            {
              originalBaselineScore:
                baseline.originalBaselineScore ?? readinessScore,
              latestBaselineScore: readinessScore,
              latestAssessmentId: savedAssessment.id,
              firstAnalyzedAt: baseline.firstAnalyzedAt ?? analyzedAt,
              lastAnalyzedAt: analyzedAt,
            },
          );

          return savedAssessment;
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to persist baseline readiness analysis baselineId=${baselineId} assessmentId=${(readinessAssessment as { id?: string }).id ?? 'pending'} message=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `analyzeBaselineReadiness persisted baseline analysis baselineId=${baselineId} assessmentId=${persistedAssessment.id} score=${readinessScore} analyzedAt=${analyzedAt.toISOString()}`,
      );
    }

    const result = await this.getBaselineByIdForUser(baselineId, userId);
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `analyzeBaselineReadiness mapped summary baselineId=${baselineId} latestAssessmentId=${result.latestAssessmentSummary.latestAssessmentId ?? 'null'} hasCompletedAssessment=${result.latestAssessmentSummary.hasCompletedAssessment} latestFitScore=${result.latestAssessmentSummary.latestFitScore ?? 'null'}`,
      );
    }
    return result;
  }

  async recordBaselineAnalysisScore(
    userId: string,
    baselineId: string,
    score: number,
  ) {
    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
    const now = new Date();

    if (baseline.originalBaselineScore === null || baseline.originalBaselineScore === undefined) {
      baseline.originalBaselineScore = normalizedScore;
      baseline.firstAnalyzedAt = now;
    }

    baseline.latestBaselineScore = normalizedScore;
    baseline.lastAnalyzedAt = now;

    return this.baselineRepository.save(baseline);
  }

  private deriveBaselineReadinessVerdict(score: number): FitAssessmentVerdict {
    if (score >= 85) {
      return FitAssessmentVerdict.APPLY;
    }
    if (score >= 70) {
      return FitAssessmentVerdict.CONSIDER;
    }
    return FitAssessmentVerdict.SKIP;
  }

  async appendStrengtheningAddition(
    userId: string,
    baselineId: string,
    detail: string,
  ): Promise<BaselineStrengtheningResult> {
    const normalizedDetail = detail.trim();
    if (!normalizedDetail) {
      throw new BadRequestException('detail is required');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const latestAssessmentForImpact = await this.fitAssessmentRepository.findOne({
      where: { userId, baselineId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    const existingEvidenceForImpact = (baseline.sections ?? [])
      .flatMap((section) =>
        [section.title, section.content]
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0),
      )
      .filter(Boolean);

    const unmetRequirementsForImpact = this.extractUnmetRequirements(latestAssessmentForImpact);
    const preImpact = classifyStrengtheningImpact({
      addition: normalizedDetail,
      existingEvidence: existingEvidenceForImpact,
      unmetRequirements: unmetRequirementsForImpact,
    });

    // Single source of truth for "what changed": when the addition is a duplicate, do not persist or score.
    if (preImpact.impactType === 'duplicate') {
      return {
        baseline,
        impactType: 'duplicate',
        changeClassification: 'no_change_duplicate',
        scoreDelta: 0,
        explanation: preImpact.explanation,
        matchedRequirement: null,
      };
    }

    const sectionTitle = 'Approved signal refinements';
    const existingSection = (baseline.sections ?? []).find(
      (section) =>
        section.sectionType === BaselineSectionType.OTHER &&
        (section.title ?? '').trim().toLowerCase() === sectionTitle.toLowerCase(),
    );

    let didPersistChange = false;

    if (existingSection) {
      const existingContent =
        typeof existingSection.content === 'string' ? existingSection.content : '';
      const existingLines = existingContent
        .split('\n')
        .map((line) => line.trim().replace(/^[-*\u2022]\s*/, ''))
        .filter(Boolean);
      const alreadyPresent = existingLines.some((line) => line === normalizedDetail);
      if (!alreadyPresent) {
        const nextContent = existingContent.trim()
          ? `${existingContent.trim()}\n${normalizedDetail}`
          : normalizedDetail;
        const updatePayload = {
          content: nextContent,
          updatedAt: new Date(),
        };
        try {
          // Use scoped update to avoid relation hydration edge cases nulling baselineId.
          await this.baselineSectionRepository.update(
            { id: existingSection.id, baselineId: baseline.id },
            updatePayload,
          );
          didPersistChange = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;
          this.logger.error(
            `Failed updating baseline refinement section baselineId=${baseline.id} sectionId=${existingSection.id} userId=${userId} payload=${JSON.stringify(
              { ...updatePayload, contentLength: nextContent.length },
            )} message=${message}`,
            stack,
          );
          throw new InternalServerErrorException({
            error: {
              code: 'BASELINE_UPDATE_PERSISTENCE_FAILED',
              message: 'Unable to persist baseline strengthening update.',
              reason: message,
              details: {
                baselineId,
                sectionId: existingSection.id,
                operation: 'update_refinement_section',
              },
            },
          });
        }
      }
    } else {
      const nextOrder =
        (baseline.sections ?? []).reduce(
          (maxOrder, section) => Math.max(maxOrder, section.order ?? 0),
          -1,
        ) + 1;

      const newSection = this.baselineSectionRepository.create({
        baselineId: baseline.id,
        sectionType: BaselineSectionType.OTHER,
        title: sectionTitle,
        content: normalizedDetail,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: nextOrder,
      });
      try {
        await this.attachEmbeddingsToSections([newSection]);
        await this.baselineSectionRepository.save(newSection);
        didPersistChange = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `Failed creating baseline refinement section baselineId=${baseline.id} userId=${userId} payload=${JSON.stringify(
            {
              baselineId: newSection.baselineId,
              sectionType: newSection.sectionType,
              includePolicy: newSection.includePolicy,
              order: newSection.order,
              contentLength: newSection.content?.length ?? 0,
            },
          )} message=${message}`,
          stack,
        );
        throw new InternalServerErrorException({
          error: {
            code: 'BASELINE_UPDATE_PERSISTENCE_FAILED',
            message: 'Unable to persist baseline strengthening update.',
            reason: message,
            details: {
              baselineId,
              operation: 'create_refinement_section',
            },
          },
        });
      }
    }

    // If we didn't persist anything (e.g., exact match already present), treat as duplicate and do not score.
    if (!didPersistChange) {
      return {
        baseline,
        impactType: 'duplicate',
        changeClassification: 'no_change_duplicate',
        scoreDelta: 0,
        explanation: 'This addition appears to already be covered by existing baseline evidence.',
        matchedRequirement: null,
      };
    }

    try {
      const updatedAt = new Date();
      await this.baselineRepository.update(
        { id: baseline.id, userId },
        { updatedAt },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed updating baseline timestamp baselineId=${baseline.id} userId=${userId} message=${message}`,
        stack,
      );
      throw new InternalServerErrorException({
        error: {
          code: 'BASELINE_UPDATE_PERSISTENCE_FAILED',
          message: 'Unable to persist baseline strengthening update.',
          reason: message,
          details: {
            baselineId,
            operation: 'update_baseline_timestamp',
          },
        },
      });
    }
    const refreshedBaseline = await this.getBaselineByIdForUser(baselineId, userId);
    const impact = preImpact;

    const changeClassification: BaselineStrengtheningResult['changeClassification'] =
      impact.impactType === 'new_match'
        ? 'new_signal_added'
        : impact.impactType === 'strengthened_match'
          ? 'refined_existing_signal'
          : 'refined_existing_signal';

    if (impact.scoreDelta !== 0) {
      const currentScore =
        typeof refreshedBaseline.latestBaselineScore === 'number'
          ? refreshedBaseline.latestBaselineScore
          : typeof latestAssessmentForImpact?.overallScore === 'number'
            ? latestAssessmentForImpact.overallScore
            : 0;
      const nextScore = Math.max(0, Math.min(100, currentScore + impact.scoreDelta));
      const scoredBaseline = await this.recordBaselineAnalysisScore(userId, baselineId, nextScore);
      return {
        baseline: scoredBaseline,
        impactType: impact.impactType,
        changeClassification,
        scoreDelta: impact.scoreDelta,
        explanation: impact.explanation,
        matchedRequirement: impact.matchedRequirement,
      };
    }

    return {
      baseline: refreshedBaseline,
      impactType: impact.impactType,
      changeClassification,
      scoreDelta: 0,
      explanation: impact.explanation,
      matchedRequirement: impact.matchedRequirement,
    };
  }

  async buildSectionsFromFile(file: Express.Multer.File): Promise<BaselineFileParseResult> {
    const ingestion = await this.baselineIngestionService.ingest(file);
    const insufficientDetails = getInsufficientExtractedTextDetails(ingestion.rawText);
    if (insufficientDetails) {
      const payload = {
        errorCode: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
        code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
        message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
        details: insufficientDetails,
        error: {
          code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
          message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
          details: insufficientDetails,
        },
      };
      throw new UnprocessableEntityException(payload);
    }
    const sections = this.buildSections(
      ingestion.rawText,
      ingestion.parsedSections,
    );

    return {
      sections,
      ingestion,
    };
  }

  private inferSourceFormat(mimeType?: string | null): BaselineSourceFormat {
    const normalized = (mimeType ?? '').toLowerCase();
    if (normalized.includes('pdf')) {
      return 'pdf';
    }
    return 'docx';
  }

  async reparseBaselineForUser(baselineId: string, userId: string) {
    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const rawSection =
      baseline.sections.find(
        (section) => section.sectionType === BaselineSectionType.RAW,
      ) ?? baseline.sections[0];

    const sourceFormat = this.inferSourceFormat(baseline.mimeType);
    const ingestion = await this.reingestFromSourceFileOrFallback(
      baseline,
      rawSection?.content ?? '',
      sourceFormat,
    );
    const rebuiltSections = this.buildSections(
      ingestion.rawText,
      ingestion.parsedSections,
    );

    return this.baselineRepository.manager.transaction(async (manager) => {
      await manager.delete(BaselineSection, { baselineId: baseline.id });

      const rebuiltEntities = rebuiltSections.map((section, index) =>
        manager.create(BaselineSection, {
          ...section,
          baselineId: baseline.id,
          order: section.order ?? index,
        }),
      );

      await this.attachEmbeddingsToSections(rebuiltEntities);
      await manager.save(rebuiltEntities);

      baseline.sections = rebuiltEntities;

      const latestVersion = await this.getLatestVersionForBaseline(baseline.id);
      const nextVersionNumber =
        (latestVersion?.versionNumber ?? baseline.version ?? 0) + 1;
      const policyState = this.normalizePoliciesFromSections(
        (baseline.sections ?? []) as PolicySectionInput[],
      );
      const versionHash = this.buildVersionHash(
        baseline.hash,
        policyState,
        latestVersion?.verifiedAdditions ?? [],
      );
      const allowlistSnapshot = buildBaselineAllowlistSnapshot(
        (baseline.sections ?? []).map((section) => ({
          title: section.title,
          content: section.content,
          sectionType: section.sectionType ?? null,
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        })),
      );

      const versionRecord = manager.create(BaselineVersion, {
        baselineId: baseline.id,
        versionNumber: nextVersionNumber,
        fileHash: versionHash,
        storagePath: baseline.storagePath,
        verifiedAdditions: [],
        additionDiff: null,
        promotedFromInterviewId: null,
        allowedCompanies: allowlistSnapshot.allowedCompanies,
        allowedRoles: allowlistSnapshot.allowedRoles,
        allowedTechnologies: allowlistSnapshot.allowedTechnologies,
        allowedMetricTokens: allowlistSnapshot.allowedMetricTokens,
      });

      const savedVersion = await manager.save(versionRecord);

      const policyEntities = policyState.map((policy) =>
        manager.create(BaselineBlockPolicy, {
          baselineVersionId: savedVersion.id,
          baselineSectionId: policy.baselineSectionId,
          includePolicy: policy.includePolicy,
          order: policy.order,
        }),
      );

      await manager.save(policyEntities);

      baseline.version = nextVersionNumber;
      baseline.versionNumber = nextVersionNumber;
      baseline.isActive = true;
      baseline.versions = [savedVersion];

      await this.persistParsedBaseline(manager, baseline, ingestion);

      return manager.save(baseline);
    });
  }

  private async reingestFromSourceFileOrFallback(
    baseline: Baseline,
    fallbackRawText: string,
    sourceFormat: BaselineSourceFormat,
  ): Promise<BaselineIngestionResult> {
    try {
      if (baseline.storagePath?.trim()) {
        return await this.baselineIngestionService.ingest({
          path: baseline.storagePath,
          originalname: baseline.originalFilename,
          mimetype: baseline.mimeType,
        } as Express.Multer.File);
      }
    } catch {
      // Fall through to previously persisted raw text.
    }

    return this.baselineIngestionService.ingestFromText(
      fallbackRawText,
      sourceFormat,
    );
  }

  async listBaselineVersionsForUser(baselineId: string, userId: string) {
    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      select: { id: true },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    // VERIFY: Confirm that descending order is the expected default for version history.
    return this.baselineVersionRepository.find({
      where: { baselineId },
      order: { versionNumber: 'DESC', createdAt: 'DESC' },
    });
  }

  async listBlocksForBaselineVersion(
    baselineId: string,
    baselineVersionId: string,
    userId: string,
  ): Promise<BaselineBlocksResponse> {
    if (!baselineVersionId?.trim()) {
      throw new BadRequestException('baseline_version_id is required');
    }

    const baseline = await this.getBaselineWithSections(baselineId, userId);

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId, baselineId: baseline.id },
    });

    if (!baselineVersion) {
      throw new NotFoundException('Baseline version not found');
    }

    const policies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId },
      relations: ['baselineSection'],
      order: { order: 'ASC' },
    });

    const sections = this.applyPoliciesToSections(
      baseline.sections ?? [],
      policies,
    );

    const additionSections =
      (baselineVersion.verifiedAdditions ?? []).map((content, index) => ({
        id: `addition-${index}`,
        sectionType: BaselineSectionType.OTHER,
        title: 'Verified addition',
        content,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: sections.length + index,
      })) ?? [];

    const versionSections = [...sections, ...additionSections];

    const policyState = this.normalizePoliciesFromSections(
      versionSections as PolicySectionInput[],
    );
    const versionHash =
      baselineVersion.fileHash ??
      this.buildVersionHash(
        baseline.hash,
        policyState,
        baselineVersion.verifiedAdditions ?? [],
      );

    if (!baselineVersion.fileHash && versionHash) {
      baselineVersion.fileHash = versionHash;
      await this.baselineVersionRepository.save(baselineVersion);
    }

    return {
      baseline_version_id: baselineVersion.id,
      baseline_version_hash: versionHash ?? null,
      blocks: versionSections.map((section) => ({
        id: section.id,
        section_type: section.sectionType ?? BaselineSectionType.OTHER,
        title: this.getSectionTitle(section.sectionType, section.title),
        content: section.content,
        include_tag: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
        order_index: section.order,
      })),
    };
  }

  async updateBlockPolicies(
    userId: string,
    baselineId: string,
    payload: {
      baseline_version_id?: string;
      baseline_version_hash?: string;
      blocks?: BaselineBlockUpdate[];
    },
  ) {
    const baselineVersionId = payload?.baseline_version_id?.trim();
    const baselineVersionHash = payload?.baseline_version_hash?.trim();
    const blocks = payload?.blocks ?? [];

    if (!baselineVersionId) {
      throw new BadRequestException('baseline_version_id is required');
    }

    if (!baselineVersionHash) {
      throw new BadRequestException('baseline_version_hash is required');
    }

    if (!Array.isArray(blocks) || blocks.length === 0) {
      throw new BadRequestException('blocks are required');
    }

    const baseline = await this.getBaselineWithSections(baselineId, userId);

    const latestVersion = await this.getLatestVersionForBaseline(baseline.id);

    if (!latestVersion) {
      throw new NotFoundException('Baseline version not found');
    }

    const requestedVersion = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId, baselineId: baseline.id },
    });

    if (!requestedVersion) {
      throw new NotFoundException('Baseline version not found');
    }

    const validPolicies = new Set<BaselineIncludePolicy>([
      BaselineIncludePolicy.ALWAYS,
      BaselineIncludePolicy.OPTIONAL,
      BaselineIncludePolicy.NEVER,
    ]);

    for (const block of blocks) {
      if (!validPolicies.has(block.include_tag)) {
        throw new BadRequestException('Invalid include_tag value');
      }
    }

    const sections = baseline.sections?.length
      ? baseline.sections
      : await this.baselineSectionRepository.find({
          where: { baselineId: baseline.id },
          order: { order: 'ASC' },
        });

    const sectionMap = new Map(
      sections.map((section) => [section.id, section]),
    );

    const updateMap = new Map<string, BaselineBlockUpdate>(
      blocks.map((block) => [block.id, block]),
    );

    for (const blockId of updateMap.keys()) {
      if (!sectionMap.has(blockId)) {
        throw new NotFoundException('Baseline block not found');
      }
    }

    const existingPolicies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: requestedVersion.id },
      order: { order: 'ASC' },
    });

    const currentPolicyState: PolicyState[] =
      existingPolicies.length > 0
        ? existingPolicies.map((policy) => ({
            baselineSectionId: policy.baselineSectionId,
            includePolicy: policy.includePolicy,
            order: policy.order,
          }))
        : this.normalizePoliciesFromSections(sections as PolicySectionInput[]);

    const currentVersionHash =
      requestedVersion.fileHash ??
      this.buildVersionHash(
        baseline.hash,
        currentPolicyState,
        requestedVersion.verifiedAdditions ?? [],
      );

    if (baselineVersionHash !== (currentVersionHash ?? '')) {
      this.raiseConflict(requestedVersion, currentVersionHash);
    }

    const policyMap = new Map<string, BaselineBlockPolicy>(
      existingPolicies.map((policy) => [policy.baselineSectionId, policy]),
    );

    const nextPolicies: PolicyState[] = sections.map((section, index) => {
      const incoming = updateMap.get(section.id);
      const currentPolicy = policyMap.get(section.id);

      return {
        baselineSectionId: section.id,
        includePolicy:
          incoming?.include_tag ??
          currentPolicy?.includePolicy ??
          section.includePolicy ??
          BaselineIncludePolicy.OPTIONAL,
        order:
          incoming?.order_index ??
          currentPolicy?.order ??
          section.order ??
          index,
      };
    });

    const newVersionHash = this.buildVersionHash(
      baseline.hash,
      nextPolicies,
      requestedVersion.verifiedAdditions ?? [],
    );
    const nextVersionNumber =
      (latestVersion.versionNumber ?? baseline.version ?? 0) + 1;

    return this.baselineRepository.manager.transaction(async (manager) => {
      const newVersion = manager.create(BaselineVersion, {
        baselineId: baseline.id,
        versionNumber: nextVersionNumber,
        fileHash: newVersionHash,
        storagePath: baseline.storagePath,
        verifiedAdditions: requestedVersion.verifiedAdditions ?? [],
        additionDiff: requestedVersion.additionDiff ?? null,
        promotedFromInterviewId: requestedVersion.promotedFromInterviewId ?? null,
      });

      const savedVersion = await manager.save(newVersion);

      const policyEntities = nextPolicies.map((policy) =>
        manager.create(BaselineBlockPolicy, {
          baselineVersionId: savedVersion.id,
          baselineSectionId: policy.baselineSectionId,
          includePolicy: policy.includePolicy,
          order: policy.order,
        }),
      );

      await manager.save(policyEntities);

      baseline.version = nextVersionNumber;
      baseline.versionNumber = nextVersionNumber;
      baseline.isActive = true;
      const updatedSections = sections.map((section) => {
        const applied = nextPolicies.find(
          (policy) => policy.baselineSectionId === section.id,
        );

        section.includePolicy = applied?.includePolicy ?? section.includePolicy;
        section.order =
          applied?.order ?? section.order ?? section.orderIndex ?? 0;
        section.title = this.getSectionTitle(section.sectionType, section.title);

        return section;
      });

      await manager.save(BaselineSection, updatedSections);
      await manager.save(baseline);

      return {
        baseline_version_id: baselineVersionId,
        updated_blocks: updatedSections.map((section) => ({
          id: section.id,
          section_type: section.sectionType ?? BaselineSectionType.OTHER,
          title: this.getSectionTitle(section.sectionType, section.title),
          content: section.content,
          include_tag: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
          order_index: section.order ?? 0,
        })),
        new_version_id: savedVersion.id,
        hash: savedVersion.fileHash,
      };
    });
  }
}
