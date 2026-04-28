import { TemplateCoverLetterGenerator } from './template-cover-letter.generator';
import { buildDocumentStrategyPlan } from '../../shared/documentStrategyPlan';
import { getSyntheticGenerationScenarioBundle } from '../../synthetic/generation/synthetic-generation.fixtures';

describe('cover letter delta quality', () => {
  const hasSupportOperationsSignal = (content: string) => {
    const lowered = content.toLowerCase();
    const signals = [
      /support/,
      /queue/,
      /escalat/,
      /service quality|quality of service|csat/,
      /workflow|workflows|playbook|runbook|routing|triage/,
      /priorit/,
      /operations|operational/,
      /incident|handoff|on-call|oncall/,
    ];

    const hits = signals.reduce((count, matcher) => (matcher.test(lowered) ? count + 1 : count), 0);
    return hits >= 3;
  };

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
    expect(hasSupportOperationsSignal(result.content)).toBe(true);
    expect(result.content).not.toMatch(/results-driven|proven track record/i);
    expect(result.content).not.toMatch(/Dear Hiring Team,\s*Dear Hiring Team,/i);
    expect(result.content.split(/\n\s*\n/).length).toBeGreaterThanOrEqual(4);
  });

  it('generates a clean generation-ready cover letter for the canonical strong-fit support operations scenario', () => {
    const generator = new TemplateCoverLetterGenerator();
    const bundle = getSyntheticGenerationScenarioBundle('Support operations director');

    expect(bundle).not.toBeNull();
    const strongFitBundle = bundle!;
    const plan = buildDocumentStrategyPlan({
      fitScore: 87,
      jobTitle: strongFitBundle.job.title,
      jobCompany: strongFitBundle.job.company,
      jobDescription: strongFitBundle.job.rawDescription,
      jobRequirements: strongFitBundle.job.normalizedRequirements,
      jobResponsibilities: strongFitBundle.job.normalizedResponsibilities,
      analysisSummary:
        'Support operations leader with incident response, staffing tradeoffs, and tooling governance.',
      analysisStrengths: ['support operations rigor', 'service reliability', 'incident response'],
      analysisGaps: ['none'],
      analysisRecommendedActions: ['keep focus'],
      baselineSections: strongFitBundle.baseline.sections,
    });

    const result = generator.generate({
      baselineId: strongFitBundle.baseline.id,
      jobId: strongFitBundle.job.id,
      candidateName: 'Synthetic Runner',
      closingTemplate: { key: 'steady', text: 'Thank you.' },
      job: {
        id: strongFitBundle.job.id,
        title: strongFitBundle.job.title,
        company: strongFitBundle.job.company,
        responsibilities: strongFitBundle.job.normalizedResponsibilities,
        requirements: strongFitBundle.job.normalizedRequirements,
      },
      allowedBaselineBlocks: strongFitBundle.baseline.sections.map((section, order) => ({
        id: section.id,
        title: section.title,
        content: section.content,
        includePolicy: 'ALWAYS',
        order,
        sectionType: section.sectionType,
      })),
      safeMode: false,
      documentStrategyPlan: plan,
      maxWords: 280,
    });

    expect(result.wordCount).toBeGreaterThan(250);
    expect(result.wordCount).toBeLessThanOrEqual(400);
    expect(result.content).toContain('Director of Support Operations opportunity at Example SaaS');
    expect(result.content).not.toContain('Thank you for considering my application.');
    expect(result.content).not.toContain('-');
  });
});
