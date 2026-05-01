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

const EXPERIENCE_TITLE_ACTION_VERBS = new Set(
  [
    'designed',
    'built',
    'led',
    'managed',
    'created',
    'implemented',
    'developed',
    'owned',
    'improved',
    'reduced',
    'increased',
    'delivered',
    'supported',
    'maintained',
    'coordinated',
    'partnered',
    'collaborated',
    'architected',
    'automated',
    'migrated',
    'troubleshot',
    'resolved',
  ].map((value) => value.toLowerCase()),
);

const EXPERIENCE_TITLE_DANGLING_SUFFIXES = new Set(
  [
    'and',
    'or',
    'with',
    'for',
    'to',
    'of',
    'full',
    'senior',
    'lead',
    'principal',
    'technical',
    'software',
    'frontend',
    'backend',
    'cloud',
    'platform',
    'systems',
  ].map((value) => value.toLowerCase()),
);

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

function trimToLastTerminalPunctuation(value: string): string {
  const text = trimToText(value);
  if (!text) return '';
  const lastMatch = text.match(/[\s\S]*[.!?](?=\s*$|\s+)/);
  return lastMatch ? trimToText(lastMatch[0]) : '';
}

/**
 * Remove trailing fragment-like lines (e.g. ending with "the", "and", "with") from generated text.
 * This is a post-processing safety net and should run before persisting artifacts.
 */
export function trimIncompleteTrailingFragments(text: string): string {
  const raw = typeof text === 'string' ? text : '';
  const lines = raw.split(/\r?\n/);

  const cleaned: string[] = [];
  for (const line of lines) {
    const trimmed = trimToText(line);
    if (!trimmed) {
      cleaned.push('');
      continue;
    }

    if (!endsWithDanglingFragment(trimmed)) {
      cleaned.push(trimmed);
      continue;
    }

    const trimmedToSentence = trimToLastTerminalPunctuation(trimmed);
    if (trimmedToSentence.length >= 10 && !endsWithDanglingFragment(trimmedToSentence)) {
      cleaned.push(trimmedToSentence);
      continue;
    }

    // Drop this line; it looks like an incomplete fragment and we couldn't safely trim it.
    cleaned.push('');
  }

  // Collapse consecutive empty lines and trim leading/trailing empties.
  const collapsed: string[] = [];
  for (const line of cleaned) {
    const isEmpty = trimToText(line) === '';
    if (isEmpty && (collapsed.length === 0 || trimToText(collapsed[collapsed.length - 1]) === '')) {
      continue;
    }
    collapsed.push(line);
  }
  while (collapsed.length > 0 && trimToText(collapsed[0]) === '') collapsed.shift();
  while (collapsed.length > 0 && trimToText(collapsed[collapsed.length - 1]) === '') collapsed.pop();

  return collapsed.join('\n').trim();
}

export function sanitizeResumeForTrailingFragments(resume: NormalizedResumeDocument): NormalizedResumeDocument {
  const next: NormalizedResumeDocument = { ...resume };

  if (typeof next.summary === 'string') {
    next.summary = trimIncompleteTrailingFragments(next.summary);
  }

  if (Array.isArray((next as any).experience)) {
    (next as any).experience = (next as any).experience.map((entry: any) => {
      if (!entry || typeof entry !== 'object') return entry;
      const bullets = Array.isArray(entry.bullets) ? entry.bullets : [];
      const cleanedBullets = bullets
        .map((b: unknown) => (typeof b === 'string' ? trimIncompleteTrailingFragments(b) : ''))
        .map((b: string) => b.trim())
        .filter((b: string) => b.length >= 10);
      return { ...entry, bullets: cleanedBullets };
    });
  }

  return next;
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

export function looksLikeSentence(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  if (/[.!?]\s*$/.test(text)) return true;
  if (/[.!?]/.test(text) && text.split(/\s+/).length > 6) return true;
  // Common prose patterns unlikely in role/company headers.
  if (/[,:;]\s/.test(text) && text.split(/\s+/).length > 10) return true;
  return false;
}

export function startsWithActionVerb(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  const first = text.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!first) return false;
  return EXPERIENCE_TITLE_ACTION_VERBS.has(first);
}

