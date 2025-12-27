import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import {
  SearchSet,
  SearchSetSeniority,
  SearchSetWorkMode,
} from './search-set.entity';
import { SearchSetsService } from './search-sets.service';

type SearchSetRunResult = {
  jobId: string;
  title: string | null;
  company: string | null;
  sourceUrl: string | null;
  fitScore: number | null;
  verdict: FitAssessment['verdict'] | null;
};

@Injectable()
export class SearchSetsRunnerService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    private readonly searchSetsService: SearchSetsService,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
  ) {}

  async runSearchSet(searchSetId: string, userId: string, limit = 10) {
    const searchSet = await this.searchSetsService.getSearchSetForUser(
      searchSetId,
      userId,
    );

    if (!searchSet.isActive) {
      return [];
    }

    const jobs = await this.jobRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const filteredJobs = jobs.filter((job) =>
      this.matchesSearchSet(job, searchSet),
    );
    const cappedLimit = Math.min(Math.max(limit ?? 10, 1), 10);
    const selectedJobs = filteredJobs.slice(0, cappedLimit);

    if (selectedJobs.length === 0) {
      return [];
    }

    const latestAssessments = await this.loadLatestAssessments(
      selectedJobs.map((job) => job.id),
      userId,
    );

    return selectedJobs.map((job) => {
      const assessment = latestAssessments.get(job.id);
      return {
        jobId: job.id,
        title: job.title,
        company: job.company,
        sourceUrl: job.sourceUrl,
        fitScore: assessment?.overallScore ?? null,
        verdict: assessment?.verdict ?? null,
      } satisfies SearchSetRunResult;
    });
  }

  private matchesSearchSet(job: Job, searchSet: SearchSet) {
    if (!this.matchesTitlePatterns(job.title, searchSet.titlePatterns)) {
      return false;
    }

    if (!this.matchesSeniority(job, searchSet.seniority)) {
      return false;
    }

    if (!this.matchesWorkMode(job, searchSet.workMode)) {
      return false;
    }

    if (!this.matchesIndustry(job, searchSet.industry)) {
      return false;
    }

    return true;
  }

  private matchesTitlePatterns(title: string | null, patterns: string[]) {
    if (!patterns || patterns.length === 0) {
      return true;
    }

    const normalizedTitle = (title ?? '').toLowerCase();
    return patterns.some((pattern) =>
      normalizedTitle.includes(pattern.toLowerCase()),
    );
  }

  private inferSeniority(title: string | null): SearchSetSeniority | null {
    if (!title) return null;

    const normalized = title.toLowerCase();

    if (/\b(chief|c[et]o|executive|vp|vice president|director|head)\b/.test(normalized)) {
      return SearchSetSeniority.EXECUTIVE;
    }

    if (/\b(principal|staff|lead)\b/.test(normalized)) {
      return SearchSetSeniority.LEAD;
    }

    if (/\b(senior|sr\.?)\b/.test(normalized)) {
      return SearchSetSeniority.SENIOR;
    }

    if (/\b(mid|level ii|level 2|ii)\b/.test(normalized)) {
      return SearchSetSeniority.MID;
    }

    if (/\b(entry|junior|intern|apprentice|i)\b/.test(normalized)) {
      return SearchSetSeniority.ENTRY;
    }

    return null;
  }

  private matchesSeniority(job: Job, seniority: SearchSetSeniority | null) {
    if (!seniority || seniority === SearchSetSeniority.ANY) {
      return true;
    }

    const inferred = this.inferSeniority(job.title);
    if (!inferred) {
      return false;
    }

    return inferred === seniority;
  }

  private inferWorkMode(job: Job): SearchSetWorkMode | null {
    const normalizedText = `${job.title ?? ''} ${job.rawDescription ?? ''}`
      .toLowerCase()
      .trim();

    if (!normalizedText) {
      return null;
    }

    if (normalizedText.includes('remote')) {
      return SearchSetWorkMode.REMOTE;
    }

    if (normalizedText.includes('hybrid')) {
      return SearchSetWorkMode.HYBRID;
    }

    if (
      normalizedText.includes('onsite') ||
      normalizedText.includes('on-site') ||
      normalizedText.includes('on site')
    ) {
      return SearchSetWorkMode.ONSITE;
    }

    return null;
  }

  private matchesWorkMode(job: Job, workMode: SearchSetWorkMode | null) {
    if (!workMode || workMode === SearchSetWorkMode.ANY) {
      return true;
    }

    const inferred = this.inferWorkMode(job);
    if (!inferred) {
      return false;
    }

    return inferred === workMode;
  }

  private matchesIndustry(job: Job, industries: string[]) {
    if (!industries || industries.length === 0) {
      return true;
    }

    const haystack = `${job.company ?? ''} ${job.rawDescription ?? ''}`.toLowerCase();
    return industries.some((industry) =>
      haystack.includes(industry.toLowerCase()),
    );
  }

  private async loadLatestAssessments(jobIds: string[], userId: string) {
    const query = this.fitAssessmentRepository
      .createQueryBuilder('assessment')
      .where('assessment.userId = :userId', { userId })
      .andWhere('assessment.jobId IN (:...jobIds)', { jobIds })
      .orderBy('assessment.createdAt', 'DESC');

    const assessments = await query.getMany();
    const latest = new Map<string, FitAssessment>();

    for (const assessment of assessments) {
      if (!latest.has(assessment.jobId)) {
        latest.set(assessment.jobId, assessment);
      }
    }

    return latest;
  }
}
