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
  const starters = ['In prior roles,', 'Across teams,', 'In practice,', 'One consistent pattern is', 'A concrete example is'];
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

const BILLING_DOMAIN_TERMS = ['billing', 'invoice', 'invoicing', 'reconciliation', 'reconcile', 'entitlement', 'metering', 'usage metering', 'credit', 'dispute', 'revenue'];

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

type CanonicalEvidenceUnit = {
  id: string;
  text: string;
  sourceBlockId: string;
  sourceSectionType: string;
  classification: 'accomplishment' | 'responsibility' | 'outcome' | 'operational_result';
  verificationState: 'verified';
  eligibleForNarrativeComposition: boolean;
};

type ParagraphKey = 'opening' | 'body_1' | 'body_2' | 'closing';

type ParagraphEvidence = {
  paragraphKey: ParagraphKey;
  sourceEvidenceIds: string[];
  anchorTexts?: string[];
};

function jobContextSentence(jobTitle?: string | null, jobCompany?: string | null): string {
  const title = trimToText(jobTitle ?? '');
  const company = trimToText(jobCompany ?? '');
  if (title && company) {
    return `I am focused on the ${title} role at ${company}.`;
  }
  if (title) {
    return `I am focused on the ${title} role.`;
  }
  if (company) {
    return `I am focused on the opportunity at ${company}.`;
  }
  return '';
}

function splitEvidenceIntoBodyGroups(snippets: CanonicalEvidenceUnit[]): CanonicalEvidenceUnit[][] {
  const usable = snippets.slice(0, 6);
  if (usable.length === 0) return [];
  if (usable.length === 1) return [usable];

  const midpoint = Math.ceil(usable.length / 2);
  const first = usable.slice(0, midpoint);
  const second = usable.slice(midpoint);
  return second.length > 0 ? [first, second] : [first];
}

function buildParagraphText(args: {
  snippets: CanonicalEvidenceUnit[];
  jobTitle?: string | null;
  jobCompany?: string | null;
  paragraphIndex: number;
}): string {
  const { snippets, jobTitle, jobCompany, paragraphIndex } = args;
  const sentenceParts: string[] = [];

  const evidenceSentences = snippets
    .map((snippet) => sentenceFromSnippet(snippet.text))
    .filter(Boolean);
  if (evidenceSentences.length > 0) {
    sentenceParts.push(...evidenceSentences.slice(0, 2));
  }

  const secondSnippet = snippets[1];
  if (secondSnippet) {
    sentenceParts.push(ensureSentence(`For example, ${compactSnippet(secondSnippet.text, 38)}`));
  }
  const context = jobContextSentence(jobTitle, jobCompany);
  if (context) {
    sentenceParts.push(context);
  }

  if (snippets.length > 0) {
    sentenceParts.push(
      ensureSentence(
        'Those details keep the work anchored to concrete outcomes, clear ownership, and steady follow through.',
      ),
    );
    sentenceParts.push(ensureSentence('This gives the hiring team a direct line from the evidence to the role fit.'));
  }

  const impact = varyImpactSentence(`${snippets.map((snippet) => snippet.text).join(' ')} ${paragraphIndex}`).replace(/[.!?]\s*$/, '');
  const laneSuffix =
    paragraphIndex === 1
      ? 'across the first operating lane.'
      : 'across the second operating lane.';
  sentenceParts.push(ensureSentence(`${impact} ${laneSuffix}`));

  return sentenceParts.filter(Boolean).join(' ').trim();
}

function buildClosingText(args: {
  snippets: CanonicalEvidenceUnit[];
  jobTitle?: string | null;
  jobCompany?: string | null;
}): string {
  const { snippets, jobTitle, jobCompany } = args;
  const sentenceParts: string[] = [];
  const finalSnippet = snippets[snippets.length - 1];

  if (finalSnippet) {
    sentenceParts.push(sentenceFromSnippet(finalSnippet.text));
  }

  const title = trimToText(jobTitle ?? '');
  const company = trimToText(jobCompany ?? '');
  if (title && company) {
    sentenceParts.push(
      ensureSentence(
        `I would welcome the chance to discuss how this background supports the ${title} role at ${company}.`,
      ),
    );
  } else if (title) {
    sentenceParts.push(
      ensureSentence(
        `I would welcome the chance to discuss how this background supports the ${title} role.`,
      ),
    );
  } else if (company) {
    sentenceParts.push(
      ensureSentence(
        `I would welcome the chance to discuss how this background supports the opportunity at ${company}.`,
      ),
    );
  } else {
    sentenceParts.push('I would welcome the chance to discuss the fit in more detail.');
  }

  sentenceParts.push(
    ensureSentence("Thank you for considering how this experience could support the next stage of your team's work."),
  );
  sentenceParts.push(ensureSentence('I would welcome a conversation about how to apply that background in the role.'));

  return sentenceParts.filter(Boolean).join(' ').trim();
}

