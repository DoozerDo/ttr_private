import {
  assembleCoverLetterFromStructuredBaseline,
  buildCanonicalCoverLetterDocument,
} from './coverLetterTemplateAssembler';
import { CANONICAL_COVER_LETTER_TEMPLATE_VERSION } from '../documents/normalized-document.models';

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
          'Standardized runbooks and handoff routines to reduce execution friction.',
        ],
      },
    ],
  } as any;

  const allowedBlocks = structured.experience.map((entry: any, index: number) => ({
    id: `parsed-experience-${index}`,
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
  const evidenceUnits = structured.experience.flatMap((entry: any, index: number) =>
    (entry.bullets ?? []).map((bullet: string, bulletIndex: number) => ({
      id: `parsed-experience-${index}:evidence:${bulletIndex}`,
      text: bullet,
      sourceBlockId: `parsed-experience-${index}`,
      sourceSectionType: 'EXPERIENCE',
      classification: 'accomplishment' as const,
      verificationState: 'verified' as const,
      eligibleForNarrativeComposition: true as const,
    })),
  );

  it('builds a canonical cover letter document with explicit template metadata and four paragraphs', () => {
    const assembly = assembleCoverLetterFromStructuredBaseline({
      structured,
      senderName: 'Alex Candidate',
      senderContactLine: 'alex@example.com',
      jobTitle: 'Director of Support Operations',
      companyName: 'Example SaaS',
      allowedBlocks,
      evidenceUnits,
    });

    expect(assembly.document.templateVersion).toBe(CANONICAL_COVER_LETTER_TEMPLATE_VERSION);
    expect(assembly.document.senderHeading).toEqual({
      name: 'Alex Candidate',
      contactLine: 'alex@example.com',
    });
    expect(assembly.document.companyName).toBe('Example SaaS');
    expect(assembly.document.roleTitle).toBe('Director of Support Operations');
    expect(assembly.document.salutation).toBe('Dear Hiring Team,');
    expect(assembly.document.signoff).toBe('Sincerely,');
    expect(assembly.document.signatureName).toBe('Alex Candidate');
    expect(assembly.document.opening).toContain('Director of Support Operations');
    expect(assembly.document.opening).toContain('Example SaaS');
    expect(assembly.document.bodyParagraphs).toHaveLength(2);
    expect(assembly.document.closingParagraph).toBeTruthy();
    expect(assembly.paragraphEvidence).toHaveLength(4);
    expect(assembly.paragraphEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paragraphKey: 'opening' }),
        expect.objectContaining({ paragraphKey: 'body_1' }),
        expect.objectContaining({ paragraphKey: 'body_2' }),
        expect.objectContaining({ paragraphKey: 'closing' }),
      ]),
    );
    expect(
      assembly.paragraphEvidence
        .flatMap((entry) => entry.sourceEvidenceIds)
        .every((id) => id.startsWith('parsed-experience-')),
    ).toBe(true);
    expect(assembly.paragraphEvidence.find((entry) => entry.paragraphKey === 'body_1')?.sourceEvidenceIds).toEqual([
      'parsed-experience-0:evidence:0',
    ]);
    expect(assembly.paragraphEvidence.find((entry) => entry.paragraphKey === 'body_2')?.sourceEvidenceIds).toEqual([
      'parsed-experience-1:evidence:0',
    ]);
    expect(assembly.document.bodyParagraphs[0]).not.toEqual(assembly.document.bodyParagraphs[1]);
    expect(
      [assembly.document.opening, ...assembly.document.bodyParagraphs, assembly.document.closingParagraph].join(' '),
    ).not.toMatch(/For example|I am focused on the|role specific narrative|supplied baseline evidence|easy to audit|operating lane|and and|\.,/i);
  });

  it('lets the canonical builder finalize the exact 4-paragraph contract', () => {
    const canonical = buildCanonicalCoverLetterDocument({
      senderName: 'Alex Candidate',
      senderContactLine: 'alex@example.com',
      jobTitle: 'Director of Support Operations',
      companyName: 'Example SaaS',
      opening: 'The Director of Support Operations role at Example SaaS fits my background because it reflects the way I have led service quality, operating rhythm, and cross-functional execution.',
      bodyParagraphs: [
        'Owned the support operations operating model and support workflow design for a high-volume SaaS support team. That work keeps the Director of Support Operations role at Example SaaS grounded in concrete ownership and visible service quality.',
        'Partnered with cloud infrastructure and observability teams on incident response, major incident follow-up, incident command, and service reliability. Standardizing that cross-functional work helps keep support, engineering, and customer partners aligned on what comes next.',
      ],
      closingParagraph: 'That mix of support operations rigor, incident response, and cross-functional leadership is why I would welcome a conversation about the Director of Support Operations role at Example SaaS, especially given service quality and operating discipline.',
      paragraphEvidence: [
        { paragraphKey: 'opening', sourceEvidenceIds: ['parsed-experience-0:evidence:0'], anchorTexts: ['Owned the support workflow design and queue health for a SaaS team.'] },
        { paragraphKey: 'body_1', sourceEvidenceIds: ['parsed-experience-0:evidence:1'], anchorTexts: ['Built dashboards and KPI reporting for executive reviews and staffing decisions.'] },
        { paragraphKey: 'body_2', sourceEvidenceIds: ['parsed-experience-1:evidence:0', 'parsed-experience-1:evidence:1'], anchorTexts: ['Partnered with cloud teams on incident response and service reliability.', 'Standardized runbooks and handoff routines to reduce execution friction.'] },
        { paragraphKey: 'closing', sourceEvidenceIds: ['parsed-experience-1:evidence:1'], anchorTexts: ['Standardized runbooks and handoff routines to reduce execution friction.'] },
      ],
    });

    expect(canonical.templateVersion).toBe(CANONICAL_COVER_LETTER_TEMPLATE_VERSION);
    expect(canonical.bodyParagraphs).toHaveLength(2);
    expect(canonical.paragraphEvidence).toHaveLength(4);
    expect(canonical.paragraphEvidence.find((entry) => entry.paragraphKey === 'body_1')?.sourceEvidenceIds).toEqual([
      'parsed-experience-0:evidence:1',
    ]);
    expect(canonical.paragraphEvidence.find((entry) => entry.paragraphKey === 'body_2')?.sourceEvidenceIds).toEqual([
      'parsed-experience-1:evidence:0',
      'parsed-experience-1:evidence:1',
    ]);
  });

  it('fails closed when the canonical baseline is too sparse to support the document', () => {
    expect(() =>
      assembleCoverLetterFromStructuredBaseline({
        structured: {
          summary: 'Support operations leader focused on measurable improvements and reliable execution.',
          experience: [
            {
              id: 'exp-1',
              company: 'Example SaaS',
              roleTitle: 'Support Operations Director',
              dates: '2022 - Present',
              bullets: ['Owned the support operations operating model.'],
            },
          ],
        } as any,
        senderName: 'Alex Candidate',
        jobTitle: 'Director of Support Operations',
        companyName: 'Example SaaS',
        allowedBlocks: [
          {
            id: 'parsed-experience-0',
            title: 'Example SaaS - Support Operations Director',
            content: 'Example SaaS | Support Operations Director | 2022 - Present\n- Owned the support operations operating model.',
            includePolicy: 'OPTIONAL',
            order: 0,
            sectionType: 'EXPERIENCE',
          },
        ] as any,
      }),
    ).toThrow('canonical_cover_letter_evidence_insufficient');
  });
});
