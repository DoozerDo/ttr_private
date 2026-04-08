import { TemplateCoverLetterGenerator } from './cover-letters/generators/template-cover-letter.generator';
import { buildNormalizedResumeDocument } from './resume/resume-normalization';

describe('document strategic coherence', () => {
  it('keeps the resume and cover letter aligned to the same strategic frame', () => {
    const plan = {
      positioningFrame: 'Service delivery and incident operations leader',
      roleLens: {
        priorities: ['support operations rigor', 'service delivery and incident response'],
        requiredSignals: ['support operations rigor'],
        targetKeywords: ['support', 'incident'],
      },
      selectedEvidence: [
        {
          baselineSection: 'Support Operations',
          matchedSignals: ['support operations rigor'],
          approvedClaims: ['Led support operations programs.'],
        },
      ],
      summaryStrategy:
        'strong fit: lead with Service delivery and incident operations leader, emphasize support operations rigor and service delivery and incident response, and keep lower-relevance background out of the opening story.',
      resumeEmphasis: ['support operations rigor'],
      coverLetterThemes: ['Open with Service delivery and incident operations leader positioning.'],
      suppressionNotes: ['Lower-relevance background was suppressed so the story stays centered on support operations rigor.'],
      qualityPass: {
        framingStrength: 'high',
        emphasisConfidence: 'high',
        topNarrativeAxes: ['support operations rigor', 'service delivery and incident response'],
        cutCandidates: ['education'],
        mustLeadWith: ['Service delivery and incident operations leader'],
        avoidRepeating: ['results-driven', 'proven track record'],
        coverLetterDelta: [
          'Explain why Service delivery and incident operations leader is the right lens for this role.',
          'Lean on support operations rigor as the opening proof point.',
          'Keep the second paragraph additive to the resume.',
          'Show motivation and fit, not a line-by-line recap of experience.',
        ],
      },
      documentQualityScore: 96,
    };

    const resume = buildNormalizedResumeDocument(
      [
        {
          id: 'summary-1',
          type: 'SUMMARY',
          title: 'Summary',
          order: 0,
          includePolicy: 'ALWAYS',
          source: 'baseline',
          content: 'Support operations leader.',
          bullets: [],
        } as any,
        {
          id: 'experience-1',
          type: 'EXPERIENCE',
          title: 'Support Operations',
          order: 1,
          includePolicy: 'ALWAYS',
          source: 'baseline',
          content: 'Acme | Support Operations Manager | 2021 - Present\n- Led support operations programs.',
          bullets: [],
        } as any,
      ],
      { fullName: 'Test Candidate', location: 'test@example.com' },
      { documentStrategyPlan: plan as any },
    );

    const coverLetter = new TemplateCoverLetterGenerator().generate({
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
      documentStrategyPlan: plan as any,
    });

    expect(resume.summary).toContain(plan.positioningFrame);
    expect(coverLetter.content).toContain(plan.positioningFrame);
    expect(coverLetter.content).not.toContain('proven track record');
  });
});
