import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { FitScoringService } from '../analysis/fit-scoring.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
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
  applyUrl: string | null;
  sourceUrl: string | null;
  fitScore: number | null;
  verdict: FitAssessment['verdict'] | null;
  dimensionScores: FitAssessment['dimensionScores'] | null;
};

type BaselineContext = {
  baseline: Baseline;
  baselineVersion: BaselineVersion;
  sections: BaselineSection[];
};

interface ScoredJob {
  job: Job;
  overallScore: number | null;
  verdict: FitAssessment['verdict'] | null;
  dimensionScores: FitAssessment['dimensionScores'] | null;
}

@Injectable()
export class SearchSetsRunnerService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    private readonly searchSetsService: SearchSetsService,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    private readonly fitScoringService: FitScoringService,
  ) {}

  async runSearchSet(
    searchSetId: string,
    userId: string,
    baselineVersionId: string,
    limit?: number,
  ): Promise<SearchSetRunResult[]> {
    const normalizedBaselineVersionId = baselineVersionId?.trim();
    if (!normalizedBaselineVersionId) {
      throw new BadRequestException(
        'baselineVersionId is required to run a search set',
      );
    }

    const searchSet = await this.searchSetsService.getSearchSetForUser(
      searchSetId,
      userId,
    );

    if (!searchSet.isActive) {
      return [];
    }

    const baselineContext = await this.loadBaselineForVersion(
      userId,
      normalizedBaselineVersionId,
    );

    const jobs = await this.jobRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const matchedJobs = jobs.filter((job) => this.matchesSearchSet(job, searchSet));

    if (!matchedJobs.length) {
      await this.recordRunSafely(searchSet, normalizedBaselineVersionId, 0);
      return [];
    }

    const latestAssessments = await this.loadLatestAssessments(
      matchedJobs.map((job) => job.id),
      userId,
      baselineContext.baseline.id,
      baselineContext.baselineVersion.versionNumber ?? null,
    );

    const scoredJobs = await Promise.all(
      matchedJobs.map(async (job) => {
        const assessment = latestAssessments.get(job.id);
        if (assessment) {
          return {
            job,
            overallScore: assessment.overallScore,
            verdict: assessment.verdict,
            dimensionScores: assessment.dimensionScores ?? null,
          };
        }

        return {
          job,
          ...(await this.computeFitSnapshot(job, baselineContext)),
        };
      }),
    );

    const limitCount = this.computeResultLimit(limit, matchedJobs.length);

    const sorted = scoredJobs
      .map((entry) => ({
        ...entry,
        sortScore: typeof entry.overallScore === 'number' ? entry.overallScore : -1,
      }))
      .sort((a, b) => {
        if (b.sortScore !== a.sortScore) {
          return b.sortScore - a.sortScore;
        }

        const timeA = a.job.createdAt?.getTime() ?? 0;
        const timeB = b.job.createdAt?.getTime() ?? 0;

        if (timeB !== timeA) {
          return timeB - timeA;
        }

        return a.job.id.localeCompare(b.job.id);
      })
      .slice(0, limitCount);

    const results = sorted.map((entry) => ({
      jobId: entry.job.id,
      title: entry.job.title,
      company: entry.job.company,
      applyUrl: this.deriveApplyUrl(entry.job),
      sourceUrl: entry.job.sourceUrl,
      fitScore: entry.overallScore ?? null,
      verdict: entry.verdict ?? null,
      dimensionScores: entry.dimensionScores ?? null,
    }));

    await this.recordRunSafely(searchSet, normalizedBaselineVersionId, results.length);

    return results;
  }

  private computeResultLimit(requested: number | undefined, available: number) {
    if (available === 0) return 0;
    const minLimit = available >= 5 ? 5 : available;
    const normalized =
      typeof requested === 'number' ? requested : 10;
    const limited = Math.min(Math.max(normalized, minLimit), 10);
    return Math.min(limited, available);
  }

  private async loadBaselineForVersion(
    userId: string,
    baselineVersionId: string,
  ): Promise<BaselineContext> {
    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId },
      relations: ['baseline'],
    });

    if (!baselineVersion || !baselineVersion.baseline) {
      throw new NotFoundException('Baseline version not found');
    }

    if (baselineVersion.baseline.userId !== userId) {
      throw new NotFoundException('Baseline version not found');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineVersion.baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const policies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: baselineVersion.id },
      order: { order: 'ASC' },
    });

    const sections = this.applyPoliciesToSections(
      baseline.sections ?? [],
      policies,
    );

    const additionSections =
      (baselineVersion.verifiedAdditions ?? []).map((content, index) =>
        ({
          id: `addition-${index}`,
          baselineId: baseline.id,
          sectionType: BaselineSectionType.OTHER,
          title: 'Verified addition',
          content,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: sections.length + index,
        } as BaselineSection),
      ) ?? [];

    return {
      baseline,
      baselineVersion,
      sections: [...sections, ...additionSections],
    };
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

  private async loadLatestAssessments(
    jobIds: string[],
    userId: string,
    baselineId: string,
    baselineVersion: number | null,
  ) {
    if (!jobIds.length) {
      return new Map<string, FitAssessment>();
    }

    const query = this.fitAssessmentRepository
      .createQueryBuilder('assessment')
      .where('assessment.userId = :userId', { userId })
      .andWhere('assessment.jobId IN (:...jobIds)', { jobIds })
      .andWhere('assessment.baselineId = :baselineId', { baselineId });

    if (baselineVersion !== null && baselineVersion !== undefined) {
      query.andWhere('assessment.baselineVersion = :baselineVersion', {
        baselineVersion,
      });
    }

    query.orderBy('assessment.createdAt', 'DESC');

    const assessments = await query.getMany();
    const latest = new Map<string, FitAssessment>();

    for (const assessment of assessments) {
      if (!latest.has(assessment.jobId)) {
        latest.set(assessment.jobId, assessment);
      }
    }

    return latest;
  }

  private async computeFitSnapshot(
    job: Job,
    baselineContext: BaselineContext,
  ): Promise<Pick<ScoredJob, 'overallScore' | 'verdict' | 'dimensionScores'>> {
    const sections = baselineContext.sections.map((section) => ({
      type: section.sectionType,
      content: section.content,
    }));

    const baselineVersionNumber =
      baselineContext.baselineVersion.versionNumber ??
      baselineContext.baseline.version ??
      null;

    const result = await this.fitScoringService.score({
      job: {
        title: job.title,
        company: job.company,
        rawDescription: job.rawDescription,
        normalizedResponsibilities: job.normalizedResponsibilities ?? [],
        normalizedRequirements: job.normalizedRequirements ?? [],
        sourceUrl: job.sourceUrl,
      },
      baseline: {
        version: baselineVersionNumber,
        sections,
      },
      verifiedAdditions: baselineContext.baselineVersion.verifiedAdditions ?? [],
    });

    return {
      overallScore: result.overallScore,
      verdict: result.persistenceVerdict,
      dimensionScores: result.dimensionScores ?? null,
    };
  }

  private matchesSearchSet(job: Job, searchSet: SearchSet) {
    if (!this.matchesTitlePatterns(job.title, searchSet.titlePatterns)) {
      return false;
    }
    if (!this.matchesSeniorities(job, searchSet.seniority)) {
      return false;
    }
    if (!this.matchesWorkModes(job, searchSet.workMode)) {
      return false;
    }
    if (!this.matchesIndustry(job, searchSet.industry)) {
      return false;
    }
    if (!this.matchesLocation(job, searchSet.location)) {
      return false;
    }
    return true;
  }

  private matchesTitlePatterns(title: string | null, patterns: string[]) {
    if (!patterns || patterns.length === 0) {
      return true;
    }
    const normalized = (title ?? '').toLowerCase();
    return patterns.some((pattern) =>
      normalized.includes(pattern.toLowerCase()),
    );
  }

  private matchesSeniorities(job: Job, seniorities: SearchSetSeniority[] = []) {
    if (!seniorities.length) {
      return true;
    }
    const inferred = this.inferSeniority(job.title);
    if (!inferred) return false;
    return seniorities.includes(inferred);
  }

  private matchesWorkModes(job: Job, workModes: SearchSetWorkMode[] = []) {
    if (!workModes.length) {
      return true;
    }
    const inferred = this.inferWorkMode(job);
    if (!inferred) return false;
    return workModes.includes(inferred);
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

  private matchesLocation(job: Job, location?: string | null) {
    const target = location?.trim().toLowerCase();
    if (!target) return true;
    const haystack = `${job.title ?? ''} ${job.company ?? ''} ${job.rawDescription ?? ''}`.toLowerCase();
    return haystack.includes(target);
  }

  private inferSeniority(title: string | null): SearchSetSeniority | null {
    if (!title) return null;

    const normalized = title.toLowerCase();

    if (
      /\b(chief|c[et]o|executive|vp|vice president|director|head)\b/.test(
        normalized,
      )
    ) {
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

  private deriveApplyUrl(job: Job) {
    const candidateUrls = [
      (job as any).applyUrl,
      (job as any).apply_url,
      (job as any).postingUrl,
      (job as any).posting_url,
      (job as any).jobUrl,
      (job as any).job_url,
      job.sourceUrl,
    ];

    for (const candidate of candidateUrls) {
      const normalized = this.normalizeUrl(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private normalizeUrl(raw: unknown) {
    if (typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
      const parsed = new URL(trimmed);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol === 'http:' || protocol === 'https:') {
        return parsed.toString();
      }
    } catch {
      // Ignore invalid URLs.
    }

    return null;
  }

  private async recordRunSafely(
    searchSet: SearchSet,
    baselineVersionId: string,
    resultCount: number,
  ) {
    try {
      await this.searchSetsService.recordRunMetadata(
        searchSet,
        baselineVersionId,
        resultCount,
      );
    } catch {
      // Persisting run metadata should not block delivering results.
    }
  }
}
