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

function inferRoleIdentity(corpus: string): string {
  const lowered = corpus.toLowerCase();
  if (/\b(service delivery|incident|escalation|support operations|support)\b/.test(lowered)) {
    return 'Senior service delivery and support operations leader';
  }
  if (/\b(customer operations|customer success|support)\b/.test(lowered)) {
    return 'Senior customer operations leader';
  }
  if (/\b(program management|program|operating rhythm|operational)\b/.test(lowered)) {
    return 'Senior operations leader';
  }
  if (/\b(infrastructure|systems|devops|sre|platform)\b/.test(lowered)) {
    return 'systems-focused operator';
  }
  return 'operations-focused professional';
}

const BILLING_DOMAIN_TERMS = [
  'billing',
  'invoice',
  'invoicing',
  'reconciliation',
  'reconcile',
  'entitlement',
  'metering',
  'usage metering',
  'credit',
  'dispute',
  'revenue',
];

function containsBillingDomain(text: string): boolean {
  const lowered = trimToText(text).toLowerCase();
  if (!lowered) return false;
  return BILLING_DOMAIN_TERMS.some((term) => lowered.includes(term));
}

function sanitizeThesisAgainstCorpus(thesis: string, corpus: string): string {
  const normalizedThesis = trimToText(thesis);
  if (!normalizedThesis) return '';

  // Domain-fidelity guard: do not introduce billing/invoice/entitlement narratives unless the baseline corpus already contains them.
  const corpusHasBillingDomain = containsBillingDomain(corpus);
  const thesisHasBillingDomain = containsBillingDomain(normalizedThesis);
  if (!thesisHasBillingDomain || corpusHasBillingDomain) return normalizedThesis;

  const sentences = normalizedThesis
    .split(/(?<=[.!?])\s+/)
    .map((s) => trimToText(s))
    .filter(Boolean);
  const filtered = sentences.filter((s) => !containsBillingDomain(s));
  return filtered.join(' ').trim();
}

function rewriteThesisVoice(thesis: string): string {
  const t = trimToText(thesis);
  if (!t) return '';

  // Avoid repetitive/generic "focused on" framing; keep meaning while shifting to senior operating-system voice.
  // This is a phrasing transform only (no new claims).
  const normalized = t
    .replace(/\bfocus(?:ed|ing)?\s+on\b/gi, 'leading')
    .replace(/\bfocus areas:\s*/gi, '')
    .replace(/\bexperienced\b/gi, 'Senior')
    .replace(/\b(customer\/support operations leader)\b/i, 'customer and support operations leader')
    // Fix common stitched phrasing like "leader leading ..."
    .replace(/\bleader\s+leading\b/gi, 'leader who leads')
    .replace(/\bleader\s+driving\b/gi, 'leader who drives');

  return trimToText(normalized);
}

export class ExecutiveSummaryComposer {
  private detector = new GenericLanguageDetector();

  private shouldDiscardThesis(thesis: string): boolean {
    const t = trimToText(thesis).toLowerCase();
    if (!t) return true;
    // Discard stitched/metadata thesis variants that read like a generator dump.
    if (/\bhighlights include\b/.test(t)) return true;
    if (/\bexperience as\b/.test(t) && /\bhighlights\b/.test(t)) return true;
    if (/:/.test(t) && /\b(led|built|standardized|implemented|managed|owned)\b/.test(t)) return true;
    return false;
  }

  private buildPrimarySentence(identity: string, corpus: string): string {
    const lowered = trimToText(corpus).toLowerCase();
    const mentionsIncidentsOrEscalations = /\b(incident response|incident|incidents|escalation|escalations)\b/.test(lowered);
    const mentionsCrossFunctional = /\b(cross-functional|cross functional|stakeholders?|partnered|coordina)\b/.test(lowered);
    const mentionsSystems = /\b(playbooks?|runbooks?|dashboards?|reporting|operating cadence|cadence|workflow|process)\b/.test(lowered);

    if (mentionsIncidentsOrEscalations && mentionsSystems && mentionsCrossFunctional) {
      return ensureSentence(
        `${identity} who runs escalation and incident operations and builds the playbooks, visibility, and cross-functional cadence teams use to execute consistently`,
      );
    }
    if (mentionsIncidentsOrEscalations && mentionsSystems) {
      return ensureSentence(
        `${identity} who runs escalation and incident operations and builds the operating systems teams use to execute consistently`,
      );
    }
    if (mentionsSystems && mentionsCrossFunctional) {
      return ensureSentence(
        `${identity} who builds the operating systems and cross-functional cadence teams use to execute consistently`,
      );
    }
    if (mentionsSystems) {
      return ensureSentence(`${identity} who builds the operating systems teams use to execute consistently`);
    }
    if (mentionsIncidentsOrEscalations) {
      return ensureSentence(`${identity} who runs escalation and incident operations with steady cross-functional execution`);
    }
    return ensureSentence(`${identity} who builds repeatable operating cadence for cross-functional execution`);
  }

