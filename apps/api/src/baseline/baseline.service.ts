import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Not, Repository, SelectQueryBuilder } from 'typeorm';
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
  verifiedBaseline?: VerifiedBaseline | null;
};

export type VerifiedBaseline = {
  sourceText: string;
  experience: BaselineSchemaCoreShape['experience'];
  skills: BaselineSchemaCoreShape['skills'];
  education: BaselineSchemaCoreShape['education'];
  certifications: string[];
  evidence: Array<{
    id: string;
    text: string;
    metrics: Array<{ type: 'percentage' | 'currency' | 'count'; value: string }>;
    tags: string[];
  }>;
  usabilityStatus: 'valid' | 'invalid';
  rejectionReasons: string[];
};

type VerifiedBaselineEvidence = VerifiedBaseline['evidence'][number];

function normalizeVerifiedBaselineEvidence(
  value: unknown,
  index: number,
): VerifiedBaselineEvidence | null {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const text = String(record?.text ?? '').trim();
  if (!text) return null;
  const metrics = Array.isArray(record?.metrics)
    ? (record?.metrics as Array<Record<string, unknown>>)
        .map((metric) => ({
          type:
            metric?.type === 'percentage' || metric?.type === 'currency' || metric?.type === 'count'
              ? metric.type
              : null,
          value: String(metric?.value ?? '').trim(),
        }))
        .filter((metric) => Boolean(metric.type && metric.value))
    : [];
  const tags = Array.isArray(record?.tags)
    ? (record?.tags as unknown[]).map((tag) => String(tag ?? '').trim()).filter(Boolean)
    : [];
  return {
    id: String(record?.id ?? `verified-baseline-evidence-${index}`),
    text,
    metrics: metrics as VerifiedBaselineEvidence['metrics'],
    tags,
  };
}

function normalizeVerifiedBaselineExperience(
  entries: unknown,
): BaselineSchemaCoreShape['experience'] {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const company = String(record.company ?? record.company_name ?? record.companyName ?? '').trim();
      const role = String(record.role ?? record.role_title ?? record.roleTitle ?? '').trim();
      if (!company || !role) return null;
      const startDate =
        typeof record.start_date === 'string' && record.start_date.trim().length > 0
          ? record.start_date.trim()
          : typeof record.startDate === 'string' && record.startDate.trim().length > 0
            ? record.startDate.trim()
            : null;
      const endDate =
        typeof record.end_date === 'string' && record.end_date.trim().length > 0
          ? record.end_date.trim()
          : typeof record.endDate === 'string' && record.endDate.trim().length > 0
            ? record.endDate.trim()
            : null;
      const existingEvidence = Array.isArray(record.evidence)
        ? record.evidence
            .map((evidence, evidenceIndex) => normalizeVerifiedBaselineEvidence(evidence, evidenceIndex))
            .filter((value): value is VerifiedBaselineEvidence => Boolean(value))
        : [];
      const bulletTexts = Array.isArray(record.bullets)
        ? record.bullets.map((bullet) => String(bullet ?? '').trim()).filter(Boolean)
        : [];
      const fallbackEvidence = !existingEvidence.length
        ? bulletTexts.map((text, evidenceIndex) => ({
            id: `verified-baseline-experience-${index}-evidence-${evidenceIndex}`,
            text,
            metrics: [],
            tags: [],
          }))
        : [];
      const evidence = existingEvidence.length ? existingEvidence : fallbackEvidence;
      return {
        company,
        role,
        start_date: startDate,
        end_date: endDate,
        evidence,
      };
    })
    .filter((entry): entry is BaselineSchemaCoreShape['experience'][number] => Boolean(entry));
}

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

export type BaselineLibraryRow = Pick<
  Baseline,
  | 'id'
  | 'userId'
  | 'versionNumber'
  | 'isActive'
  | 'originalFilename'
  | 'mimeType'
  | 'storagePath'
  | 'hash'
  | 'status'
  | 'archivedAt'
  | 'originalBaselineScore'
  | 'latestBaselineScore'
  | 'latestAssessmentId'
  | 'firstAnalyzedAt'
  | 'lastAnalyzedAt'
  | 'isSynthetic'
  | 'syntheticScenarioKey'
  | 'syntheticRunId'
  | 'syntheticCreatedAt'
  | 'preserveFromCleanup'
  | 'createdAt'
  | 'updatedAt'
>;

