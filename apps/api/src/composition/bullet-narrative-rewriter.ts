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

function softenBuzzwords(text: string): string {
  return text
    .replace(/\butilize\b/gi, 'use')
    .replace(/\bleverage\b/gi, 'use')
    .replace(/\bsynerg(?:y|ize)\b/gi, 'coordinate');
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

    const originalHasDigits = hasDigits(raw);
    let text = softenBuzzwords(raw);

    // Upgrade weak verb openings without inventing outcomes.
    text = text
      .replace(/^\s*managed\s+/i, 'Coordinated ')
      .replace(/^\s*worked\s+with\s+/i, 'Partnered with ')
      .replace(/^\s*helped\s+(?:with\s+)?/i, 'Supported ')
      .replace(/^\s*assisted\s+(?:with\s+)?/i, 'Supported ')
      .replace(/^\s*responsible\s+for\s+/i, 'Owned ');

    // Add operational framing only when the bullet is very short, and only as intent (not results).
    const short = trimToText(text).length < 70;
    if (short) {
      const hint = (() => {
        const role = `${trimToText(input.roleTitle)} ${trimToText(input.company)}`.toLowerCase();
        if (/\b(support|customer|service|incident|queue|sla)\b/.test(role)) {
          return 'to maintain service quality and reduce execution friction';
        }
        if (/\b(operations|ops|program|process|workflow)\b/.test(role)) {
          return 'to improve operating clarity and follow-through';
        }
        if (/\b(infrastructure|systems|devops|linux|platform|sre)\b/.test(role)) {
          return 'to improve reliability and day-to-day stability';
        }
        return 'to improve clarity and follow-through';
      })();
      text = `${trimToText(text).replace(/[.;:,\u2013\u2014-]+\s*$/g, '')}, ${hint}`;
    }

    // Avoid injecting numbers when none existed.
    if (!originalHasDigits) {
      text = text.replace(/\b\d+(?:\.\d+)?%?\b/g, '');
      text = text.replace(/\s{2,}/g, ' ').trim();
    }

    const rewritten = ensureSentence(text);
    const changed = trimToText(rewritten) !== trimToText(raw);
    const flags = this.detector.detect(rewritten);
    return { rewritten, changed, genericLanguageFlags: flags };
  }
}

