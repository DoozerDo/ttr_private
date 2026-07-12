import { CoverLetterNarrativeComposer } from './cover-letter-narrative-composer';

describe('CoverLetterNarrativeComposer', () => {
  it('uses thesis in opening, keeps role/company context, and emits anchored body paragraphs', () => {
    const composer = new CoverLetterNarrativeComposer();
    const result = composer.compose({
      thesis: 'I lead service delivery and incident operations with a bias for operational clarity.',
      evidenceSnippets: [
        {
          id: 'e1',
          text: 'Example SaaS Support Operations Director 2019 to 2022 Owned support workflow design and queue health for a SaaS team. Built dashboards and KPI reporting for executive reviews and staffing decisions.',
        },
        {
          id: 'e2',
          text: 'Example SaaS Workflow and Incident Design Lead 2022 to 2024 Partnered with cloud teams on incident response and service reliability. Standardized reporting and tooling governance across Zendesk, Jira, and Salesforce Service Cloud.',
        },
        {
          id: 'e3',
          text: 'Example SaaS Support Operations Program Owner 2024 to Present Led operating reviews, coaching rhythms, and escalation playbooks. Used customer feedback and service metrics to guide change leadership.',
        },
        {
          id: 'e4',
          text: 'Example SaaS Support Operations Lead 2021 to 2023 Coordinated recurring issue follow up and improved handoff routines between frontline support and specialist teams.',
        },
      ],
      jobCompany: 'Example SaaS',
      jobTitle: 'Director of Support Operations',
      maxBodyParagraphs: 3,
    });
    const text = [result.opening, ...result.bodyParagraphs, result.closing].join(' ');
    expect(result.opening).toContain('Director of Support Operations');
    expect(result.opening).toContain('Example SaaS');
    expect(result.bodyParagraphs).toHaveLength(2);
    expect(result.closing).toContain('Director of Support Operations');
    expect(result.paragraphEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paragraphKey: 'opening' }),
        expect.objectContaining({ paragraphKey: 'body_1' }),
        expect.objectContaining({ paragraphKey: 'body_2' }),
        expect.objectContaining({ paragraphKey: 'closing' }),
      ]),
    );
    expect(result.paragraphEvidence.every((entry) => entry.sourceEvidenceIds.length > 0)).toBe(true);
    expect(result.diagnostics.renderedEvidenceSnippetIds).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(text.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(250);
  });

  it('does not glue evidence snippets into one paragraph or repeat connective filler', () => {
    const composer = new CoverLetterNarrativeComposer();
    const result = composer.compose({
      thesis: null,
      evidenceSnippets: [
        { id: 'e1', text: 'EvidenceOne rebuilt escalation handoffs to reduce queue thrash and make ownership clearer.' },
        { id: 'e2', text: 'EvidenceTwo created weekly operating reviews with clear owners and metrics.' },
        { id: 'e3', text: 'EvidenceThree standardized runbooks to reduce ambiguity during incidents.' },
        { id: 'e4', text: 'EvidenceFour partnered with engineering to close feedback loops faster.' },
        { id: 'e5', text: 'EvidenceFive improved SLA visibility and triage signals for support queues.' },
        { id: 'e6', text: 'EvidenceSix tightened change control to protect production stability.' },
      ],
      jobCompany: 'ExampleCo',
      jobTitle: 'Director of Support Operations',
      maxBodyParagraphs: 3,
    });

    expect(result.opening).toBeTruthy();
    expect(result.bodyParagraphs.length).toBe(2);
    expect(result.closing).toContain('Director of Support Operations');

    const evidenceNeedles = ['EvidenceOne', 'EvidenceTwo', 'EvidenceThree', 'EvidenceFour'];
    for (const paragraph of result.bodyParagraphs) {
      const hits = evidenceNeedles.filter((needle) => paragraph.includes(needle)).length;
      expect(hits).toBeLessThanOrEqual(2);
    }

    const impactSentences = result.bodyParagraphs
      .map((paragraph) => {
        const sentences = paragraph.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
        const impact = sentences.find((s) => /^that\b/i.test(s));
        return impact ?? '';
      })
      .filter(Boolean);
    expect(impactSentences.length).toBe(result.bodyParagraphs.length);
    expect(new Set(impactSentences).size).toBe(impactSentences.length);
  });

  it('does not introduce billing-domain narrative when evidence snippets do not support it', () => {
    const composer = new CoverLetterNarrativeComposer();
    const result = composer.compose({
      thesis: 'I lead billing support operations focused on invoice accuracy, entitlement mismatches, and reconciliation workflows.',
      evidenceSnippets: [
        { id: 'e1', text: 'Coordinated incident response workflows across teams to keep service stable.' },
        { id: 'e2', text: 'Owned escalation handoffs and improved queue health reviews with clear owners.' },
        { id: 'e3', text: 'Standardized runbooks and escalation paths to reduce execution friction.' },
        { id: 'e4', text: 'Partnered with engineering leaders to align priorities and timelines.' },
      ],
      jobCompany: 'ExampleCo',
      jobTitle: 'Director of Support Operations',
      maxBodyParagraphs: 3,
    });

    const text = [result.opening, ...result.bodyParagraphs, result.closing].join(' ');
    expect(text.toLowerCase()).not.toMatch(/\b(billing|invoice|entitlement|reconciliation|metering|credit|dispute|revenue)\b/);
  });

  it('fails closed when evidence is too sparse to ground the canonical structure', () => {
    const composer = new CoverLetterNarrativeComposer();
    const result = composer.compose({
      thesis: null,
      evidenceSnippets: [
        { id: 'e1', text: 'Sparse evidence with only one supported accomplishment.' },
      ],
      jobCompany: 'ExampleCo',
      jobTitle: 'Director of Support Operations',
      maxBodyParagraphs: 3,
    });

    expect(result.bodyParagraphs).toHaveLength(2);
    expect(result.paragraphEvidence.filter((entry) => entry.paragraphKey.startsWith('body_'))).toHaveLength(2);
    expect(new Set(result.paragraphEvidence.flatMap((entry) => entry.sourceEvidenceIds)).size).toBe(1);
  });
});
