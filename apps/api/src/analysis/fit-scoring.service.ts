import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { GapEmbeddingProvider } from '../interviews/gap-detection.service';
import { GAP_EMBEDDING_PROVIDER } from '../interviews/gap-detection.service';
import { normalizeText } from '../scoring/fit-score/fit-score.utils';
import {
  FitScoreEngine,
  FitScoreInputError,
} from '../scoring/fit-score/fit-score.engine';
import type {
  DimensionWeightOverrides as FitScoreDimensionWeightOverrides,
  FitScoreDimensionScores,
  FitScoreInput,
  FitScoreResult,
} from '../scoring/fit-score/fit-score.types';
import type { FitScoreVerdictLabel } from '../scoring/fit-score/fit-verdict';
import { buildFitScoreRubricMessages, FitScoreRubricJson, FIT_SCORE_RUBRIC_VERSION } from './prompts/fit-score-rubric.v1';
import { canonicalizeJobText, sha256Text } from './job-text.canonical';
import { LlmRubricScorerService } from './llm-rubric-scorer.service';

export type FitScoringInput = FitScoreInput;
export type DimensionWeightOverrides = FitScoreDimensionWeightOverrides;

export type FitScoringResult = Omit<FitScoreResult, 'verdict'> & {
  verdict: FitScoreVerdictLabel | FitScoreRubricJson['verdict'];
  originalScore: number;
  expandedScore: number;
  delta: number;
  expandedDimensionScores: FitScoreDimensionScores | null;
  appliedAdditions: string[];
  scoringMode: 'engine' | 'engine_fallback' | 'llm';
  scoringPromptVersion: typeof FIT_SCORE_RUBRIC_VERSION | null;
  jobTextSha256: string;
  jobTextCharCount: number;
  baselineTextSha256: string;
  llmScore: number | null;
  llmVerdict: FitScoreRubricJson['verdict'] | null;
  llmDimensionScores: FitScoreRubricJson['dimensionScores'] | null;
};

const MIN_TEXT_LENGTH = 200;
const ENABLE_INTERNAL_PARITY_ENDPOINT = process.env.ENABLE_INTERNAL_PARITY_ENDPOINT === 'true';
const isLlmParityEnabled = () => process.env.ENABLE_LLM_PARITY_SCORE === 'true';
void ENABLE_INTERNAL_PARITY_ENDPOINT;

@Injectable()
export class FitScoringService {
  private readonly engine: FitScoreEngine;

  constructor(
    @Optional()
    @Inject(GAP_EMBEDDING_PROVIDER)
    embeddingProvider?: GapEmbeddingProvider,
    @Optional()
    private readonly llmRubricScorer?: LlmRubricScorerService,
  ) {
    this.engine = new FitScoreEngine(embeddingProvider);
  }

  async score(
    input: FitScoringInput,
    dimensionWeights?: DimensionWeightOverrides | null,
    options?: { debug?: boolean },
  ): Promise<FitScoringResult> {
    const { jobTextUsed, jobTextSha256, jobTextCharCount } = canonicalizeJobText(input.job);
    const jobTextOverride = jobTextUsed;

    const hasRawText = (input.job.rawDescription ?? '').trim().length > 0;

    const engineJob = {
      ...input.job,
      normalizedResponsibilities: hasRawText
        ? []
        : input.job.normalizedResponsibilities ?? [],
      normalizedRequirements: hasRawText ? [] : input.job.normalizedRequirements ?? [],
      jobTextOverride,
    };

    const enginePayload = {
      job: engineJob,
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

    const baselineText = input.baseline.sections
      .map((section) => section.content)
      .join('\n');
    const baselineTextSha256 = sha256Text(baselineText);

    const complianceFlags = this.computeComplianceFlags(
      jobTextUsed,
      baselineText,
      input.job.sourceUrl,
    );

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
        job: engineJob,
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

    let scoringMode: 'engine' | 'engine_fallback' | 'llm' = 'engine';
    let scoringPromptVersion: typeof FIT_SCORE_RUBRIC_VERSION | null = null;
    let llmScore: number | null = null;
    let llmVerdict: FitScoreRubricJson['verdict'] | null = null;
    let llmDimensionScores: FitScoreRubricJson['dimensionScores'] | null = null;

    if (isLlmParityEnabled() && this.llmRubricScorer) {
      const llmMessages = buildFitScoreRubricMessages({
        baselineText,
        jobText: jobTextUsed,
      });
      const llmResult = await this.llmRubricScorer.score(llmMessages);
      if (llmResult.ok) {
        scoringMode = 'llm';
        scoringPromptVersion = llmResult.parsed.scoringPromptVersion;
        llmScore = llmResult.parsed.score;
        llmVerdict = llmResult.parsed.verdict;
        llmDimensionScores = llmResult.parsed.dimensionScores;
      } else {
        scoringMode = 'engine_fallback';
        const safeReason =
          llmResult.reason.replace(/\s+/g, ' ').trim().slice(0, 120) || 'unknown';
        complianceFlags.push('llm_scoring_failed', `llm_scoring_failed_reason:${safeReason}`);
      }
    }

    const finalOverallScore =
      scoringMode === 'llm' && llmScore !== null ? llmScore : baseResult.overallScore;
    const finalVerdict: FitScoreVerdictLabel | FitScoreRubricJson['verdict'] =
      scoringMode === 'llm' && llmVerdict ? llmVerdict : baseResult.verdict;

    return {
      ...baseResult,
      complianceFlags,
      originalScore: baseResult.overallScore,
      expandedScore,
      delta,
      expandedDimensionScores,
      appliedAdditions: additions,
      scoringMode,
      scoringPromptVersion,
      jobTextSha256,
      jobTextCharCount,
      baselineTextSha256,
      llmScore,
      llmVerdict,
      llmDimensionScores,
      overallScore: finalOverallScore,
      verdict: finalVerdict,
    };
  }

  private computeComplianceFlags(
    jobText: string,
    baselineText: string,
    sourceUrl?: string | null,
  ) {
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
