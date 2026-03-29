import {
  dirtyResumeFixture,
  jdHeavyCoverLetterFixture,
  paragraphOnlyResumeFixture,
} from './artifact-validation.fixtures';

describe('dirty fixture regression coverage', () => {
  it('contains the expected dirty resume fixture components', () => {
    expect(dirtyResumeFixture.baselineSections).toHaveLength(4);
    expect(dirtyResumeFixture.jobDescription).toContain('operations manager');
  });

  it('contains the paragraph only resume fixture components', () => {
    expect(paragraphOnlyResumeFixture.baselineSections[0]?.content).toContain('I led weekly planning');
    expect(paragraphOnlyResumeFixture.jobDescription).toContain('structured delivery');
  });

  it('contains the JD heavy cover letter fixture components', () => {
    expect(jdHeavyCoverLetterFixture.job.responsibilities.join(' ')).toContain('innovation at scale');
    expect(jdHeavyCoverLetterFixture.allowedBaselineBlocks[0]?.content).toContain('queue health');
  });
});
