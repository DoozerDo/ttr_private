import type { NormalizedResumeDocument } from '../documents/normalized-document.models';

export type ArtifactQualityStatus = 'pass' | 'needs_refinement';

export type ArtifactQualityGate = {
  status: ArtifactQualityStatus;
  reasons: string[];
};

const DANGLING_TRAILING_WORDS = new Set(
  [
    'the',
    'a',
    'an',
    'and',
    'but',
    'because',
    'with',
    'for',
    'to',
    'of',
    'in',
    'on',
    'at',
    'by',
    'from',
  ].map((value) => value.toLowerCase()),
);

const PLACEHOLDER_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'placeholder:TBD', pattern: /\bTBD\b/i },
  { label: 'placeholder:TODO', pattern: /\bTODO\b/i },
  { label: 'placeholder:Lorem ipsum', pattern: /\bLorem ipsum\b/i },
  { label: 'placeholder:Insert', pattern: /\bInsert\b/i },
  { label: 'placeholder:Placeholder', pattern: /\bPlaceholder\b/i },
  { label: 'placeholder:N/A', pattern: /^(?:N\/A|NA)\b/i },
];

const COVER_BANNED_PHRASES: Array<{ label: string; pattern: RegExp }> = [
  { label: "banned_phrase:'operating context'", pattern: /\boperating context\b/i },
  { label: "banned_phrase:'execution systems'", pattern: /\bexecution systems\b/i },
  { label: "banned_phrase:'lens'", pattern: /\blens\b/i },
  { label: "banned_phrase:'strongest fit'", pattern: /\bstrongest fit\b/i },
];

function trimToText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeForTrailingCheck(value: string): string {
  return value
    .trim()
    .replace(/[\s\u00A0]+$/g, '')
    .replace(/[\s.,;:!?)}\]"'`]+$/g, '')
    .trim();
}

function endsWithDanglingFragment(value: string): boolean {
  const normalized = normalizeForTrailingCheck(value);
  if (!normalized) return false;
  const lastToken = normalized.split(/\s+/).pop()?.toLowerCase() ?? '';
  if (!lastToken) return false;
  return DANGLING_TRAILING_WORDS.has(lastToken);
}

function detectPlaceholderReasons(value: string): string[] {
  const raw = trimToText(value);
  if (!raw) return [];
  return PLACEHOLDER_PATTERNS.filter((entry) => entry.pattern.test(raw)).map((entry) => entry.label);
}

function detectTrailingFragmentReason(value: string): string | null {
  const raw = trimToText(value);
  if (!raw) return null;
  return endsWithDanglingFragment(raw) ? 'incomplete_trailing_fragment' : null;
}

export function validateResumeArtifactQuality(
  resume: NormalizedResumeDocument | null,
): ArtifactQualityGate {
  if (!resume) {
    return {
      status: 'needs_refinement',
      reasons: ['missing_model'],
    };
  }

  const reasons: string[] = [];

  if (typeof resume.summary === 'string') {
    reasons.push(...detectPlaceholderReasons(resume.summary));
    const trailing = detectTrailingFragmentReason(resume.summary);
    if (trailing) reasons.push(trailing);
    if (!trimToText(resume.summary)) {
      reasons.push('empty_summary');
    }
  }

  const experience = Array.isArray(resume.experience) ? resume.experience : [];
  for (const entry of experience) {
    const company = trimToText((entry as any)?.company);
    const roleTitle = trimToText((entry as any)?.roleTitle);
    const bullets = Array.isArray((entry as any)?.bullets)
      ? ((entry as any).bullets as unknown[])
          .map((b) => trimToText(b))
          .filter(Boolean)
      : [];

    if ((company || roleTitle) && bullets.length === 0) {
      reasons.push('empty_role');
    }

    for (const bullet of bullets) {
      reasons.push(...detectPlaceholderReasons(bullet));
      const trailing = detectTrailingFragmentReason(bullet);
      if (trailing) reasons.push(trailing);
    }
  }

  const unique = Array.from(new Set(reasons));
  return {
    status: unique.length > 0 ? 'needs_refinement' : 'pass',
    reasons: unique,
  };
}

