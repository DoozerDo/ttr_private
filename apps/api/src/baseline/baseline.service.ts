import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { Repository } from 'typeorm';
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
  ) {}

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
          content: section.content ?? 'Uploaded file content',
          includePolicy: section.includePolicy ?? 'optional',
          orderIndex: section.orderIndex ?? index,
        })) ?? [
          {
            type: 'other',
            content: 'Uploaded file content',
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

  async buildSectionsFromFile(filePath: string, fallbackFilename: string) {
    // TODO: Replace with real parsing. For now, read what we can and store as a single section.
    let content = `Uploaded file: ${fallbackFilename}`;

    try {
      const buffer = await readFile(filePath, 'utf8');
      if (buffer.trim()) {
        content = buffer.slice(0, 4000);
      }
    } catch {
      // ignore parse errors and keep fallback content
    }

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
