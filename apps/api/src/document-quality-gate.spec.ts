import { CoverLetterNarrativeComposer } from './composition/cover-letter-narrative-composer';
import { NarrativeCompositionEngine } from './composition/narrative-composition-engine';

function normalize(text: string): string {
  return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function wordCount(text: string): number {
  return normalize(text).split(' ').filter(Boolean).length;
}

function firstWord(text: string): string {
  return (normalize(text).split(' ')[0] ?? '').trim();
}

function assertDoesNotMentionUnsupported(text: string, excludedRequirements: string[]) {
  const corpus = normalize(text);
  for (const req of excludedRequirements) {
    const needle = normalize(req);
    if (!needle) continue;
    expect(corpus).not.toContain(needle);
  }
}

describe('document-level quality gate (resume + cover letter)', () => {
  it('produces usable, non-stuffed documents and respects excludedRequirements', () => {
    const excludedRequirements = ['python', 'snowflake'];

    const resumeEngine = new NarrativeCompositionEngine();
    const resume = resumeEngine.composeResume({
      renderPlan: {
        summaryNarrative: 'Service delivery and incident operations leader with a bias for operational clarity.',
        evidencePriorities: ['incident response', 'support operations', 'escalations'],
      } as any,
      summaryFallback: 'Operations leader.',
      experience: [
        {
          company: 'Acme',
          roleTitle: 'Director of Support',
          dateRange: '2022 - Present',
          bullets: [
            'Managed escalations and incident communications across teams',
            'Responsible for support operations, incident response, escalation management, customer communication, stakeholder alignment, tooling improvements, and reporting across teams',
            'Worked with engineering to tighten handoffs and clarify ownership during incidents',
          ],
        },
      ],
    });

    expect(resume.summary).toBeTruthy();
    expect(resume.experience.length).toBeGreaterThanOrEqual(1);
    const role = resume.experience[0]!;
    expect(Array.isArray(role.bullets)).toBeTruthy();
    expect(role.bullets.length).toBeGreaterThanOrEqual(2);

    for (const bullet of role.bullets.slice(0, 6)) {
      expect(wordCount(bullet)).toBeLessThanOrEqual(32);
    }

    const openings = role.bullets.slice(0, 4).map(firstWord).filter(Boolean);
    expect(new Set(openings).size).toBeGreaterThan(1);

    assertDoesNotMentionUnsupported([resume.summary, ...role.bullets].join(' '), excludedRequirements);

    const coverComposer = new CoverLetterNarrativeComposer();
    const cover = coverComposer.compose({
      thesis: 'I lead service delivery and incident operations with a bias for operational clarity.',
      evidenceSnippets: [
        { id: 'e1', text: 'Coordinated incident response workflows across teams to keep service stable.' },
        { id: 'e2', text: 'Owned escalation handoffs and improved queue health reviews with clear owners.' },
        { id: 'e3', text: 'Standardized runbooks and escalation paths to reduce execution friction.' },
        { id: 'e4', text: 'Partnered with engineering leaders to align priorities and timelines.' },
      ],
      jobCompany: 'ExampleCo',
      jobTitle: 'Support Operations Director',
      maxBodyParagraphs: 3,
    });

    expect(cover.opening).toBeTruthy();
    expect(cover.bodyParagraphs.length).toBeGreaterThanOrEqual(2);
    expect(cover.closing).toBeTruthy();

    const bodyStarts = cover.bodyParagraphs.map(firstWord).filter(Boolean);
    expect(new Set(bodyStarts).size).toBe(bodyStarts.length);

    const connectiveSentences = cover.bodyParagraphs
      .map((paragraph) => {
        const sentences = String(paragraph ?? '')
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const connective = sentences.find((s) => /^that\b/i.test(s));
        return connective ?? '';
      })
      .filter(Boolean);
    expect(new Set(connectiveSentences).size).toBe(connectiveSentences.length);

    const coverText = [cover.opening, ...cover.bodyParagraphs, cover.closing].join('\n\n');
    assertDoesNotMentionUnsupported(coverText, excludedRequirements);
  });
});

