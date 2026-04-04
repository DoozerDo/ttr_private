import { BadRequestException, Injectable } from '@nestjs/common';
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
import { canonicalizeJobText, sha256Text } from './job-text.canonical';
import {
  sanitizeLinkedInJobText,
  shouldApplyLinkedInSanitizer,
} from '../jobs/linkedin-sanitize';
import { CriticalFlowEventType, CriticalFlowTrackerService } from '../support/critical-flow-tracker.service';

export type FitScoringInput = FitScoreInput;
export type DimensionWeightOverrides = FitScoreDimensionWeightOverrides;

export type FitScoringResult = Omit<FitScoreResult, 'verdict'> & {
  verdict: FitScoreVerdictLabel;
  originalScore: number;
  expandedScore: number;
  delta: number;
  expandedDimensionScores: FitScoreDimensionScores | null;
  appliedAdditions: string[];
  jobTextSha256: string;
  jobTextCharCount: number;
  baselineTextSha256: string;
};

const MIN_TEXT_LENGTH = 200;

@Injectable()
export class FitScoringService {
  private readonly engine: FitScoreEngine;

  constructor(private readonly criticalFlowTrackerService: CriticalFlowTrackerService) {
    this.engine = new FitScoreEngine();
  }

  async score(
    input: FitScoringInput,
    dimensionWeights?: DimensionWeightOverrides | null,
    options?: { debug?: boolean },
  ): Promise<FitScoringResult> {
    try {
      const { jobTextUsed, jobTextSha256, jobTextCharCount } =
        canonicalizeJobText(input.job);
      const jobTextOverride = jobTextUsed;

      const hasRawText = (input.job.rawDescription ?? '').trim().length > 0;

      const engineJob = {
        ...input.job,
        normalizedResponsibilities: hasRawText
          ? []
          : (input.job.normalizedResponsibilities ?? []),
        normalizedRequirements: hasRawText
          ? []
          : (input.job.normalizedRequirements ?? []),
        jobTextOverride,
      };

      const enginePayload = {
        job: engineJob,
        baseline: {
          version: input.baseline.version,
          sections: input.baseline.sections,
        },
      };

      const baseResult = await this.engine.score(enginePayload, {
        weights: dimensionWeights,
        debug: options?.debug,
      });

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
      void this.criticalFlowTrackerService.recordCriticalFlowEvent({
        flow: CriticalFlowEventType.SCORE_GENERATED_SUCCESS,
        areaOrRoute: 'scoring',
      });

      return {
        ...baseResult,
        complianceFlags,
        originalScore: baseResult.overallScore,
        expandedScore,
        delta,
        expandedDimensionScores,
        appliedAdditions: additions,
        jobTextSha256,
        jobTextCharCount,
        baselineTextSha256,
        overallScore: baseResult.overallScore,
        verdict: baseResult.verdict,
      };
    } catch (error) {
      void this.criticalFlowTrackerService.recordCriticalFlowEvent({
        flow: CriticalFlowEventType.SCORE_GENERATED_FAILURE,
        areaOrRoute: 'scoring',
      });
      if (error instanceof FitScoreInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
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

    const shouldSanitize = shouldApplyLinkedInSanitizer({
      sourceUrl,
      rawText: jobText,
    });
    const sanitizedJob = shouldSanitize
      ? sanitizeLinkedInJobText(jobText).text
      : jobText;
    const normalizedJob = normalizeText(sanitizedJob);
    const rawJobLower = sanitizedJob.toLowerCase();

    const strongSignals = [
      'ignore previous instructions',
      'you are chatgpt',
      'act as',
      'system prompt',
      'developer message',
    ];
    const strongMatch = strongSignals.some((signal) =>
      normalizedJob.includes(signal),
    );
    const labelSignal =
      /(^|\s)prompt\s*:/i.test(rawJobLower) ||
      /(^|\s)instruction\s*:/i.test(rawJobLower);
    const weakSignals = [
      {
        pattern: /\bwrite (a|an)\b/i,
        context:
          /\b(resume|cover letter|response|answer|summary|analysis|prompt|instruction|email|output)\b/i,
      },
      {
        pattern: /\bgenerate (a|an)\b/i,
        context:
          /\b(resume|cover letter|response|answer|summary|analysis|prompt|instruction|email|output)\b/i,
      },
    ];
    const weakMatch = weakSignals.some(
      ({ pattern, context }) =>
        pattern.test(normalizedJob) && context.test(normalizedJob),
    );

    if (strongMatch || labelSignal || weakMatch) {
      flags.push('Job description contains prompt-like content');
    }

    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
      flags.push('Suspicious job source URL');
    }

    return flags;
  }

  buildComplianceFlags(
    jobText: string,
    baselineText: string,
    sourceUrl?: string | null,
  ) {
    return this.computeComplianceFlags(jobText, baselineText, sourceUrl);
  }
}
