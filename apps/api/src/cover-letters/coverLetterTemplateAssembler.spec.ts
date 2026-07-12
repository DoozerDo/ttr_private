import { assembleCoverLetterFromStructuredBaseline } from './coverLetterTemplateAssembler';

describe('assembleCoverLetterFromStructuredBaseline', () => {
  const structured = {
    summary: 'Support operations director with ownership of queue health and operating rhythm.',
    experience: [
      {
        id: 'exp-1',
        company: 'Example SaaS',
        roleTitle: 'Support Operations Director',
        dates: '2019 - 2022',
        bullets: [
          'Owned support workflow design and queue health for a SaaS team.',
          'Built dashboards and KPI reporting for executive reviews and staffing decisions.',
        ],
      },
      {
        id: 'exp-2',
        company: 'Example SaaS',
        roleTitle: 'Workflow and Incident Design Lead',
        dates: '2022 - 2024',
        bullets: [
          'Partnered with cloud teams on incident response and service reliability.',
          'Standardized reporting and tooling governance across Zendesk, Jira, and Salesforce Service Cloud.',
        ],
      },
    ],
  } as any;

  const allowedBlocks = structured.experience.map((entry: any, index: number) => ({
    id: `resume_v2_exp_${index}`,
    title: `${entry.company} - ${entry.roleTitle}`,
    content: [
      [entry.company, entry.roleTitle, entry.dates].filter(Boolean).join(' | '),
      ...(entry.bullets ?? []).map((bullet: string) => `- ${bullet}`),
    ]
      .join('\n')
      .trim(),
    includePolicy: 'OPTIONAL',
    order: index * 1000,
    sectionType: 'EXPERIENCE',
  }));

  it('passes the canonical composer output and paragraph anchors through the adapter', () => {
    const assembly = assembleCoverLetterFromStructuredBaseline({
      structured,
      senderName: 'Alex Candidate',
      senderContactLine: 'alex@example.com',
      jobTitle: 'Director of Support Operations',
      companyName: 'Example SaaS',
      allowedBlocks,
    });

    expect(assembly.document.salutation).toBe('Dear Hiring Team,');
    expect(assembly.document.opening).toContain('Director of Support Operations');
    expect(assembly.document.opening).toContain('Example SaaS');
    expect(assembly.document.bodyParagraphs.length).toBe(2);
    expect(assembly.document.closingParagraph).toBeTruthy();
    expect(assembly.document.signatureName).toBe('Alex Candidate');
    expect(assembly.paragraphEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paragraphKey: 'opening' }),
        expect.objectContaining({ paragraphKey: 'body_1' }),
        expect.objectContaining({ paragraphKey: 'body_2' }),
        expect.objectContaining({ paragraphKey: 'closing' }),
      ]),
    );
    expect(assembly.paragraphEvidence.every((entry) => entry.sourceEvidenceIds.length > 0)).toBe(true);
  });

  it('uses the canonical composer output instead of inventing an opening from job context', () => {
    const assembly = assembleCoverLetterFromStructuredBaseline({
      structured: {
        summary: '',
        experience: [
          {
            id: 'exp-1',
            company: 'Acme',
            roleTitle: 'Director of Support',
            dates: '2022 - Present',
            bullets: [
              'Led support operations programs and reduced escalation churn through clear handoffs.',
              'Built operating reviews that kept queue health and service quality visible.',
            ],
          } as any,
          {
            id: 'exp-2',
            company: 'Acme',
            roleTitle: 'Support Workflow Lead',
            dates: '2020 - 2022',
            bullets: [
              'Standardized runbooks and escalation paths to reduce execution friction.',
              'Partnered with engineering leaders to align priorities and timelines.',
            ],
          } as any,
        ],
      } as any,
      senderName: 'Alex Candidate',
      senderContactLine: 'alex@example.com',
      jobTitle: 'Director of Support',
      companyName: 'ExampleCo',
      allowedBlocks: [
        {
          id: 'parsed-experience-0',
          title: 'Acme - Director of Support',
          content:
            'Acme | Director of Support | 2022 - Present\n- Led support operations programs and reduced escalation churn through clear handoffs.\n- Built operating reviews that kept queue health and service quality visible.',
          includePolicy: 'OPTIONAL',
          order: 0,
          sectionType: 'EXPERIENCE',
        },
        {
          id: 'resume_v2_exp_1',
          title: 'Acme - Support Workflow Lead',
          content:
            'Acme | Support Workflow Lead | 2020 - 2022\n- Standardized runbooks and escalation paths to reduce execution friction.\n- Partnered with engineering leaders to align priorities and timelines.',
          includePolicy: 'OPTIONAL',
          order: 1000,
          sectionType: 'EXPERIENCE',
        },
      ] as any,
    });

    expect(assembly.document.salutation).toBe('Dear Hiring Team,');
    expect(assembly.document.opening).toBeTruthy();
    expect(assembly.document.bodyParagraphs.length).toBe(2);
    expect(assembly.document.closingParagraph).toBeTruthy();
    expect(assembly.document.signatureName).toBe('Alex Candidate');
  });

  it('passes through approved thesis text into the composed opening', () => {
    const assembly = assembleCoverLetterFromStructuredBaseline({
      structured: {
        summary: 'Service delivery and incident operations leader.',
        experience: [
          {
            id: 'exp-1',
            company: 'Acme',
            roleTitle: 'Director of Support',
            dates: '2022 - Present',
            bullets: ['Led support operations programs.'],
          } as any,
        ],
      } as any,
      senderName: 'Alex Candidate',
      jobTitle: 'Director of Support',
      companyName: 'ExampleCo',
      allowedBlocks: [
        {
          id: 'resume_v2_exp_0',
          title: 'Acme - Director of Support',
          content:
            'Acme | Director of Support | 2022 - Present\n- Led support operations programs.',
          includePolicy: 'OPTIONAL',
          order: 0,
          sectionType: 'EXPERIENCE',
        },
      ] as any,
    });

    expect(assembly.document.opening).toContain('Service delivery and incident operations leader.');
    expect(assembly.document.opening).toContain('Director of Support');
    expect(assembly.document.bodyParagraphs.length).toBe(1);
  });

  it('derives canonical evidence from summary, skills, and experience blocks without legacy plain text', () => {
    const assembly = assembleCoverLetterFromStructuredBaseline({
      structured: {
        summary: 'Support operations leader focused on execution cadence and measurable outcomes.',
        skills: ['ServiceNow', 'Jira Service Management', 'Incident Response'],
        experience: [
          {
            id: 'exp-1',
            company: 'Acme',
            roleTitle: 'Director of Support',
            dates: '2022 - Present',
            bullets: [
              'Led support operations programs and reduced escalation churn through clear handoffs.',
              'Built operating reviews that kept queue health and service quality visible.',
            ],
          } as any,
        ],
      } as any,
      senderName: 'Alex Candidate',
      jobTitle: 'Director of Support',
      companyName: 'ExampleCo',
      allowedBlocks: [
        {
          id: 'parsed-experience-0',
          title: 'Acme - Director of Support',
          content:
            'Acme | Director of Support | 2022 - Present\n- Led support operations programs and reduced escalation churn through clear handoffs.\n- Built operating reviews that kept queue health and service quality visible.',
          includePolicy: 'optional',
          order: 1000,
          sectionType: 'EXPERIENCE',
        },
      ] as any,
    });

    expect(assembly.document.bodyParagraphs.length).toBe(2);
    const sourceEvidenceIds = assembly.paragraphEvidence.flatMap((entry) => entry.sourceEvidenceIds);
    expect(sourceEvidenceIds.some((id) => id.startsWith('parsed-experience-0:evidence:'))).toBe(true);
    expect(sourceEvidenceIds.some((id) => id.startsWith('resume_v2_exp_'))).toBe(false);
    expect(assembly.paragraphEvidence.every((entry) => entry.sourceEvidenceIds.every((id) => !id.includes('resume_v2_plain_text')))).toBe(true);
  });
});