  private buildSupportSentence(corpus: string, thesis: string): string {
    const lowered = `${trimToText(thesis)} ${trimToText(corpus)}`.toLowerCase();
    const hasOpsLanguage = /\b(operating|operational|systems|cadence|execution)\b/.test(lowered);
    if (hasOpsLanguage) return '';

    const mentionsDashboardsOrReporting = /\b(dashboards?|reporting|csat|queue)\b/.test(lowered);
    const mentionsPlaybooks = /\b(playbooks?|runbooks?)\b/.test(lowered);
    const mentionsIncidentsOrEscalations = /\b(incident|incidents|incident response|escalation|escalations)\b/.test(lowered);

    // Use only concepts that already exist in the corpus/thesis (no invented scope/metrics).
    if (mentionsDashboardsOrReporting && mentionsPlaybooks) {
      return ensureSentence('Builds the operating cadence, playbooks, and visibility teams need to execute consistently');
    }
    if (mentionsDashboardsOrReporting) {
      return ensureSentence('Builds the operating cadence and visibility teams need to execute consistently');
    }
    if (mentionsPlaybooks) {
      return ensureSentence('Builds the operating cadence and playbooks teams need to execute consistently');
    }
    if (mentionsIncidentsOrEscalations) {
      return ensureSentence('Builds repeatable operating cadence across teams to keep escalations and incidents running smoothly');
    }
    return ensureSentence('Builds repeatable operating cadence across teams to keep execution running smoothly');
  }

  private dedupeIncidentEscalationRepetition(summary: string): string {
    const text = trimToText(summary);
    if (!text) return '';
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => trimToText(s))
      .filter(Boolean);

    const hasIncidentsOrEscalations = (s: string) =>
      /\b(incident response|incident|incidents|escalation|escalations)\b/i.test(s);

    // If we already have one incident/escalation sentence, drop additional short "scope" repeats.
    let seen = false;
    const filtered = sentences.filter((s) => {
      if (!hasIncidentsOrEscalations(s)) return true;
      if (!seen) {
        seen = true;
        return true;
      }
      // Drop repetitive one-liners like "Known for ..." or "Operating scope ..." that restate the same pair.
      return wordCount(s) > 14;
    });

    return filtered.join(' ').trim();
  }

  compose(input: {
    positioningThesis?: string | null;
    experienceSnippets: string[];
    evidencePriorities?: string[] | null;
  }): {
    summary: string;
    genericLanguageFlags: ReturnType<GenericLanguageDetector['detect']>;
    source: 'authoritative_thesis' | 'inferred';
  } {
    const corpus = input.experienceSnippets.map((s) => trimToText(s)).filter(Boolean).join(' ');
    const rawThesis = rewriteThesisVoice(
      sanitizeThesisAgainstCorpus(trimToText(input.positioningThesis ?? ''), corpus),
    );
    const thesis = this.shouldDiscardThesis(rawThesis) ? '' : rawThesis;
    const identity = inferRoleIdentity(`${thesis} ${corpus}`);

    // Avoid injecting metadata-style competency inventory into the executive summary.
    // Evidence prioritization is handled elsewhere; the summary should read like a human-written positioning statement.

    const summary = (() => {
      const sentences: string[] = [];
      if (thesis) {
        const normalized = ensureSentence(thesis);
        const startsWithRole = /\b(Senior|Leader|Director|Head|Manager|Operator|Engineer|Specialist)\b/i.test(normalized);
        if (!startsWithRole) {
          sentences.push(
            ensureSentence(
              `${identity} who builds durable operating systems for cross-functional execution and measurable service outcomes`,
            ),
          );
        }
        sentences.push(normalized);
      } else {
        sentences.push(this.buildPrimarySentence(identity, corpus));
      }
      const supportSentence = this.buildSupportSentence(corpus, thesis);
      if (supportSentence) sentences.push(supportSentence);

      // Avoid label-like phrase lists by merging adjacent short clauses into a single, natural sentence.
      if (sentences.length >= 2) {
        const first = trimToText(sentences[0]);
        const second = trimToText(sentences[1]);
        const firstShort = wordCount(first) <= 12;
        const secondShort = wordCount(second) <= 14;
        if (firstShort && secondShort) {
          const merged = ensureSentence(`${first.replace(/[.!?]\s*$/, '')} who ${second.replace(/[.!?]\s*$/, '').replace(/^Builds\s+/i, 'builds ')}`);
          sentences.splice(0, 2, merged);
        }
      }

      const compact = sentences
        .map((s) => trimToText(s))
        .filter(Boolean)
        .join(' ')
        .trim();

      const deduped = this.dedupeIncidentEscalationRepetition(compact);

      // Keep summaries short and readable (avoid stitched, run-on paragraphs).
      const maxSummaryWords = 55;
      if (wordCount(deduped) > maxSummaryWords) {
        return capWords(deduped, maxSummaryWords);
      }
      return deduped;
    })();

    return {
      summary,
      genericLanguageFlags: this.detector.detect(summary),
      source: thesis ? 'authoritative_thesis' : 'inferred',
    };
  }
}
