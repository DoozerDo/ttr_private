import { GenericLanguageDetector } from './generic-language-detector';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function ensureSentence(value: string): string {
  const text = trimToText(value);
  if (!text) return '';
  return /[.!?]\s*$/.test(text) ? text : `${text}.`;
}

function hasDigits(text: string): boolean {
  return /\d/.test(text);
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

function stripBillingDomainClauses(text: string): string {
  // Bullet-friendly filter: drop sentences that contain billing-domain terms.
  const sentences = trimToText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => trimToText(s))
    .filter(Boolean);
  return sentences.filter((s) => !containsBillingDomain(s)).join(' ').trim();
}

function wordCount(text: string): number {
  return trimToText(text).split(' ').filter(Boolean).length;
}

function capWords(text: string, maxWords: number): string {
  const normalized = trimToText(text);
  if (!normalized) return '';
  const words = normalized.split(' ').filter(Boolean);
  if (words.length <= maxWords) return normalized;
  return `${words.slice(0, maxWords).join(' ')}...`.replace(/\s{2,}/g, ' ').trim();
}

function softenBuzzwords(text: string): string {
  return text
    .replace(/\butilize\b/gi, 'use')
    .replace(/\bleverage\b/gi, 'use')
    .replace(/\bsynerg(?:y|ize)\b/gi, 'coordinate');
}

function reduceInventoryTone(text: string): string {
  const normalized = trimToText(text);
  if (!normalized) return '';

  const commaCount = (normalized.match(/,/g) ?? []).length;
  if (commaCount < 3) return normalized;

  const parts = normalized.split(',').map((p) => trimToText(p)).filter(Boolean);
  if (parts.length < 4) return normalized;

  const head = parts.slice(0, 2).join(', ');
  const including = parts.slice(2, 4);
  const tail = including.length === 2 ? `${including[0]} and ${including[1]}` : including[0] ?? '';
  const suffix = tail ? `, including ${tail}` : '';
  return `${head}${suffix}`.replace(/\s{2,}/g, ' ').trim();
}

function preferActionVerbOpening(text: string): string {
  const normalized = trimToText(text);
  if (!normalized) return '';

  if (
    /^\s*(Owned|Led|Drove|Delivered|Shipped|Launched|Built|Created|Improved|Reduced|Standardized|Partnered|Coordinated|Supported)\b/i.test(
      normalized,
    )
  ) {
    return normalized;
  }

  return normalized
    .replace(/^\s*optimized\s+/i, 'Improved ')
    .replace(/^\s*handled\s+/i, 'Owned ')
    .replace(/^\s*participated\s+in\s+/i, 'Supported ')
    .replace(/^\s*involved\s+in\s+/i, 'Supported ')
    .replace(/^\s*responsible\s+for\s+/i, 'Owned ');
}

function reframeImplementationScale(text: string): string {
  const normalized = trimToText(text);
  if (!normalized) return '';

  // Avoid leading with "lines of code" / raw implementation-scale metrics; keep the metric as supporting detail.
  // This preserves the verified number without inventing outcomes or leadership scope.
  const match = normalized.match(
    /^(?:Built|Wrote|Developed|Delivered)\s+([\d,]+(?:\.\d+)?\+?)\s*(?:lines of code|lines of)\s+([^,.;]+?)(?:(?:\s+across|\s+for|\s+to)\b|[,.]|$)(.*)$/i,
  );
  if (!match) return normalized;

  const count = match[1] ?? '';
  const subject = trimToText(match[2] ?? '');
  const rest = trimToText(match[3] ?? '').replace(/^[,.;:\s]+/, '');

  const suffix = rest ? ` ${rest}` : '';
  return `Delivered substantial ${subject} delivery${suffix} (${count} lines)`.replace(/\s{2,}/g, ' ').trim();
}

function stableHash(text: string): number {
  // Deterministic, fast, stable across runtimes (no crypto).
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  }
  return Math.abs(hash);
}

function hasClearOutcomeOrIntent(text: string): boolean {
  const normalized = trimToText(text).toLowerCase();
  if (!normalized) return false;
  if (/\b(to|so that)\b\s+\w+/.test(normalized)) return true;
  if (/\bby\b\s+\w+/.test(normalized)) return true;
  if (/\d/.test(normalized)) return true;
  if (/\b(result(?:ed)? in|leading to|which (?:re)?duced|which improved)\b/.test(normalized)) return true;
  return false;
}

function isGenericFillerBullet(text: string): boolean {
  const normalized = trimToText(text).toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('verified professional experience')) return true;
  if (/^experienced\s+\w+/.test(normalized) && normalized.length < 55) return true;
  if (/\bproven track record\b/.test(normalized)) return true;
  return false;
}

function deMechanicalizeIntentClause(text: string): string {
  const normalized = trimToText(text);
  if (!normalized) return '';
  // Convert ", to <verb> ..." into a more natural "that <verb> ..." construction when safe.
  // This is phrasing-only; it does not add new claims.
  if (/, to\b/i.test(normalized)) {
    return normalized.replace(/,\s*to\s+/i, ' that ').replace(/\s{2,}/g, ' ').trim();
  }
  return normalized;
}

