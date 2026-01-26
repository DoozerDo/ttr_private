import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { InterviewGap } from './interview-types';

describe('InterviewQuestionGeneratorService', () => {
  it('creates neutral, JD-referenced questions for each gap', () => {
    const service = new InterviewQuestionGeneratorService();
    const gap: InterviewGap = {
      gapId: 'gap-1',
      domain: 'experience',
      jdExcerpt: 'Cloud security controls',
      baselineExcerpt: null,
      confidence: 'high',
    };

    const questions = service.generateQuestions([gap]);

    expect(questions).toHaveLength(5);
    questions.forEach((question) => {
      expect(question.jdReference).toBe(gap.jdExcerpt);
      expect(question.prompt).toContain(gap.jdExcerpt);
      expect(question.prompt).not.toMatch(/%|increase by|doubled/i);
      expect(question.prompt.toLowerCase()).toContain('if');
    });

    const categories = questions.map((q) => q.category);
    expect(categories).toEqual(
      expect.arrayContaining([
        'Direct Experience',
        'Context',
        'Scope',
        'Tooling',
        'Impact',
      ]),
    );
  });
});
