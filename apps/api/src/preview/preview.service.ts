import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { EmbeddingService } from '../ai/embedding.service';

type RateLimitState = {
  count: number;
  windowStartMs: number;
};

const MAX_TOTAL_CHARS = 100_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'your',
  'will',
  'you',
  'are',
  'our',
  'their',
  'has',
  'had',
  'its',
  'was',
  'were',
  'not',
  'but',
  'about',
  'into',
  'than',
  'then',
  'they',
  'them',
  'his',
  'her',
  'she',
  'him',
  'who',
  'what',
  'when',
  'where',
  'how',
  'any',
  'all',
  'can',
  'may',
  'per',
  'via',
  'use',
  'using',
  'used',
  'role',
  'job',
  'description',
]);

type SenioritySignalLevel = 'strong' | 'partial' | 'weak';

@Injectable()
export class PreviewService {
  private readonly rateLimitByIp = new Map<string, RateLimitState>();

  constructor(private readonly embeddingService: EmbeddingService) {}

  async computeCompatibilityScore(input: {
    resumeText: string;
    jobDescriptionText: string;
    ipAddress: string;
    mode: 'live-preview' | 'final-preview';
  }): Promise<number> {
    this.assertRateLimit(input.ipAddress);

    const resumeText = this.normalize(input.resumeText);
    const jobDescriptionText = this.normalize(input.jobDescriptionText);

    if (resumeText.length + jobDescriptionText.length > MAX_TOTAL_CHARS) {
      throw new Error('Request exceeds 100k characters');
    }

    const hasResume = resumeText.length > 0;

    const semanticScore = hasResume
      ? await this.computeSemanticScore(resumeText, jobDescriptionText)
      : await this.computeJobOnlySemanticScore(jobDescriptionText);

    const keywordScore = hasResume
      ? this.computeKeywordScore(resumeText, jobDescriptionText)
      : this.computeJobOnlyKeywordScore(jobDescriptionText);
    const experienceScore = hasResume
      ? this.computeExperienceScore(resumeText, jobDescriptionText)
      : this.computeJobOnlyExperienceScore(jobDescriptionText);

    const rawScore =
      semanticScore * 0.6 + keywordScore * 0.3 + experienceScore * 0.1;
    const normalized = this.clamp(rawScore / 100, 0, 1);
    const calibrated = 1 / (1 + Math.exp(-4 * (normalized - 0.5)));
    const clampedScore = this.clamp(calibrated * 100, 25, 92);
    const modeAdjustedScore =
      input.mode === 'live-preview' ? Math.max(clampedScore, 42) : clampedScore;

    return Math.round(modeAdjustedScore);
  }

  private normalize(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  }

  private async computeSemanticScore(
    resumeText: string,
    jobDescriptionText: string,
  ): Promise<number> {
    const [resumeEmbedding, jdEmbedding] = await Promise.all([
      this.embeddingService.embed(resumeText),
      this.embeddingService.embed(jobDescriptionText),
    ]);
    const semanticSimilarity =
      resumeEmbedding && jdEmbedding
        ? this.cosineSimilarity(resumeEmbedding, jdEmbedding)
        : 0;
    return this.clamp(semanticSimilarity * 100, 0, 100);
  }

  private async computeJobOnlySemanticScore(jobDescriptionText: string): Promise<number> {
    const jdEmbedding = await this.embeddingService.embed(jobDescriptionText);
    if (!jdEmbedding || !jdEmbedding.length) {
      return 52;
    }

    const nonZeroCount = jdEmbedding.filter((value) => Math.abs(value) > 1e-6).length;
    const richness = nonZeroCount / jdEmbedding.length;
    return this.clamp(45 + richness * 30, 45, 75);
  }

  private computeKeywordScore(resumeText: string, jobDescriptionText: string): number {
    const jobTokens = this.tokenize(jobDescriptionText);
    const uniqueJobTokens = Array.from(new Set(jobTokens)).slice(0, 30);
    if (!uniqueJobTokens.length) {
      return 0;
    }

    const resumeTokenSet = new Set(this.tokenize(resumeText));
    const matched = uniqueJobTokens.filter((token) => resumeTokenSet.has(token))
      .length;
    const coverage = matched / uniqueJobTokens.length;
    return this.clamp(coverage * 100, 0, 100);
  }

  private computeExperienceScore(resumeText: string, jobDescriptionText: string): number {
    const resumeLevel = this.detectSeniorityLevel(resumeText);
    const jobLevel = this.detectSeniorityLevel(jobDescriptionText);
    const signal = this.resolveExperienceSignal(resumeLevel, jobLevel);
    return signal * 100;
  }

  private computeJobOnlyKeywordScore(jobDescriptionText: string): number {
    const jobTokens = this.tokenize(jobDescriptionText);
    const uniqueJobTokens = Array.from(new Set(jobTokens)).slice(0, 30);
    if (!uniqueJobTokens.length) {
      return 45;
    }

    const lengthRatio = uniqueJobTokens.length / 30;
    return this.clamp(45 + lengthRatio * 35, 45, 80);
  }

  private computeJobOnlyExperienceScore(jobDescriptionText: string): number {
    const seniority = this.detectSeniorityLevel(jobDescriptionText);
    if (seniority === 'strong') {
      return 78;
    }
    if (seniority === 'partial') {
      return 64;
    }
    return 48;
  }

  private detectSeniorityLevel(text: string): SenioritySignalLevel {
    const normalized = text.toLowerCase();
    const yearsMatches = normalized.match(/\b([0-9]{1,2})\+?\s*years?\b/g) ?? [];
    const hasDirector = /\b(director|head of)\b/.test(normalized);
    const hasLeadOrManager = /\b(lead|manager|senior)\b/.test(normalized);

    if (hasDirector || yearsMatches.length >= 2) {
      return 'strong';
    }
    if (hasLeadOrManager || yearsMatches.length === 1) {
      return 'partial';
    }
    return 'weak';
  }

  private resolveExperienceSignal(
    resumeLevel: SenioritySignalLevel,
    jobLevel: SenioritySignalLevel,
  ): number {
    if (resumeLevel === jobLevel) {
      return 1.0;
    }

    const rank = { weak: 0, partial: 1, strong: 2 } as const;
    const delta = Math.abs(rank[resumeLevel] - rank[jobLevel]);
    if (delta === 1) {
      return 0.6;
    }
    return 0.3;
  }

  private cosineSimilarity(left: number[], right: number[]): number {
    if (!left.length || !right.length || left.length !== right.length) {
      return 0;
    }

    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let i = 0; i < left.length; i += 1) {
      dot += left[i] * right[i];
      leftNorm += left[i] * left[i];
      rightNorm += right[i] * right[i];
    }

    if (!leftNorm || !rightNorm) {
      return 0;
    }

    return this.clamp(dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)), 0, 1);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private assertRateLimit(ipAddress: string) {
    const now = Date.now();
    const key = ipAddress || 'unknown';
    const current = this.rateLimitByIp.get(key);

    if (!current || now - current.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
      this.rateLimitByIp.set(key, { count: 1, windowStartMs: now });
      return;
    }

    if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    current.count += 1;
    this.rateLimitByIp.set(key, current);
  }
}
