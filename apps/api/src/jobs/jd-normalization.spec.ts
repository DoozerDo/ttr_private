import { normalizeJobDescription } from './jd-normalization';

describe('normalizeJobDescription', () => {
  it('extracts responsibilities and requirements by headings', () => {
    const text = `
Responsibilities
- Build product features
- Partner with design

Requirements
- 5+ years experience
- Typescript proficiency
`;

    const result = normalizeJobDescription(text);

    expect(result.responsibilities).toEqual([
      'Build product features',
      'Partner with design',
    ]);
    expect(result.requirements).toEqual([
      '5+ years experience',
      'Typescript proficiency',
    ]);
  });

  it('splits bullets without headings using fallback logic', () => {
    const text = `
About the team
- Collaborate across teams
- Own delivery timelines
- Familiar with React
- 3+ years of experience
`;

    const result = normalizeJobDescription(text);

    expect(result.responsibilities.length).toBeGreaterThan(0);
    expect(result.requirements.length).toBe(0);
  });

  it('handles mixed bullets and paragraphs', () => {
    const text = `
Responsibilities
You will own the roadmap and align stakeholders.
- Build weekly status updates
- Drive customer interviews
`;

    const result = normalizeJobDescription(text);

    expect(result.responsibilities).toEqual([
      'Build weekly status updates',
      'Drive customer interviews',
      'You will own the roadmap and align stakeholders.',
    ]);
  });

  it('deduplicates and caps items', () => {
    const text = `
Requirements
- Strong communication
- Strong communication
- Strong communication
`;

    const result = normalizeJobDescription(text);

    expect(result.requirements).toEqual(['Strong communication']);
  });
});
