import { createHash } from 'node:crypto';
import { FitAssessmentVerdict } from '../../analysis/fit-assessment.entity';
import { GapEmbeddingProvider } from '../../interviews/gap-detection.service';
import {
  FitScoreInput,
  FitScoreResult,
  FitScoreOptions,
  DimensionWeightOverrides,
  FitScoreDebugPayload,
  FitScoreDimensionScores,
  FitScoreDebugDimensionDetail,
} from './fit-score.types';
import {
  normalizeText,
  countWords,
  tokenize,
  clamp,
  mapSimilarityToScore,
  buildJobPromptText,
} from './fit-score.utils';
import { evaluateToolCoverage } from './tool-extractor';
import { buildStrengths, buildGaps } from './fit-score.explain';
import { verdictFromScore } from './fit-verdict';
import type { FitScoreVerdictLabel } from './fit-verdict';

const EXPERIENCE_SECTION_TYPES = ['EXPERIENCE', 'PROJECT', 'SUMMARY'];
const CX_PHRASES = [
  'customer experience',
  'cx operations',
  'customer support operations',
  'support operations',
];
const LEADERSHIP_MARKERS = [
  'manage',
  'managed',
  'lead',
  'led',
  'director',
  'senior manager',
  'global',
  'cross-functional',
  'stakeholder',
  'coaching',
];
const STRATEGIC_CUES = [
  'strategy',
  'strategic',
  'roadmap',
  'vision',
  'portfolio',
  'planning',
  'architecture',
];
const STRONG_INDUSTRY_MARKERS = ['security', 'saas', 'b2b', 'enterprise'];
const INCOMPATIBLE_INDUSTRY_MAP: Record<string, string[]> = {
  healthcare: ['finance', 'banking', 'regulated'],
  finance: ['healthcare', 'gaming', 'consumer'],
  government: ['gaming'],
  consumer: ['enterprise', 'b2b', 'saas'],
  gaming: ['regulated', 'government'],
};

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'their',
  'they',
  'this',
  'to',
  'we',
  'with',
  'will',
  'you',
  'your',
]);

const DEFAULT_WEIGHTS: Record<keyof FitScoreDimensionScores, number> = {
  experienceAlignment: 0.3,
  leadershipLevel: 0.25,
  strategicTacticalFit: 0.2,
  industryContext: 0.15,
  technicalPlatformFit: 0.1,
};

const combineSections = (
  sections: FitScoreInput['baseline']['sections'],
  types?: string[],
) =>
  sections
    .filter((section) => section.content)
    .filter((section) => {
      if (!types?.length) return true;
      const type = (section.type ?? '').toUpperCase();
      return Boolean(type && types.includes(type));
    })
    .map((section) => section.content)
    .join('\n');

const hashForCache = (text: string) => createHash('sha256').update(text).digest('hex');

export class FitScoreInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitScoreInputError';
  }
}

type DimensionWithDetail = {
  score: number;
  detail: FitScoreDebugDimensionDetail;
};

type TechnicalDimensionResult = DimensionWithDetail & {
  missingRequiredTools: string[];
};

export class FitScoreEngine {
  private readonly embeddingProvider?: GapEmbeddingProvider;
  private readonly embeddingsEnabled: boolean;
  private readonly embeddingCache = new Map<string, number[]>();
  private readonly embeddingModel: string;

  constructor(embeddingProvider?: GapEmbeddingProvider) {
    this.embeddingProvider = embeddingProvider;
    this.embeddingsEnabled = Boolean(this.embeddingProvider?.isEnabled?.());
    this.embeddingModel =
      (this.embeddingProvider as unknown as { modelName?: string })?.modelName ??
      (this.embeddingProvider as unknown as { model?: string })?.model ??
      'default';
  }

