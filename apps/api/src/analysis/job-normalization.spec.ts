import { extractNormalizedJobSegments } from './job-normalization';

describe('extractNormalizedJobSegments', () => {
  it('extracts responsibilities and requirements from a basic job description', () => {
    const jobDescription = `
Responsibilities:
- Lead cross-functional squads to deliver platform improvements.
- Own incident response and reliability goals.

Requirements:
- 5+ years of experience with distributed systems.
- Bachelor's degree in computer science or a related field.
`;

    const segments = extractNormalizedJobSegments(jobDescription);

    expect(segments.responsibilities.length).toBeGreaterThan(0);
    expect(segments.requirements.length).toBeGreaterThan(0);
    expect(segments.responsibilities).toEqual(
      expect.arrayContaining([
        'Lead cross-functional squads to deliver platform improvements.',
        'Own incident response and reliability goals.',
      ]),
    );
    expect(segments.requirements).toEqual(
      expect.arrayContaining([
        '5+ years of experience with distributed systems.',
        "Bachelor's degree in computer science or a related field.",
      ]),
    );
  });
});
