import { buildNormalizedResumeDocument } from './resume-normalization';

describe('resume summary quality', () => {
  it('replaces weak filler summary text with a strategic frame-led summary', () => {
    const document = buildNormalizedResumeDocument(
      [
        {
          id: 'summary-1',
          type: 'SUMMARY',
          title: 'Summary',
          order: 0,
          includePolicy: 'ALWAYS',
          source: 'baseline',
          content: 'Results-driven leader with a proven track record.',
          bullets: [],
        } as any,
        {
          id: 'experience-1',
          type: 'EXPERIENCE',
          title: 'Experience',
          order: 1,
          includePolicy: 'ALWAYS',
          source: 'baseline',
          content: 'Support Operations\n• Led support operations programs.',
          bullets: [],
        } as any,
      ],
      {
        fullName: 'Test Candidate',
        location: 'test@example.com',
      },
      {
        documentStrategyPlan: {
          positioningFrame: 'Customer Operations and Support Strategy leader',
          roleLens: {
            priorities: ['support operations rigor', 'process and workflow design'],
            requiredSignals: ['support operations rigor'],
            targetKeywords: ['support', 'workflow'],
          },
          selectedEvidence: [
            {
              baselineSection: 'Support Operations',
              matchedSignals: ['support operations rigor'],
              approvedClaims: ['Led support operations programs.'],
            },
          ],
          summaryStrategy:
            'strong fit: lead with Customer Operations and Support Strategy leader, emphasize support operations rigor and process and workflow design, and keep lower-relevance background out of the opening story.',
          resumeEmphasis: ['support operations rigor'],
          coverLetterThemes: ['Open with Customer Operations and Support Strategy leader positioning.'],
          suppressionNotes: ['Lower-relevance background was suppressed so the story stays centered on support operations rigor.'],
          qualityPass: {
            framingStrength: 'high',
            emphasisConfidence: 'high',
            topNarrativeAxes: ['support operations rigor', 'process and workflow design'],
            cutCandidates: ['Education'],
            mustLeadWith: ['Customer Operations and Support Strategy leader'],
            avoidRepeating: ['results-driven', 'proven track record'],
            coverLetterDelta: ['Explain why the frame fits.'],
          },
          documentQualityScore: 92,
        },
      },
    );

    expect(document.summary).toContain('Customer Operations and Support Strategy leader');
    expect(document.summary).toContain('support operations rigor');
    expect(document.summary).not.toMatch(/results-driven|proven track record/i);
  });
});
