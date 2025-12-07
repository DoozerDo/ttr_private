import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Express } from 'express';
import { BaselineTextExtractor } from './baseline-text-extractor.service';
import { BaselineSection } from './baseline-section.entity';
import { Baseline } from './baseline.entity';

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
    private readonly baselineTextExtractor: BaselineTextExtractor,
  ) {}

  private sanitizeSectionContent(content?: string | null) {
    if (!content) {
      return 'Uploaded file content';
    }

    // Strip out null bytes that can surface from binary uploads (e.g., PDFs)
    // so we do not send invalid UTF-8 to Postgres.
    return content.replace(/\u0000/g, '');
  }

  async createBaseline(
    userId: string,
    file: FileMetadata,
    parsedSections?: Partial<BaselineSection>[],
  ) {
    const baseline = this.baselineRepository.create({
      userId,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      storagePath: file.path,
      hash: null,
      sections:
        parsedSections?.map((section, index) => ({
          type: section.type ?? 'other',
          content: this.sanitizeSectionContent(section.content),
          includePolicy: section.includePolicy ?? 'optional',
          orderIndex: section.orderIndex ?? index,
        })) ?? [
          {
            type: 'other',
            content: this.sanitizeSectionContent(),
            includePolicy: 'optional',
            orderIndex: 0,
          },
        ],
    });

    return this.baselineRepository.save(baseline);
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
          orderIndex: 'ASC',
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

    return [
      {
        type: 'other',
        content,
        includePolicy: 'optional',
        orderIndex: 0,
      } as Partial<BaselineSection>,
    ];
  }
}
