import { Injectable, NotFoundException } from '@nestjs/common';
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

export type FileMetadata = {
  originalname: string;
  mimetype: string;
  path: string;
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

  private async computeFileHash(filePath: string): Promise<string | null> {
    try {
      const fileBuffer = await readFile(filePath);
      return createHash('sha256').update(fileBuffer).digest('hex');
    } catch {
      // VERIFY: Decide whether a missing hash should block baseline persistence.
      return null;
    }
  }

  async createBaseline(
    userId: string,
    file: FileMetadata,
    parsedSections?: Partial<BaselineSection>[],
  ) {
    const fileHash = await this.computeFileHash(file.path);

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

      const versionRecord = manager.create(BaselineVersion, {
        baselineId: savedBaseline.id,
        versionNumber: nextVersionNumber,
        // VERIFY: Hash storage is currently tied to the baseline hash field.
        fileHash: fileHash ?? savedBaseline.hash,
        storagePath: savedBaseline.storagePath,
      });

      await manager.save(versionRecord);

      savedBaseline.version = nextVersionNumber;

      return manager.save(savedBaseline);
    });
  }

  async listBaselinesForUser(userId: string) {
    return this.baselineRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
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

    await this.baselineSectionRepository.delete({ baselineId: baseline.id });

    baseline.sections = rebuiltSections as BaselineSection[];
    return this.baselineRepository.save(baseline);
  }
}
