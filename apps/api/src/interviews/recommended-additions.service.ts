import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  InterviewGap,
  InterviewQuestion,
  RecommendedAddition,
} from './interview-types';

type RecommendationInput = {
  responses: string[];
  questions?: InterviewQuestion[];
  gaps?: InterviewGap[];
};

@Injectable()
export class RecommendedAdditionsService {
  generateFromResponses(input: RecommendationInput): RecommendedAddition[] {
    const normalizedResponses = (input.responses ?? [])
      .map((entry) => entry?.trim())
      .filter((entry): entry is string => Boolean(entry));

    if (!normalizedResponses.length) {
      return [];
    }

    const suggestions: RecommendedAddition[] = [];

    for (
      let index = 0;
      index < normalizedResponses.length && suggestions.length < 8;
      index += 1
    ) {
      const snippet = this.buildSnippet(normalizedResponses[index]);
      const question = input.questions?.[index];
      const gap = input.gaps?.find((entry) => entry.gapId === question?.gapId);

      const text = `Documented experience: ${snippet}`;
      const sources = [
        {
          gapId: gap?.gapId,
          questionIndex: question ? index : undefined,
          questionPrompt: question?.prompt,
        },
      ].filter((source) =>
        Boolean(source.gapId || source.questionPrompt),
      ) as RecommendedAddition['sources'];

      const id = this.buildId(text, sources);

      suggestions.push({
        id,
        text,
        sources,
        status: 'proposed',
      });
    }

    return suggestions.slice(0, Math.max(3, suggestions.length));
  }

  private buildSnippet(response: string): string {
    const condensed = response.replace(/\s+/g, ' ').trim();
    const [firstSentence] = condensed.split(/(?<=[.!?])\s+/);
    const snippet = firstSentence || condensed;
    return snippet.length > 180 ? `${snippet.slice(0, 177)}...` : snippet;
  }

  private buildId(
    text: string,
    sources: RecommendedAddition['sources'],
  ): string {
    return createHash('sha256')
      .update(JSON.stringify({ text, sources }))
      .digest('hex');
  }
}
