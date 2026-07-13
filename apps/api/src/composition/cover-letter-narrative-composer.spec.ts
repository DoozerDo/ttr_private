import { CoverLetterNarrativeComposer } from './cover-letter-narrative-composer';

describe('CoverLetterNarrativeComposer', () => {
  const unit = (id: string, text: string, sourceBlockId = id) => ({
    id,
    text,
    sourceBlockId,
    sourceSectionType: 'EXPERIENCE',
    classification: 'accomplishment' as const,
    verificationState: 'verified' as const,
    eligibleForNarrativeComposition: true as const,
  });

  it('builds exactly one opening, two body paragraphs, and one closing from canonical evidence units', () => {
    const composer = new CoverLetterNarrativeComposer();
    const result = composer.compose({
      thesis: null,
      evidenceUnits: [
        unit('e1', 'In prior roles, Owned the support operations operating model and support workflow design for a high-volume SaaS support team.'),
        unit('e2', 'Built dashboards and KPIs for executive communication and weekly operating reviews that kept staffing tradeoffs, SLA adherence, and queue health visible.'),
        unit('e3', 'Partnered with cloud infrastructure and observability teams on incident response, major incident follow-up, incident command, and service reliability.'),
        unit('e4', 'Standardized ticketing system governance in Zendesk and Jira so routing and handoff stayed predictable.'),
      ],
      jobCompany: 'Example SaaS',
      jobTitle: 'Director of Support Operations',
      maxBodyParagraphs: 3,
    });

    expect(result.opening).toContain('Director of Support Operations');
    expect(result.opening).toContain('Example SaaS');
    expect(result.opening).not.toContain('In prior roles, Owned');
    expect(result.opening).toMatch(/In prior roles, owned/i);
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
    expect(result.paragraphEvidence).toHaveLength(4);
    expect(result.paragraphEvidence.find((entry) => entry.paragraphKey === 'opening')?.sourceEvidenceIds).toEqual(['e1']);
    expect(result.paragraphEvidence.find((entry) => entry.paragraphKey === 'body_1')?.sourceEvidenceIds).toEqual(['e1']);
    expect(result.paragraphEvidence.find((entry) => entry.paragraphKey === 'body_2')?.sourceEvidenceIds).toEqual(['e2']);
    expect(result.paragraphEvidence.find((entry) => entry.paragraphKey === 'closing')?.sourceEvidenceIds).toEqual(['e1']);
    expect(result.diagnostics.renderedEvidenceSnippetIds).toEqual(['e1', 'e2']);

    const paragraphs = [result.opening, ...result.bodyParagraphs, result.closing];
    expect(paragraphs).toHaveLength(4);
    expect(new Set(result.bodyParagraphs.map((paragraph) => paragraph.split(/\s+/)[0] ?? '')).size).toBe(2);
    expect(paragraphs.join(' ')).not.toMatch(/For example|I am focused on the|role specific narrative|easy to audit|supplied baseline evidence|operating lane|and and|\.,/i);
  });

  it('keeps distinct body evidence lanes without repeated connective filler', () => {
    const composer = new CoverLetterNarrativeComposer();
    const result = composer.compose({
      thesis: null,
      evidenceUnits: [
        unit('e1', 'Led support workflow design and queue health for a SaaS team.'),
        unit('e2', 'Built dashboards and KPI reporting for executive reviews and staffing decisions.'),
        unit('e3', 'Partnered with cloud teams on incident response and service reliability.'),
        unit('e4', 'Standardized ticketing system governance so routing and handoff stayed predictable.'),
      ],
      jobCompany: 'ExampleCo',
      jobTitle: 'Director of Support Operations',
      maxBodyParagraphs: 3,
    });

    expect(result.bodyParagraphs).toHaveLength(2);
    const bodyOpeners = result.bodyParagraphs.map((paragraph) => paragraph.split(/\s+/)[0] ?? '');
    expect(new Set(bodyOpeners).size).toBe(bodyOpeners.length);

    const allParagraphs = [result.opening, ...result.bodyParagraphs, result.closing].join(' ');
    expect(allParagraphs).not.toMatch(/For example|I am focused on the|operating lane|role specific narrative|easy to audit|and and|\.,/i);
    expect(result.bodyParagraphs[0]).toContain('support workflow design');
    expect(result.bodyParagraphs[1]).toContain('dashboards and KPI reporting');
    expect(result.closing).toContain('would welcome a conversation');
  });

  it('fails closed when canonical evidence units are too sparse', () => {
    const composer = new CoverLetterNarrativeComposer();

    expect(() =>
      composer.compose({
        thesis: null,
        evidenceUnits: [
          unit('e1', 'Owned the support operations operating model and support workflow design for a high-volume SaaS support team.'),
        ],
        jobCompany: 'ExampleCo',
        jobTitle: 'Director of Support Operations',
        maxBodyParagraphs: 3,
      }),
    ).toThrow('canonical_cover_letter_evidence_insufficient');
  });
});