  async score(input: FitScoreInput, options?: FitScoreOptions): Promise<FitScoreResult> {
    const jobSelection = this.selectJobText(input.job);
    if (jobSelection.wordCount < 300) {
      throw new FitScoreInputError('Job text must contain at least 300 words for reliable scoring.');
    }

    const baselineText = combineSections(input.baseline.sections);
    const baselineWordCount = countWords(baselineText);
    const baselineExperienceText = combineSections(
      input.baseline.sections,
      EXPERIENCE_SECTION_TYPES,
    );

    const experience = await this.scoreExperienceAlignment(
      jobSelection.text,
      baselineExperienceText,
      baselineText,
    );
    const leadership = await this.scoreLeadershipLevel(jobSelection.text, baselineExperienceText);
    const strategic = await this.scoreStrategicFit(jobSelection.text, baselineText);
    const industry = await this.scoreIndustryContext(jobSelection.text, baselineText);
    const technical = await this.scoreTechnicalPlatformFit(jobSelection.text, baselineText);

    const dimensionScores: FitScoreDimensionScores = {
      experienceAlignment: experience.score,
      leadershipLevel: leadership.score,
      strategicTacticalFit: strategic.score,
      industryContext: industry.score,
      technicalPlatformFit: technical.score,
    };

    const appliedWeights = this.applyDimensionWeights(options?.weights);
    const weightSum =
      Object.values(appliedWeights).reduce((total, value) => total + value, 0) || 1;
    const baseRawScore = clamp(
      Math.round(
        (dimensionScores.experienceAlignment * appliedWeights.experienceAlignment +
          dimensionScores.leadershipLevel * appliedWeights.leadershipLevel +
          dimensionScores.strategicTacticalFit * appliedWeights.strategicTacticalFit +
          dimensionScores.industryContext * appliedWeights.industryContext +
          dimensionScores.technicalPlatformFit * appliedWeights.technicalPlatformFit) /
          weightSum,
      ),
    );
    const signalBoost = this.hasStrongSignal(dimensionScores) ? 20 : 0;
    const rawScore = clamp(baseRawScore + signalBoost);

    const missingRequiredToolsCount = technical.missingRequiredTools.length;
    const penalty = Math.min(10, missingRequiredToolsCount * 3);
    let finalScore = rawScore - penalty;
    let leadershipOverrideApplied = false;

    if (dimensionScores.leadershipLevel >= 80 && dimensionScores.strategicTacticalFit >= 75) {
      finalScore = Math.max(finalScore, 70);
      leadershipOverrideApplied = true;
    }

    finalScore = clamp(finalScore);

    const verdictLabel = verdictFromScore(finalScore);
    const strengths = buildStrengths(jobSelection.text, baselineText, dimensionScores);
    const gaps = buildGaps(technical.missingRequiredTools, dimensionScores);
    const summary =
      'Weighted fit based on leadership, experience alignment, strategy, industry context, and tools. Tools are a modest factor; missing required tools apply a bounded penalty.';

    const debug: FitScoreDebugPayload | undefined = options?.debug
      ? {
          weights: appliedWeights,
          rawScore,
          signalBoost,
          finalScore,
          missingRequiredToolsCount,
          missingRequiredToolsPenalty: penalty,
          leadershipOverrideApplied,
          chosenTextSource: jobSelection.source,
          jobWordCount: jobSelection.wordCount,
          baselineWordCount,
          verdict: verdictLabel,
          dimensionDetails: {
            experienceAlignment: {
              score: dimensionScores.experienceAlignment,
              semanticScore: experience.detail.semanticScore,
              keywordBoost: experience.detail.keywordBoost,
            },
            leadershipLevel: {
              score: dimensionScores.leadershipLevel,
              semanticScore: leadership.detail.semanticScore,
              structuredScore: leadership.detail.structuredScore,
            },
            strategicTacticalFit: {
              score: dimensionScores.strategicTacticalFit,
              semanticScore: strategic.detail.semanticScore,
              keywordBoost: strategic.detail.keywordBoost,
            },
            industryContext: {
              score: dimensionScores.industryContext,
              semanticScore: industry.detail.semanticScore,
              keywordBoost: industry.detail.keywordBoost,
              fallbackScore: industry.detail.fallbackScore,
            },
            technicalPlatformFit: {
              score: dimensionScores.technicalPlatformFit,
              semanticScore: technical.detail.semanticScore,
              keywordBoost: technical.detail.keywordBoost,
              fallbackScore: technical.detail.fallbackScore,
            },
          },
        }
      : undefined;

    return {
      overallScore: finalScore,
      rawScore,
      verdict: verdictLabel,
      persistenceVerdict: this.mapPersistenceVerdict(verdictLabel),
      dimensionScores,
      strengths,
      gaps,
      summary,
      missingRequiredTools: technical.missingRequiredTools,
      missingRequiredToolsCount,
      missingRequiredToolsPenalty: penalty,
      leadershipOverrideApplied,
      complianceFlags: [],
      debug,
    };
  }

