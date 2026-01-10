import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { GapEmbeddingProvider } from '../interviews/gap-detection.service';
import { GAP_EMBEDDING_PROVIDER } from '../interviews/gap-detection.service';
import { normalizeText } from '../scoring/fit-score/fit-score.utils';
import { FitScoreEngine, FitScoreInputError } from '../scoring/fit-score/fit-score.engine';
import type {
  DimensionWeightOverrides as FitScoreDimensionWeightOverrides,
  FitScoreDimensionScores,
  FitScoreInput,
  FitScoreResult,
} from '../scoring/fit-score/fit-score.types';

export type FitScoringInput = FitScoreInput;
export type DimensionWeightOverrides = FitScoreDimensionWeightOverrides;

export type FitScoringResult = FitScoreResult & {
  originalScore: number;
  expandedScore: number;
  delta: number;
  expandedDimensionScores: FitScoreDimensionScores | null;
  appliedAdditions: string[];
};

const MIN_TEXT_LENGTH = 200;

@Injectable()
export class FitScoringService {
  private readonly engine: FitScoreEngine;

  constructor(
    @Optional()
    @Inject(GAP_EMBEDDING_PROVIDER)
    embeddingProvider?: GapEmbeddingProvider,
  ) {
    this.engine = new FitScoreEngine(embeddingProvider);
  }

  async score(
    input: FitScoringInput,
    dimensionWeights?: DimensionWeightOverrides | null,
    options?: { debug?: boolean },
  ): Promise<FitScoringResult> {
    const enginePayload = {
      job: input.job,
      baseline: {
        version: input.baseline.version,
        sections: input.baseline.sections,
      },
    };

    let baseResult: FitScoreResult;

    try {
      baseResult = await this.engine.score(enginePayload, {
        weights: dimensionWeights,
        debug: options?.debug,
      });
    } catch (error) {
      if (error instanceof FitScoreInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const jobText = this.buildJobText(input.job);
    const baselineText = input.baseline.sections.map((section) => section.content).join('\n');
    const complianceFlags = this.computeComplianceFlags(jobText, baselineText, input.job.sourceUrl);

    const additions = (input.verifiedAdditions ?? [])
      .map((entry) => entry?.trim())
      .filter((entry): entry is string => Boolean(entry));

    let expandedDimensionScores: FitScoreDimensionScores | null = null;
    let expandedScore = baseResult.overallScore;

    if (additions.length) {
      const additionSections = additions.map((content, index) => ({
        type: 'OTHER',
        content,
        id: `addition-${index}`,
      }));
      const expandedPayload = {
        job: input.job,
        baseline: {
          version: input.baseline.version,
          sections: [...input.baseline.sections, ...additionSections],
        },
      };

      const expanded = await this.engine.score(expandedPayload, {
        weights: dimensionWeights,
      });

      expandedDimensionScores = expanded.dimensionScores;
      expandedScore = expanded.overallScore;
    }

    const delta = expandedScore - baseResult.overallScore;

    return {
      ...baseResult,
      complianceFlags,
      originalScore: baseResult.overallScore,
      expandedScore,
      delta,
      expandedDimensionScores,
      appliedAdditions: additions,
    };
  }

  private buildJobText(job: FitScoringInput['job']) {
    const normalizedChunks = [
      ...job.normalizedResponsibilities,
      ...job.normalizedRequirements,
    ].filter(Boolean);
    const normalized = normalizedChunks.join('\n').trim();
    if (normalized) return normalized;
    return job.rawDescription.trim();
  }

  private computeComplianceFlags(jobText: string, baselineText: string, sourceUrl?: string | null) {
    const flags: string[] = [];

    if (baselineText.trim().length < MIN_TEXT_LENGTH) {
      flags.push('Baseline too short for reliable scoring');
    }

    if (jobText.trim().length < MIN_TEXT_LENGTH) {
      flags.push('Job description too short for reliable scoring');
    }

    const normalizedJob = normalizeText(jobText);
    const promptSignals = [
      'ignore previous instructions',
      'system prompt',
      'assistant',
      'developer message',
    ];
    if (promptSignals.some((signal) => normalizedJob.includes(signal))) {
      flags.push('Job description contains prompt-like content');
    }

    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
      flags.push('Suspicious job source URL');
    }

    return flags;
  }

  buildComplianceFlags(jobText: string, baselineText: string, sourceUrl?: string | null) {
    return this.computeComplianceFlags(jobText, baselineText, sourceUrl);
  }
}
