import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Express } from 'express';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BaselineTextExtractor } from './baseline-text-extractor.service';
import {
  BaselineSection,
  BaselineSectionType,
  BaselineIncludePolicy,
} from './baseline-section.entity';
import { Baseline } from './baseline.entity';
import { BaselineParserService, ParsedSection } from './baseline-parser.service';
import { BaselineVersion } from './baseline-version.entity';
import { BaselineBlockPolicy } from './baseline-block-policy.entity';

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
    private readonly baselineTextExtractor: BaselineTextExtractor,
    private readonly baselineParser: BaselineParserService,
  ) {}

  private sanitizeSectionContent(content?: string | null) {
    if (!content) {
      return 'Uploaded file content';
    }

    // Strip out null bytes that can surface from binary uploads (e.g., PDFs)
    // so we do not send invalid UTF-8 to Postgres.
    return content.replace(/\u0000/g, '');
  }

  private buildSections(
    rawText: string,
    parsedSections: ParsedSection[],
  ): Partial<BaselineSection>[] {
    const sanitizedRaw = this.sanitizeSectionContent(rawText);

    const structuredSections = parsedSections.map((section, index) => ({
      sectionType: section.sectionType,
      title: section.title,
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

  private async computeFileHash(filePath: string): Promise<string> {
    try {
      const fileBuffer = await readFile(filePath);
      return createHash('sha256').update(fileBuffer).digest('hex');
    } catch {
      throw new BadRequestException('Unable to compute file hash');
    }
  }

  private buildVersionHash(baselineHash: string | null, policies: PolicyState[]) {
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

    return createHash('sha256')
      .update(JSON.stringify({ baselineHash: baselineHash ?? null, policies: normalized }))
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

  private normalizePoliciesFromSections(sections: BaselineSection[]): PolicyState[] {
    return sections.map((section, index) => ({
      baselineSectionId: section.id,
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      order: section.order ?? index,
    }));
  }

  private raiseConflict(currentVersion: BaselineVersion, hash?: string | null): never {
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
    parsedSections?: Partial<BaselineSection>[],
  ) {
    const fileHash = await this.computeFileHash(file.path);

    if (!fileHash) {
      throw new BadRequestException('Baseline file hash is required');
    }

    return this.baselineRepository.manager.transaction(async (manager) => {
      const baseline = manager.create(Baseline, {
        userId,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        storagePath: file.path,
        hash: fileHash,
        sections:
          parsedSections?.map((section, index) => ({
            sectionType: section.sectionType ?? BaselineSectionType.OTHER,
            title: section.title ?? null,
            content: this.sanitizeSectionContent(section.content),
            includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
            order: section.order ?? index,
          })) ?? [
            {
              sectionType: BaselineSectionType.OTHER,
              title: null,
              content: this.sanitizeSectionContent(),
              includePolicy: BaselineIncludePolicy.OPTIONAL,
              order: 0,
            },
          ],
      });

      const savedBaseline = await manager.save(baseline);

      // VERIFY: Persisting the initial version increments the current baseline version.
      const nextVersionNumber = (savedBaseline.version ?? 0) + 1;

      const policyState = this.normalizePoliciesFromSections(
        savedBaseline.sections ?? [],
      );
      const versionHash = this.buildVersionHash(fileHash, policyState);

      const versionRecord = manager.create(BaselineVersion, {
        baselineId: savedBaseline.id,
        versionNumber: nextVersionNumber,
        fileHash: versionHash,
        storagePath: savedBaseline.storagePath,
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

      return manager.save(savedBaseline);
    });
  }

  async listBaselinesForUser(userId: string) {
    return this.baselineRepository.find({
      where: { userId },
      relations: ['versions'],
      order: {
        createdAt: 'DESC',
        versions: { versionNumber: 'DESC', createdAt: 'DESC' },
      },
    });
  }

  async getBaselineByIdForUser(id: string, userId: string) {
    const baseline = await this.baselineRepository.findOne({
      where: { id, userId },
      relations: ['sections', 'versions'],
      order: {
        sections: {
          order: 'ASC',
        },
        versions: {
          versionNumber: 'DESC',
          createdAt: 'DESC',
        },
      },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const latestVersion =
      baseline.versions?.[0] ?? (await this.getLatestVersionForBaseline(baseline.id));

    if (latestVersion) {
      const policies = await this.baselineBlockPolicyRepository.find({
        where: { baselineVersionId: latestVersion.id },
        relations: ['baselineSection'],
        order: { order: 'ASC' },
      });

      baseline.sections = this.applyPoliciesToSections(
        baseline.sections ?? [],
        policies,
      );
    }

    return baseline;
  }

  async buildSectionsFromFile(file: Express.Multer.File) {
    const content = await this.baselineTextExtractor.extractText(file);
    const parsedSections = this.baselineParser.parseBaseline(content);

    return this.buildSections(content, parsedSections);
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

    const rawText = rawSection?.content ?? '';
    const parsedSections = this.baselineParser.parseBaseline(rawText);
    const rebuiltSections = this.buildSections(rawText, parsedSections);

    return this.baselineRepository.manager.transaction(async (manager) => {
      await manager.delete(BaselineSection, { baselineId: baseline.id });

      const rebuiltEntities = rebuiltSections.map((section, index) =>
        manager.create(BaselineSection, {
          ...section,
          baselineId: baseline.id,
          order: section.order ?? index,
        }),
      );

      await manager.save(rebuiltEntities);

      baseline.sections = rebuiltEntities as BaselineSection[];

      const latestVersion = await this.getLatestVersionForBaseline(baseline.id);
      const nextVersionNumber =
        (latestVersion?.versionNumber ?? baseline.version ?? 0) + 1;
      const policyState = this.normalizePoliciesFromSections(baseline.sections);
      const versionHash = this.buildVersionHash(baseline.hash, policyState);

      const versionRecord = manager.create(BaselineVersion, {
        baselineId: baseline.id,
        versionNumber: nextVersionNumber,
        fileHash: versionHash,
        storagePath: baseline.storagePath,
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

      return manager.save(baseline);
    });
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

    const policyState = this.normalizePoliciesFromSections(sections);
    const versionHash =
      baselineVersion.fileHash ?? this.buildVersionHash(baseline.hash, policyState);

    if (!baselineVersion.fileHash && versionHash) {
      baselineVersion.fileHash = versionHash;
      await this.baselineVersionRepository.save(baselineVersion);
    }

    return {
      baseline_version_id: baselineVersion.id,
      baseline_version_hash: versionHash ?? null,
      blocks: sections.map((section) => ({
        id: section.id,
        section_type: section.sectionType ?? BaselineSectionType.OTHER,
        title: section.title ?? null,
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

    const sectionMap = new Map(sections.map((section) => [section.id, section]));

    const updateMap = new Map<string, BaselineBlockUpdate>(
      blocks.map((block) => [block.id, block]),
    );

    for (const blockId of updateMap.keys()) {
      if (!sectionMap.has(blockId)) {
        throw new NotFoundException('Baseline block not found');
      }
    }

    const existingPolicies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: latestVersion.id },
      order: { order: 'ASC' },
    });

    const currentPolicyState: PolicyState[] =
      existingPolicies.length > 0
        ? existingPolicies.map((policy) => ({
            baselineSectionId: policy.baselineSectionId,
            includePolicy: policy.includePolicy,
            order: policy.order,
          }))
        : this.normalizePoliciesFromSections(sections);

    const currentVersionHash =
      latestVersion.fileHash ?? this.buildVersionHash(baseline.hash, currentPolicyState);

    if (requestedVersion.id !== latestVersion.id) {
      this.raiseConflict(latestVersion, currentVersionHash);
    }

    if (baselineVersionHash !== (currentVersionHash ?? '')) {
      this.raiseConflict(latestVersion, currentVersionHash);
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

    const newVersionHash = this.buildVersionHash(baseline.hash, nextPolicies);
    const nextVersionNumber =
      (latestVersion.versionNumber ?? baseline.version ?? 0) + 1;

    return this.baselineRepository.manager.transaction(async (manager) => {
      const newVersion = manager.create(BaselineVersion, {
        baselineId: baseline.id,
        versionNumber: nextVersionNumber,
        fileHash: newVersionHash,
        storagePath: baseline.storagePath,
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

        return section;
      });

      await manager.save(BaselineSection, updatedSections);
      await manager.save(baseline);

      return {
        baseline_version_id: baselineVersionId,
        updated_blocks: nextPolicies.map((policy) => ({
          id: policy.baselineSectionId,
          include_tag: policy.includePolicy,
          order_index: policy.order,
        })),
        new_version_id: savedVersion.id,
        hash: savedVersion.fileHash,
      };
    });
  }
}
