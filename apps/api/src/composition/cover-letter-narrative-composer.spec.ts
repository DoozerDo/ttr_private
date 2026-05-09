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
});

