import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
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
  GapDetectionResult,
  GapDomain,
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

export interface GapEmbeddingProvider {
  isEnabled(): boolean;
  embed(text: string): Promise<number[]>;
}

export const GAP_EMBEDDING_PROVIDER = Symbol('GAP_EMBEDDING_PROVIDER');

type SectionEmbedding = {
  section: BaselineSection;
  embedding: number[];
};

@Injectable()
export class GapDetectionService {
  private readonly embeddingMatchThreshold = 0.75;

  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    @Optional()
    @Inject(GAP_EMBEDDING_PROVIDER)
    private readonly embeddingProvider?: GapEmbeddingProvider,
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

    if (!baselineVersion || !baselineVersion.baseline || baselineVersion.baseline.userId !== inputs.userId) {
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

    const normalizedSections = this.applyPoliciesToSections(sections, blockPolicies).filter(
      (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
    );

    const sectionTokens = this.buildSectionTokens(normalizedSections);
    let sectionEmbeddings = await this.buildSectionEmbeddings(normalizedSections);

    const jdItems = [
      ...(job.normalizedRequirements ?? []),
      ...(job.normalizedResponsibilities ?? []),
    ]
      .map((item) => item.trim())
      .filter(Boolean);

    const gaps: InterviewGap[] = [];

    for (const item of jdItems) {
      const jdTokens = this.tokenize(item);
      if (!jdTokens.size) {
        continue;
      }

      const match = this.findBestSectionMatch(jdTokens, sectionTokens);
      const coverage = match?.overlap ?? 0;
      const coverageRatio = jdTokens.size === 0 ? 0 : coverage / jdTokens.size;

      if (sectionEmbeddings) {
        try {
          const embeddingMatch = await this.findBestEmbeddingMatch(item, sectionEmbeddings);
          const similarity = embeddingMatch?.similarity ?? 0;
          if (similarity >= this.embeddingMatchThreshold) {
            continue;
          }
        } catch {
          sectionEmbeddings = null;
        }
      }

      if (coverageRatio >= 0.5) {
        continue;
      }

      const confidence = this.resolveConfidence(coverageRatio);

      gaps.push({
        gapId: randomUUID(),
        domain: this.inferDomain(item),
        jdExcerpt: item,
        baselineExcerpt: this.buildBaselineExcerpt(match?.section?.content ?? null),
        confidence,
      });
    }

    return {
      baselineId: baselineVersion.baselineId,
      baselineVersionId,
      jobId,
      gaps,
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
        .filter((token) => token.length >= 3),
    );
  }

  private buildSectionTokens(sections: BaselineSection[]): SectionTokens[] {
    return sections.map((section) => ({
      section,
      tokens: this.tokenize(section.content ?? ''),
    }));
  }

  private async buildSectionEmbeddings(sections: BaselineSection[]): Promise<SectionEmbedding[] | null> {
    try {
      if (!this.embeddingProvider?.isEnabled()) {
        return null;
      }

      const embeddings = await Promise.all(
        sections.map(async (section) => ({
          section,
          embedding: await this.embeddingProvider!.embed(section.content ?? ''),
        })),
      );

      return embeddings;
    } catch {
      return null;
    }
  }

  private findBestSectionMatch(jdTokens: Set<string>, sections: SectionTokens[]) {
    let bestMatch:
      | {
          section: BaselineSection;
          overlap: number;
        }
      | null = null;

    for (const candidate of sections) {
      const overlap = [...jdTokens].filter((token) => candidate.tokens.has(token)).length;

      if (!bestMatch || overlap > bestMatch.overlap) {
        bestMatch = { section: candidate.section, overlap };
      }
    }

    return bestMatch;
  }

  private async findBestEmbeddingMatch(
    jdText: string,
    sections: SectionEmbedding[],
  ): Promise<{ section: BaselineSection; similarity: number } | null> {
    if (!this.embeddingProvider) {
      return null;
    }

    const jdEmbedding = await this.embeddingProvider.embed(jdText);
    let bestMatch: { section: BaselineSection; similarity: number } | null = null;

    for (const candidate of sections) {
      const similarity = this.cosineSimilarity(jdEmbedding, candidate.embedding);

      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { section: candidate.section, similarity };
      }
    }

    return bestMatch;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) {
      return 0;
    }

    const dotProduct = a.reduce((sum, value, index) => sum + value * b[index], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  private resolveConfidence(coverageRatio: number): GapConfidence {
    if (coverageRatio === 0) {
      return 'high';
    }
    if (coverageRatio < 0.25) {
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

  private inferDomain(text: string): GapDomain {
    const value = text.toLowerCase();

    const leadershipKeywords = ['lead', 'leader', 'leadership', 'manager', 'mentor', 'coach'];
    if (leadershipKeywords.some((keyword) => value.includes(keyword))) {
      return 'leadership';
    }

    const toolingKeywords = ['sql', 'python', 'javascript', 'aws', 'gcp', 'azure', 'tool', 'framework', 'platform'];
    if (toolingKeywords.some((keyword) => value.includes(keyword))) {
      return 'tooling';
    }

    const scopeKeywords = ['scale', 'scalable', 'enterprise', 'multiple teams', 'cross-functional', 'global'];
    if (scopeKeywords.some((keyword) => value.includes(keyword))) {
      return 'scope';
    }

    const industryKeywords = ['healthcare', 'finance', 'fintech', 'ecommerce', 'retail', 'government'];
    if (industryKeywords.some((keyword) => value.includes(keyword))) {
      return 'industry';
    }

    return 'experience';
  }
}
