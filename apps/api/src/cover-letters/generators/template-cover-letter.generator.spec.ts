import { TemplateCoverLetterGenerator } from './template-cover-letter.generator';
import { buildDocumentStrategyPlan } from '../../shared/documentStrategyPlan';
import { listSyntheticGenerationScenarioBundles } from '../../synthetic/generation/synthetic-generation.fixtures';
import {
  DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY,
  resolveClosingTemplate,
} from '../closing-templates';
import {
  gameDesignFixture,
  supportOperationsFixture,
} from './__fixtures__/cover-letter-fixtures';
import { COVER_LETTER_GENERIC_FILLER_PHRASES } from './cover-letter-writing-contract';

describe('TemplateCoverLetterGenerator', () => {
  it('rejects underspecified evidence fixtures with a supported-input error', () => {
    const generator = new TemplateCoverLetterGenerator();

    expect(() =>
      generator.generate({
        ...gameDesignFixture,
        allowedBaselineBlocks: [
          {
            ...gameDesignFixture.allowedBaselineBlocks[0],
            content: 'Managed operations.',
          },
        ],
      }),
    ).toThrow(/unsupported_input|insufficient baseline evidence/i);
  });

  it('filters resume artifacts and raw payload fragments before rejecting unsupported input', () => {
    const generator = new TemplateCoverLetterGenerator();

    expect(() =>
      generator.generate({
        ...supportOperationsFixture,
        allowedBaselineBlocks: [
          {
            ...supportOperationsFixture.allowedBaselineBlocks[0],
            content:
              'Page 2 | 3\nÃ¢â‚¬Â¢ Summary\nDelivered measurable support outcomes across recurring operations workflows while partnering across teams.\n{"audit_id":"raw"}',
          },
        ],
      }),
    ).toThrow(/unsupported_input|insufficient baseline evidence/i);
  });

  it('keeps support operations text from collapsing into a JD mirror while generating successfully', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams. Built weekly operating reviews that kept queue health, staffing tradeoffs, and service quality visible. Partnered with product and engineering on root cause fixes and recurring issue reduction.',
        },
      ],
    });

    expect(result.wordCount).toBeGreaterThanOrEqual(250);
    expect(result.content).toMatch(/I am applying for the /i);
  });

  it('keeps paragraph ordering validation focused on the generated letter rather than rejecting strong evidence', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams. Built weekly operating reviews that kept queue health, staffing tradeoffs, and service quality visible. Partnered with product and engineering on root cause fixes and recurring issue reduction.',
        },
      ],
    });

    expect(result.paragraphs).toHaveLength(4);
    expect(result.paragraphs[0]).toMatch(/I am applying for the /i);
  });

  it('surfaces constraints summary behavior while still generating a compliant letter', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      complianceConstraints: {
        mode: 'strict',
        allowedCompanyNames: ['Acme Care'],
        disallowPhrases: ['the Director'],
      },
    });

    expect(result.content).not.toContain('the Director');
    expect(result.wordCount).toBeGreaterThan(250);
  });

  it('generates a cover letter from a strong support operations baseline', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'Led support operations as a director and owned queue health, service delivery, escalation governance, and weekly operating reviews. Partnered with product, cloud infrastructure, and customer support teams to improve routing, incident response, and customer updates. Built dashboards, KPIs, and operating reviews that made staffing tradeoffs and service quality visible to leaders.',
        },
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          id: 'o2',
          content:
            'Owned the support operations operating model and support workflow design for a high-volume SaaS support team with customer-facing ownership. Built weekly operating reviews that kept staffing tradeoffs, SLA adherence, and queue health visible. Partnered with cloud infrastructure and observability teams on incident response, major incident follow-up, incident command, and service reliability.',
        },
      ],
    });

    expect(result.wordCount).toBeGreaterThan(250);
    expect(result.document.opening).toMatch(/I am applying for the /i);
  });

  it('keeps the live Morgan Lee synthetic support-ops closing grounded and varied', () => {
    const bundle = listSyntheticGenerationScenarioBundles().find(
      (entry) => entry.scenario.id === 'support-ops-director-strong-fit',
    );
    if (!bundle) {
      throw new Error('support-ops-director-strong-fit bundle is missing');
    }

    const generator = new TemplateCoverLetterGenerator();
    const plan = buildDocumentStrategyPlan({
      fitScore: 87,
      jobTitle: bundle.job.title,
      jobCompany: bundle.job.company,
      jobDescription: bundle.job.rawDescription,
      jobRequirements: bundle.job.normalizedRequirements,
      jobResponsibilities: bundle.job.normalizedResponsibilities,
      analysisSummary: 'Support operations leader with incident response and workflow ownership.',
      analysisStrengths: ['support operations rigor', 'service reliability', 'incident response'],
      analysisGaps: [],
      analysisRecommendedActions: [],
      baselineSections: bundle.baseline.sections,
    });

    const result = generator.generate({
      baselineId: '29fbcbb4-eca6-4109-ada5-3ccf1359823f',
      jobId: bundle.job.id,
      candidateName: 'Morgan Lee',
      closingTemplate: resolveClosingTemplate(DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY),
      job: {
        id: bundle.job.id,
        title: bundle.job.title,
        company: bundle.job.company,
        responsibilities: bundle.job.normalizedResponsibilities,
        requirements: bundle.job.normalizedRequirements,
      },
      allowedBaselineBlocks: [
        {
          id: '9ac0cbbc-8faf-4094-bbcb-f87fe70bb9c4',
          title: 'Summary',
          content: 'Morgan Lee',
          includePolicy: 'ALWAYS' as never,
          order: 0,
          sectionType: 'OTHER' as never,
        },
        {
          id: 'dc587696-10b4-4827-9c68-e6afdbf797e8',
          title: 'Summary',
          content:
            'Support Operations Director with ownership of queue health, service delivery, escalation governance, staffing tradeoffs, and weekly operating rhythm for a SaaS team.\n\nPartnered with product, engineering, cloud infrastructure, and customer support on incident response, routing, and service quality improvements.',
          includePolicy: 'ALWAYS' as never,
          order: 1,
          sectionType: 'SUMMARY' as never,
        },
        {
          id: '650f2c98-b3fd-4a39-a5b2-508b5b7015dd',
          title: 'Experience',
          content:
            'Support Operations Director | Example SaaS | Seattle, WA\n\n2019 - 2022\n\n- Owned support workflow design and queue health for a SaaS team.\n\n- Built dashboards and KPI reporting for executive reviews and staffing decisions.\n\n- Kept staffing and SLA trends visible for support leaders.\n\n- Coached managers on escalation handling and customer communication.\n\nWorkflow And Incident Design Lead | Example SaaS | Seattle, WA\n\n2022 - 2024\n\n- Partnered with cloud teams on incident response and service reliability.\n\n- Standardized Zendesk, Jira, and Salesforce Service Cloud reporting and tooling governance.\n\n- Drove change coordination, problem management, and recurring issue follow-up.\n\n- Created runbooks and process notes that tightened handoffs during active incidents.\n\nSupport Operations Program Owner | Example SaaS | Seattle, WA\n\n2024 - Present\n\n- Led operating reviews, coaching rhythms, and escalation playbooks.\n\n- Led cross functional prioritization on recurring issue fixes.\n\n- Improved automation workflows and ITSM process maturity.\n\n- Used voice of the customer, CSAT trends, and self service signals to guide change leadership.\n\n- Owned capacity planning and staffing tradeoffs across two regions and three queues.\n\n- Reduced repeat escalations, improved SLA adherence, and lowered response time.\n\n- Kept issue analysis and service metrics aligned with the operating rhythm.\n\n- Built operating reviews and playbooks that clarified ownership.\n\n- Aligned support tooling, reporting, and team workflows to the operating model.\n\n- Maintained leadership visibility into customer advocacy and service quality.',
          includePolicy: 'ALWAYS' as never,
          order: 2,
          sectionType: 'EXPERIENCE' as never,
        },
        {
          id: 'c368e2ee-4620-4598-a784-2a17bfb21a96',
          title: 'Technical Skills',
          content:
            'Zendesk | Jira | Salesforce Service Cloud | SQL | Looker\n\nQueue health | capacity planning | staffing tradeoffs | weekly operating reviews | voice of the customer | customer advocacy | CSAT | self service',
          includePolicy: 'ALWAYS' as never,
          order: 3,
          sectionType: 'SKILLS' as never,
        },
      ],
      safeMode: false,
      documentStrategyPlan: plan,
      maxWords: 280,
    });

    expect(result.wordCount).toBeGreaterThan(250);
    expect(result.document.closingParagraph).toContain(
      'Led operating reviews, coaching rhythms, and escalation playbooks.',
    );
    expect(result.document.closingParagraph).not.toMatch(
      /I would bring the same partnership across product, engineering, cloud infrastructure, and customer support/i,
    );
    expect(result.document.closingParagraph).not.toMatch(
      /I would welcome a conversation about how that operating rhythm supports steady execution\.$/i,
    );
  });

  it('avoids generic enthusiasm filler phrases', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams. Built weekly operating reviews that kept queue health, staffing tradeoffs, and service quality visible.',
        },
      ],
    });

    const lowered = result.content.toLowerCase();
    for (const phrase of COVER_LETTER_GENERIC_FILLER_PHRASES) {
      expect(lowered).not.toContain(phrase);
    }
  });

  it('avoids internal-sounding positioning phrases', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams. Built weekly operating reviews that kept queue health, staffing tradeoffs, and service quality visible. Partnered with product and engineering on root cause fixes and recurring issue reduction.',
        },
      ],
    });

    const lowered = result.content.toLowerCase();
    const banned = [
      'operating context behind the work',
      'lead with a lens',
      'ownership of execution systems',
      'cross functional operating approach',
    ];
    for (const phrase of banned) {
      expect(lowered).not.toContain(phrase);
    }
  });

  it('never emits banned cover letter phrases', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'Led support operations and owned escalation governance, incident handoffs, and weekly reviews. Partnered with engineering on root cause fixes and recurring issue reduction.',
        },
      ],
    });

    const lowered = result.content.toLowerCase();
    const banned = ['operating context', 'execution systems', 'lens', 'strongest fit'];
    for (const phrase of banned) {
      expect(lowered).not.toContain(phrase);
    }
  });

  it('starts with a recruiter-ready opening line', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'Managed escalation flows and coordinated incident handoffs across product, support, and engineering teams.',
        },
      ],
      maxWords: 280,
    });

    const firstParagraph = result.paragraphs[0]?.trim() ?? '';
    expect(firstParagraph).toMatch(/I am applying for the /);
    expect(firstParagraph).not.toMatch(/this role requires/i);
  });

  it('fails generation when raw date ranges leak into the letter', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'July 2024 - April 2026 Linux System Administrator. Managed operations, wrote scripts, and handled tickets.',
        },
      ],
    });

    // Generator must translate baseline text into narrative and avoid leaking raw timelines.
    expect(result.content).not.toMatch(/\bJuly\b/i);
    expect(result.content).not.toMatch(/\b2026\b/);
  });

  it('keeps a single positioning theme visible across the letter', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      allowedBaselineBlocks: [
        {
          ...supportOperationsFixture.allowedBaselineBlocks[0],
          content:
            'Partnered with engineering on incident response and escalation handling. Built incident handoffs and follow ups that kept service work coordinated.',
        },
      ],
    });

    const lowered = result.content.toLowerCase();
    // This fixture should select the reliability_execution theme.
    expect(lowered).toMatch(/reliability|incident response|incident resilience|resilient execution/);
  });

  it('does not throw unsupported_input when only one strong theme hit exists (generates a narrower coherent letter)', () => {
    const generator = new TemplateCoverLetterGenerator();

    expect(() =>
      generator.generate({
        ...supportOperationsFixture,
        allowedBaselineBlocks: [
          {
            ...supportOperationsFixture.allowedBaselineBlocks[0],
            // Only a single obvious theme signal.
            content: 'Handled incident response coordination for customer-impacting issues.',
          },
        ],
        maxWords: 280,
      }),
    ).not.toThrow();
  });

  it('anchors the letter to a concrete role problem signal', () => {
    const generator = new TemplateCoverLetterGenerator();

    const result = generator.generate({
      ...supportOperationsFixture,
      job: {
        ...supportOperationsFixture.job,
        // Narrow the JD to reliability/incident language so the resolver deterministically selects it.
        responsibilities: [
          'Own incident response improvements and reliability work across support and engineering.',
          'Improve availability and incident resilience for customer-facing systems.',
        ],
        requirements: [
          'Experience improving reliability and managing incident response programs.',
        ],
      },
    });

    expect(result.content.toLowerCase()).toMatch(/improving reliability|reliability under pressure|incident resilience/);
  });
});
