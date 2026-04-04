import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import {
  BetaFeedback,
  BetaFeedbackCategory,
  BetaFeedbackSeverity,
} from './beta-feedback.entity';
import { CreateBetaFeedbackDto } from './dto/create-beta-feedback.dto';
import { ListBetaFeedbackDto } from './dto/list-beta-feedback.dto';

export function classifyBetaFeedbackCategory(input: {
  title: string;
  where: string;
  actual: string;
  expected: string;
  notes?: string | null;
}): BetaFeedbackCategory {
  const haystack = [
    input.title,
    input.where,
    input.actual,
    input.expected,
    input.notes ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (haystack.includes('score too high') || haystack.includes('score too low')) {
    return BetaFeedbackCategory.SCORING_ISSUE;
  }

  if (
    haystack.includes('made up') ||
    haystack.includes('invented') ||
    haystack.includes('hallucinated')
  ) {
    return BetaFeedbackCategory.HALLUCINATION;
  }

  if (haystack.includes('cover letter')) {
    if (
      haystack.includes('format') ||
      haystack.includes('spacing') ||
      haystack.includes('layout')
    ) {
      return BetaFeedbackCategory.FORMATTING_COVER_LETTER;
    }
  }

  if (
    haystack.includes('bullet') ||
    haystack.includes('format') ||
    haystack.includes('spacing')
  ) {
    return BetaFeedbackCategory.FORMATTING_RESUME;
  }

  if (
    haystack.includes('confusing') ||
    haystack.includes('not sure what to do')
  ) {
    return BetaFeedbackCategory.UX_CONFUSION;
  }

  if (
    (haystack.includes('button') ||
      haystack.includes('click') ||
      haystack.includes('route') ||
      haystack.includes('page')) &&
    (haystack.includes('broken') ||
      haystack.includes('not working') ||
      haystack.includes('goes nowhere') ||
      haystack.includes('wrong page') ||
      haystack.includes('404'))
  ) {
    return BetaFeedbackCategory.NAVIGATION_BREAK;
  }

  if (haystack.includes('missing') || haystack.includes('not included')) {
    return BetaFeedbackCategory.DATA_MISSING;
  }

  return BetaFeedbackCategory.OTHER;
}

type BetaFeedbackSummary = {
  totalCount: number;
  bySeverity: Record<BetaFeedbackSeverity, number>;
  byCategory: Record<BetaFeedbackCategory, number>;
  topRecurringTitles: Array<{ title: string; count: number }>;
};

@Injectable()
export class BetaFeedbackService {
  constructor(
    @InjectRepository(BetaFeedback)
    private readonly betaFeedbackRepo: Repository<BetaFeedback>,
  ) {}

  async create(payload: CreateBetaFeedbackDto, user?: AuthUserDto) {
    const category = classifyBetaFeedbackCategory({
      title: payload.title,
      where: payload.where,
      actual: payload.actual,
      expected: payload.expected,
      notes: payload.notes,
    });

    const entity = this.betaFeedbackRepo.create({
      title: payload.title.trim(),
      where: payload.where.trim(),
      actual: payload.actual.trim(),
      expected: payload.expected.trim(),
      severity: payload.severity,
      category,
      jobDescription: payload.jobDescription?.trim() || null,
      notes: payload.notes?.trim() || null,
      screenshotUrl: payload.screenshotUrl?.trim() || null,
      userId: user?.id ?? null,
    });

    return this.betaFeedbackRepo.save(entity);
  }

  async findAll(filters?: ListBetaFeedbackDto) {
    const query = this.betaFeedbackRepo
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.user', 'user')
      .orderBy('feedback.createdAt', 'DESC');

    if (filters?.severity) {
      query.andWhere('feedback.severity = :severity', { severity: filters.severity });
    }
    if (filters?.category) {
      query.andWhere('feedback.category = :category', { category: filters.category });
    }

    return query.getMany();
  }

  async getSummary(): Promise<BetaFeedbackSummary> {
    const all = await this.betaFeedbackRepo.find({
      select: ['title', 'severity', 'category'],
    });

    const bySeverity: Record<BetaFeedbackSeverity, number> = {
      [BetaFeedbackSeverity.BLOCKER]: 0,
      [BetaFeedbackSeverity.MAJOR]: 0,
      [BetaFeedbackSeverity.MINOR]: 0,
    };

    const byCategory: Record<BetaFeedbackCategory, number> = {
      [BetaFeedbackCategory.SCORING_ISSUE]: 0,
      [BetaFeedbackCategory.HALLUCINATION]: 0,
      [BetaFeedbackCategory.FORMATTING_RESUME]: 0,
      [BetaFeedbackCategory.FORMATTING_COVER_LETTER]: 0,
      [BetaFeedbackCategory.UX_CONFUSION]: 0,
      [BetaFeedbackCategory.NAVIGATION_BREAK]: 0,
      [BetaFeedbackCategory.DATA_MISSING]: 0,
      [BetaFeedbackCategory.OTHER]: 0,
    };

    const titleCounts = new Map<string, number>();
    for (const item of all) {
      bySeverity[item.severity] += 1;
      byCategory[item.category] += 1;
      const normalizedTitle = item.title.trim().toLowerCase();
      if (!normalizedTitle) continue;
      titleCounts.set(normalizedTitle, (titleCounts.get(normalizedTitle) ?? 0) + 1);
    }

    const topRecurringTitles = Array.from(titleCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }));

    return {
      totalCount: all.length,
      bySeverity,
      byCategory,
      topRecurringTitles,
    };
  }
}

