import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  BaselineIncludePolicy,
  BaselineSection,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { Job } from '../jobs/job.entity';
import {
  GapConfidence,
  GapDetectionDebug,
  GapDetectionResult,
  GapDomain,
  GapScoreRecord,
  InterviewGap,
} from './interview-types';

type DetectionInputs = {
  userId: string;
  jobId: string;
  baselineVersionId: string;
};

type SectionTokens = {
  section: BaselineSection;
  tokens: Set<string>;
};

const GAP_VECTOR_SIMILARITY_THRESHOLD = 0.25;
const GAP_CLUSTER_EMBEDDING_THRESHOLD = 0.82;
const GAP_CLUSTER_TOKEN_THRESHOLD = 0.5;

const TOKEN_STOPWORDS = new Set(['and', 'the', 'for', 'with', 'from', 'into', 'over', 'under']);

type GapCandidate = {
  gap: InterviewGap;
  tokens: Set<string>;
};

@Injectable()
export class GapDetectionService {
  private readonly logger = new Logger(GapDetectionService.name);
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
  ) {}

  async detectGaps(inputs: DetectionInputs): Promise<GapDetectionResult> {
    const jobId = inputs.jobId?.trim();
    const baselineVersionId = inputs.baselineVersionId?.trim();

    if (!jobId || !baselineVersionId) {
      throw new BadRequestException('jobId and baselineVersionId are required');
    }

    const job = await this.jobRepository.findOne({
      where: { id: jobId, userId: inputs.userId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId },
      relations: ['baseline'],
    });

    if (
      !baselineVersion ||
      !baselineVersion.baseline ||
      baselineVersion.baseline.userId !== inputs.userId
    ) {
      throw new NotFoundException('Baseline version not found');
    }

    const [sections, blockPolicies] = await Promise.all([
      this.baselineSectionRepository.find({
        where: { baselineId: baselineVersion.baselineId },
        order: { order: 'ASC' },
      }),
      this.baselineBlockPolicyRepository.find({
        where: { baselineVersionId },
      }),
    ]);

    const normalizedSections = this.applyPoliciesToSections(
      sections,
      blockPolicies,
    ).filter(
      (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
    );

    const sectionTokens = this.buildSectionTokens(normalizedSections);
    const jobEmbedding =
      Array.isArray(job.embedding) && job.embedding.length > 0
        ? job.embedding
        : null;
    let sectionSimilarityMap = jobEmbedding
      ? await this.buildSectionSimilarityMap(
          baselineVersion.baselineId,
          jobEmbedding,
        )
      : new Map<string, number>();

    // Unit tests use a lightweight repository mock without pgvector query support.
    // When embeddings are available, fall back to an in-memory cosine similarity map.
    if (jobEmbedding && sectionSimilarityMap.size === 0) {
      sectionSimilarityMap = this.buildInMemorySectionSimilarityMap(
        normalizedSections,
        jobEmbedding,
      );
    }

    const embeddingsUsed =
      Boolean(jobEmbedding) && sectionSimilarityMap.size > 0;

    const sectionSimilarityRecords = normalizedSections.map((section) => ({
      sectionId: section.id,
      similarity: sectionSimilarityMap.get(section.id) ?? 0,
      hasEmbedding: Array.isArray(section.embedding) && section.embedding.length > 0,
    }));

    const jdItems = [
      ...(job.normalizedRequirements ?? []),
      ...(job.normalizedResponsibilities ?? []),
    ]
      .map((item) => item.trim())
      .filter(Boolean);

    const clusteringInputs: GapCandidate[] = [];
    const gapScores: GapScoreRecord[] = [];

    for (const item of jdItems) {
      const jdTokens = this.tokenize(item);
      if (!jdTokens.size) {
        continue;
      }

      const domain = this.inferDomain(item);

      const match = this.findBestSectionMatch(jdTokens, sectionTokens);
      const coverage = match?.overlap ?? 0;
      const coverageRatio = jdTokens.size === 0 ? 0 : coverage / jdTokens.size;

      // Very short JD snippets (3 tokens or fewer) can be "covered" by a single strong keyword
      // match (e.g. "Kubernetes administration" matched by "Kubernetes").
      if (jdTokens.size <= 3 && coverage >= 1) {
        continue;
      }

      if (coverageRatio >= 0.5) {
        continue;
      }

      const matchedSectionId = match?.section?.id ?? null;
      const vectorSimilarity =
        domain === 'leadership'
          ? 0
          : matchedSectionId
            ? this.getSectionSimilarity(matchedSectionId, sectionSimilarityMap)
            : this.getBestSectionSimilarity(sectionSimilarityMap);

      if (vectorSimilarity >= GAP_VECTOR_SIMILARITY_THRESHOLD) {
        continue;
      }
      const heuristicScore = coverageRatio;
      const finalScore = this.computeFinalScore(vectorSimilarity, heuristicScore);
      const confidence = this.resolveConfidence(finalScore);

      const gap: InterviewGap = {
        gapId: randomUUID(),
        domain,
        jdExcerpt: item,
        baselineExcerpt:
          domain === 'leadership'
            ? null
            : this.buildBaselineExcerpt(match?.section?.content ?? null),
        confidence,
      };

      clusteringInputs.push({
        gap,
        tokens: jdTokens,
      });

      gapScores.push({
        gapId: gap.gapId,
        sectionId: matchedSectionId,
        vectorSimilarity,
        heuristicScore,
        finalScore,
      });
    }

    const orderedGaps = this.clusterAndOrderGaps(clusteringInputs);
    const debug: GapDetectionDebug = {
      embeddingsUsed,
      jobEmbeddingAvailable: Boolean(jobEmbedding),
      threshold: GAP_VECTOR_SIMILARITY_THRESHOLD,
      sectionSimilarities: sectionSimilarityRecords,
      gapScores,
    };

    return {
      baselineId: baselineVersion.baselineId,
      baselineVersionId,
      jobId,
      gaps: orderedGaps,
      debug,
    };
  }

  private applyPoliciesToSections(
    sections: BaselineSection[],
    policies: BaselineBlockPolicy[],
  ): BaselineSection[] {
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

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9+]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .filter((token) => !TOKEN_STOPWORDS.has(token)),
    );
  }

  private buildInMemorySectionSimilarityMap(
    sections: BaselineSection[],
    jobEmbedding: number[],
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const section of sections) {
      const embedding = (section as unknown as { embedding?: number[] | null }).embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        continue;
      }
      const similarity = this.cosineSimilarity(jobEmbedding, embedding);
      if (Number.isFinite(similarity)) {
        map.set(section.id, this.clampSimilarity(similarity));
      }
    }
    return map;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const length = Math.min(a.length, b.length);
    if (length === 0) return 0;
    let dot = 0;
    let aNorm = 0;
    let bNorm = 0;
    for (let i = 0; i < length; i += 1) {
      const av = Number(a[i] ?? 0);
      const bv = Number(b[i] ?? 0);
      dot += av * bv;
      aNorm += av * av;
      bNorm += bv * bv;
    }
    if (aNorm === 0 || bNorm === 0) return 0;
    return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
  }

  private buildSectionTokens(sections: BaselineSection[]): SectionTokens[] {
    return sections.map((section) => ({
      section,
      tokens: this.tokenize(section.content ?? ''),
    }));
  }

  private findBestSectionMatch(
    jdTokens: Set<string>,
    sections: SectionTokens[],
  ) {
    let bestMatch: { section: BaselineSection; overlap: number } | null = null;

    for (const candidate of sections) {
      const overlap = [...jdTokens].filter((token) =>
        candidate.tokens.has(token),
      ).length;
      if (!bestMatch || overlap > bestMatch.overlap) {
        bestMatch = { section: candidate.section, overlap };
      }
    }

    if (!bestMatch || bestMatch.overlap === 0) {
      return null;
    }

    return bestMatch;
  }

  private resolveConfidence(score: number): GapConfidence {
    if (score === 0) {
      return 'high';
    }
    if (score < GAP_VECTOR_SIMILARITY_THRESHOLD) {
      return 'medium';
    }
    return 'low';
  }

  private buildBaselineExcerpt(content: string | null): string | null {
    if (!content) {
      return null;
    }

    const trimmed = content.trim();
    if (trimmed.length <= 300) {
      return trimmed;
    }

    return `${trimmed.slice(0, 297)}...`;
  }

  private clusterAndOrderGaps(candidates: GapCandidate[]): InterviewGap[] {
    if (!candidates.length) {
      return [];
    }

    const clusters: GapCandidate[][] = [];

    for (const candidate of candidates) {
      const bestClusterIndex = this.findBestClusterIndex(candidate, clusters);
      if (bestClusterIndex === -1) {
        clusters.push([candidate]);
      } else {
        clusters[bestClusterIndex].push(candidate);
      }
    }

    return clusters.flatMap((cluster) => cluster.map((entry) => entry.gap));
  }

  private findBestClusterIndex(
    candidate: GapCandidate,
    clusters: GapCandidate[][],
  ): number {
    let bestIndex = -1;
    let bestSimilarity = 0;

    clusters.forEach((cluster, index) => {
      const seed = cluster[0];
      const similarity = this.resolveSimilarity(candidate, seed);
      if (
        similarity >= GAP_CLUSTER_EMBEDDING_THRESHOLD &&
        similarity > bestSimilarity
      ) {
        bestSimilarity = similarity;
        bestIndex = index;
      }
    });

    if (bestIndex !== -1) {
      return bestIndex;
    }

    clusters.forEach((cluster, index) => {
      const seed = cluster[0];
      const similarity = this.tokenSimilarity(candidate.tokens, seed.tokens);
      if (
        similarity >= GAP_CLUSTER_TOKEN_THRESHOLD &&
        similarity > bestSimilarity
      ) {
        bestSimilarity = similarity;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  private resolveSimilarity(_a: GapCandidate, _b: GapCandidate): number {
    return 0;
  }

  private tokenSimilarity(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) {
      return 0;
    }

    const shared = [...a].filter((token) => b.has(token)).length;
    return shared / Math.max(a.size, b.size);
  }

  private getSectionSimilarity(
    sectionId: string | null,
    map: Map<string, number>,
  ): number {
    if (!sectionId) {
      return 0;
    }

    return this.clampSimilarity(map.get(sectionId) ?? 0);
  }

  private getBestSectionSimilarity(map: Map<string, number>): number {
    let best = 0;
    for (const value of map.values()) {
      if (value > best) {
        best = value;
      }
    }
    return this.clampSimilarity(best);
  }

  private computeFinalScore(
    vectorSimilarity: number,
    heuristicScore: number,
  ): number {
    const vector = this.clampSimilarity(vectorSimilarity);
    const heuristic = Math.min(Math.max(heuristicScore, 0), 1);
    return vector * 0.6 + heuristic * 0.4;
  }

  private clampSimilarity(value: number): number {
    if (Number.isNaN(value)) {
      return 0;
    }
    return Math.min(Math.max(value, 0), 1);
  }

  private async buildSectionSimilarityMap(
    baselineId: string,
    jobEmbedding: number[],
  ): Promise<Map<string, number>> {
    try {
      const vectorLiteral = `[${jobEmbedding.join(',')}]`;

      const rows = await this.baselineSectionRepository
        .createQueryBuilder('section')
        .select(['section.id'])
        .addSelect(
          `section.embedding <=> :jobEmbedding::vector`,
          'distance',
        )
        .where('section.baselineId = :baselineId', { baselineId })
        .setParameter('jobEmbedding', vectorLiteral)
        .getRawMany<{
          section_id: string;
          distance: string | number | null;
        }>();

      const map = new Map<string, number>();

      for (const row of rows) {
        const rawDistance = row.distance;
        if (rawDistance === null || rawDistance === undefined) {
          continue;
        }
        const distance =
          typeof rawDistance === 'string'
            ? parseFloat(rawDistance)
            : Number(rawDistance);
        if (!Number.isFinite(distance)) {
          continue;
        }
        map.set(row.section_id, this.convertDistanceToSimilarity(distance));
      }

      return map;
    } catch (error) {
      this.logger.warn(
        'Vector similarity query failed; falling back to heuristics',
        this.describeError(error),
      );
      return new Map();
    }
  }

  private convertDistanceToSimilarity(distance: number): number {
    return this.clampSimilarity(1 - distance);
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private inferDomain(text: string): GapDomain {
    const value = text.toLowerCase();

    if (
      ['lead', 'leader', 'leadership', 'manager', 'mentor', 'coach'].some((k) =>
        value.includes(k),
      )
    ) {
      return 'leadership';
    }

    if (
      [
        'sql',
        'python',
        'javascript',
        'aws',
        'gcp',
        'azure',
        'tool',
        'framework',
        'platform',
      ].some((k) => value.includes(k))
    ) {
      return 'tooling';
    }

    if (
      [
        'scale',
        'scalable',
        'enterprise',
        'multiple teams',
        'cross-functional',
        'global',
      ].some((k) => value.includes(k))
    ) {
      return 'scope';
    }

    if (
      [
        'healthcare',
        'finance',
        'fintech',
        'ecommerce',
        'retail',
        'government',
      ].some((k) => value.includes(k))
    ) {
      return 'industry';
    }

    return 'experience';
  }
}