  private applyDimensionWeights(
    overrides?: DimensionWeightOverrides | null,
  ): Record<keyof FitScoreDimensionScores, number> {
    const weights: Record<keyof FitScoreDimensionScores, number> = {
      experienceAlignment: DEFAULT_WEIGHTS.experienceAlignment,
      leadershipLevel: DEFAULT_WEIGHTS.leadershipLevel,
      strategicTacticalFit: DEFAULT_WEIGHTS.strategicTacticalFit,
      industryContext: DEFAULT_WEIGHTS.industryContext,
      technicalPlatformFit: DEFAULT_WEIGHTS.technicalPlatformFit,
    };

    (Object.keys(weights) as Array<keyof FitScoreDimensionScores>).forEach((dimension) => {
      weights[dimension] = weights[dimension] * (overrides?.[dimension] ?? 1);
    });

    return weights;
  }

  private selectJobText(job: FitScoreInput['job']) {
    const override = job.jobTextOverride?.trim();
    if (override) {
      return {
        text: override,
        wordCount: countWords(override),
        source: 'rawDescription',
      };
    }
    const jobPrompt = buildJobPromptText(job);
    return {
      text: jobPrompt.text,
      wordCount: jobPrompt.wordCount,
      source: jobPrompt.source,
    };
  }

  private async scoreExperienceAlignment(
    jobText: string,
    baselineExperienceText: string,
    baselineText: string,
  ): Promise<DimensionWithDetail> {
    const semanticScore = this.referenceCoverage(jobText, baselineExperienceText);
    const cxBoost = this.computeCxBoost(jobText, baselineText);
    const finalScore = clamp(semanticScore + cxBoost);

    return {
      score: finalScore,
      detail: {
        score: finalScore,
        semanticScore,
        keywordBoost: cxBoost,
      },
    };
  }

  private computeCxBoost(jobText: string, baselineText: string) {
    const normalizedJob = normalizeText(jobText);
    const normalizedBaseline = normalizeText(baselineText);
    const matches = CX_PHRASES.filter(
      (phrase) => normalizedJob.includes(phrase) && normalizedBaseline.includes(phrase),
    ).length;
    return Math.min(10, matches * 4);
  }

  private async scoreLeadershipLevel(
    jobText: string,
    baselineLeadershipText: string,
  ): Promise<DimensionWithDetail> {
    const semanticScore = this.referenceCoverage(jobText, baselineLeadershipText);

    const normalizedJob = normalizeText(jobText);
    const normalizedBaseline = normalizeText(baselineLeadershipText);
    const jobCount = LEADERSHIP_MARKERS.filter((marker) => normalizedJob.includes(marker)).length;
    const baselineCount = LEADERSHIP_MARKERS.filter((marker) =>
      normalizedBaseline.includes(marker),
    ).length;
    const structuredScore =
      jobCount === 0 ? 65 : clamp(Math.min(baselineCount / jobCount, 1) * 100);
    const finalScore = clamp(Math.round(semanticScore * 0.7 + structuredScore * 0.3));

    return {
      score: finalScore,
      detail: {
        score: finalScore,
        semanticScore,
        structuredScore,
      },
    };
  }

  private async scoreStrategicFit(jobText: string, baselineText: string): Promise<DimensionWithDetail> {
    const semanticScore = this.referenceCoverage(jobText, baselineText);

    const normalizedJob = normalizeText(jobText);
    const normalizedBaseline = normalizeText(baselineText);
    const matchCount = STRATEGIC_CUES.filter(
      (cue) => normalizedJob.includes(cue) && normalizedBaseline.includes(cue),
    ).length;
    const keywordBoost = Math.min(10, matchCount * 3);
    const finalScore = clamp(semanticScore + keywordBoost);

    return {
      score: finalScore,
      detail: {
        score: finalScore,
        semanticScore,
        keywordBoost,
      },
    };
  }

