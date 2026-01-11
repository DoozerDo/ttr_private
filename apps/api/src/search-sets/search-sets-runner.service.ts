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
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { JobsService } from '../jobs/jobs.service';
import { JobSourceRegistry } from '../job-sources/job-source-registry.service';
import { JobSourceInput, ParsedJob } from '../job-sources/job-source.types';
import { createHash } from 'node:crypto';
import {
  SearchSetRunResultSummary,
  SearchSetRunSourceSnapshot,
} from './search-set-run.entity';
import { SearchSetRunRecordInput, SearchSetRunsService } from './search-set-runs.service';
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

type SearchSetRunMetadata = {
  usedProviderDiscovery: boolean;
  providerId: string | null;
  sourceSnapshot: SearchSetRunSourceSnapshot | null;
  runInputHash: string | null;
};

type SearchSetRunResponse = {
  results: SearchSetRunResult[];
  metadata: SearchSetRunMetadata;
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
    private readonly jobsService: JobsService,
    private readonly searchSetsService: SearchSetsService,
    private readonly jobSourceRegistry: JobSourceRegistry,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    private readonly fitScoringService: FitScoringService,
    private readonly searchSetRunsService: SearchSetRunsService,
  ) {}

  private readonly detailFetchDelayMs = 250;

  async runSearchSet(
    searchSetId: string,
    userId: string,
    baselineVersionId: string,
    limit?: number,
  ): Promise<SearchSetRunResponse> {
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
      return {
        results: [],
        metadata: {
          usedProviderDiscovery: false,
          providerId: null,
          sourceSnapshot: null,
          runInputHash: null,
        },
      };
    }

    const baselineContext = await this.loadBaselineForVersion(
      userId,
      normalizedBaselineVersionId,
    );

    if (searchSet.sourceType && searchSet.sourceUrl) {
      return this.runProviderSearchSet(
        searchSet,
        userId,
        normalizedBaselineVersionId,
        baselineContext,
        limit,
      );
    }

    return this.runLegacySearchSet(
      searchSet,
      userId,
      normalizedBaselineVersionId,
      baselineContext,
      limit,
    );
  }

  private async runLegacySearchSet(
    searchSet: SearchSet,
    userId: string,
    baselineVersionId: string,
    baselineContext: BaselineContext,
    limit?: number,
  ): Promise<SearchSetRunResponse> {
    const jobs = await this.jobRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const matchedJobs = jobs.filter((job) => this.matchesSearchSet(job, searchSet));

    if (!matchedJobs.length) {
      await this.recordRunSafely(searchSet, baselineVersionId, 0, {
        searchSetId: searchSet.id,
        baselineVersionId,
        sourceSnapshot: null,
        runInputHash: null,
        usedProviderDiscovery: false,
        topResults: [],
      });

      return {
        results: [],
        metadata: {
          usedProviderDiscovery: false,
          providerId: null,
          sourceSnapshot: null,
          runInputHash: null,
        },
      };
    }

    const { results, ranked } = await this.scoreJobsWithBaseline(
      matchedJobs,
      userId,
      baselineContext,
      limit,
    );

    const topResults = this.summarizeTopResults(ranked);

    await this.recordRunSafely(searchSet, baselineVersionId, results.length, {
      searchSetId: searchSet.id,
      baselineVersionId,
      sourceSnapshot: null,
      runInputHash: null,
      usedProviderDiscovery: false,
      topResults,
    });

    return {
      results,
      metadata: {
        usedProviderDiscovery: false,
        providerId: null,
        sourceSnapshot: null,
        runInputHash: null,
      },
    };
  }

  private async runProviderSearchSet(
    searchSet: SearchSet,
    userId: string,
    baselineVersionId: string,
    baselineContext: BaselineContext,
    limit?: number,
  ): Promise<SearchSetRunResponse> {
    const providerInput: JobSourceInput = {
      sourceType: searchSet.sourceType!,
      sourceUrl: searchSet.sourceUrl!,
      options: searchSet.sourceOptions ?? null,
    };

    const provider = this.jobSourceRegistry.findProvider(providerInput);
    if (!provider) {
      throw new BadRequestException('No provider available for this source type.');
    }

    const listings = await provider.fetchListings(providerInput);
    const maxListings = this.computeMaxListings(searchSet);
    const slicedListings = listings.slice(0, maxListings);
    const fetchedAt = new Date().toISOString();
    const sourceSnapshot: SearchSetRunSourceSnapshot = {
      sourceUrl: searchSet.sourceUrl ?? null,
      providerId: provider.id,
      listingCount: listings.length,
      fetchedAt,
    };

    const discoveredJobs: Job[] = [];
    const seenJobIds = new Set<string>();

    for (const listing of slicedListings) {
      try {
        const detail = await provider.fetchJobDetail(listing);
        const parsed = provider.parseJob(detail);
        const job = await this.ingestOrReuseJob(userId, provider.id, parsed);
        if (!job) continue;
        if (!this.matchesSearchSet(job, searchSet)) continue;
        if (seenJobIds.has(job.id)) continue;
        seenJobIds.add(job.id);
        discoveredJobs.push(job);
      } catch {
        // skip failing listings without breaking the run
      } finally {
        await this.delay(this.detailFetchDelayMs);
      }
    }

    const runInputHash = this.computeRunInputHash(
      baselineVersionId,
      sourceSnapshot,
      searchSet.sourceOptions,
    );

    if (!discoveredJobs.length) {
      await this.recordRunSafely(searchSet, baselineVersionId, 0, {
        searchSetId: searchSet.id,
        baselineVersionId,
        sourceSnapshot,
        runInputHash,
        usedProviderDiscovery: true,
        topResults: [],
      });

      return {
        results: [],
        metadata: {
          usedProviderDiscovery: true,
          providerId: provider.id,
          sourceSnapshot,
          runInputHash,
        },
      };
    }

    const { results, ranked } = await this.scoreJobsWithBaseline(
      discoveredJobs,
      userId,
      baselineContext,
      limit,
    );

    const topResults = this.summarizeTopResults(ranked);

    await this.recordRunSafely(searchSet, baselineVersionId, results.length, {
      searchSetId: searchSet.id,
      baselineVersionId,
      sourceSnapshot,
      runInputHash,
      usedProviderDiscovery: true,
      topResults,
    });

    return {
      results,
      metadata: {
        usedProviderDiscovery: true,
        providerId: provider.id,
        sourceSnapshot,
        runInputHash,
      },
    };
  }

  private async scoreJobsWithBaseline(
    jobs: Job[],
    userId: string,
    baselineContext: BaselineContext,
    limit?: number,
  ): Promise<{ results: SearchSetRunResult[]; ranked: ScoredJob[] }> {
    if (!jobs.length) {
      return { results: [], ranked: [] };
    }

    const latestAssessments = await this.loadLatestAssessments(
      jobs.map((job) => job.id),
      userId,
      baselineContext.baseline.id,
      baselineContext.baselineVersion.versionNumber ?? null,
    );

    const scoredJobs = await Promise.all(
      jobs.map(async (job) => {
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

    const limitCount = this.computeResultLimit(limit, jobs.length);

    const sorted = scoredJobs
      .map((entry) => ({
        ...entry,
        sortScore:
          typeof entry.overallScore === 'number' ? entry.overallScore : -1,
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

    return { results, ranked: sorted };
  }

  private summarizeTopResults(ranked: ScoredJob[]): SearchSetRunResultSummary[] {
    return ranked.map((entry) => ({
      jobId: entry.job.id,
      fitScore: entry.overallScore ?? null,
      verdict: entry.verdict ?? null,
    }));
  }

  private computeMaxListings(searchSet: SearchSet): number {
    const candidate = searchSet.sourceOptions?.maxListings;
    const parsed =
      typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string'
        ? Number(candidate)
        : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(Math.max(Math.floor(parsed), 1), 200);
    }
    return 50;
  }

  private computeRunInputHash(
    baselineVersionId: string,
    sourceSnapshot: SearchSetRunSourceSnapshot,
    options?: Record<string, unknown> | null,
  ): string {
    const payload = this.normalizeForHash({
      baselineVersionId,
      sourceSnapshot,
      sourceOptions: options ?? null,
    });

    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private normalizeForHash(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeForHash(item));
    }

    if (value && typeof value === 'object') {
      const sorted: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([a], [b]) => a.localeCompare(b),
      );
      for (const [key, entryValue] of entries) {
        sorted[key] = this.normalizeForHash(entryValue);
      }
      return sorted;
    }

    return value;
  }

  private async ingestOrReuseJob(
    userId: string,
    providerId: string,
    parsed: ParsedJob,
  ): Promise<Job | null> {
    const canonicalUrl =
      this.normalizeUrl(parsed.applyUrl ?? parsed.sourceUrl) ?? null;
    const dedupeHash = this.computeDedupeHash(parsed);

    const existing = await this.findDuplicateJob({
      userId,
      providerId,
      externalId: parsed.externalId,
      canonicalUrl,
      dedupeHash,
    });

    if (existing) {
      return existing;
    }

    try {
      return await this.jobsService.createJob(userId, {
        title: parsed.title,
        company: parsed.company ?? null,
        rawDescription: parsed.descriptionText,
        sourceUrl: parsed.sourceUrl,
        responsibilities: parsed.responsibilities,
        requirements: parsed.requirements,
        jdIngestionMethod: JobIngestionMethod.SOURCE_PROVIDER,
        sourceProviderId: providerId,
        sourceExternalId: parsed.externalId,
        canonicalUrl,
        dedupeHash,
      });
    } catch {
      return null;
    }
  }

  private async findDuplicateJob(params: {
    userId: string;
    providerId: string;
    externalId?: string;
    canonicalUrl?: string | null;
    dedupeHash?: string;
  }): Promise<Job | null> {
    if (params.externalId) {
      const match = await this.jobRepository.findOne({
        where: {
          userId: params.userId,
          jdIngestionMethod: JobIngestionMethod.SOURCE_PROVIDER,
          sourceProviderId: params.providerId,
          sourceExternalId: params.externalId,
        },
      });
      if (match) return match;
    }

    if (params.canonicalUrl) {
      const byUrl = await this.jobRepository.findOne({
        where: { userId: params.userId, canonicalUrl: params.canonicalUrl },
      });
      if (byUrl) return byUrl;
    }

    if (params.dedupeHash) {
      const byHash = await this.jobRepository.findOne({
        where: { userId: params.userId, dedupeHash: params.dedupeHash },
      });
      if (byHash) return byHash;
    }

    return null;
  }

  private computeDedupeHash(parsed: ParsedJob) {
    const payload = `${parsed.descriptionText ?? ''}|${parsed.title ?? ''}|${
      parsed.company ?? ''
    }`;
    return createHash('sha256').update(payload).digest('hex');
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async recordRunSafely(
    searchSet: SearchSet,
    baselineVersionId: string,
    resultCount: number,
    runRecord: SearchSetRunRecordInput,
  ) {
    try {
      await this.searchSetsService.recordRunMetadata(searchSet, baselineVersionId, resultCount);
    } catch {
      // Intentional swallow
    }

    try {
      await this.searchSetRunsService.recordRun(runRecord);
    } catch {
      // Do not block results on record saving
    }
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
}
