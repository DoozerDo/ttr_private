import { Injectable } from '@nestjs/common';
import { InterviewGap, InterviewQuestion } from './interview-types';

const QUESTION_TEMPLATES: Record<
  InterviewQuestion['category'],
  (gap: InterviewGap) => InterviewQuestion
> = {
  'Direct Experience': (gap) => ({
    gapId: gap.gapId,
    category: 'Direct Experience',
    prompt: `The JD highlights "${gap.jdExcerpt}". Can you share any direct experience you have related to this?`,
    jdReference: gap.jdExcerpt,
  }),
  Context: (gap) => ({
    gapId: gap.gapId,
    category: 'Context',
    prompt: `What context surrounded any work you have done related to "${gap.jdExcerpt}", if applicable?`,
    jdReference: gap.jdExcerpt,
  }),
  Scope: (gap) => ({
    gapId: gap.gapId,
    category: 'Scope',
    prompt: `If you've engaged with "${gap.jdExcerpt}", what was the scope of your involvement?`,
    jdReference: gap.jdExcerpt,
  }),
  Tooling: (gap) => ({
    gapId: gap.gapId,
    category: 'Tooling',
    prompt: `What tools or platforms have you used, if any, when addressing "${gap.jdExcerpt}"?`,
    jdReference: gap.jdExcerpt,
  }),
  Impact: (gap) => ({
    gapId: gap.gapId,
    category: 'Impact',
    prompt: `What outcomes resulted from efforts related to "${gap.jdExcerpt}", or what impact would you aim for in similar work?`,
    jdReference: gap.jdExcerpt,
  }),
};

@Injectable()
export class InterviewQuestionGeneratorService {
  generateQuestions(gaps: InterviewGap[]): InterviewQuestion[] {
    return gaps.flatMap((gap) => this.buildQuestionsForGap(gap));
  }

  private buildQuestionsForGap(gap: InterviewGap): InterviewQuestion[] {
    return Object.values(QUESTION_TEMPLATES).map((template) => template(gap));
  }
}
