import { GenericLanguageDetector } from './generic-language-detector';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function ensureSentence(value: string): string {
  const text = trimToText(value);
  if (!text) return '';
  return /[.!?]\s*$/.test(text) ? text : `${text}.`;
}

function wordCount(text: string): number {
  return trimToText(text).split(' ').filter(Boolean).length;
}

function capWords(text: string, maxWords: number): string {
  const words = trimToText(text).split(' ').filter(Boolean);
  if (words.length <= maxWords) return trimToText(text);
  return `${words.slice(0, maxWords).join(' ')}.`.replace(/\.\.+$/g, '.').trim();
}

function joinThemes(themes: string[]): string {
  if (!themes.length) return '';
  if (themes.length === 1) return themes[0] ?? '';
  if (themes.length === 2) return `${themes[0]} and ${themes[1]}`;
  return `${themes[0]}, ${themes[1]}, and ${themes[2]}`;
}

function inferRoleIdentity(corpus: string): string {
  const lowered = corpus.toLowerCase();
  if (/\b(service delivery|incident|escalation|support operations|support)\b/.test(lowered)) {
    return 'service delivery and incident operations leader';
  }
  if (/\b(customer operations|customer success|support)\b/.test(lowered)) {
    return 'customer operations leader';
  }
  if (/\b(program management|program|operating rhythm|operational)\b/.test(lowered)) {
    return 'operations leader';
  }
  if (/\b(infrastructure|systems|devops|sre|platform)\b/.test(lowered)) {
    return 'systems-focused operator';
  }
  return 'operations-focused professional';
}

export class ExecutiveSummaryComposer {
  private detector = new GenericLanguageDetector();

  compose(input: {
    positioningThesis?: string | null;
    experienceSnippets: string[];
    evidencePriorities?: string[] | null;
  }): {
    summary: string;
    genericLanguageFlags: ReturnType<GenericLanguageDetector['detect']>;
    source: 'authoritative_thesis' | 'inferred';
  } {
    const thesis = trimToText(input.positioningThesis ?? '');
    const corpus = input.experienceSnippets.map((s) => trimToText(s)).filter(Boolean).join(' ');
    const identity = inferRoleIdentity(`${thesis} ${corpus}`);

    const themes = (input.evidencePriorities ?? [])
      .map((t) => trimToText(t))
      .filter(Boolean)
      // Avoid keyword stuffing from long theme phrases; keep short recruiter-readable anchors.
      .filter((t) => t.length <= 34);
    const themeClause = (() => {
      const picked = themes.slice(0, 2);
      if (!picked.length) return '';
      return ensureSentence(`Focus areas: ${joinThemes(picked)}`);
    })();

    const summary = (() => {
      const sentences: string[] = [];
      if (thesis) {
        const normalized = ensureSentence(thesis);
        const startsWithRole = /\b(leader|manager|operator|engineer|specialist)\b/i.test(normalized);
        if (!startsWithRole) sentences.push(ensureSentence(identity));
        sentences.push(normalized);
      } else {
        sentences.push(ensureSentence(identity));
      }
      if (themeClause) sentences.push(themeClause);

      const compact = sentences
        .map((s) => trimToText(s))
        .filter(Boolean)
        .join(' ')
        .trim();

      // Keep summaries short and readable (avoid stitched, run-on paragraphs).
      const maxSummaryWords = 55;
      if (wordCount(compact) > maxSummaryWords) {
        return capWords(compact, maxSummaryWords);
      }
      return compact;
    })();

    return {
      summary,
      genericLanguageFlags: this.detector.detect(summary),
      source: thesis ? 'authoritative_thesis' : 'inferred',
    };
  }
}
