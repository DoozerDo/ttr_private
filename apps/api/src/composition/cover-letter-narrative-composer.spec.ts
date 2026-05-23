import { CoverLetterNarrativeComposer } from './cover-letter-narrative-composer';

describe('CoverLetterNarrativeComposer', () => {
  it('uses thesis in opening and varies paragraph structures', () => {
    const composer = new CoverLetterNarrativeComposer();
    const result = composer.compose({
      thesis: 'I lead service delivery and incident operations with a bias for operational clarity.',
      evidenceSnippets: [
        { id: 'e1', text: 'Coordinated incident response workflows across teams to keep service stable.' },
        { id: 'e2', text: 'Owned queue health reviews and improved handoffs between support and engineering.' },
        { id: 'e3', text: 'Standardized runbooks and escalation paths to reduce execution friction.' },
        { id: 'e4', text: 'Partnered with product and engineering leaders to align priorities and timelines.' },
      ],
      jobCompany: 'ExampleCo',
      jobTitle: 'Operations Manager',
      maxBodyParagraphs: 3,
    });
    expect(result.opening).toContain('incident operations');
    const starts = result.bodyParagraphs.map((p) => (p.split(/\s+/)[0] ?? '').toLowerCase()).filter(Boolean);
    expect(new Set(starts).size).toBeGreaterThan(1);
    expect(result.diagnostics.renderedEvidenceSnippetIds).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('does not glue three evidence snippets into one paragraph or repeat connective filler', () => {
    const composer = new CoverLetterNarrativeComposer();
    const result = composer.compose({
      thesis: null,
      evidenceSnippets: [
        { id: 'e1', text: 'EvidenceOne: rebuilt escalation handoffs to reduce queue thrash.' },
        { id: 'e2', text: 'EvidenceTwo: created weekly operating reviews with clear owners and metrics.' },
        { id: 'e3', text: 'EvidenceThree: standardized runbooks to reduce ambiguity during incidents.' },
        { id: 'e4', text: 'EvidenceFour: partnered with engineering to close feedback loops faster.' },
        { id: 'e5', text: 'EvidenceFive: improved SLA visibility and triage signals for support queues.' },
        { id: 'e6', text: 'EvidenceSix: tightened change control to protect production stability.' },
      ],
      jobCompany: 'ExampleCo',
      jobTitle: 'Director of Support Operations',
      maxBodyParagraphs: 3,
    });

    // Complete letter structure (intro + body + close).
    expect(result.opening).toMatch(/I am applying/i);
    expect(result.bodyParagraphs.length).toBeGreaterThanOrEqual(2);
    expect(result.closing).toMatch(/welcome the chance/i);

    // Regression: prior composer glued 3 raw evidence snippets into a single paragraph.
    const evidenceNeedles = ['EvidenceOne', 'EvidenceTwo', 'EvidenceThree'];
    for (const paragraph of result.bodyParagraphs) {
      const hits = evidenceNeedles.filter((needle) => paragraph.includes(needle)).length;
      expect(hits).toBeLessThanOrEqual(2);
    }

    // Impact/connective sentence should not repeat across body paragraphs.
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
});
