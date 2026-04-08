import { buildResumeDraftSections } from './resume-draft-bullets';

describe('resume bullet ranking quality', () => {
  it('surfaces the most role-relevant bullets first and keeps chronology intact', () => {
    const sections = buildResumeDraftSections(
      [
        {
          id: 'experience-1',
          title: 'Support Operations',
          sectionType: 'EXPERIENCE',
          order: 0,
          includePolicy: 'ALWAYS',
          content:
            'Acme | Support Operations Manager | 2021 - Present\n- Reorganized customer support workflows across engineering and support.\n- Managed a weekly team lunch and office events.',
        } as any,
      ],
      {
        jobText:
          'Lead customer support operations, process design, escalation handling, and cross-functional execution for a SaaS team.',
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
              matchedSignals: ['support operations rigor', 'process and workflow design'],
              approvedClaims: ['Reorganized customer support workflows.'],
            },
          ],
          suppressionNotes: ['Lower-relevance background was suppressed so the story stays centered on support operations rigor.'],
          qualityPass: {
            framingStrength: 'high',
            emphasisConfidence: 'high',
            topNarrativeAxes: ['support operations rigor', 'process and workflow design'],
            cutCandidates: ['office events'],
            mustLeadWith: ['Customer Operations and Support Strategy leader'],
            avoidRepeating: ['office events'],
            coverLetterDelta: ['Explain why the role fits.'],
          },
          documentQualityScore: 95,
        },
      },
    );

    const bullets = sections[0]?.bullets ?? [];
    expect(bullets.length).toBeGreaterThan(0);
    expect(bullets[0]?.text).toContain('support workflows');
    expect(bullets[bullets.length - 1]?.text).toContain('office events');
  });
});
