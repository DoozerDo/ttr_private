import { GenericLanguageDetector } from './generic-language-detector';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function ensureSentence(value: string): string {
  const text = trimToText(value);
  if (!text) return '';
  return /[.!?]\s*$/.test(text) ? text : `${text}.`;
}

function compactSnippet(text: string, maxWords = 80): string {
  const cleaned = trimToText(text).replace(/\|/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length > maxWords ? words.slice(0, maxWords).join(' ').trim() : cleaned;
}

function chooseVariedOpenings(paragraphs: string[]): string[] {
  const starters = [
    'In prior roles,',
    'Across teams,',
    'In practice,',
    'One consistent pattern is',
    'A concrete example is',
  ];
  let i = 0;
  return paragraphs.map((p) => {
    const text = trimToText(p);
    if (!text) return '';
    if (/^(in prior roles,|across teams,|in practice,|one consistent pattern is|a concrete example is)\b/i.test(text)) {
      return ensureSentence(text);
    }
    const starter = starters[i % starters.length];
    i += 1;
    return ensureSentence(`${starter} ${text}`);
  });
}

export class CoverLetterNarrativeComposer {
  private detector = new GenericLanguageDetector();

  compose(input: {
    thesis: string | null;
    evidenceSnippets: Array<{ id: string; text: string; roleId?: string | null }>;
    jobCompany?: string | null;
    jobTitle?: string | null;
    maxBodyParagraphs: number;
  }): {
    opening: string;
    bodyParagraphs: string[];
    closing: string;
    diagnostics: {
      genericLanguageFlags: ReturnType<GenericLanguageDetector['detect']>;
      renderedEvidenceSnippetIds: string[];
      narrativeStrategy: string;
    };
  } {
    const thesis = trimToText(input.thesis ?? '');
    const company = trimToText(input.jobCompany ?? '');
    const title = trimToText(input.jobTitle ?? '');
    const renderedEvidenceSnippetIds = input.evidenceSnippets.map((s) => s.id);

    const opening = (() => {
      const identity = thesis
        ? ensureSentence(thesis)
        : ensureSentence(
            title && company ? `I am applying for the ${title} opportunity at ${company}` : 'I am applying for this role',
          );
      const fit = ensureSentence(
        title && company
          ? `My focus is translating operational evidence into clear priorities and reliable execution for ${company}`
          : 'My focus is translating operational evidence into clear priorities and reliable execution',
      );
      return [identity, fit].filter(Boolean).join(' ').trim();
    })();

    const grouped = input.evidenceSnippets
      .map((s) => compactSnippet(s.text))
      .filter(Boolean)
      .slice(0, Math.max(6, input.maxBodyParagraphs * 4));

    const paragraphsRaw: string[] = [];
    for (let idx = 0; idx < grouped.length; idx += 3) {
      const a = grouped[idx];
      const b = grouped[idx + 1];
      const c = grouped[idx + 2];
      const joined = [a, b, c].filter(Boolean).join(' ');
      const connective = (() => {
        const lowered = joined.toLowerCase();
        if (/(incident|escalat|outage|reliab|availability)/.test(lowered)) {
          return 'This kept execution calm under pressure, tightened handoffs during escalations, and reduced avoidable coordination churn without overstating outcomes.';
        }
        if (/(workflow|process|runbook|playbook|handoff)/.test(lowered)) {
          return 'This improved handoffs, made ownership clearer, and reduced ambiguity in day-to-day decisions without inflating scope claims.';
        }
        if (/(queue|sla|support|customer|service)/.test(lowered)) {
          return 'This protected service quality by keeping operational signals and decisions explicit, and by making the work easier for partners to trust and review.';
        }
        return 'This strengthened execution by clarifying priorities, decision points, and ownership so the work stayed practical and reviewable.';
      })();
      paragraphsRaw.push(`${joined} ${connective}`);
    }

    const bodyParagraphs = chooseVariedOpenings(paragraphsRaw).slice(0, input.maxBodyParagraphs);
    const closing = (() => {
      const line1 = ensureSentence(
        company ? `I’d welcome the chance to discuss how I can contribute at ${company}` : 'I’d welcome the chance to discuss how I can contribute',
      );
      const line2 = ensureSentence(
        title && company
          ? `If you’re hiring for ${title}, I can bring a steady operating rhythm, clear handoffs, and evidence led decisions`
          : 'I can bring a steady operating rhythm, clear handoffs, and evidence led decisions',
      );
      return [line1, line2].filter(Boolean).join(' ').trim();
    })();

    const fullText = [opening, ...bodyParagraphs, closing].filter(Boolean).join('\n\n');
    const flags = this.detector.detect(fullText);

    return {
      opening,
      bodyParagraphs,
      closing,
      diagnostics: {
        genericLanguageFlags: flags,
        renderedEvidenceSnippetIds,
        narrativeStrategy: thesis ? 'thesis_first' : 'job_identity_first',
      },
    };
  }
}