  private async scoreIndustryContext(jobText: string, baselineText: string): Promise<DimensionWithDetail> {
    const normalizedJob = normalizeText(jobText);
    const normalizedBaseline = normalizeText(baselineText);

    let keywordScore = 50;
    let strongMatches = 0;
    let incompatiblePenalty = 0;

    STRONG_INDUSTRY_MARKERS.forEach((marker) => {
      if (normalizedJob.includes(marker)) {
        if (normalizedBaseline.includes(marker)) {
          keywordScore += 10;
          strongMatches += 1;
        }
        const conflicts = INCOMPATIBLE_INDUSTRY_MAP[marker] ?? [];
        if (conflicts.some((conflict) => normalizedBaseline.includes(conflict))) {
          incompatiblePenalty = -10;
        }
      }
    });

    keywordScore = Math.min(keywordScore, 90);

    const semanticFallback = Math.round(
      (await this.computeSemanticSimilarity(jobText, baselineText)) * 100,
    );

    const blendedScore =
      strongMatches >= 2
        ? clamp(keywordScore + incompatiblePenalty)
        : clamp(Math.round(keywordScore * 0.6 + semanticFallback * 0.4) + incompatiblePenalty);

    return {
      score: blendedScore,
      detail: {
        score: blendedScore,
        semanticScore: semanticFallback,
        keywordBoost: keywordScore,
        fallbackScore: semanticFallback,
      },
    };
  }

  private async scoreTechnicalPlatformFit(
    jobText: string,
    baselineText: string,
  ): Promise<TechnicalDimensionResult> {
    const coverage = evaluateToolCoverage(jobText, baselineText);
    const finalScore = clamp(
      Math.round(coverage.requiredCoverage * 70 + coverage.preferredCoverage * 30),
    );
    return {
      score: finalScore,
      missingRequiredTools: coverage.missingRequired,
      detail: {
        score: finalScore,
        semanticScore: Math.round(coverage.requiredCoverage * 100),
        keywordBoost: Math.round(coverage.preferredCoverage * 100),
        fallbackScore: coverage.missingRequired.length,
      },
    };
  }

  private mapPersistenceVerdict(label: FitScoreVerdictLabel): FitAssessmentVerdict {
    if (label === 'Apply') {
      return FitAssessmentVerdict.APPLY;
    }
    if (label === 'Consider') {
      return FitAssessmentVerdict.CONSIDER;
    }
    return FitAssessmentVerdict.SKIP;
  }

  private async computeSemanticSimilarity(textA: string, textB: string): Promise<number> {
    if (!textA || !textB) return 0;
    const [firstEmbedding, secondEmbedding] = await Promise.all([
      this.embedWithCache(textA),
      this.embedWithCache(textB),
    ]);
    if (firstEmbedding && secondEmbedding) {
      return this.cosineSimilarity(firstEmbedding, secondEmbedding);
    }
    return this.lexicalSimilarity(textA, textB);
  }

  private async embedWithCache(text: string): Promise<number[] | null> {
    if (!this.embeddingsEnabled || !this.embeddingProvider) {
      return null;
    }
    const key = `${this.embeddingModel}:${hashForCache(text)}`;
    if (this.embeddingCache.has(key)) {
      return this.embeddingCache.get(key) ?? null;
    }
    try {
      const embedding = await this.embeddingProvider.embed(text);
      this.embeddingCache.set(key, embedding);
      return embedding;
    } catch {
      return null;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) {
      return 0;
    }
    const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
    if (!magnitudeA || !magnitudeB) {
      return 0;
    }
    return dot / (magnitudeA * magnitudeB);
  }

  private lexicalSimilarity(textA: string, textB: string): number {
    const tokensA = new Set(tokenize(textA));
    const tokensB = new Set(tokenize(textB));
    if (!tokensA.size || !tokensB.size) {
      return 0;
    }
    const overlap = [...tokensA].filter((token) => tokensB.has(token)).length;
    const referenceSize = tokensB.size || tokensA.size;
    return overlap / Math.max(referenceSize, 1);
  }

  private normalizedTokens(text: string) {
    return tokenize(text).filter((token) => !STOPWORDS.has(token));
  }

  private referenceCoverage(jobText: string, baselineText: string): number {
    const normalizedJob = normalizeText(jobText);
    if (!normalizedJob) return 0;
    const baselineTokens = new Set(this.normalizedTokens(baselineText));
    if (!baselineTokens.size) return 0;
    let matches = 0;
    for (const token of baselineTokens) {
      if (normalizedJob.includes(token)) {
        matches += 1;
      }
    }
    return Math.round((matches / baselineTokens.size) * 100);
  }

  private hasStrongSignal(scores: FitScoreDimensionScores): boolean {
    return (
      scores.experienceAlignment >= 55 &&
      scores.leadershipLevel >= 50 &&
      scores.strategicTacticalFit >= 55
    );
  }
}