export function validateCoverLetterArtifactQuality(
  paragraphs: string[] | null | undefined,
): ArtifactQualityGate {
  const normalizedParagraphs = Array.isArray(paragraphs)
    ? paragraphs.map((p) => String(p ?? '')).filter(Boolean)
    : [];

  const fullText = normalizedParagraphs.map((p) => trimToText(p)).filter(Boolean).join('\n');
  if (!fullText) {
    return {
      status: 'needs_refinement',
      reasons: ['missing_content'],
    };
  }

  const reasons: string[] = [];
  for (const entry of COVER_BANNED_PHRASES) {
    if (entry.pattern.test(fullText)) {
      reasons.push(entry.label);
    }
  }

  const opening = trimToText(normalizedParagraphs.find((p) => trimToText(p)) ?? '');
  const openingLower = opening.toLowerCase();
  if (openingLower.includes('the strongest fit comes from')) {
    reasons.push('generic_opening:strongest_fit');
  }
  if (openingLower.includes('my background aligns because')) {
    reasons.push('generic_opening:aligns_because');
  }

  for (const paragraph of normalizedParagraphs) {
    reasons.push(...detectPlaceholderReasons(paragraph));
    const trailing = detectTrailingFragmentReason(paragraph);
    if (trailing) reasons.push(trailing);
  }

  const unique = Array.from(new Set(reasons));
  return {
    status: unique.length > 0 ? 'needs_refinement' : 'pass',
    reasons: unique,
  };
}

function removeDanglingTrailingWord(text: string): string {
  const normalized = normalizeForTrailingCheck(text);
  if (!normalized) return '';
  const tokens = normalized.split(/\s+/);
  if (tokens.length === 0) return '';
  const last = tokens[tokens.length - 1]?.toLowerCase() ?? '';
  if (!DANGLING_TRAILING_WORDS.has(last)) return text.trim();
  return tokens.slice(0, -1).join(' ').trim();
}

export function repairResumeForQuality(
  resume: NormalizedResumeDocument,
  gate: ArtifactQualityGate,
): NormalizedResumeDocument {
  if (gate.status !== 'needs_refinement') return resume;

  const summary = typeof resume.summary === 'string' ? removeDanglingTrailingWord(resume.summary) : resume.summary;
  const experience = (Array.isArray(resume.experience) ? resume.experience : []).map((entry) => {
    const bullets = Array.isArray((entry as any)?.bullets)
      ? ((entry as any).bullets as unknown[])
          .map((bullet) => {
            const raw = trimToText(bullet);
            if (!raw) return '';
            return removeDanglingTrailingWord(raw);
          })
          .filter(Boolean)
      : (entry as any).bullets;
    return { ...(entry as any), bullets };
  });

  return {
    ...(resume as any),
    ...(typeof summary === 'string' ? { summary } : {}),
    experience: experience as any,
  };
}

export function repairCoverLetterForQuality(
  paragraphs: string[],
  gate: ArtifactQualityGate,
): string[] {
  if (gate.status !== 'needs_refinement') return paragraphs;

  const bannedRewrites: Array<[RegExp, string]> = [
    [/\boperating context\b/gi, 'operational context'],
    [/\bexecution systems\b/gi, 'execution approach'],
    [/\bstrongest fit\b/gi, 'best fit'],
    [/\blens\b/gi, 'view'],
  ];

  return (paragraphs ?? [])
    .map((paragraph) => {
      let next = String(paragraph ?? '');
      for (const [pattern, replacement] of bannedRewrites) {
        next = next.replace(pattern, replacement);
      }
      next = removeDanglingTrailingWord(next);
      return next.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

