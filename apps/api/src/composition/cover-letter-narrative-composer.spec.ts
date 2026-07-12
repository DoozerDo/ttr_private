import { CoverLetterNarrativeComposer } from './cover-letter-narrative-composer';

describe('CoverLetterNarrativeComposer', () => {
  const unit = (id: string, text: string) => ({
    id,
    text,
    sourceBlockId: id,
    sourceSectionType: 'EXPERIENCE',
    classification: 'accomplishment' as const,
    verificationState: 'verified' as const,
    eligibleForNarrativeComposition: true as const,
  });

  it('uses thesis in opening, keeps role/company context, and emits anchored body paragraphs', () => {
    const composer = new CoverLetterNarrativeComposer();
    const result = composer.compose({
      thesis: 'I lead service delivery and incident operations with a bias for operational clarity.',
      evidenceUnits: [
        unit('e1', 'Owned support workflow design and queue health for a SaaS team.'),
        unit('e2', 'Partnered with cloud teams on incident response and service reliability.'),
        unit('e3', 'Led operating reviews, coaching rhythms, and escalation playbooks.'),
        unit('e4', 'Coordinated recurring issue follow up and improved handoff routines between frontline support and specialist teams.'),
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
      evidenceUnits: [
        unit('e1', 'EvidenceOne rebuilt escalation handoffs to reduce queue thrash and make ownership clearer.'),
        unit('e2', 'EvidenceTwo created weekly operating reviews with clear owners and metrics.'),
        unit('e3', 'EvidenceThree standardized runbooks to reduce ambiguity during incidents.'),
        unit('e4', 'EvidenceFour partnered with engineering to close feedback loops faster.'),
        unit('e5', 'EvidenceFive improved SLA visibility and triage signals for support queues.'),
        unit('e6', 'EvidenceSix tightened change control to protect production stability.'),
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
      expect(hits).toBeLessThanOrEqual(3);
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
      evidenceUnits: [
        unit('e1', 'Coordinated incident response workflows across teams to keep service stable.'),
        unit('e2', 'Owned escalation handoffs and improved queue health reviews with clear owners.'),
        unit('e3', 'Standardized runbooks and escalation paths to reduce execution friction.'),
        unit('e4', 'Partnered with engineering leaders to align priorities and timelines.'),
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
      evidenceUnits: [
        unit('e1', 'Sparse evidence with only one supported accomplishment.'),
      ],
      jobCompany: 'ExampleCo',
      jobTitle: 'Director of Support Operations',
      maxBodyParagraphs: 3,
    });

    expect(result.bodyParagraphs).toHaveLength(1);
    expect(result.paragraphEvidence.filter((entry) => entry.paragraphKey.startsWith('body_'))).toHaveLength(1);
    expect(new Set(result.paragraphEvidence.flatMap((entry) => entry.sourceEvidenceIds)).size).toBe(1);
  });
});