export function endsWithDanglingHeaderToken(value: string): boolean {
  const normalized = normalizeForTrailingCheck(trimToText(value));
  if (!normalized) return false;
  const lastToken = normalized.split(/\s+/).pop()?.toLowerCase() ?? '';
  if (!lastToken) return false;
  return EXPERIENCE_TITLE_DANGLING_SUFFIXES.has(lastToken);
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

    // Structural header contract: never allow bullet-like prose to be treated as the experience header.
    if (roleTitle) {
      if (looksLikeSentence(roleTitle) || startsWithActionVerb(roleTitle) || endsWithDanglingHeaderToken(roleTitle)) {
        reasons.push('malformed_experience_header:role_title');
      }
    }
    if (company) {
      if (looksLikeSentence(company) || startsWithActionVerb(company)) {
        reasons.push('malformed_experience_header:company');
      }
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

export function isMalformedResumeExperienceRoleTitle(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  return looksLikeSentence(text) || startsWithActionVerb(text) || endsWithDanglingHeaderToken(text);
}

export function isMalformedResumeExperienceCompany(value: string): boolean {
  const text = trimToText(value);
  if (!text) return false;
  return looksLikeSentence(text) || startsWithActionVerb(text);
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

function addBulletIfMissing(existing: unknown, bulletText: string): unknown[] {
  const normalized = trimToText(bulletText);
  if (!normalized) return Array.isArray(existing) ? existing : [];
  const bullets = Array.isArray(existing) ? existing.map((b) => trimToText(b)).filter(Boolean) : [];
  if (bullets.some((b) => b === normalized)) return Array.isArray(existing) ? existing : bullets;
  return [...bullets, normalized];
}

function trimDanglingHeaderSuffix(value: string): string {
  const text = trimToText(value);
  if (!text) return '';
  if (!endsWithDanglingHeaderToken(text)) return text;
  const tokens = text.split(/\s+/);
  if (tokens.length <= 1) return '';
  return tokens.slice(0, -1).join(' ').trim();
}

// Structural repair pass: when an experience header field looks like prose/bullets, move it into bullets
// and clear the header. This is non-fabricating: it never invents a company or role title.
export function repairResumeStructure(
  resume: NormalizedResumeDocument,
): NormalizedResumeDocument {
  const experience = (Array.isArray(resume.experience) ? resume.experience : []).map((entry) => {
    const rawCompany = trimToText((entry as any)?.company);
    const rawRoleTitle = trimToText((entry as any)?.roleTitle);
    const rawBullets = Array.isArray((entry as any)?.bullets) ? (entry as any).bullets : [];

    let nextCompany = rawCompany;
    let nextRoleTitle = rawRoleTitle;
    let nextBullets: unknown = rawBullets;

    if (nextRoleTitle) {
      const trimmedRoleTitle = trimDanglingHeaderSuffix(nextRoleTitle);
      // If the title is malformed, keep the content as a bullet and clear the header field.
      // Use the *original* value for the bullet so we preserve the exact generated text.
      if (isMalformedResumeExperienceRoleTitle(trimmedRoleTitle) || isMalformedResumeExperienceRoleTitle(nextRoleTitle)) {
        nextBullets = addBulletIfMissing(nextBullets, nextRoleTitle);
        nextRoleTitle = '';
      } else {
        nextRoleTitle = trimmedRoleTitle;
      }
    }

    if (nextCompany) {
      // If company is malformed, drop it (company-like prose should not be promoted to the header).
      if (isMalformedResumeExperienceCompany(nextCompany)) {
        nextCompany = '';
      }
    }

    return {
      ...(entry as any),
      company: nextCompany,
      roleTitle: nextRoleTitle,
      bullets: Array.isArray(nextBullets)
        ? nextBullets.map((b) => trimToText(b)).filter(Boolean)
        : nextBullets,
    };
  });

  return {
    ...(resume as any),
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
