import { Injectable } from '@nestjs/common';
import { InterviewGap, InterviewQuestion } from './interview-types';

const QUESTION_TEMPLATES: Record<
  'Direct Experience' | 'Scope' | 'Impact',
  (gap: InterviewGap) => InterviewQuestion
> = {
  'Direct Experience': (gap) => ({
    gapId: gap.gapId,
    category: 'Direct Experience',
    prompt: `The JD highlights "${gap.jdExcerpt}". If you have direct experience related to this, can you share it?`,
    jdReference: gap.jdExcerpt,
  }),
  Scope: (gap) => ({
    gapId: gap.gapId,
    category: 'Scope',
    prompt: `If you've engaged with "${gap.jdExcerpt}", what was the scope of your involvement?`,
    jdReference: gap.jdExcerpt,
  }),
  Impact: (gap) => ({
    gapId: gap.gapId,
    category: 'Impact',
    prompt: `What outcomes resulted from efforts related to "${gap.jdExcerpt}", or if you have similar work, what impact would you aim for?`,
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
