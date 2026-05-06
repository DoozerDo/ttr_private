import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaselineParsed } from './baseline-parsed.entity';
import { buildValidatedResumeV2FromParsedBaseline } from './baseline-resume-v2';

@Injectable()
export class BaselineResumeV2BackfillService {
  constructor(
    @InjectRepository(BaselineParsed)
    private readonly baselineParsedRepository: Repository<BaselineParsed>,
  ) {}

  async backfillLatestIfMissing(input: {
    baselineId: string;
  }): Promise<BaselineParsed | null> {
    const record = await this.baselineParsedRepository.findOne({
      where: { baselineId: input.baselineId },
      order: { createdAt: 'DESC' },
    });
    if (!record) return null;
    if (record.resumeV2Json && typeof record.resumeV2Json === 'object') return record;

    const parsed = record.parsedJson;
    if (!parsed || typeof parsed !== 'object') return null;

    const normalized = buildValidatedResumeV2FromParsedBaseline(parsed as any);
    record.resumeV2Json = normalized as any;
    try {
      return await this.baselineParsedRepository.save(record);
    } catch (error) {
      throw new UnprocessableEntityException({
        error: {
          code: 'baseline_resume_v2_backfill_failed',
          message: 'Could not persist the ResumeV2 backfill for this baseline.',
          details: {
            baselineId: input.baselineId,
            reason: (error as Error)?.message ?? 'unknown_error',
          },
        },
      });
    }
  }
}

