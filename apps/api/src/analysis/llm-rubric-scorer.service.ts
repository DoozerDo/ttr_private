import { Injectable } from '@nestjs/common';
import {
  FitScoreRubricMessages,
  FitScoreRubricJson,
  FitScoreRubricVerdict,
} from './prompts/fit-score-rubric.v1';

type RubricScoreSuccess = {
  ok: true;
  parsed: FitScoreRubricJson;
  rawText: string;
};

type RubricScoreFailure = {
  ok: false;
  reason: string;
  rawText: string;
};

@Injectable()
export class LlmRubricScorerService {
  async score(
    messages: FitScoreRubricMessages,
  ): Promise<RubricScoreSuccess | RubricScoreFailure> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { ok: false, reason: 'missing_openai_api_key', rawText: '' };
    }

    const model = process.env.OPENAI_FIT_SCORE_MODEL ?? 'gpt-3.5-turbo';

    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: [
              { role: 'system', content: messages.system },
              { role: 'developer', content: messages.developer },
              { role: 'user', content: messages.user },
            ],
          }),
        },
      );

      if (!response.ok) {
        const rawText = await response.text();
        return { ok: false, reason: `model_error:${response.status}`, rawText };
      }

      const payload = await response.json();
      const rawText = payload?.choices?.[0]?.message?.content ?? '';

      if (!rawText) {
        return { ok: false, reason: 'missing_choice_content', rawText: '' };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch (error) {
        return { ok: false, reason: 'invalid_json', rawText };
      }

      const validation = this.validateParsed(parsed);
      if (!validation.ok) {
        return { ok: false, reason: validation.reason, rawText };
      }

      return { ok: true, parsed: validation.value, rawText };
    } catch (error) {
      return {
        ok: false,
        reason: `network_error:${(error as Error).message}`,
        rawText: '',
      };
    }
  }

  private validateParsed(
    parsed: unknown,
  ): { ok: true; value: FitScoreRubricJson } | { ok: false; reason: string } {
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reason: 'parsed_not_object' };
    }

    const candidate = parsed as Partial<FitScoreRubricJson>;

    if (candidate.scoringPromptVersion !== 'v1') {
      return { ok: false, reason: 'scoring_prompt_version_mismatch' };
    }

    if (!this.isValidScore(candidate.score)) {
      return { ok: false, reason: 'score_out_of_range' };
    }

    if (!this.isValidVerdict(candidate.verdict)) {
      return { ok: false, reason: 'verdict_invalid' };
    }

    if (!this.isValidDimensionScores(candidate.dimensionScores)) {
      return { ok: false, reason: 'dimension_scores_invalid' };
    }

    if (typeof candidate.notes !== 'string') {
      return { ok: false, reason: 'notes_missing' };
    }

    return {
      ok: true,
      value: {
        scoringPromptVersion: candidate.scoringPromptVersion,
        score: candidate.score,
        verdict: candidate.verdict,
        dimensionScores: candidate.dimensionScores,
        notes: candidate.notes,
      },
    };
  }

  private isValidScore(score: unknown): score is number {
    return (
      typeof score === 'number' &&
      Number.isFinite(score) &&
      score >= 0 &&
      score <= 100
    );
  }

  private isValidVerdict(verdict: unknown): verdict is FitScoreRubricVerdict {
    return (
      verdict === 'Strong' ||
      verdict === 'Moderate' ||
      verdict === 'Borderline' ||
      verdict === 'Skip'
    );
  }

  private isValidDimensionScores(
    scores: unknown,
  ): scores is FitScoreRubricJson['dimensionScores'] {
    if (typeof scores !== 'object' || scores === null) {
      return false;
    }

    const keys: Array<keyof FitScoreRubricJson['dimensionScores']> = [
      'experience',
      'leadership',
      'technicalPlatform',
      'industryContext',
      'strategicBalance',
    ];

    for (const key of keys) {
      const value = (scores as Record<string, unknown>)[key];
      if (!this.isValidScore(value)) {
        return false;
      }
    }

    return true;
  }
}
