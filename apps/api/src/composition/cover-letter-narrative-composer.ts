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

function sentenceFromSnippet(text: string): string {
  const cleaned = ensureSentence(compactSnippet(text, 60));
  return cleaned.replace(/^[\s-]+/, '').trim();
}

function varyImpactSentence(source: string): string {
  const lowered = source.toLowerCase();
  const stableHash = (() => {
    let hash = 0;
    for (let i = 0; i < lowered.length; i += 1) {
      hash = (hash * 31 + lowered.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  })();
  const candidates = (() => {
    if (/(incident|escalat|outage|reliab|availability)/.test(lowered)) {
      return [
        'That keeps execution calm under pressure and makes escalation paths easier to trust.',
        'That improves reliability without overstating scope or outcomes.',
        'That tightens handoffs during escalations and reduces avoidable coordination churn.',
      ];
    }
    if (/(workflow|process|runbook|playbook|handoff)/.test(lowered)) {
      return [
        'That clarifies ownership and reduces ambiguity in day-to-day decisions.',
        'That turns good intentions into repeatable execution that teams can review.',
        'That strengthens handoffs and keeps expectations explicit across partners.',
      ];
    }
    if (/(queue|sla|support|customer|service)/.test(lowered)) {
      return [
        'That protects service quality by keeping signals and decisions explicit.',
        'That reduces friction for both customers and internal partners.',
        'That improves the operating rhythm without turning the letter into a checklist.',
      ];
    }
    return [
      'That keeps priorities clear and execution reviewable.',
      'That turns evidence into practical decisions teams can follow.',
      'That improves consistency without inflating claims.',
    ];
  })();
  return candidates[candidates.length ? stableHash % candidates.length : 0] ?? candidates[0];
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

function stripBillingDomainSentences(text: string): string {
  const sentences = trimToText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => trimToText(s))
    .filter(Boolean);
  return sentences.filter((s) => !containsBillingDomain(s)).join(' ').trim();
}

function sanitizeThesisAgainstEvidence(thesis: string, evidenceCorpus: string): string {
  const normalizedThesis = trimToText(thesis);
  if (!normalizedThesis) return '';
  if (!containsBillingDomain(normalizedThesis)) return normalizedThesis;
  if (containsBillingDomain(evidenceCorpus)) return normalizedThesis;
  return stripBillingDomainSentences(normalizedThesis);
}

export class CoverLetterNarrativeComposer {
  private detector = new GenericLanguageDetector();

  private buildBodyParagraph(snippets: string[]): string {
    const cleaned = snippets.map((s) => trimToText(s)).filter(Boolean);
    const first = cleaned[0] ? sentenceFromSnippet(cleaned[0]) : '';
    const second = cleaned[1]
      ? ensureSentence(`For example, ${compactSnippet(cleaned[1], 50)}`)
      : '';
    const impact = cleaned.length ? ensureSentence(varyImpactSentence(cleaned.join(' '))) : '';
    return [first, second, impact].filter(Boolean).join(' ').trim();
  }

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
    const evidenceCorpus = input.evidenceSnippets.map((s) => trimToText(s.text)).filter(Boolean).join(' ');
    const thesis = sanitizeThesisAgainstEvidence(trimToText(input.thesis ?? ''), evidenceCorpus);
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
    for (let idx = 0; idx < grouped.length; idx += 2) {
      const a = grouped[idx];
      const b = grouped[idx + 1];
      const paragraph = this.buildBodyParagraph([a, b].filter(Boolean) as string[]);
      if (paragraph) paragraphsRaw.push(paragraph);
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

    // Domain-fidelity guard: avoid introducing billing-domain narrative unless supported by evidence snippets.
    const corpusHasBilling = containsBillingDomain(evidenceCorpus);
    const safeOpening = corpusHasBilling ? opening : stripBillingDomainSentences(opening);
    const safeBody = corpusHasBilling ? bodyParagraphs : bodyParagraphs.map(stripBillingDomainSentences).filter(Boolean);
    const safeClosing = corpusHasBilling ? closing : stripBillingDomainSentences(closing);

    const fullText = [safeOpening, ...safeBody, safeClosing].filter(Boolean).join('\n\n');
    const flags = this.detector.detect(fullText);

    return {
      opening: safeOpening,
      bodyParagraphs: safeBody,
      closing: safeClosing,
      diagnostics: {
        genericLanguageFlags: flags,
        renderedEvidenceSnippetIds,
        narrativeStrategy: thesis ? 'thesis_first' : 'job_identity_first',
      },
    };
  }
}