function reduceAbstractTailLanguage(text: string): string {
  const normalized = trimToText(text);
  if (!normalized) return '';

  // Replace generic, abstract tails with concrete operational language (no new claims).
  // Only transforms phrasing; does not introduce metrics, timelines, or new scope.
  return normalized
    .replace(/\bimprove consistency\b/gi, 'standardize execution')
    .replace(/\bimpro(?:ve|ved)\s+customer-facing execution\b/gi, 'tighten customer-facing workflows')
    .replace(/\bstrengthen service reliability\b/gi, 'improve incident response execution')
    .replace(/\bstrengthen reliability\b/gi, 'improve incident response execution')
    .replace(/\bimprove execution\b/gi, 'improve operating cadence')
    .replace(/\bimprove consistency across\b/gi, 'standardize execution across')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export class BulletNarrativeRewriter {
  private detector = new GenericLanguageDetector();

  rewrite(input: {
    bullet: string;
    roleTitle?: string | null;
    company?: string | null;
    positioningThemes?: string[] | null;
  }): { rewritten: string; changed: boolean; genericLanguageFlags: ReturnType<GenericLanguageDetector['detect']> } {
    const raw = trimToText(input.bullet);
    if (!raw) return { rewritten: '', changed: false, genericLanguageFlags: [] };

    // Keep filler out of top bullets by collapsing to empty (caller will drop).
    if (isGenericFillerBullet(raw)) {
      return { rewritten: '', changed: true, genericLanguageFlags: this.detector.detect(raw) };
    }

    const originalHasDigits = hasDigits(raw);
    const originalHasBillingDomain = containsBillingDomain(raw);
    let text = softenBuzzwords(raw);

    // Reduce inventory-style phrasing without changing the underlying claim.
    text = text
      .replace(/^\s*(?:Responsible for|Tasked with)\s+/i, 'Owned ')
      .replace(/\bservices include\b/gi, 'including');

    // Prefer outcome/ownership framing before implementation-scale metrics.
    text = reframeImplementationScale(text);

    // Upgrade weak verb openings without inventing outcomes.
    text = text
      .replace(/^\s*managed\s+/i, 'Coordinated ')
      .replace(/^\s*worked\s+with\s+/i, 'Partnered with ')
      .replace(/^\s*helped\s+(?:with\s+)?/i, 'Supported ')
      .replace(/^\s*assisted\s+(?:with\s+)?/i, 'Supported ')
      .replace(/^\s*responsible\s+for\s+/i, 'Owned ');

    text = preferActionVerbOpening(text);
    text = reduceInventoryTone(text);

    // Add operational framing only when the bullet is very short, and only as intent (not results).
    const short = trimToText(text).length < 70;
    if (short && !hasClearOutcomeOrIntent(text)) {
      const hint = (() => {
        const role = `${trimToText(input.roleTitle)} ${trimToText(input.company)}`.toLowerCase();
        if (/\b(support|customer|service|incident|queue|sla)\b/.test(role)) {
          const variants = [
            'to strengthen service reliability and escalation discipline',
            'to improve customer-facing execution and operating cadence',
            'to reduce avoidable escalations and improve consistency',
          ];
          return variants[stableHash(`${role}:${text}`) % variants.length] ?? variants[0];
        }
        if (/\b(operations|ops|program|process|workflow)\b/.test(role)) {
          const variants = [
            'to improve operating clarity and follow-through',
            'to tighten process execution and decision velocity',
            'to create repeatable operating rhythms across teams',
          ];
          return variants[stableHash(`${role}:${text}`) % variants.length] ?? variants[0];
        }
        if (/\b(infrastructure|systems|devops|linux|platform|sre)\b/.test(role)) {
          const variants = [
            'to improve reliability and day-to-day stability',
            'to reduce operational toil and stabilize delivery',
            'to improve incident prevention and recovery discipline',
          ];
          return variants[stableHash(`${role}:${text}`) % variants.length] ?? variants[0];
        }
        const variants = [
          'to improve clarity and follow-through',
          'to improve execution consistency across stakeholders',
          'to reduce friction and improve throughput',
        ];
        return variants[stableHash(`${role}:${text}`) % variants.length] ?? variants[0];
      })();
      text = `${trimToText(text).replace(/[.;:,\u2013\u2014-]+\s*$/g, '')}, ${hint}`;
    }

    // Reduce mechanical ", to ..." constructions into more natural accomplishment phrasing.
    text = deMechanicalizeIntentClause(text);
    text = reduceAbstractTailLanguage(text);

    // Avoid injecting numbers when none existed.
    if (!originalHasDigits) {
      text = text.replace(/\b\d+(?:\.\d+)?%?\b/g, '');
      text = text.replace(/\s{2,}/g, ' ').trim();
    }

    // Domain-fidelity guard: do not introduce billing-domain narrative unless it was present in baseline bullet text.
    if (!originalHasBillingDomain && containsBillingDomain(text)) {
      text = stripBillingDomainClauses(text);
    }

    const maxWords = 28;
    if (wordCount(text) > maxWords) {
      text = capWords(text, maxWords);
    }

    const rewritten = ensureSentence(text);
    const changed = trimToText(rewritten) !== trimToText(raw);
    const flags = this.detector.detect(rewritten);
    return { rewritten, changed, genericLanguageFlags: flags };
  }
}