export class CoverLetterNarrativeComposer {
  private detector = new GenericLanguageDetector();

  compose(input: {
    thesis: string | null;
    evidenceUnits: CanonicalEvidenceUnit[];
    jobCompany?: string | null;
    jobTitle?: string | null;
    maxBodyParagraphs: number;
  }): {
    opening: string;
    bodyParagraphs: string[];
    closing: string;
    paragraphEvidence: ParagraphEvidence[];
    diagnostics: {
      genericLanguageFlags: ReturnType<GenericLanguageDetector['detect']>;
      renderedEvidenceSnippetIds: string[];
      narrativeStrategy: string;
    };
  } {
    const evidenceCorpus = input.evidenceUnits.map((s) => trimToText(s.text)).filter(Boolean).join(' ');
    const thesis = sanitizeThesisAgainstEvidence(trimToText(input.thesis ?? ''), evidenceCorpus);
    const renderedEvidenceSnippetIds = input.evidenceUnits.map((s) => s.id);

    const jobTitle = trimToText(input.jobTitle ?? '');
    const jobCompany = trimToText(input.jobCompany ?? '');
    const bodyParagraphGroups = splitEvidenceIntoBodyGroups(input.evidenceUnits).slice(
      0,
      Math.min(Math.max(input.maxBodyParagraphs, 0), 2),
    );

    const openingEvidence = input.evidenceUnits.slice(0, Math.min(2, input.evidenceUnits.length));
    const openingParts = [
      thesis,
      openingEvidence[0] ? sentenceFromSnippet(openingEvidence[0].text) : '',
      openingEvidence[1] ? sentenceFromSnippet(openingEvidence[1].text) : '',
      jobContextSentence(jobTitle, jobCompany),
      ensureSentence('The result is a role-specific narrative that stays tied to the supplied baseline evidence.'),
      ensureSentence('It keeps the opening concrete, reviewable, and easy to audit.'),
    ].filter(Boolean);
    const opening = chooseVariedOpenings([openingParts.join(' ')])[0] ?? '';

    const bodyParagraphs = chooseVariedOpenings(
      bodyParagraphGroups.map((group, index) =>
        buildParagraphText({ snippets: group, jobTitle, jobCompany, paragraphIndex: index + 1 }),
      ),
    );
    const closing = buildClosingText({
      snippets: input.evidenceUnits.slice(-1),
      jobTitle,
      jobCompany,
    });

    const paragraphEvidence: ParagraphEvidence[] = [];
    if (opening) {
      paragraphEvidence.push({
        paragraphKey: 'opening',
        sourceEvidenceIds: openingEvidence.map((snippet) => snippet.id).filter(Boolean),
        anchorTexts: openingEvidence.map((snippet) => compactSnippet(snippet.text, 24)).filter(Boolean),
      });
    }
    bodyParagraphGroups.forEach((group, index) => {
      if (!group.length) return;
      const paragraphKey: ParagraphKey = index === 0 ? 'body_1' : 'body_2';
      paragraphEvidence.push({
        paragraphKey,
        sourceEvidenceIds: group.map((snippet) => snippet.id).filter(Boolean),
        anchorTexts: group.map((snippet) => compactSnippet(snippet.text, 24)).filter(Boolean),
      });
    });
    if (closing) {
      const finalEvidence = input.evidenceUnits.slice(-1);
      paragraphEvidence.push({
        paragraphKey: 'closing',
        sourceEvidenceIds: finalEvidence.map((snippet) => snippet.id).filter(Boolean),
        anchorTexts: finalEvidence.map((snippet) => compactSnippet(snippet.text, 24)).filter(Boolean),
      });
    }

    const fullText = [opening, ...bodyParagraphs, closing].filter(Boolean).join('\n\n');
    const flags = this.detector.detect(fullText);

    return {
      opening,
      bodyParagraphs,
      closing,
      paragraphEvidence,
      diagnostics: {
        genericLanguageFlags: flags,
        renderedEvidenceSnippetIds,
        narrativeStrategy: thesis ? 'thesis_first' : 'canonical_absence',
      },
    };
  }
}
