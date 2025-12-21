import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
} from '../baseline/baseline-section.entity';
import { Job } from '../jobs/job.entity';

export type AnalysisRequest = {
  baselineId: string;
  jobId?: string;
  jobDescription?: string;
};

export type AnalysisResult = {
  ok: boolean;
  baselineId: string;
  score: number;
  strengths: string[];
  gaps: string[];
  summary: string;
};

@Injectable()
export class AnalysisService {
  constructor(
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
  ) {}

  private normalizeKeywords(text: string) {
    const tokens = text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length >= 3) ?? [];

    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }

    return frequencies;
  }

  private sortByFrequency(values: Map<string, number>, items: string[]) {
    return [...items].sort((a, b) => {
      const delta = (values.get(b) ?? 0) - (values.get(a) ?? 0);
      if (delta !== 0) return delta;
      return a.localeCompare(b);
    });
  }

  private buildBaselineText(sections: BaselineSection[]) {
    return sections
      .filter((section) => section.includePolicy !== BaselineIncludePolicy.NEVER)
      .map((section) => section.content)
      .join('\n');
  }

  async analyzeForUser(userId: string, payload: AnalysisRequest): Promise<AnalysisResult> {
    const baselineId = payload.baselineId?.trim();
    if (!baselineId) {
      throw new BadRequestException('baselineId is required');
    }

    const hasJobId = Boolean(payload.jobId?.trim());
    const hasJobDescription = Boolean(payload.jobDescription?.trim());

    if (!hasJobId && !hasJobDescription) {
      throw new BadRequestException('jobId or jobDescription is required');
    }

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
        where: { baselineId: baseline.id },
        order: { order: 'ASC' },
      });
    }

    const jobDescription = hasJobId
      ? (await this.jobRepository.findOne({
          where: { id: payload.jobId?.trim(), userId },
        }))?.rawDescription
      : payload.jobDescription?.trim();

    if (!jobDescription) {
      throw new NotFoundException('Job not found');
    }

    const baselineText = this.buildBaselineText(baseline.sections ?? []);
    const baselineKeywords = this.normalizeKeywords(baselineText);
    const jobKeywords = this.normalizeKeywords(jobDescription);

    const baselineSet = new Set(baselineKeywords.keys());
    const jobSet = new Set(jobKeywords.keys());

    const overlap = [...jobSet].filter((keyword) => baselineSet.has(keyword));
    const gaps = [...jobSet].filter((keyword) => !baselineSet.has(keyword));

    const overlapSorted = this.sortByFrequency(jobKeywords, overlap);
    const gapsSorted = this.sortByFrequency(jobKeywords, gaps);

    const total = jobSet.size;
    const matched = overlap.length;
    const score = total === 0 ? 0 : Math.round((matched / total) * 100);

    const strengths = overlapSorted.slice(0, 8);
    const gapList = gapsSorted.slice(0, 8);

    const summary =
      total === 0
        ? 'No keywords found in the job description.'
        : `Matched ${matched} of ${total} key terms from the job description.`;

    return {
      ok: true,
      baselineId: baseline.id,
      score,
      strengths,
      gaps: gapList,
      summary,
    };
  }
}
