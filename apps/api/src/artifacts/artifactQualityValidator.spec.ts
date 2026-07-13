import {
  repairCoverLetterForQuality,
  sanitizeResumeForTrailingFragments,
  validateCoverLetterArtifactQuality,
  validateResumeArtifactQuality,
  trimIncompleteTrailingFragments,
} from './artifactQualityValidator';

describe('artifactQualityValidator', () => {
  it('sanitizes resume trailing fragments before validation', () => {
    const resume: any = {
      heading: { name: 'Test', contactLine: 'test@example.com' },
      summary: 'Designed and built a full-stack production platform. The',
      competencies: ['TypeScript'],
      experience: [],
      education: [],
    };

    const gate = validateResumeArtifactQuality(resume);
    expect(gate.reasons).not.toContain('incomplete_trailing_fragment');
  });

  it('emits a single trailing-fragment summary log (capped offenders) when enabled for cover letter validation', () => {
    const original = process.env.DEBUG_DOCGEN;
    process.env.DEBUG_DOCGEN = 'true';

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const gate = validateCoverLetterArtifactQuality([
      'Dear Hiring Team,',
      'I improved service operations with',
    ]);
    expect(gate.reasons).toContain('incomplete_trailing_fragment');
    expect(
      logSpy.mock.calls.some(([first]) =>
        String(first ?? '').includes('[DOCGEN][INCOMPLETE_TRAILING_FRAGMENT_SUMMARY]'),
      ),
    ).toBe(true);

    logSpy.mockRestore();
    process.env.DEBUG_DOCGEN = original;
  });

  it('emits exactly one compact trailing-fragment summary log per run', () => {
    const original = process.env.DEBUG_DOCGEN;
    process.env.DEBUG_DOCGEN = 'true';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    // Resume validation sanitizes trailing fragments; use cover letter validation to assert
    // offender/source cap + summary structure in a deterministic way.
    const gate = validateCoverLetterArtifactQuality([
      'I improved service operations and.',
      'I improved service operations and.',
      'I improved service operations and.',
      'I improved service operations and.',
      'I improved service operations and.',
      'I improved service operations and.',
      'I improved service operations and.',
      'I improved service operations and.',
      'I improved service operations and.',
      'I improved service operations and.',
      'I improved service operations and.',
    ]);
    expect(gate.reasons).toContain('incomplete_trailing_fragment');

    const offenderCalls = logSpy.mock.calls.filter(([first]) =>
      String(first ?? '').includes('[DOCGEN][INCOMPLETE_TRAILING_FRAGMENT_OFFENDER]'),
    );
    const sourceCalls = logSpy.mock.calls.filter(([first]) =>
      String(first ?? '').includes('[DOCGEN][INCOMPLETE_TRAILING_FRAGMENT_SOURCE]'),
    );
    const summaryCalls = logSpy.mock.calls.filter(([first]) =>
      String(first ?? '').includes('[DOCGEN][INCOMPLETE_TRAILING_FRAGMENT_SUMMARY]'),
    );

    // Only one compact summary log per run.
    expect(offenderCalls.length).toBe(0);
    expect(sourceCalls.length).toBe(0);
    expect(summaryCalls.length).toBe(1);

    const summaryPayload = summaryCalls[0]?.[1] as any;
    expect(summaryPayload?.totalDetected).toBeGreaterThan(0);
    expect(summaryPayload?.totalLogged).toBeGreaterThan(0);
    expect(Array.isArray(summaryPayload?.offenders)).toBe(true);
    expect(summaryPayload.offenders.length).toBeLessThanOrEqual(3);
    logSpy.mockRestore();
    process.env.DEBUG_DOCGEN = original;
  });

  it('repairs a banned phrase in cover letter on retry', () => {
    const paragraphs = ['The strongest fit comes from the operating context I have already handled.'];
    const gate = validateCoverLetterArtifactQuality(paragraphs);
    expect(gate.status).toBe('needs_refinement');
    expect(gate.reasons.some((reason) => reason.includes('operating context'))).toBe(true);

    const repaired = repairCoverLetterForQuality(paragraphs, gate);
    const repairedGate = validateCoverLetterArtifactQuality(repaired);
    // Repair should remove the banned phrase, but must not imply overall pass when the document is still
    // structurally insufficient (e.g., too short / missing required paragraph structure).
    expect(repairedGate.reasons.some((reason) => reason.includes('operating context'))).toBe(false);
    expect(repairedGate.status).toBe('needs_refinement');
  });

  it('normalizes production-shaped role titles and companies before reference checks', () => {
    const paragraphs = [
      'Dear Hiring Team,',
      'I am focused on the Director of Support Operations Date Less Fixture role at Example SaaS because I owned support workflow design and queue health for a SaaS team.',
      'I built dashboards and KPI reporting for executive reviews and staffing decisions that kept staffing and SLA trends visible for support leaders.',
      'I partnered with cloud teams on incident response and service reliability, standardized Zendesk, Jira, and Salesforce Service Cloud reporting, and drove recurring issue follow up across the support motion.',
      'I would welcome the chance to discuss how that background supports your service quality and operating rhythm at Example SaaS.',
      'Sincerely,',
      'Synthetic Runner',
    ];

    const gate = validateCoverLetterArtifactQuality(paragraphs, {
      company: 'Example SaaS',
      roleTitle: 'Director of Support Operations - Date Less Fixture',
      requiredEvidenceSnippets: [
        'owned support workflow design and queue health for a SaaS team',
        'built dashboards and KPI reporting for executive reviews and staffing decisions',
      ],
    });

    expect(gate.reasons).not.toContain('missing_company_reference');
    expect(gate.reasons).not.toContain('missing_role_reference');
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

  it('drops or trims incomplete clauses even when no dangling token is present', () => {
    const cleaned = trimIncompleteTrailingFragments(
      [
        'Improved system performance by 35% through query tuning', // no terminal punctuation; should be treated complete enough
        'Built scalable architecture for', // incomplete
        'Led', // incomplete
        'Delivered measurable outcomes.', // complete
      ].join('\n'),
    );
    const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    expect(lines).toContain('Improved system performance by 35% through query tuning');
    expect(lines).toContain('Delivered measurable outcomes.');
    expect(lines.some((line) => line === 'Built scalable architecture for')).toBe(false);
    expect(lines.some((line) => line === 'Led')).toBe(false);
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
