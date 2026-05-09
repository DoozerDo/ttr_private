import { GenericLanguageDetector } from './generic-language-detector';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function ensureSentence(value: string): string {
  const text = trimToText(value);
  if (!text) return '';
  return /[.!?]\s*$/.test(text) ? text : `${text}.`;
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

    const themes = (input.evidencePriorities ?? []).map((t) => trimToText(t)).filter(Boolean);
    const themeClause = themes.length ? `Focused on ${themes.slice(0, 3).join(', ')}.` : '';

    const summary = (() => {
      if (thesis) {
        const normalized = ensureSentence(thesis);
        // Ensure the summary contains an explicit identity statement up-front when the thesis is vague.
        const startsStrong = /\b(leader|manager|operator|engineer|specialist)\b/i.test(normalized);
        const identitySentence = startsStrong ? '' : ensureSentence(`${identity} with a bias for execution systems and operational clarity`);
        return [identitySentence, normalized, themeClause].filter(Boolean).join(' ').trim();
      }
      return [ensureSentence(identity), themeClause].filter(Boolean).join(' ').trim();
    })();

    return {
      summary,
      genericLanguageFlags: this.detector.detect(summary),
      source: thesis ? 'authoritative_thesis' : 'inferred',
    };
  }
}

