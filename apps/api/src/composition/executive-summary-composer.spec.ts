import { ExecutiveSummaryComposer } from './executive-summary-composer';

function countSentences(text: string): number {
  return String(text ?? "")
    .trim()
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function countWords(text: string): number {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

describe('ExecutiveSummaryComposer', () => {
  it('returns the approved thesis without synthesizing additional summary text', () => {
    const composer = new ExecutiveSummaryComposer();

    const result = composer.compose({
      positioningThesis:
        'Support operations leader who improves incident response, escalations, and customer outcomes while staying grounded in verified experience',
      experienceSnippets: [
        'Director of Support at Acme',
        'Owned escalations and incident communications for a SaaS platform',
        'Partnered with engineering on reliability improvements',
      ],
      evidencePriorities: [
        'incident response',
        'support operations',
        'escalations',
        'customer communication',
        'multi-stakeholder alignment',
        'extremely long theme phrase that should be ignored to avoid keyword stuffing in the summary output',
      ],
    });

    expect(result.summary).toBe(
      'Support operations leader who improves incident response, escalations, and customer outcomes while staying grounded in verified experience',
    );
    expect(result.source).toBe('authoritative_thesis');
  });

  it('returns an empty summary when the canonical planner does not approve one', () => {
    const composer = new ExecutiveSummaryComposer();

    const result = composer.compose({
      positioningThesis: '',
      experienceSnippets: [
        'Director of Support at Acme',
        'Owned escalations and incident communications for a SaaS platform',
        'Partnered with engineering on reliability improvements',
      ],
      evidencePriorities: ['incident response', 'support operations'],
    });

    expect(result.summary).toBe('');
    expect(result.source).toBe('inferred');
  });
});
