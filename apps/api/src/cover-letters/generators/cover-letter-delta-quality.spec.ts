import { TemplateCoverLetterGenerator } from './template-cover-letter.generator';

describe('cover letter delta quality', () => {
  it('keeps the letter additive to the resume and leads with a strategic fit narrative', () => {
    const generator = new TemplateCoverLetterGenerator();
    const result = generator.generate({
      baselineId: 'base-1',
      jobId: 'job-1',
      candidateName: 'Test Candidate',
      closingTemplate: { key: 'steady', text: 'I am ready to execute steadily.' },
      job: {
        id: 'job-1',
        title: 'Director of Support',
        company: 'Acme',
        responsibilities: ['Lead support operations.'],
        requirements: ['Partner with product and engineering.'],
      },
      allowedBaselineBlocks: [
        {
          id: 'block-1',
          title: 'Support Operations',
          content:
            'Led support operations programs across a SaaS platform, reducing escalation churn by coordinating product, engineering, and support leadership while keeping customer context visible in every operating review. Built incident handoff routines that clarified ownership, lowered ambiguity, and gave the team a steadier rhythm during high-volume periods. Partnered with engineering to redesign playbooks, close workflow gaps, and support service delivery without losing speed. Coached support leads on process adoption, measurement, and weekly operating reviews so changes stuck after launch. Created response dashboards that made trends visible to leadership and helped prioritize the right fixes. Worked with cross-functional partners to tighten escalation timing without losing customer context or accountability.',
          includePolicy: 'ALWAYS',
          order: 0,
          sectionType: 'EXPERIENCE',
        },
      ],
      safeMode: true,
      documentStrategyPlan: {
        positioningFrame: 'Customer Operations and Support Strategy leader',
        roleLens: {
          priorities: ['support operations rigor', 'cross-functional leadership'],
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
        coverLetterThemes: [
          'Open with Customer Operations and Support Strategy leader positioning.',
          'Connect the letter to support operations rigor.',
        ],
        suppressionNotes: ['Lower-relevance background was suppressed so the story stays centered on support operations rigor.'],
        qualityPass: {
          framingStrength: 'high',
          emphasisConfidence: 'high',
          topNarrativeAxes: ['support operations rigor', 'cross-functional leadership'],
          cutCandidates: ['office events'],
          mustLeadWith: ['Customer Operations and Support Strategy leader'],
          avoidRepeating: ['results-driven', 'proven track record'],
          coverLetterDelta: [
            'Explain why Customer Operations and Support Strategy leader is the right lens for this role.',
            'Lean on support operations rigor as the opening proof point.',
            'Keep the second paragraph additive to the resume.',
            'Show motivation and fit, not a line-by-line recap of experience.',
          ],
        },
      },
    });

    expect(result.content).toContain('Customer Operations and Support Strategy leader');
    expect(result.content).toContain('support operations rigor');
    expect(result.content).not.toMatch(/results-driven|proven track record/i);
  });
});