const BASELINE_LIBRARY_SAFE_SELECT_COLUMNS = [
  'baseline.id',
  'baseline.userId',
  'baseline.versionNumber',
  'baseline.isActive',
  'baseline.originalFilename',
  'baseline.mimeType',
  'baseline.storagePath',
  'baseline.hash',
  'baseline.status',
  'baseline.archivedAt',
  'baseline.originalBaselineScore',
  'baseline.latestBaselineScore',
  'baseline.latestAssessmentId',
  'baseline.firstAnalyzedAt',
  'baseline.lastAnalyzedAt',
  'baseline.isSynthetic',
  'baseline.syntheticScenarioKey',
  'baseline.syntheticRunId',
  'baseline.syntheticCreatedAt',
  'baseline.preserveFromCleanup',
  'baseline.createdAt',
  'baseline.updatedAt',
] as const;

type BaselineLibraryRowRaw = {
  id: string;
  userId: string;
  versionNumber: number | null;
  isActive: boolean | null;
  originalFilename: string;
  mimeType: string;
  storagePath: string;
  hash: string | null;
  status: BaselineStatus;
  archivedAt: Date | null;
  originalBaselineScore: number | null;
  latestBaselineScore: number | null;
  latestAssessmentId: string | null;
  firstAnalyzedAt: Date | null;
  lastAnalyzedAt: Date | null;
  isSynthetic: boolean | null;
  syntheticScenarioKey: string | null;
  syntheticRunId: string | null;
  syntheticCreatedAt: Date | null;
  preserveFromCleanup: boolean | null;
  createdAt: Date;
  updatedAt: Date;
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
  baseline: BaselineLibraryRow;
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

  private buildVerifiedBaseline(input: {
    sourceText: string;
    ingestion: BaselineIngestionResult | null | undefined;
    sections: BaselineSection[];
  }): VerifiedBaseline | null {
    const canonical = input.ingestion?.canonical;
    const structured = extractStructuredBaselineFromSections(input.sections as any);
    const sourceText =
      input.sourceText || (input.sections ?? []).map((section) => section.content ?? '').join('\n');
    const experience = normalizeVerifiedBaselineExperience(canonical?.experience ?? structured.experience);
    const skills = canonical?.skills ?? structured.skills.map((name) => ({ name, category: null }));
    const education = canonical?.education ?? structured.education.map((school) => ({
      school,
      degree: null,
      startDate: null,
      endDate: null,
      evidence: [],
    }));
    const pipelineComplete = Boolean(input.ingestion);
    const rejectionReasons = pipelineComplete ? [] : ['baseline_unreadable_or_unmappable'];
    const evidence = [
      ...(Array.isArray(canonical?.experience)
        ? canonical.experience.flatMap((entry) => (Array.isArray((entry as any)?.evidence) ? (entry as any).evidence : []))
        : []),
      ...(Array.isArray(canonical?.education)
        ? canonical.education.flatMap((entry) => (Array.isArray((entry as any)?.evidence) ? (entry as any).evidence : []))
        : []),
    ];

    return {
      sourceText,
      experience,
      skills,
      education,
      certifications: [],
      evidence,
      usabilityStatus: pipelineComplete ? 'valid' : 'invalid',
      rejectionReasons,
    };
  }

  private async enforceBaselineLimit(manager: EntityManager, userId: string) {
    const baselineCount = await manager.count(Baseline, {
      where: { userId, status: BaselineStatus.ACTIVE },
    });

    this.logger.debug(
      `enforceBaselineLimit userId=${userId} activeCount=${baselineCount} canonicalLimitDisabled=true`,
    );
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
        try {
          section.embedding =
            (await this.embeddingService.embed(section.content ?? '')) ?? null;
        } catch (error) {
          // Embeddings are advisory and must not break baseline ingest/reparse.
          // If the embedding provider is unavailable, keep the baseline usable for ResumeV2 readiness + generation.
          this.logger.warn('Embedding generation failed; continuing without embeddings', {
            error: error instanceof Error ? error.message : String(error ?? 'unknown'),
          });
          section.embedding = null;
        }
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
    const latestBaseline = await this.baselineRepository
      .createQueryBuilder('baseline')
      .select('baseline.versionNumber', 'versionNumber')
      .addSelect('baseline.version', 'version')
      .where('baseline.userId = :userId', { userId })
      .orderBy('baseline.versionNumber', 'DESC')
      .addOrderBy('baseline.version', 'DESC')
      .addOrderBy('baseline.createdAt', 'DESC')
      .getRawOne<{
        versionNumber: number | null;
        version: number | null;
      }>();

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

  private mapBaselineToLibraryRow(baseline: Baseline): BaselineLibraryRow {
    return {
      id: baseline.id,
      userId: baseline.userId,
      versionNumber: baseline.versionNumber,
      isActive: baseline.isActive,
      originalFilename: baseline.originalFilename,
      mimeType: baseline.mimeType,
      storagePath: baseline.storagePath,
      hash: baseline.hash,
      status: baseline.status,
      archivedAt: baseline.archivedAt,
      originalBaselineScore: baseline.originalBaselineScore,
      latestBaselineScore: baseline.latestBaselineScore,
      latestAssessmentId: baseline.latestAssessmentId ?? null,
      firstAnalyzedAt: baseline.firstAnalyzedAt,
      lastAnalyzedAt: baseline.lastAnalyzedAt,
      isSynthetic: baseline.isSynthetic,
      syntheticScenarioKey: baseline.syntheticScenarioKey,
      syntheticRunId: baseline.syntheticRunId,
      syntheticCreatedAt: baseline.syntheticCreatedAt,
      preserveFromCleanup: baseline.preserveFromCleanup,
      createdAt: baseline.createdAt,
      updatedAt: baseline.updatedAt,
    };
  }

  private applyBaselineLibrarySafeSelect(
    query: SelectQueryBuilder<Baseline>,
  ): SelectQueryBuilder<Baseline> {
    return query
      .select('baseline.id', 'id')
      .addSelect('baseline.userId', 'userId')
      .addSelect('baseline.versionNumber', 'versionNumber')
      .addSelect('baseline.isActive', 'isActive')
      .addSelect('baseline.originalFilename', 'originalFilename')
      .addSelect('baseline.mimeType', 'mimeType')
      .addSelect('baseline.storagePath', 'storagePath')
      .addSelect('baseline.hash', 'hash')
      .addSelect('baseline.status', 'status')
      .addSelect('baseline.archivedAt', 'archivedAt')
      .addSelect('baseline.originalBaselineScore', 'originalBaselineScore')
      .addSelect('baseline.latestBaselineScore', 'latestBaselineScore')
      .addSelect('baseline.latestAssessmentId', 'latestAssessmentId')
      .addSelect('baseline.firstAnalyzedAt', 'firstAnalyzedAt')
      .addSelect('baseline.lastAnalyzedAt', 'lastAnalyzedAt')
      .addSelect('baseline.isSynthetic', 'isSynthetic')
      .addSelect('baseline.syntheticScenarioKey', 'syntheticScenarioKey')
      .addSelect('baseline.syntheticRunId', 'syntheticRunId')
      .addSelect('baseline.syntheticCreatedAt', 'syntheticCreatedAt')
      .addSelect('baseline.preserveFromCleanup', 'preserveFromCleanup')
      .addSelect('baseline.createdAt', 'createdAt')
      .addSelect('baseline.updatedAt', 'updatedAt');
  }

  private mapRawBaselineLibraryRow(raw: BaselineLibraryRowRaw): BaselineLibraryRow {
    return {
      id: raw.id,
      userId: raw.userId,
      versionNumber: raw.versionNumber ?? 0,
      isActive: raw.isActive ?? false,
      originalFilename: raw.originalFilename,
      mimeType: raw.mimeType,
      storagePath: raw.storagePath,
      hash: raw.hash ?? null,
      status: raw.status,
      archivedAt: raw.archivedAt ?? null,
      originalBaselineScore: raw.originalBaselineScore ?? null,
      latestBaselineScore: raw.latestBaselineScore ?? null,
      latestAssessmentId: raw.latestAssessmentId ?? null,
      firstAnalyzedAt: raw.firstAnalyzedAt ?? null,
      lastAnalyzedAt: raw.lastAnalyzedAt ?? null,
      isSynthetic: raw.isSynthetic ?? false,
      syntheticScenarioKey: raw.syntheticScenarioKey ?? null,
      syntheticRunId: raw.syntheticRunId ?? null,
      syntheticCreatedAt: raw.syntheticCreatedAt ?? null,
      preserveFromCleanup: raw.preserveFromCleanup ?? false,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
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
            const revived = await manager.findOne(Baseline, {
              where: { id: existingByHash.id, userId },
              relations: ['sections'],
              order: { sections: { order: 'ASC' } },
            });

            if (!revived) {
              throw new NotFoundException('Baseline not found');
            }

            const sectionPayloads =
              parseResult?.sections?.map((section, index) => ({
                sectionType: section.sectionType ?? BaselineSectionType.OTHER,
                title: this.getSectionTitle(section.sectionType, section.title),
                content: this.sanitizeSectionContent(section.content),
                includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
                order: section.order ?? index,
              })) ?? [];

            if (sectionPayloads.length > 0 && parseResult?.ingestion) {
              await manager.delete(BaselineSection, { baselineId: revived.id });
              await this.attachEmbeddingsToSections(sectionPayloads);

              const revivedSections = sectionPayloads.map((section) =>
                manager.create(BaselineSection, {
                  ...section,
                  baselineId: revived.id,
                }),
              );
              const persistedSections = await manager.save(revivedSections);
              revived.sections = persistedSections;

              let normalization: CanonicalNormalizationResult | undefined;
              if (parseResult.ingestion.canonical) {
                normalization = normalizeExtractedToCanonicalV1(parseResult.ingestion.canonical);
                parseResult.ingestion.canonical = normalization.canonical;
              }

              const nextVersionNumber = await this.getNextBaselineVersionNumber(userId);
              const policyState = this.normalizePoliciesFromSections(
                (revived.sections ?? []) as PolicySectionInput[],
              );
              const versionHash = this.buildVersionHash(fileHash, policyState);
              const allowlistSnapshot = buildBaselineAllowlistSnapshot(
                (revived.sections ?? []).map((section) => ({
                  title: section.title,
                  content: section.content,
                  sectionType: section.sectionType ?? null,
                  sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
                })),
              );

              const versionRecord = manager.create(BaselineVersion, {
                baselineId: revived.id,
                versionNumber: nextVersionNumber,
                fileHash: versionHash,
                storagePath: revived.storagePath,
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
              await this.persistParsedBaseline(manager, revived, parseResult.ingestion);

              revived.version = nextVersionNumber;
              revived.versionNumber = nextVersionNumber;
              revived.versions = [savedVersion];

              if (normalization) {
                parseResult.ingestion.canonical = normalization.canonical;
              }
            }

            if (shouldBecomeActive) {
              await this.setSingleActiveBaseline(manager, userId, revived.id);
            }
            await manager.update(
              Baseline,
              { id: revived.id, userId },
              {
                status: BaselineStatus.ACTIVE,
                archivedAt: null,
                isActive: shouldBecomeActive ? true : revived.isActive,
                ...(typeof revived.versionNumber === 'number'
                  ? { version: revived.versionNumber, versionNumber: revived.versionNumber }
                  : {}),
              },
            );

            return {
              baseline:
                revived ??
                ({
                  ...existingByHash,
                  status: BaselineStatus.ACTIVE,
                  archivedAt: null,
                  verifiedBaseline: this.buildVerifiedBaseline({
                    sourceText: parseResult?.ingestion?.rawText ?? '',
                    ingestion: parseResult?.ingestion,
                    sections: existingByHash.sections ?? [],
                  }),
                } as Baseline),
              baselineId: existingByHash.id,
              ingestion: parseResult?.ingestion,
              verifiedBaseline: this.buildVerifiedBaseline({
                sourceText: parseResult?.ingestion?.rawText ?? '',
                ingestion: parseResult?.ingestion,
                sections: revived?.sections ?? existingByHash.sections ?? [],
              }),
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
            verifiedBaseline: this.buildVerifiedBaseline({
              sourceText: parseResult?.ingestion?.rawText ?? '',
              ingestion: parseResult?.ingestion,
              sections: existing.sections ?? [],
            }),
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
    const verifiedBaseline = this.buildVerifiedBaseline({
      sourceText: parseResult?.ingestion?.rawText ?? '',
      ingestion: parseResult?.ingestion,
      sections: sectionPayloads as unknown as BaselineSection[],
    });

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
      verifiedBaseline,
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
      verifiedBaseline: savedBaseline.verifiedBaseline ?? verifiedBaseline,
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
      verifiedBaseline: this.buildVerifiedBaseline({
        sourceText: parseResult?.ingestion?.rawText ?? '',
        ingestion: parseResult?.ingestion,
        sections: (savedBaseline.sections ?? []) as BaselineSection[],
      }),
    };
  }

  private async persistParsedBaseline(
    manager: EntityManager,
    baseline: Baseline,
    ingestion: BaselineIngestionResult,
  ) {
    const ingestedAt = new Date().toISOString();
    let parsedBaseline: any;
    try {
      parsedBaseline = BaselineSchema.parse({
        ...ingestion.canonical,
        baseline_id: baseline.id,
        source_file_id: baseline.id,
        source_format: ingestion.sourceFormat,
        ingested_at: ingestedAt,
        user_verified: false,
      });
    } catch (error) {
      // Canonical parsed baseline must be valid for ResumeV2 generation; expose a stable typed error for repair flows.
      throw new UnprocessableEntityException({
        error: {
          code: 'baseline_reparse_invalid_parsed_baseline',
          message:
            'Your baseline could not be reprocessed because the parsed resume payload is invalid. Please re-upload your resume and try again.',
          details: error instanceof Error ? error.message : String(error ?? 'unknown'),
        },
      });
    }

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
      resumeV2Json = buildValidatedResumeV2FromParsedBaseline(parsedBaseline as any, ingestion.parsedSections as any) as any;
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
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnprocessableEntityException({
        error: {
          code: 'baseline_reparse_resume_v2_invalid',
          message:
            'Your baseline could not be reprocessed into a usable Resume V2. Please re-upload your resume and try again.',
          details: error instanceof Error ? error.message : String(error ?? 'unknown'),
        },
      });
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
  ): Promise<BaselineLibraryRow[]> {
    const query = this.baselineRepository
      .createQueryBuilder('baseline')
      .select([...BASELINE_LIBRARY_SAFE_SELECT_COLUMNS])
      .where('baseline.userId = :userId', { userId });

    if (!includeArchived) {
      query.andWhere('baseline.status = :status', {
        status: BaselineStatus.ACTIVE,
      });
    }

    const baselines = await query.orderBy('baseline.updatedAt', 'DESC').getMany();

    return baselines.map((baseline) => this.mapBaselineToLibraryRow(baseline));
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

  async setCurrentBaseline(
    userId: string,
    baselineId: string,
  ): Promise<BaselineLibraryRow> {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[BASELINE][SET_CURRENT]', { baselineId, userId });
    }

    return this.baselineRepository.manager.transaction(async (manager) => {
      const baseline = await manager
        .createQueryBuilder(Baseline, 'baseline')
        .select('baseline.id', 'id')
        .addSelect('baseline.userId', 'userId')
        .addSelect('baseline.status', 'status')
        .where('baseline.id = :baselineId', { baselineId })
        .andWhere('baseline.userId = :userId', { userId })
        .getRawOne<{
          id: string;
          userId: string;
          status: BaselineStatus;
        }>();

      if (!baseline) {
        throw new NotFoundException('Baseline not found');
      }

      if (baseline.status === BaselineStatus.ARCHIVED) {
        throw new BadRequestException('Cannot set an archived baseline as current');
      }

      await manager.update(Baseline, { userId }, { isActive: false });
      await manager.update(Baseline, { id: baseline.id, userId }, { isActive: true });

      const updated = await this.applyBaselineLibrarySafeSelect(
        manager.createQueryBuilder(Baseline, 'baseline'),
      )
        .where('baseline.id = :baselineId', { baselineId: baseline.id })
        .andWhere('baseline.userId = :userId', { userId })
        .getRawOne<BaselineLibraryRowRaw>();

      if (!updated) {
        throw new NotFoundException('Baseline not found');
      }

      return this.mapRawBaselineLibraryRow(updated);
    });
  }

  private async updateBaselineStatus(
    userId: string,
    baselineId: string,
    status: BaselineStatus,
  ) {
    try {
      return await this.baselineRepository.manager.transaction(async (manager) => {
        const baseline = await this.applyBaselineLibrarySafeSelect(
          manager.createQueryBuilder(Baseline, 'baseline'),
        )
          .where('baseline.id = :baselineId', { baselineId })
          .andWhere('baseline.userId = :userId', { userId })
          .getRawOne<BaselineLibraryRowRaw>();

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

        const baselines = await this.applyBaselineLibrarySafeSelect(
          manager.createQueryBuilder(Baseline, 'baseline'),
        )
          .where('baseline.userId = :userId', { userId })
          .orderBy('baseline.createdAt', 'DESC')
          .getRawMany<BaselineLibraryRowRaw>();

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

        const updated = await this.applyBaselineLibrarySafeSelect(
          manager.createQueryBuilder(Baseline, 'baseline'),
        )
          .where('baseline.id = :baselineId', { baselineId: baseline.id })
          .andWhere('baseline.userId = :userId', { userId })
          .getRawOne<BaselineLibraryRowRaw>();

        return updated ? this.mapRawBaselineLibraryRow(updated) : this.mapRawBaselineLibraryRow(baseline);
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
  ): Promise<BaselineLibraryRow> {
    const baseline = await this.applyBaselineLibrarySafeSelect(
      this.baselineRepository.createQueryBuilder('baseline'),
    )
      .where('baseline.id = :id', { id })
      .andWhere('baseline.userId = :userId', { userId })
      .getRawOne<BaselineLibraryRowRaw>();

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    return this.mapRawBaselineLibraryRow(baseline);
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

    const baselineRow = await this.getBaselineByIdForUser(baselineId, userId);
    const result = {
      ...baselineRow,
      latestAssessmentSummary: {
        latestAssessmentId: persistedAssessment.id,
        latestAssessmentCreatedAt: persistedAssessment.createdAt,
        latestFitScore:
          typeof persistedAssessment.overallScore === 'number'
            ? persistedAssessment.overallScore
            : null,
        hasCompletedAssessment: true,
      },
    };
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
    this.logger.log('[BASELINE][REPARSE_START]', { baselineId, userId });
    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    this.logger.debug('[BASELINE][REPARSE_BASELINE_LOADED]', {
      baselineId: baseline.id,
      userId,
      sections: baseline.sections?.length ?? 0,
      storagePath: baseline.storagePath ? 'present' : 'missing',
      mimeType: baseline.mimeType ?? null,
    });

    const baselineSections = Array.isArray(baseline.sections) ? baseline.sections : [];
    const rawSection =
      baselineSections.find(
        (section) => section.sectionType === BaselineSectionType.RAW,
      ) ?? baselineSections[0];

    const fallbackRawText = (rawSection?.content ?? '').trim();
    const hasStoredSourceFile = Boolean(baseline.storagePath?.trim());
    if (!hasStoredSourceFile && !fallbackRawText) {
      throw new ConflictException({
        code: 'baseline_reparse_missing_source',
        message:
          'Your baseline cannot be reprocessed because the original resume content is missing. Please re-upload your resume and try again.',
      });
    }

    const sourceFormat = this.inferSourceFormat(baseline.mimeType);
    this.logger.debug('[BASELINE][REPARSE_REINGEST_BEGIN]', {
      baselineId: baseline.id,
      userId,
      sourceFormat,
    });
    let ingestion: BaselineIngestionResult;
    try {
      ingestion = await this.reingestFromSourceFileOrFallback(
        baseline,
        fallbackRawText,
        sourceFormat,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnprocessableEntityException({
        code: 'baseline_reparse_ingestion_failed',
        message:
          'Reprocessing failed while re-ingesting your resume content. Please try again or re-upload your resume.',
        details: error instanceof Error ? error.message : String(error ?? 'unknown'),
      });
    }
    this.logger.debug('[BASELINE][REPARSE_REINGEST_DONE]', {
      baselineId: baseline.id,
      userId,
      rawTextLength: ingestion.rawText?.length ?? 0,
      parsedSections: ingestion.parsedSections?.length ?? 0,
    });

    if (!String(ingestion.rawText ?? '').trim()) {
      throw new UnprocessableEntityException({
        code: 'baseline_reparse_empty_content',
        message:
          'Reprocessing produced empty resume content. Please re-upload your resume and try again.',
      });
    }

    let rebuiltSections: ReturnType<BaselineService['buildSections']>;
    try {
      rebuiltSections = this.buildSections(ingestion.rawText, ingestion.parsedSections);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnprocessableEntityException({
        code: 'baseline_reparse_section_rebuild_failed',
        message:
          'Reprocessing failed while rebuilding baseline sections from your resume. Please re-upload your resume and try again.',
        details: error instanceof Error ? error.message : String(error ?? 'unknown'),
      });
    }
    this.logger.debug('[BASELINE][REPARSE_SECTIONS_REBUILT]', {
      baselineId: baseline.id,
      userId,
      rebuiltSections: rebuiltSections.length,
    });

    try {
      return await this.baselineRepository.manager.transaction(async (manager) => {
        this.logger.debug('[BASELINE][REPARSE_TX_BEGIN]', {
          baselineId: baseline.id,
          userId,
        });

        await manager.delete(BaselineSection, { baselineId: baseline.id });
        this.logger.debug('[BASELINE][REPARSE_SECTIONS_DELETED]', {
          baselineId: baseline.id,
          userId,
        });

        const rebuiltEntities = rebuiltSections.map((section, index) =>
          manager.create(BaselineSection, {
            ...section,
            baselineId: baseline.id,
            order: section.order ?? index,
          }),
        );

        this.logger.debug('[BASELINE][REPARSE_EMBEDDINGS_BEGIN]', {
          baselineId: baseline.id,
          userId,
          sections: rebuiltEntities.length,
        });
        await this.attachEmbeddingsToSections(rebuiltEntities);
        this.logger.debug('[BASELINE][REPARSE_EMBEDDINGS_DONE]', {
          baselineId: baseline.id,
          userId,
        });

        await manager.save(rebuiltEntities);
        this.logger.debug('[BASELINE][REPARSE_SECTIONS_SAVED]', {
          baselineId: baseline.id,
          userId,
          sections: rebuiltEntities.length,
        });

        baseline.sections = rebuiltEntities;

        this.logger.debug('[BASELINE][REPARSE_VERSION_BEGIN]', {
          baselineId: baseline.id,
          userId,
        });
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
        this.logger.log('[BASELINE][REPARSE_VERSION_SAVED]', {
          baselineId: baseline.id,
          userId,
          baselineVersionId: savedVersion.id,
          versionNumber: nextVersionNumber,
        });

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

        this.logger.debug('[BASELINE][REPARSE_RESUMEV2_BEGIN]', {
          baselineId: baseline.id,
          userId,
          baselineVersionId: savedVersion.id,
        });
        try {
          await this.persistParsedBaseline(manager, baseline, ingestion);
        } catch (error) {
          if (error instanceof HttpException) {
            throw error;
          }
          throw new UnprocessableEntityException({
            code: 'baseline_reparse_resume_v2_failed',
            message:
              'Reprocessing failed while generating the Resume V2 baseline required for document generation. Please re-upload your resume and try again.',
            details: error instanceof Error ? error.message : String(error ?? 'unknown'),
          });
        }
        this.logger.debug('[BASELINE][REPARSE_RESUMEV2_DONE]', {
          baselineId: baseline.id,
          userId,
          baselineVersionId: savedVersion.id,
        });

        // Readiness recomputation is not performed directly in this endpoint today; it is evaluated downstream
        // from persisted ResumeV2 state and/or scoring pipelines. This breadcrumb exists to make it explicit in logs.
        this.logger.debug('[BASELINE][REPARSE_READINESS_RECOMPUTE_DEFERRED]', {
          baselineId: baseline.id,
          userId,
          baselineVersionId: savedVersion.id,
        });

        await manager.update(
          Baseline,
          { id: baseline.id, userId },
          {
            version: nextVersionNumber,
            versionNumber: nextVersionNumber,
            isActive: true,
            status: BaselineStatus.ACTIVE,
            archivedAt: null,
          },
        );

        const savedBaseline = {
          ...baseline,
          version: nextVersionNumber,
          versionNumber: nextVersionNumber,
          isActive: true,
          status: BaselineStatus.ACTIVE,
          archivedAt: null,
          versions: [savedVersion],
        } as Baseline;
        this.logger.log('[BASELINE][REPARSE_SUCCESS]', {
          baselineId: baseline.id,
          userId,
          baselineVersionId: savedVersion.id,
          versionNumber: nextVersionNumber,
        });
        return savedBaseline;
      });
    } catch (error) {
      this.logger.error('[BASELINE][REPARSE_FAILED]', {
        baselineId,
        userId,
        error: error instanceof Error ? error.message : String(error ?? 'unknown'),
        name:
          error && typeof error === 'object' && 'name' in error
            ? String((error as { name?: unknown }).name ?? 'Error')
            : 'Error',
        stack:
          error && typeof error === 'object' && 'stack' in error
            ? String((error as { stack?: unknown }).stack ?? '')
            : '',
      });
      if (!(error instanceof HttpException)) {
        throw new UnprocessableEntityException({
          code: 'baseline_reparse_persistence_failed',
          message:
            'Reprocessing failed while saving your updated baseline. Please try again or re-upload your resume.',
          details: error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
      }
      throw error;
    }
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
