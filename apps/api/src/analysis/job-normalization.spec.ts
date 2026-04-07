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
        "Bachelor's degree in computer science or a related field.",
      ]),
    );
  });

  it('filters location metadata and malformed requirement fragments', () => {
    const jobDescription = `
Lead Game Designer
Middletown, CT
Responsibilities:
- Own gameplay loop tuning.
- Partner with engineering.

Requirements:
- Middletown, CT
- Entry-level movement/dv experience designer
- Proficient
- 5+ years of experience shipping games.
`;

    const segments = extractNormalizedJobSegments(jobDescription);

    expect(segments.requirements.join(' ')).not.toContain('Middletown, CT');
    expect(segments.requirements.join(' ')).not.toContain('Entry-level movement/dv experience designer');
    expect(segments.requirements.join(' ')).not.toContain('Proficient');
  });

  it('rejects chopped narrative fragments and company mission prose', () => {
    const jobDescription = `
Requirements:
- The HPC/AI team is on a mission to build the
- Deliverables for the quarter
`;

    const segments = extractNormalizedJobSegments(jobDescription);

    expect(segments.requirements.join(' ')).not.toContain('the hpc/ai team is on a mission to build the');
    expect(segments.requirements.join(' ')).not.toContain('deliverables for the quarter');
  });
});
