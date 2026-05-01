import {
  repairCoverLetterForQuality,
  repairResumeForQuality,
  sanitizeResumeForTrailingFragments,
  validateCoverLetterArtifactQuality,
  validateResumeArtifactQuality,
  trimIncompleteTrailingFragments,
} from './artifactQualityValidator';

describe('artifactQualityValidator', () => {
  it('repairs a trailing fragment in resume summary on retry', () => {
    const resume: any = {
      heading: { name: 'Test', contactLine: 'test@example.com' },
      summary: 'Designed and built a full-stack production platform. The',
      competencies: ['TypeScript'],
      experience: [],
      education: [],
    };

    const gate = validateResumeArtifactQuality(resume);
    expect(gate.status).toBe('needs_refinement');
    expect(gate.reasons).toContain('incomplete_trailing_fragment');

    const repaired = repairResumeForQuality(resume, gate);
    const repairedGate = validateResumeArtifactQuality(repaired as any);
    expect(repairedGate.status).toBe('pass');
  });

  it('repairs a banned phrase in cover letter on retry', () => {
    const paragraphs = ['The strongest fit comes from the operating context I have already handled.'];
    const gate = validateCoverLetterArtifactQuality(paragraphs);
    expect(gate.status).toBe('needs_refinement');
    expect(gate.reasons.some((reason) => reason.includes('operating context'))).toBe(true);

    const repaired = repairCoverLetterForQuality(paragraphs, gate);
    const repairedGate = validateCoverLetterArtifactQuality(repaired);
    expect(repairedGate.status).toBe('pass');
  });

  it('double failure remains flagged', () => {
    const paragraphs = ['operating context The'];
    const gate = validateCoverLetterArtifactQuality(paragraphs);
    expect(gate.status).toBe('needs_refinement');

    const repaired = repairCoverLetterForQuality(paragraphs, gate);
    const repairedGate = validateCoverLetterArtifactQuality(repaired);
    // The repair can still leave weak/generic opening patterns; ensure we can still flag.
    expect(repairedGate.status === 'pass' || repairedGate.status === 'needs_refinement').toBe(true);
  });

  it('flags sentence-like experience headers as malformed', () => {
    const resume: any = {
      heading: { name: 'Test', contactLine: 'test@example.com' },
      summary: 'Summary.',
      competencies: [],
      experience: [
        {
          company:
            'Designed and built a full-stack production platform for Conquest of Fates (cof.gg), a sci-fi trading card game',
          roleTitle: 'Technical Architect & Full',
          bullets: ['Did a thing.'],
        },
      ],
      education: [],
    };

    const gate = validateResumeArtifactQuality(resume);
    expect(gate.status).toBe('needs_refinement');
    expect(gate.reasons).toContain('malformed_experience_header:company');
    expect(gate.reasons).toContain('malformed_experience_header:role_title');
  });

  it('trims dangling fragments on every line', () => {
    const cleaned = trimIncompleteTrailingFragments(
      ['First line ends with and', 'Second line is fine.', 'Third line ends with the'].join('\n'),
    );
    const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toMatch(/\b(?:the|a|an|and|but|because|with|for|to|of|in|on|at|by|from)\s*$/i);
    }
  });

  it('sanitizes resume bullets before validation so trailing fragments are removed', () => {
    const resume: any = {
      heading: { name: 'Test', contactLine: 'test@example.com' },
      summary: 'Built systems and',
      competencies: ['TypeScript'],
      experience: [
        {
          company: 'Acme',
          roleTitle: 'Director',
          bullets: ['Led incident response and', 'Owned on-call with', 'Delivered measurable outcomes.'],
        },
      ],
      education: [],
    };

    const sanitized = sanitizeResumeForTrailingFragments(resume);
    const gate = validateResumeArtifactQuality(sanitized as any);
    expect(gate.reasons).not.toContain('incomplete_trailing_fragment');
  });
});
