import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
import type { ComplianceTextSection } from '../compliance/compliance.types';
import {
  getInsufficientExtractedTextDetails,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
} from '../compliance/extracted-text.utils';
import { EmbeddingService } from '../ai/embedding.service';
import {
  FIT_REVIEW_DIMENSION_LABELS,
  type FitReviewDimensionKey,
} from './fit-review-dimensions';

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
    private readonly embeddingService: EmbeddingService,
    private readonly baselineIngestionService: BaselineIngestionService,
  ) {}

  private async enforceBaselineLimit(manager: EntityManager, userId: string) {
    // Upload limits are intentionally disabled.
    void manager;
    void userId;
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
    const fileHash = await this.computeFileHash(file.path);

    if (!fileHash) {
      throw new BadRequestException('Baseline file hash is required');
    }

    const duplicate = await this.findDuplicateBaseline(userId, fileHash);
    if (duplicate) {
      throw new ConflictException({
        error: {
          code: 'BASELINE_DUPLICATE',
          message: 'This file has already been uploaded.',
          existingBaselineId: duplicate.id,
        },
      });
    }

    return this.baselineRepository.manager.transaction(async (manager) => {
      await this.enforceBaselineLimit(manager, userId);

      return this.createBaselineRecord(
        manager,
        userId,
        file,
        fileHash,
        parseResult,
      );
    });
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
      },
      order: { createdAt: 'DESC' },
    });
  }

  private async createBaselineRecord(
    manager: EntityManager,
    userId: string,
    file: FileMetadata,
    fileHash: string,
    parseResult?: BaselineFileParseResult,
  ): Promise<BaselineCreationResult> {
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
      sections: sectionPayloads,
    });

    const savedBaseline = await manager.save(baseline);

    const nextVersionNumber = (savedBaseline.version ?? 0) + 1;

    const policyState = this.normalizePoliciesFromSections(
      (savedBaseline.sections ?? []) as PolicySectionInput[],
    );
    const versionHash = this.buildVersionHash(fileHash, policyState);
    const allowlistSnapshot = buildBaselineAllowlistSnapshot(
      savedBaseline.sections ?? [],
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

    savedBaseline.version = nextVersionNumber;
    savedBaseline.versions = [savedVersion];

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

    const finalBaseline = await manager.save(savedBaseline);
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

    const parsedRecord = manager.create(BaselineParsed, {
      baselineId: baseline.id,
      sourceFileId: baseline.id,
      schemaVersion: parsedBaseline.schema_version,
      sourceFormat: parsedBaseline.source_format,
      ingestedAt: new Date(parsedBaseline.ingested_at),
      parsedJson: parsedBaseline,
      flagsJson: parsedBaseline.system_generated_read_only,
    });

    await manager.save(parsedRecord);
  }

  async listBaselinesForUser(userId: string, includeArchived = false) {
    const statusFilter = includeArchived
      ? {}
      : { status: BaselineStatus.ACTIVE };

    return this.baselineRepository.find({
      where: {
        userId,
        ...statusFilter,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async archiveBaseline(userId: string, baselineId: string) {
    return this.updateBaselineStatus(
      userId,
      baselineId,
      BaselineStatus.ARCHIVED,
    );
  }

  async restoreBaseline(userId: string, baselineId: string) {
    return this.updateBaselineStatus(userId, baselineId, BaselineStatus.ACTIVE);
  }

  private async updateBaselineStatus(
    userId: string,
    baselineId: string,
    status: BaselineStatus,
  ) {
    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    if (baseline.status === status) {
      return baseline;
    }

    baseline.status = status;
    baseline.archivedAt =
      status === BaselineStatus.ARCHIVED ? new Date() : null;

    return this.baselineRepository.save(baseline);
  }

  async getBaselineByIdForUser(id: string, userId: string) {
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

    return baseline;
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
        baseline.sections ?? [],
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
