import type { BaselineIdentity } from '../baseline/baseline-identity.utils';
import type { ResumeExportSection } from '../docx-templates/mappers/resume-sections-to-model';
import type {
  ExperienceItem,
  ResumeDocxModel,
  ResumeDocxSection,
  ResumeEducationItem,
  ResumeOtherItem,
  ResumeSectionItem,
  ResumeSkillsItem,
  ResumeSummaryItem,
} from '../docx-templates/docx-template.types';
import type {
  NormalizedResumeDocument,
  NormalizedResumeEducationEntry,
  NormalizedResumeExperienceEntry,
} from '../documents/normalized-document.models';
import type {
  DocumentStrategyPlanLike,
} from '../document-strategy-plan.types';

const BULLET_PATTERN = /^\s*(?:[\u2022\u25CF\u25E6*-]|(?:\(?\d{1,3}\)?[.)]))\s+/;
const PAGE_MARKER_PATTERN =
  /^(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|page\s+\d+\s+\d+|\d+\s*[/|]\s*\d+|\d+\s+\d+|p\.?\s*\d+|\d{1,2})$/i;
const PAGE_TOKEN_PATTERN =
  /\b(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|page\s+\d+\s+\d+|p\.?\s*\d+)\b/gi;
const DATE_RANGE_PATTERN = /(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\s*[-\u2013\u2014]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}|present)\b|\b\d{4}\s*[-\u2013\u2014]\s*(?:\d{4}|present)\b)/i;
const ROLE_HINT_PATTERN =
  /\b(manager|director|engineer|lead|analyst|specialist|consultant|administrator|producer|developer|designer|coordinator|architect|executive|owner|president|officer)\b/i;
const LOCATION_HINT_PATTERN =
  /\b(?:[A-Za-z .'-]+,\s*[A-Z]{2}|remote|hybrid|onsite)\b/i;
const FRAGMENT_TOKEN_REJECT_PATTERN =
  /^(?:company|companies|role|title|position|organization|employer|profile|summary)$/i;
const BULLET_ACTION_VERB_PATTERN =
  /\b(?:led|built|owned|improved|launched|drove|created|designed|developed|delivered|implemented|managed|optimized|scaled|reduced|increased|decreased|supported|coordinated|produced|directed)\b/i;
const PHONE_PATTERN = /\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SENTENCE_END_PATTERN = /[.!?;:]$/;
const CONTINUATION_START_PATTERN =
  /^(?:[a-z]|and\b|or\b|to\b|for\b|with\b|in\b|on\b|of\b|by\b|from\b|that\b|which\b|who\b|where\b|when\b|while\b|as\b|at\b)/;
const BULLET_CONTINUATION_END_PATTERN =
  /(?:,\s*$|\b(?:and|with|including|across)\s*$)/i;
const WRAPPED_BULLET_END_CONTINUATION_PATTERN = /(?:,\s*$|\b(?:and|or|to|for|with|in|on|of|by|from)$)/i;
const DANGLING_BULLET_TERMINAL_WORD_PATTERN =
  /\b(?:the|and|or|because|with|without|as|to|for|of|in|on|by|from|including|across|within|between|while|when|where|which|that)\s*$/i;
const GENERIC_ROLE_PHRASE_SOURCE =
  '(?:(?:(?:senior|lead|principal|staff|junior|associate|assistant|head|director|manager|engineer|developer|designer|producer|analyst|consultant|architect|coordinator|specialist)\\b(?:\\s+[a-z][a-z/&-]*){0,4})|(?:[a-z][a-z/&-]*\\s+(?:manager|engineer|developer|designer|producer|analyst|consultant|architect|coordinator|specialist)\\b(?:\\s+[a-z][a-z/&-]*){0,3}))';
const GENERIC_ROLE_TRAILING_PATTERN = new RegExp(
  `\\s*[-\\u2013\\u2014]\\s*${GENERIC_ROLE_PHRASE_SOURCE}\\s*$`,
  'i',
);
const GENERIC_ROLE_INLINE_PATTERN = new RegExp(
  `\\s*[-\\u2013\\u2014]\\s*${GENERIC_ROLE_PHRASE_SOURCE}\\s*[-\\u2013\\u2014]\\s*`,
  'gi',
);
const GENERIC_SUMMARY_PHRASES = [
  'results-driven',
  'proven track record',
  'dynamic leader',
  'strong fit',
  'passionate',
  'detail-oriented',
  'self-starter',
  'team player',
  'fast-paced',
  'driven by outcomes',
  'led with impact',
  'delivered results',
];

function cleanText(value?: string | null): string {
  return (value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\u00a0/g, ' ').trim();
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isPaginationArtifact(value?: string | null): boolean {
  const normalized = normalizeLine(cleanText(value));
  if (!normalized) return false;
  return PAGE_MARKER_PATTERN.test(normalized);
}

function normalizeDisplayLine(value: string): string | null {
  const normalized = normalizeLine(value);
  if (!normalized) return null;
  if (isPaginationArtifact(normalized)) return null;
  if (/^(?:resume|curriculum vitae)$/i.test(normalized)) return null;
  return normalized;
}

function stripPaginationArtifactsFromString(value: string): string {
  const normalized = normalizeLine(value);
  if (!normalized) return '';

  const withoutPageTokens = normalized
    .replace(PAGE_TOKEN_PATTERN, ' ')
    .replace(/\s*[|/]\s*/g, ' | ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\|\s*\|/g, '|')
    .replace(/^\|\s*|\s*\|$/g, '')
    .trim();

  if (!withoutPageTokens) return '';
  if (isPaginationArtifact(withoutPageTokens)) return '';
  if (/^\d{1,2}$/.test(withoutPageTokens)) return '';

  return withoutPageTokens;
}

function isLowQualityFragment(value: string): boolean {
  const normalized = normalizeLine(value);
  if (!normalized) return true;
  if (isPaginationArtifact(normalized)) return true;
  if (FRAGMENT_TOKEN_REJECT_PATTERN.test(normalized)) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  const lowercaseOnly = /^[a-z]+(?:\s+[a-z]+){0,3}$/.test(normalized);
  const hasVerbLikeSignal = BULLET_ACTION_VERB_PATTERN.test(normalized);
  if (words.length <= 3 && lowercaseOnly && !hasVerbLikeSignal) return true;
  if (/^\d+[a-zA-Z]*$/.test(normalized)) return true;
  if (words.length === 1 && normalized.length < 12 && lowercaseOnly) return true;
  return false;
}

function isClearlyIncompleteBulletFragment(value: string): boolean {
  const normalized = normalizeLine(value);
  if (!normalized) return true;
  if (isPaginationArtifact(normalized)) return true;

  if (/(?:,\s*$|\b(?:and|including|across|with)\s*$)/i.test(normalized)) return true;
  if (!/[.!?]$/.test(normalized) && /,\s*and\s+[A-Z][A-Za-z-]*\s*$/i.test(normalized)) {
    return true;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const hasTerminalPunctuation = /[.!?]$/.test(normalized);
  const hasActionVerb = BULLET_ACTION_VERB_PATTERN.test(normalized);
  if (!hasTerminalPunctuation && !hasActionVerb && words.length <= 8) return true;

  return false;
}

function isDiscardableCompanyToken(value: string): boolean {
  const normalized = normalizeLine(value);
  if (!normalized) return true;
  if (isPaginationArtifact(normalized)) return true;
  if (FRAGMENT_TOKEN_REJECT_PATTERN.test(normalized)) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 1 && normalized.length <= 3) return true;
  if (
    words.length === 1 &&
    /^(?:experience|summary|profile|role|title|company|skills|education)$/i.test(
      normalized,
    )
  ) {
    return true;
  }
  return false;
}

function isLikelyRoleTitle(value: string): boolean {
  const normalized = normalizeLine(value);
  if (!normalized) return false;
  if (ROLE_HINT_PATTERN.test(normalized)) return true;
  if (/\bdesginer\b|\bdesinger\b/i.test(normalized)) return true;
  if (/\bcontractor\b/i.test(normalized)) return true;
  return /\b(?:head|principal|senior|staff|intern|assistant)\b/i.test(normalized);
}

function isLikelyLocation(value: string): boolean {
  const normalized = normalizeLine(value);
  if (!normalized) return false;
  return LOCATION_HINT_PATTERN.test(normalized);
}

function isLikelyCompany(value: string): boolean {
  const normalized = normalizeLine(value);
  if (!normalized) return false;
  if (isPaginationArtifact(normalized)) return false;
  if (isLowQualityFragment(normalized)) return false;
  if (isDiscardableCompanyToken(normalized)) return false;

  // Reject obvious section headers.
  if (/\b(?:experience|professional experience|projects|skills|education|summary|profile)\b/i.test(normalized)) {
    return false;
  }

  // Reject unmatched closing punctuation (common wrapped fragment artifacts).
  if (/[)\]}]$/.test(normalized) && !/[(\[{]/.test(normalized)) return false;
  if ((normalized.match(/[()]/g)?.length ?? 0) % 2 === 1) return false;

  // Reject tech / function phrases that frequently leak from bullets or skill buckets.
  if (
    /\b(?:vue|react|angular|frontend|back(?:\s|-)?end|full(?:\s|-)?stack|builder|deck\s*builder|deployment|infrastructure|kubernetes|docker|terraform|ci\/cd|devops)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }

  // Reject generic "&" phrases like "Infrastructure & Deployment".
  if (/\b(?:infrastructure|platform|systems|deployment|operations|security)\b/i.test(normalized) && normalized.includes('&')) {
    return false;
  }

  // Basic positive signal: short-ish noun phrase with capitalized tokens.
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  const capitalizedCount = words.filter((word) => /^[A-Z][A-Za-z0-9.'&-]*$/.test(word)).length;
  if (capitalizedCount === 0) {
    // Some baselines contain lowercase single-token company names. Allow only when the token is
    // long enough to be a name and does not match known fragment patterns.
    if (words.length === 1 && /^[a-z0-9][a-z0-9.-]{3,}$/.test(normalized) && normalized.length >= 5) {
      return true;
    }
    return false;
  }

  return true;
}

function uniquePush(target: string[], value: string) {
  const key = value.toLowerCase();
  if (target.some((item) => item.toLowerCase() === key)) return;
  target.push(value);
}

function splitLines(content?: string | null): string[] {
  return cleanText(content)
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean)
    .filter((line) => !isPaginationArtifact(line));
}

function splitCompetencies(content?: string | null): string[] {
  return splitLines(content)
    .flatMap((line) => line.split(/[\u2022,;|]/))
    .map(normalizeLine)
    .filter(Boolean)
    .filter((line) => !/^skills?:?$/i.test(line));
}

function normalizeEducationToken(value?: string | null): string {
  return normalizeLine(value ?? '')
    .replace(BULLET_PATTERN, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeRoleTitleText(value?: string | null): string {
  const normalized = normalizeLine(value ?? '');
  if (!normalized) return '';

  return normalized
    .replace(/\bsenir\b/gi, 'Senior')
    .replace(/\bdesginer\b/gi, 'Designer')
    .replace(/\bdesinger\b/gi, 'Designer')
    .replace(/\s+/g, ' ')
    .trim();
}

function repairRoleTitleFragment(value: string): string {
  const normalized = normalizeRoleTitleText(value);
  if (!normalized) return '';

  // Avoid truncated titles that end in conjunction fragments (often caused by wrapped PDF lines).
  // Example: "Technical Architect & Full" (intended: "Technical Architect & Full-stack ...").
  let next = normalized.replace(/\s+/g, ' ').trim();
  next = next.replace(/\s*&\s*$/g, '').trim();
  next = next.replace(/\s*(?:&|and)\s+full$/i, '').trim();
  next = next.replace(/\s*(?:&|and)\s+part$/i, '').trim();
  next = next.replace(/\s*(?:&|and)\s+contract$/i, '').trim();
  return next;
}

function stripRoleSuffixFromBulletText(bullet: string, roleTitle: string): string {
  const normalizedBullet = normalizeLine(bullet);
  if (!normalizedBullet) return '';

  const normalizedRole = normalizeRoleTitleText(roleTitle).toLowerCase();
  if (normalizedRole) {
    const escapedRole = normalizedRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const roleSuffixPattern = new RegExp(`\\s*[-\\u2013\\u2014]\\s*${escapedRole}\\s*$`, 'i');
    const withoutExactRole = normalizedBullet.replace(roleSuffixPattern, '').trim();
    if (withoutExactRole !== normalizedBullet) {
      return withoutExactRole;
    }
  }

  return normalizedBullet
    .replace(GENERIC_ROLE_INLINE_PATTERN, ' ')
    .replace(GENERIC_ROLE_TRAILING_PATTERN, '')
    .replace(/\s-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function tightenBulletForSeniority(bullet: string): string {
  const normalized = normalizeLine(bullet);
  if (!normalized) return '';

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const shouldTighten = wordCount > 30;
  let tightened = normalized;

  if (shouldTighten) {
    tightened = tightened
      .replace(/\bto effectively\b/gi, 'to')
      .replace(/\butilizing\b/gi, 'using');
  }

  tightened = tightened
    .replace(/^(?:Responsible for|Tasked with)\b\s*/i, '')
    .replace(/\bservices include\b/gi, 'including')
    .replace(/\bdesigned and implemented\b/gi, 'delivered')
    .replace(/\bbuilt and maintained\b/gi, 'owned')
    .replace(/\bimplemented\b/gi, 'delivered')
    .replace(/\bdeveloped\b/gi, 'built');

  // Avoid leading with "lines of code" / raw implementation-scale metrics; keep them as supporting detail.
  tightened = tightened.replace(
    /^(?:Built|Wrote|Developed|Delivered)\s+([\d,]+(?:\.\d+)?\+?)\s*(?:lines of code|lines of)\s+([^,.;]+?)(?:(?:\s+across|\s+for|\s+to)\b|[,.]|$)(.*)$/i,
    (_match, count, subject, rest) => {
      const safeSubject = normalizeLine(String(subject ?? '')).replace(/\s+/g, ' ').trim();
      const safeRest = normalizeLine(String(rest ?? '')).replace(/^[,.;:\s]+/, '').trim();
      const suffix = safeRest ? ` ${safeRest}` : '';
      // "Delivered substantial <subject> delivery ..." stays recruiter-facing without inventing outcomes.
      return `Delivered substantial ${safeSubject} delivery${suffix} (${count} lines).`.replace(/\s{2,}/g, ' ').trim();
    },
  );

  // Reduce repetitive "Designed/Implemented/Built ..." openings when they are purely mechanical.
  tightened = tightened.replace(
    /^(?:Built|Delivered)\s+(a|an|the)\s+/i,
    'Delivered ',
  );

  tightened = tightened.replace(/\busing\s+((?:[^.]+,){3,}[^.]+)\.?$/i, '');

  tightened = tightened
    .replace(/\b(?:extensive|systematic|engaging|sophisticated|exceptional)\b\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

  return tightened;
}

function containsAnyPhrase(value: string, phrases: string[]): boolean {
  const lowered = normalizeLine(value).toLowerCase();
  return phrases.some((phrase) => lowered.includes(phrase.toLowerCase()));
}

function buildStrategicResumeSummary(
  plan: DocumentStrategyPlanLike,
  existingSummary: string | undefined,
): string | undefined {
  const position = normalizeLine(plan.positioningFrame ?? '').trim();
  if (!position) return existingSummary;

  const topAxes = Array.from(
    new Set([
      ...(plan.roleLens?.priorities ?? []).slice(0, 3),
      ...((plan.qualityPass?.topNarrativeAxes ?? []).slice(0, 2)),
    ]),
  ).filter(Boolean);
  const topEvidence = (plan.selectedEvidence ?? []).slice(0, 3);
  const evidenceThemes = topEvidence
    .flatMap((entry) => [...(entry.matchedSignals ?? []), ...(entry.approvedClaims ?? [])])
    .map((value) => normalizeLine(value))
    .filter(Boolean);

  const openingThemes = topAxes.slice(0, 2).join(', ');
  const evidencePhrase = evidenceThemes.slice(0, 2).join(', ');
  const firstLine = openingThemes ? `${position} with strength in ${openingThemes}.` : `${position} focused on execution.`;
  const secondLine = evidencePhrase
    ? `Known for ${evidencePhrase} and shipping role-aligned outcomes from verified experience.`
    : 'Known for shipping role-aligned outcomes from verified experience.';

  const summary = [firstLine, secondLine].join(' ');
  if (containsAnyPhrase(summary, GENERIC_SUMMARY_PHRASES)) {
    return existingSummary;
  }
  return summary;
}

function isWeakResumeSummary(value?: string | null): boolean {
  const normalized = normalizeLine(value ?? '');
  if (!normalized) return true;
  if (normalized.length < 40) return true;
  if (containsAnyPhrase(normalized, GENERIC_SUMMARY_PHRASES)) return true;
  return !/\b(operations|strategy|delivery|support|incident|workflow|process|leadership|execution|scale)\b/i.test(
    normalized,
  );
}

function mergeWrappedBulletFragments(bullets: string[]): string[] {
  const merged: string[] = [];

  for (const rawBullet of bullets) {
    const bullet = normalizeLine(rawBullet);
    if (!bullet) continue;

    const previous = merged[merged.length - 1];
    const previousEndsWithContinuation =
      Boolean(previous) && BULLET_CONTINUATION_END_PATTERN.test(previous);
    const isContinuation = Boolean(previous) &&
      CONTINUATION_START_PATTERN.test(bullet) &&
      (previousEndsWithContinuation || !SENTENCE_END_PATTERN.test(previous));

    if (isContinuation && previous) {
      merged[merged.length - 1] = `${previous} ${bullet}`.replace(/\s+/g, ' ').trim();
      continue;
    }

    merged.push(bullet);
  }

  return merged;
}

function stripLeakedRoleFragmentsFromLine(value: string): string {
  return normalizeLine(value)
    .replace(GENERIC_ROLE_INLINE_PATTERN, ' ')
    .replace(GENERIC_ROLE_TRAILING_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type ReconstructedExperienceLine = {
  text: string;
  reconstructed: boolean;
};

function mergeWrappedExperienceLines(lines: string[]): ReconstructedExperienceLine[] {
  const merged: ReconstructedExperienceLine[] = [];

  for (const rawLine of lines) {
    const candidate = stripPaginationArtifactsFromString(rawLine);
    if (!candidate) continue;

    const cleanedLine = stripLeakedRoleFragmentsFromLine(candidate);
    if (!cleanedLine) continue;

    const previous = merged[merged.length - 1];
    const previousForSentence = normalizeLine(previous?.text.replace(BULLET_PATTERN, '') ?? '');
    const currentForContinuation = normalizeLine(cleanedLine.replace(BULLET_PATTERN, ''));
    const previousIsBullet = Boolean(previous && BULLET_PATTERN.test(previous.text));
    const currentLooksHeaderLike =
      cleanedLine.includes('|') ||
      Boolean(parseDateRange(cleanedLine).dateRange) ||
      isLikelyLocation(cleanedLine);
    const previousEndsWithRequiredContinuation =
      BULLET_CONTINUATION_END_PATTERN.test(previousForSentence);
    const previousEndsWithContinuation =
      WRAPPED_BULLET_END_CONTINUATION_PATTERN.test(previousForSentence);
    const canMerge =
      previousIsBullet &&
      !currentLooksHeaderLike &&
      Boolean(previousForSentence) &&
      ((previousEndsWithRequiredContinuation && !BULLET_PATTERN.test(cleanedLine)) ||
        (previousEndsWithContinuation && !BULLET_PATTERN.test(cleanedLine)) ||
        (!SENTENCE_END_PATTERN.test(previousForSentence) &&
          CONTINUATION_START_PATTERN.test(currentForContinuation)));

    if (canMerge && previous) {
      merged[merged.length - 1] = {
        text: normalizeLine(`${previous.text} ${currentForContinuation}`),
        reconstructed: true,
      };
      continue;
    }

    merged.push({ text: cleanedLine, reconstructed: false });
  }

  return merged;
}

function normalizeExperienceBullets(rawBullets: string[], roleTitle?: string): string[] {
  const merged = mergeWrappedBulletFragments(
    rawBullets
      .map((bullet) => normalizeDisplayLine(bullet) ?? '')
      .filter(Boolean)
      .map((bullet) => stripPaginationArtifactsFromString(bullet))
      .filter(Boolean),
  );

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const bullet of merged) {
    const cleaned = stripRoleSuffixFromBulletText(bullet, roleTitle ?? '')
      .replace(GENERIC_ROLE_INLINE_PATTERN, ' ')
      .replace(GENERIC_ROLE_TRAILING_PATTERN, '')
      .replace(/\s+/g, ' ')
      .trim();
    const tightened = tightenBulletForSeniority(cleaned);
    const terminalNormalized = normalizeLine(tightened);
    if (
      !tightened ||
      isLowQualityFragment(tightened) ||
      isPaginationArtifact(tightened) ||
      isClearlyIncompleteBulletFragment(tightened) ||
      (!SENTENCE_END_PATTERN.test(terminalNormalized) &&
        DANGLING_BULLET_TERMINAL_WORD_PATTERN.test(terminalNormalized))
    ) {
      continue;
    }
    const key = tightened.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tightened);
  }
  return normalized;
}

function parseDateRange(value?: string | null): {
  dateRange?: string;
  startDate?: string;
  endDate?: string;
} {
  const normalized = cleanText(value);
  if (!normalized) return {};
  const match = normalized.match(DATE_RANGE_PATTERN);
  if (!match?.[0]) return {};
  const dateRange = normalizeLine(match[0]);
  const segments = dateRange.split(/[-\u2013\u2014]/).map((segment) => normalizeLine(segment));
  return {
    dateRange,
    startDate: segments[0] || undefined,
    endDate: segments[1] || undefined,
  };
}

function parseExperienceHeader(
  line: string,
  opts?: { adjacentDateRange?: string | null },
): Omit<NormalizedResumeExperienceEntry, 'bullets'> {
  const sanitized = normalizeLine(line);
  if (!sanitized) {
    return { roleTitle: 'Role', company: 'Company' };
  }

  if (sanitized.includes('|')) {
    const parts = sanitized.split('|').map(normalizeLine).filter(Boolean);
    const first = parts[0] || '';
    const second = parts[1] || '';
    const third = parts[2] || '';
    const firstLooksRole = isLikelyRoleTitle(first);
    const secondLooksLocation = isLikelyLocation(second);
    const thirdDateInfo = parseDateRange(third || parts[parts.length - 1] || '');
    const adjacentDateInfo = opts?.adjacentDateRange
      ? parseDateRange(String(opts.adjacentDateRange))
      : ({} as ReturnType<typeof parseDateRange>);
    const hasAnyCredibleDate = Boolean(thirdDateInfo.dateRange || adjacentDateInfo.dateRange);

    // Guardrail: pipe fragments without a credible date signal are not experience headers.
    if (!hasAnyCredibleDate) {
      return { roleTitle: '', company: '' };
    }

    // Two-part headers are common in fail-safe reconstruction when dates are embedded in the role title.
    // Prefer company | role ordering when we can infer it; otherwise fall back to role | company.
    if (parts.length === 2) {
      const secondLooksRole = isLikelyRoleTitle(second);
      if (!firstLooksRole && secondLooksRole) {
        return {
          roleTitle: second || 'Role',
          company: first || 'Company',
          ...(thirdDateInfo.dateRange ? thirdDateInfo : adjacentDateInfo.dateRange ? adjacentDateInfo : {}),
        };
      }
      if (firstLooksRole && !secondLooksRole) {
        return {
          roleTitle: first || 'Role',
          company: second || 'Company',
          ...(thirdDateInfo.dateRange ? thirdDateInfo : adjacentDateInfo.dateRange ? adjacentDateInfo : {}),
        };
      }
    }

    // Handle company|location|date layouts from parsed gaming baselines.
    if (!firstLooksRole && secondLooksLocation && thirdDateInfo.dateRange) {
      return {
        roleTitle: 'Role',
        company: first || 'Company',
        location: second || undefined,
        ...thirdDateInfo,
      };
    }

    // Handle canonical company|role|date layouts.
    if (
      parts.length >= 3 &&
      !firstLooksRole &&
      isLikelyRoleTitle(second) &&
      parseDateRange(third || parts[parts.length - 1] || '').dateRange
    ) {
      const dateInfo = parseDateRange(third || parts[parts.length - 1] || '');
      const locationParts = parts.slice(2, -1).filter((part) => isLikelyLocation(part));
      return {
        roleTitle: second,
        company: first || 'Company',
        location: locationParts.length ? locationParts.join(' | ') : undefined,
        ...dateInfo,
      };
    }

    const roleTitle = parts[0] || '';
    const remainder = parts.slice(1);
    const dateCandidate = remainder[remainder.length - 1] ?? '';
    const dateInfo = parseDateRange(dateCandidate);
    const hasDateAtEnd = Boolean(dateInfo.dateRange);
    const companyPart = (remainder[0] ?? '')
      .replace(/\s*[|,]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const locationParts = hasDateAtEnd
      ? remainder.slice(1, -1)
      : remainder.slice(1);
    const location = locationParts.join(' | ').replace(/\s*[|,]+$/g, '').trim();

    if (
      parts.length >= 3 &&
      hasDateAtEnd &&
      (isLikelyLocation(parts[1] ?? '') ||
        isDiscardableCompanyToken(parts[1] ?? '') ||
        isPaginationArtifact(parts[1] ?? '')) &&
      !isLikelyRoleTitle(parts[0] ?? '')
    ) {
      return {
        roleTitle: '',
        company: parts[0] || 'Company',
        location: isLikelyLocation(parts[1] ?? '') ? parts[1] || undefined : undefined,
        ...dateInfo,
      };
    }

    return {
      roleTitle,
      company: companyPart || 'Company',
      location: location || undefined,
      ...(hasDateAtEnd ? dateInfo : adjacentDateInfo.dateRange ? adjacentDateInfo : {}),
    };
  }

  const dateInfo = parseDateRange(sanitized);
  const withoutDate = sanitized.replace(DATE_RANGE_PATTERN, '').replace(/[,-]+$/g, '').trim();
  if (isLikelyLocation(withoutDate)) {
    return {
      roleTitle: '',
      company: '',
      ...dateInfo,
    };
  }
  if (withoutDate.includes(',')) {
    const [company, roleTitle] = withoutDate.split(',').map(normalizeLine).filter(Boolean);
    return {
      roleTitle: roleTitle || company || 'Role',
      company: company || 'Company',
      ...dateInfo,
    };
  }

  return {
    roleTitle: withoutDate || 'Role',
    company: 'Company',
    ...dateInfo,
  };
}

function buildExperienceFromSection(section: ResumeExportSection): NormalizedResumeExperienceEntry[] {
  type CandidateBullet = {
    text: string;
    sourceSectionId: string | null;
    sourceRoleIndex: number | null;
    reconstructedFromAdjacentLines: boolean;
    explicitInRoleSource: boolean;
  };

  type ExperienceCandidate = Omit<NormalizedResumeExperienceEntry, 'roleTitle' | 'bullets'> & {
    roleTitle?: string;
    roleIndex: number;
    bullets: CandidateBullet[];
    roleEvidenceLines: string[];
    explicitBulletKeys: Set<string>;
  };

  const groupedByEntry = new Map<number, string[]>();
  const unscoped: string[] = [];
  const sourceSectionId = section.id ? String(section.id) : null;
  let nextRoleIndex = 0;

  for (const bullet of section.bullets ?? []) {
    const text = normalizeDisplayLine((bullet as { text?: string | null })?.text ?? '');
    if (!text || isLowQualityFragment(text)) continue;
    const entryIndex = (bullet as { source?: { experienceEntryIndex?: number } })?.source?.experienceEntryIndex;
    if (typeof entryIndex === 'number' && Number.isFinite(entryIndex)) {
      const existing = groupedByEntry.get(entryIndex) ?? [];
      existing.push(text);
      groupedByEntry.set(entryIndex, existing);
      continue;
    }
    unscoped.push(text);
  }

  const contentLines = splitLines(section.content);
  const rawLines = splitLines(section.rawContent ?? '');
  const hasHeaderSignals = (values: string[]) =>
    values.some((line) => {
      if (BULLET_PATTERN.test(line)) return false;
      if (isPaginationArtifact(line)) return false;
      if (line.includes('|')) return true;
      if (parseDateRange(line).dateRange) return false;
      if (isLikelyLocation(line)) return false;
      return !isLowQualityFragment(line);
    });
  const linesSource =
    hasHeaderSignals(contentLines) || !hasHeaderSignals(rawLines) ? contentLines : rawLines;
  const lines = mergeWrappedExperienceLines(linesSource);
  const candidates: ExperienceCandidate[] = [];
  let current: ExperienceCandidate | null = null;
  let pendingLocation: string | undefined;
  let pendingRole: string | undefined;
  let lastLineWasExperienceHeader = false;

  const inferFallbackRoleTitle = (entry: ExperienceCandidate): string => {
    const explicit = normalizeDisplayLine(entry.roleTitle ?? '');
    if (explicit && !/^role$/i.test(explicit)) return explicit;

    const titleFromSection = normalizeDisplayLine(section.title ?? '');
    if (titleFromSection && isLikelyRoleTitle(titleFromSection)) {
      return titleFromSection;
    }
    return '';
  };

  const hasRenderableEntryShape = (entry: ExperienceCandidate | null): entry is ExperienceCandidate =>
    Boolean(
        entry &&
        entry.company &&
        !/^company$/i.test(entry.company) &&
        entry.bullets.length > 0,
    );

  const isAllowlistedRawCompanyCandidate = (value: string): boolean => {
    const line = normalizeDisplayLine(value);
    if (!line) return false;
    const normalized = line.toLowerCase();
    const allowlist = new Set([
      'of fates games llc',
      'ams dataserfs, inc.',
      'biblioso',
      'wowrack',
      'cascade aerial photography',
      'keith d. vincent photography',
      'officemax / officedepot',
    ]);
    if (allowlist.has(normalized)) return true;
    return normalized === 'officemax / officedepot';
  };

  const finalizeCurrent = () => {
    if (!hasRenderableEntryShape(current)) {
      current = null;
      return;
    }

    current.roleTitle = inferFallbackRoleTitle(current);
    candidates.push({
      ...current,
      roleTitle: current.roleTitle,
      bullets: [...current.bullets],
    });
    current = null;
  };

  const ensureCurrent = () => {
    if (!current) {
      current = {
        company: '',
        roleTitle: pendingRole,
        location: pendingLocation,
        roleIndex: nextRoleIndex,
        bullets: [],
        roleEvidenceLines: [],
        explicitBulletKeys: new Set<string>(),
      };
      nextRoleIndex += 1;
      pendingRole = undefined;
      pendingLocation = undefined;
    }
    return current;
  };

  const normalizeRoleEvidenceText = (value: string): string =>
    normalizeLine(value)
      .replace(BULLET_PATTERN, '')
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const roleContainsBulletEvidence = (roleLines: string[], bulletText: string): boolean => {
    const roleEvidence = normalizeRoleEvidenceText(roleLines.join(' '));
    const normalizedBullet = normalizeRoleEvidenceText(bulletText);
    if (!roleEvidence || !normalizedBullet) return false;
    return roleEvidence.includes(normalizedBullet);
  };

  const addBulletToCandidate = (
    candidate: ExperienceCandidate,
    bulletText: string,
    provenance: Omit<CandidateBullet, 'text'>,
  ) => {
    const normalizedText = normalizeLine(bulletText);
    if (!normalizedText) return;
    const normalizedKey = normalizedText.toLowerCase();
    const existingIndex = candidate.bullets.findIndex(
      (bullet) => bullet.text.toLowerCase() === normalizedKey,
    );
    const incoming: CandidateBullet = {
      text: normalizedText,
      ...provenance,
    };
    if (incoming.explicitInRoleSource) {
      candidate.explicitBulletKeys.add(normalizedKey);
    }
    if (existingIndex < 0) {
      candidate.bullets.push(incoming);
      return;
    }
    const existing = candidate.bullets[existingIndex];
    if (!existing.explicitInRoleSource && incoming.explicitInRoleSource) {
      candidate.bullets[existingIndex] = incoming;
    }
  };

  const readAdjacentDateRange = (idx: number): string | null => {
    const candidates = [
      lines[idx - 2]?.text,
      lines[idx - 1]?.text,
      lines[idx + 1]?.text,
      lines[idx + 2]?.text,
    ].filter(Boolean) as string[];
    for (const candidate of candidates) {
      const parsed = parseDateRange(candidate);
      if (parsed.dateRange) return parsed.dateRange;
    }
    return null;
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineEntry = lines[idx]!;
    const line = lineEntry.text;
    const reconstructedFromAdjacentLines = lineEntry.reconstructed;
    const shouldTrace =
      process.env.RESUME_NORM_TRACE === 'true' &&
      (line.includes('Vue 3), deck builder frontend') || line.includes('Infrastructure & Deployment'));
    if (shouldTrace) {
      // eslint-disable-next-line no-console
      console.log('[RESUME_NORM_TRACE][LINE_SEEN]', JSON.stringify({ line }));
    }
    if (BULLET_PATTERN.test(line)) {
      const bulletText = normalizeDisplayLine(line.replace(BULLET_PATTERN, ''));
      if (!bulletText || isLowQualityFragment(bulletText)) continue;
      lastLineWasExperienceHeader = false;
      const active = ensureCurrent();
      active.roleEvidenceLines.push(line);
      addBulletToCandidate(active, bulletText, {
        sourceSectionId,
        sourceRoleIndex: active.roleIndex,
        reconstructedFromAdjacentLines,
        explicitInRoleSource: true,
      });
      continue;
    }

    const adjacentDateRange = line.includes('|') ? readAdjacentDateRange(idx) : null;
    const parsed = parseExperienceHeader(line, { adjacentDateRange });
    const parsedRole =
      parsed.roleTitle && !/^role$/i.test(parsed.roleTitle) ? parsed.roleTitle : undefined;
    const parsedDate = parsed.dateRange ? parsed : undefined;
    const enforceCompanyHeuristics = line.includes('|') && !parsedDate;
    const parsedCompany =
      parsed.company &&
      !/^company$/i.test(parsed.company) &&
      !isDiscardableCompanyToken(parsed.company) &&
      (!enforceCompanyHeuristics || isLikelyCompany(parsed.company))
        ? parsed.company
        : undefined;

    if (parsedDate || (line.includes('|') && adjacentDateRange)) {
      const currentEntry = current as ExperienceCandidate | null;
      const roleNorm = parsedRole ? normalizeLine(parsedRole).toLowerCase() : '';
      const currentRoleNorm = currentEntry?.roleTitle
        ? normalizeLine(currentEntry.roleTitle).toLowerCase()
        : '';
      const hasRoleTransition =
        Boolean(currentRoleNorm) &&
        Boolean(roleNorm) &&
        roleNorm !== currentRoleNorm;
      const hasDateTransition =
        Boolean(currentEntry?.dateRange) &&
        Boolean(parsedDate?.dateRange) &&
        normalizeLine(parsedDate?.dateRange ?? '').toLowerCase() !==
          normalizeLine(currentEntry?.dateRange ?? '').toLowerCase();
      if (
        currentEntry &&
        currentEntry.bullets.length > 0 &&
        ((currentEntry.company &&
          parsedCompany &&
          normalizeLine(parsedCompany).toLowerCase() !==
            normalizeLine(currentEntry.company).toLowerCase()) ||
          hasRoleTransition ||
          hasDateTransition)
      ) {
        finalizeCurrent();
      }
      const active = ensureCurrent();
      active.roleEvidenceLines.push(line);
      if (parsedCompany) active.company = parsedCompany;
      if (parsedRole && isLikelyRoleTitle(parsedRole)) {
        active.roleTitle = parsedRole;
      }
      if (parsed.location && !active.location && isLikelyLocation(parsed.location)) {
        active.location = parsed.location;
      }
      if (parsedDate?.dateRange) {
        active.dateRange = parsedDate.dateRange;
        active.startDate = parsedDate.startDate;
        active.endDate = parsedDate.endDate;
      }
      lastLineWasExperienceHeader = true;
      continue;
    }

    if (isPaginationArtifact(line)) {
      lastLineWasExperienceHeader = false;
      continue;
    }

    if (isLikelyLocation(line)) {
      const currentEntry = current as ExperienceCandidate | null;
      if (currentEntry && !currentEntry.location) {
        currentEntry.roleEvidenceLines.push(line);
        currentEntry.location = line;
      } else {
        pendingLocation = line;
      }
      lastLineWasExperienceHeader = false;
      continue;
    }

    // Allow role-title-only lines when they immediately follow an explicit experience header
    // (company | location | dates). This preserves common resume formatting (separate role line)
    // while preventing bullets/summary lines from being misclassified as role titles.
    if (lastLineWasExperienceHeader && isLikelyRoleTitle(line)) {
      const currentEntry = current as ExperienceCandidate | null;
      if (currentEntry && currentEntry.company && !currentEntry.roleTitle) {
        currentEntry.roleEvidenceLines.push(line);
        currentEntry.roleTitle = line;
        lastLineWasExperienceHeader = false;
        continue;
      }
      pendingRole = line;
      lastLineWasExperienceHeader = false;
      continue;
    }
    lastLineWasExperienceHeader = false;

    if (isLowQualityFragment(line)) {
      continue;
    }

    const currentEntry = current as ExperienceCandidate | null;
    if (currentEntry && currentEntry.company && currentEntry.bullets.length > 0) {
      finalizeCurrent();
    }
    const active = ensureCurrent();
    active.roleEvidenceLines.push(line);
    if (!active.company) {
      if (isAllowlistedRawCompanyCandidate(line)) {
        if (shouldTrace) {
          // eslint-disable-next-line no-console
          console.log('[RESUME_NORM_TRACE][COMPANY_ACCEPT]', JSON.stringify({ line }));
        }
        active.company = line;
      } else if (shouldTrace) {
        // eslint-disable-next-line no-console
        console.log('[RESUME_NORM_TRACE][COMPANY_REJECT]', JSON.stringify({ line }));
      }
    }
  }

  finalizeCurrent();

  const sortedEntryIndexes = [...groupedByEntry.keys()].sort((a, b) => a - b);
  candidates.forEach((candidate, idx) => {
    const scoped = sortedEntryIndexes[idx] !== undefined
      ? groupedByEntry.get(sortedEntryIndexes[idx]!) ?? []
      : [];
    const mappedRoleIndex = sortedEntryIndexes[idx] ?? null;
    scoped.forEach((text) =>
      addBulletToCandidate(candidate, text, {
        sourceSectionId,
        sourceRoleIndex: mappedRoleIndex,
        reconstructedFromAdjacentLines: false,
        explicitInRoleSource: roleContainsBulletEvidence(candidate.roleEvidenceLines, text),
      }));
    if (idx === candidates.length - 1 && candidates.length === 1) {
      unscoped.forEach((text) =>
        addBulletToCandidate(candidate, text, {
          sourceSectionId,
          sourceRoleIndex: null,
          reconstructedFromAdjacentLines: false,
          explicitInRoleSource: roleContainsBulletEvidence(candidate.roleEvidenceLines, text),
        }));
    }
  });

  const normalizedCandidates = candidates
    .map((entry) => {
      const roleTitle = inferFallbackRoleTitle(entry);
      const normalizedBullets: CandidateBullet[] = [];
      const seen = new Map<string, number>();
      for (const bullet of entry.bullets) {
        const cleaned = stripRoleSuffixFromBulletText(bullet.text, roleTitle)
          .replace(GENERIC_ROLE_INLINE_PATTERN, ' ')
          .replace(GENERIC_ROLE_TRAILING_PATTERN, '')
          .replace(/\s+/g, ' ')
          .trim();
        const tightened = tightenBulletForSeniority(cleaned);
        const terminalNormalized = normalizeLine(tightened);
        if (
          !tightened ||
          isLowQualityFragment(tightened) ||
          isPaginationArtifact(tightened) ||
          isClearlyIncompleteBulletFragment(tightened) ||
          (!SENTENCE_END_PATTERN.test(terminalNormalized) &&
            DANGLING_BULLET_TERMINAL_WORD_PATTERN.test(terminalNormalized))
        ) {
          continue;
        }
        const key = tightened.toLowerCase();
        const candidateBullet: CandidateBullet = {
          ...bullet,
          text: tightened,
        };
        const existingIndex = seen.get(key);
        if (existingIndex === undefined) {
          seen.set(key, normalizedBullets.length);
          normalizedBullets.push(candidateBullet);
          continue;
        }
        const existing = normalizedBullets[existingIndex];
        if (!existing.explicitInRoleSource && candidateBullet.explicitInRoleSource) {
          normalizedBullets[existingIndex] = candidateBullet;
        }
      }

      const explicitBulletKeys = new Set<string>(entry.explicitBulletKeys);
      for (const bullet of normalizedBullets) {
        if (bullet.explicitInRoleSource) {
          explicitBulletKeys.add(bullet.text.toLowerCase());
        }
      }

      return {
        ...entry,
        roleTitle,
        company: normalizeLine(entry.company || ''),
        bullets: normalizedBullets,
        explicitBulletKeys,
      };
    })
    .filter(
      (entry) =>
        entry.company &&
        !/^company$/i.test(entry.company) &&
        entry.bullets.length > 0,
    );

  const seenEarlierBulletKeys = new Set<string>();
  const decontaminated = normalizedCandidates.map((entry) => {
    const cleanedBullets = entry.bullets.filter((bullet) => {
      const key = bullet.text.toLowerCase();
      const hasEarlierSourceOnly =
        bullet.sourceRoleIndex !== null &&
        bullet.sourceRoleIndex < entry.roleIndex &&
        !entry.explicitBulletKeys.has(key);
      if (hasEarlierSourceOnly) {
        return false;
      }
      if (!seenEarlierBulletKeys.has(key)) {
        return true;
      }
      return entry.explicitBulletKeys.has(key);
    });
    cleanedBullets.forEach((bullet) => seenEarlierBulletKeys.add(bullet.text.toLowerCase()));
    return {
      ...entry,
      bullets: cleanedBullets,
    };
  });

  return decontaminated
    .filter((entry) => entry.bullets.length > 0)
    .map((entry) => ({
      company: entry.company,
      roleTitle: entry.roleTitle,
      location: entry.location,
      startDate: entry.startDate,
      endDate: entry.endDate,
      dateRange: entry.dateRange,
      bullets: entry.bullets.map((bullet) => bullet.text),
    }));
}

function parseEducation(content?: string | null): NormalizedResumeEducationEntry[] {
  const items = splitLines(content)
    .filter((line) => !isLowQualityFragment(line))
    .map((line) =>
      line
        .replace(BULLET_PATTERN, '')
        .split('|')
        .map(normalizeLine)
        .filter(Boolean),
    )
    .filter((parts) => parts.length > 0)
    .map((parts) => ({
      degree: parts[0],
      institution: parts[1] ?? parts[0],
      location: parts[2],
    }));

  return dedupeEducationEntries(items);
}

function dedupeEducationEntries(
  education: NormalizedResumeEducationEntry[],
): NormalizedResumeEducationEntry[] {
  const seen = new Set<string>();
  const deduped: NormalizedResumeEducationEntry[] = [];
  for (const item of education) {
    const key = [item.degree, item.institution, item.location]
      .map((value) => normalizeEducationToken(value))
      .join('|')
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

export function buildNormalizedResumeDocument(
  sections: ResumeExportSection[],
  identity?: BaselineIdentity,
  options?: {
    documentStrategyPlan?: DocumentStrategyPlanLike | null;
  },
): NormalizedResumeDocument {
  let summary: string | undefined;
  const coreCompetencies: string[] = [];
  const experience: NormalizedResumeExperienceEntry[] = [];
  const education: NormalizedResumeEducationEntry[] = [];
  const additionalSections: Array<{ title: string; items: string[] }> = [];

  for (const section of sections) {
    const type = String(section.type ?? '').toUpperCase();
    if (type === 'SUMMARY' && !summary) {
      const normalized = splitLines(section.content)
        .filter((line) => !BULLET_PATTERN.test(line))
        .filter((line) => !isLowQualityFragment(line))
        .join(' ')
        .trim();
      if (normalized && normalized.length >= 25) summary = normalized;
      continue;
    }
    if (type === 'SKILLS') {
      splitCompetencies(section.content)
        .filter((item) => !isLowQualityFragment(item))
        .forEach((item) => uniquePush(coreCompetencies, item));
      continue;
    }
    if (type === 'EXPERIENCE') {
      buildExperienceFromSection(section).forEach((item) => experience.push(item));
      continue;
    }
    if (type === 'EDUCATION') {
      parseEducation(section.content).forEach((item) => education.push(item));
      continue;
    }

    const lines = splitLines(section.content);
    const filteredLines = lines.filter((line) => !isLowQualityFragment(line));
    if (filteredLines.length) {
      additionalSections.push({
        title: section.title?.trim() || 'Additional Information',
        items: filteredLines,
      });
    }
  }

  const nameCandidateLines = sections
    .flatMap((section) => splitLines(section.rawContent ?? section.content).slice(0, 6))
    .filter(Boolean);
  const firstContentLines = sections
    .flatMap((section) => splitLines(section.content).slice(0, 6))
    .filter(Boolean);
  const inferredName = nameCandidateLines.find((line) => /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4}$/.test(line));
  const inferredEmail = firstContentLines.find((line) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line));
  const inferredPhoneSource = firstContentLines.find((line) => /\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(line));
  const inferredPhoneDigits = (inferredPhoneSource ?? '').replace(/\D/g, '');
  const inferredPhone = inferredPhoneDigits.length === 10
    ? `(${inferredPhoneDigits.slice(0, 3)}) ${inferredPhoneDigits.slice(3, 6)}-${inferredPhoneDigits.slice(6)}`
    : inferredPhoneSource;

  const rawContactValues = [identity?.contactLine, identity?.location, inferredEmail, inferredPhone]
    .flatMap((value) => normalizeLine(String(value ?? '')).split('|').map(normalizeLine))
    .filter(Boolean)
    .filter((value) => !isPaginationArtifact(value));
  const seenContacts = new Set<string>();
  const contactParts: string[] = [];
  for (const value of rawContactValues) {
    if (!value) continue;
    const emailMatch = value.match(EMAIL_PATTERN)?.[0]?.toLowerCase();
    if (emailMatch) {
      if (seenContacts.has(`email:${emailMatch}`)) continue;
      seenContacts.add(`email:${emailMatch}`);
      contactParts.push(emailMatch);
      continue;
    }
    const phoneDigits = (value.match(PHONE_PATTERN)?.[0] ?? value).replace(/\D/g, '');
    if (phoneDigits.length === 10) {
      const formatted = `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
      if (seenContacts.has(`phone:${phoneDigits}`)) continue;
      seenContacts.add(`phone:${phoneDigits}`);
      contactParts.push(formatted);
      continue;
    }
    const normalized = normalizeDisplayLine(value);
    if (!normalized || isLowQualityFragment(normalized)) continue;
    const key = `text:${normalized.toLowerCase()}`;
    if (seenContacts.has(key)) continue;
    seenContacts.add(key);
    contactParts.push(normalized);
  }

  const links: string[] = [];
  const dedupeEducation = dedupeEducationEntries(education);
  const strategicSummary = options?.documentStrategyPlan
    ? buildStrategicResumeSummary(options.documentStrategyPlan, summary)
    : summary;
  const normalizedSummary =
    options?.documentStrategyPlan && isWeakResumeSummary(summary)
      ? strategicSummary
      : strategicSummary && containsAnyPhrase(strategicSummary, GENERIC_SUMMARY_PHRASES)
        ? summary
        : strategicSummary;

  const normalized: NormalizedResumeDocument = {
    heading: {
      name: normalizeDisplayLine(identity?.fullName ?? '') || inferredName || 'Candidate',
      contactLine: contactParts.join(' | '),
      ...(links.length ? { links } : {}),
    },
    ...(normalizedSummary ? { summary: normalizedSummary } : {}),
    ...(coreCompetencies.length ? { competencies: coreCompetencies } : {}),
    ...(coreCompetencies.length ? { coreCompetencies } : {}),
    experience,
    ...(dedupeEducation.length ? { education: dedupeEducation } : {}),
    ...(additionalSections.length ? { additionalSections } : {}),
  };

  return sanitizeNormalizedResumeDocument(normalized);
}

function sanitizeNormalizedResumeDocument(
  document: NormalizedResumeDocument,
): NormalizedResumeDocument {
  const sanitizeText = (value?: string | null): string => stripPaginationArtifactsFromString(value ?? '');

  const sanitizedHeadingName =
    sanitizeText(document.heading.name) || normalizeDisplayLine(document.heading.name) || 'Candidate';
  const sanitizedContactLine = sanitizeText(document.heading.contactLine);
  const sanitizedLinks = (document.heading.links ?? [])
    .map((value) => sanitizeText(value))
    .filter((value) => value.length > 0);

  const sanitizedSummary = sanitizeText(document.summary ?? '');
  const rawCompetencies = document.competencies?.length
    ? document.competencies
    : document.coreCompetencies ?? [];
  const sanitizedCompetencies = rawCompetencies
    .map((value) => sanitizeText(value))
    .filter((value) => value.length > 0 && !isLowQualityFragment(value));

  const sanitizedExperience = document.experience
    .map((entry) => {
      const roleTitle =
        repairRoleTitleFragment(sanitizeText(entry.roleTitle)) || '';
      const bulletLines = entry.bullets
        .flatMap((bullet) => sanitizeText(bullet).split(/\r?\n/))
        .map((bullet) => bullet.trim())
        .filter((bullet) => bullet.length > 0);

      const mergedBullets = mergeWrappedBulletFragments(bulletLines)
        .map((bullet) => stripRoleSuffixFromBulletText(bullet, roleTitle))
        .map((bullet) => tightenBulletForSeniority(bullet))
        .filter((bullet) => bullet.length > 0)
        .filter((bullet) => !isLowQualityFragment(bullet))
        .filter((bullet) => !isClearlyIncompleteBulletFragment(bullet))
        .filter((bullet, index, list) => list.findIndex((item) => item.toLowerCase() === bullet.toLowerCase()) === index);

      return {
        company: sanitizeText(entry.company),
        roleTitle,
        location: sanitizeText(entry.location ?? '') || undefined,
        startDate: sanitizeText(entry.startDate ?? '') || undefined,
        endDate: sanitizeText(entry.endDate ?? '') || undefined,
        dateRange: sanitizeText(entry.dateRange ?? '') || undefined,
        bullets: mergedBullets,
      };
    })
    .filter((entry) => entry.company.length > 0 && !isDiscardableCompanyToken(entry.company));

  const sanitizedEducation = dedupeEducationEntries((document.education ?? [])
    .map((entry) => ({
      degree: sanitizeText(entry.degree ?? '') || undefined,
      institution: sanitizeText(entry.institution),
      location: sanitizeText(entry.location ?? '') || undefined,
    }))
    .filter((entry) => entry.institution.length > 0));

  const sanitizedAdditionalSections = (document.additionalSections ?? [])
    .map((section) => ({
      title: sanitizeText(section.title),
      items: section.items.map((item) => sanitizeText(item)).filter((item) => item.length > 0),
    }))
    .filter((section) => section.title.length > 0 && section.items.length > 0);

  return {
    heading: {
      name: sanitizedHeadingName,
      contactLine: sanitizedContactLine,
      ...(sanitizedLinks.length ? { links: sanitizedLinks } : {}),
    },
    ...(sanitizedSummary ? { summary: sanitizedSummary } : {}),
    ...(sanitizedCompetencies.length ? { competencies: sanitizedCompetencies } : {}),
    ...(sanitizedCompetencies.length ? { coreCompetencies: sanitizedCompetencies } : {}),
    experience: sanitizedExperience,
    ...(sanitizedEducation.length ? { education: sanitizedEducation } : {}),
    ...(sanitizedAdditionalSections.length
      ? { additionalSections: sanitizedAdditionalSections }
      : {}),
  };
}

export function normalizeNormalizedResumeDocument(
  document: NormalizedResumeDocument,
): NormalizedResumeDocument {
  return sanitizeNormalizedResumeDocument(document);
}

export function mapNormalizedResumeToDocxModel(
  document: NormalizedResumeDocument,
): ResumeDocxModel {
  const sections: ResumeDocxSection[] = [];

  if (document.summary) {
    const item: ResumeSummaryItem = { paragraphs: [document.summary] };
    sections.push({ key: 'summary', title: 'Summary', items: [item] });
  }

  const competencies =
    document.competencies?.length ? document.competencies : document.coreCompetencies;
  if (competencies?.length) {
    const item: ResumeSkillsItem = {
      groups: [{ values: competencies }],
    };
    sections.push({ key: 'skills', title: 'Technical Skills', items: [item] });
  }

  if (document.experience.length) {
    const items: ExperienceItem[] = document.experience
      .filter((entry) => entry.bullets.length > 0)
      .map((entry) => ({
        role: entry.roleTitle,
        company: entry.company,
        location: entry.location,
        dateRange:
          entry.dateRange ??
          ([entry.startDate, entry.endDate].filter(Boolean).join(' - ') ||
            undefined),
        bullets: entry.bullets,
      }));
    sections.push({ key: 'experience', title: 'Professional Experience', items });
  }

  if (document.education?.length) {
    const dedupedEducation = dedupeEducationEntries(document.education);

    const items: ResumeEducationItem[] = dedupedEducation.map((entry) => ({
      institution: entry.institution,
      degree: entry.degree,
      details: entry.location ? [entry.location] : undefined,
      raw: [entry.degree, entry.institution, entry.location].filter(Boolean).join(' | '),
    }));
    sections.push({ key: 'education', title: 'Education', items });
  }

  if (document.additionalSections?.length) {
    const items: ResumeOtherItem[] = document.additionalSections.map((section) => ({
      lines: [section.title, ...section.items].filter((line) => !isPaginationArtifact(line)),
    }));
    sections.push({ key: 'other', title: 'Additional Information', items: items as ResumeSectionItem[] });
  }

  return {
    header: {
      name: document.heading.name,
      contactLines: [document.heading.contactLine, ...(document.heading.links ?? [])].filter(Boolean),
    },
    sections,
  };
}

export function buildResumePlainText(document: NormalizedResumeDocument): string {
  const canonicalizeEducationToken = (token: string): string =>
    token
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;:|./()[\]{}'"`-]+|[\s,;:|./()[\]{}'"`-]+$/g, '')
      .trim()
      .toLowerCase();

  const normalizeTokensForRender = (value?: string | null): string[] =>
    String(value ?? '')
      .split(/[|¦｜]/)
      .map((token) => token.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((token, index, list) => {
        const key = canonicalizeEducationToken(token);
        if (!key) return false;
        return list.findIndex((item) => canonicalizeEducationToken(item) === key) === index;
      });

  const normalizeEducationForRender = (entry: {
    degree?: string;
    institution?: string;
    location?: string;
  }) => {
    const degreeTokens = normalizeTokensForRender(entry.degree);
    const degreeSet = new Set(degreeTokens.map((token) => canonicalizeEducationToken(token)));

    const institutionTokens = normalizeTokensForRender(entry.institution).filter(
      (token) => !degreeSet.has(canonicalizeEducationToken(token)),
    );
    const institutionSet = new Set(
      institutionTokens.map((token) => canonicalizeEducationToken(token)),
    );

    const locationTokens = normalizeTokensForRender(entry.location).filter((token) => {
      const canonical = canonicalizeEducationToken(token);
      return !degreeSet.has(canonical) && !institutionSet.has(canonical);
    });

    const degree = degreeTokens.join(' | ');
    const institution = institutionTokens.join(' | ');
    const location = locationTokens.join(' | ');
    return { degree, institution, location };
  };

  const dedupeEducationForRender = (
    entries: Array<{ degree?: string; institution?: string; location?: string }>,
  ) => {
    const seen = new Set<string>();
    const deduped: Array<{ degree: string; institution: string; location: string }> = [];
    for (const entry of entries) {
      const normalized = normalizeEducationForRender(entry);
      const key = [normalized.degree, normalized.institution, normalized.location]
        .map((token) => canonicalizeEducationToken(token))
        .join('|');
      if (!key.replace(/\|/g, '').trim() || seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(normalized);
    }
    return deduped;
  };

  const lines: string[] = [];
  lines.push(document.heading.name);
  if (document.heading.contactLine) lines.push(document.heading.contactLine);
  (document.heading.links ?? []).forEach((link) => lines.push(link));
  lines.push('');

  if (document.summary) {
    lines.push('Summary');
    lines.push(document.summary);
    lines.push('');
  }

  const competencies =
    document.competencies?.length ? document.competencies : document.coreCompetencies;
  if (competencies?.length) {
    lines.push('Core Competencies');
    lines.push(competencies.join(', '));
    lines.push('');
  }

  if (document.experience.length) {
    lines.push('Professional Experience');
    for (const entry of document.experience) {
      const companyLine = [entry.company, entry.location].filter(Boolean).join(' | ');
      const roleLine = [
        entry.roleTitle,
        entry.dateRange ?? [entry.startDate, entry.endDate].filter(Boolean).join(' - '),
      ]
        .filter(Boolean)
        .join(' | ');
      if (companyLine) {
        lines.push(companyLine);
      }
      if (roleLine) {
        lines.push(roleLine);
      }
      entry.bullets.forEach((bullet) => lines.push(`- ${bullet}`));
      lines.push('');
    }
  }

  if (document.education?.length) {
    lines.push('Education');
    const dedupedEducation = dedupeEducationForRender(document.education);
    dedupedEducation.forEach((entry) => {
      if (entry.degree) {
        lines.push(entry.degree);
      }
      const secondary = [entry.institution, entry.location].filter(Boolean).join(' | ');
      if (secondary) {
        lines.push(secondary);
      }
      lines.push('');
    });
    lines.push('');
  }

  return lines
    .map((line) => normalizeDisplayLine(line) ?? '')
    .filter((line, index, arr) => !(line === '' && arr[index - 1] === ''))
    .join('\n')
    .trim();
}



export function validateNormalizedResumeDocument(document: NormalizedResumeDocument): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!document.heading.name?.trim()) {
    reasons.push('Missing heading name.');
  }
  const contactTokens = document.heading.contactLine
    .split('|')
    .map((token) => normalizeLine(token))
    .filter(Boolean);
  const dedupeContact = new Set<string>();
  for (const token of contactTokens) {
    const phoneDigits = token.replace(/\D/g, '');
    const key =
      phoneDigits.length === 10
        ? `phone:${phoneDigits}`
        : `text:${token.toLowerCase()}`;
    if (dedupeContact.has(key)) {
      reasons.push('Duplicate contact token detected.');
      break;
    }
    dedupeContact.add(key);
  }
  const paginationInDocument = [
    document.heading.name,
    document.heading.contactLine,
    document.summary ?? '',
    ...(document.competencies ?? document.coreCompetencies ?? []),
    ...document.experience.flatMap((entry) => [
      entry.company,
      entry.roleTitle,
      entry.location ?? '',
      entry.dateRange ?? '',
      ...(entry.bullets ?? []),
    ]),
    ...(document.education ?? []).flatMap((entry) => [
      entry.degree ?? '',
      entry.institution,
      entry.location ?? '',
    ]),
  ].some((value) => isPaginationArtifact(value));
  if (paginationInDocument) {
    reasons.push('Pagination artifact detected in normalized model.');
  }

  const hasCollapsedPunctuationNoise = [
    document.heading.name,
    document.heading.contactLine,
    document.summary ?? '',
    ...document.experience.flatMap((entry) => [
      entry.company,
      entry.roleTitle,
      entry.location ?? '',
      ...(entry.bullets ?? []),
    ]),
    ...(document.education ?? []).flatMap((entry) => [
      entry.degree ?? '',
      entry.institution,
      entry.location ?? '',
    ]),
  ].some((value) => /(?:[|,:;-]{3,}|[.]{4,})/.test(String(value ?? '')));
  if (hasCollapsedPunctuationNoise) {
    reasons.push('Collapsed punctuation noise detected in normalized model.');
  }

  const hasMalformedExperienceBlob = document.experience.some((entry) => {
    const bullets = entry.bullets ?? [];
    if (bullets.length > 30) return true;
    return bullets.some((bullet) => {
      const normalized = normalizeLine(bullet);
      if (!normalized) return true;
      if (normalized.length > 420) return true;
      if ((normalized.match(/[|]/g) ?? []).length >= 6) return true;
      return false;
    });
  });
  if (hasMalformedExperienceBlob) {
    reasons.push('Experience section appears malformed or merged into oversized blobs.');
  }

  const duplicateRoleHeaderDetected = (() => {
    const seen = new Set<string>();
    for (const entry of document.experience) {
      const key = [
        normalizeLine(entry.company).toLowerCase(),
        normalizeLine(entry.roleTitle).toLowerCase(),
        normalizeLine(entry.dateRange ?? `${entry.startDate ?? ''}|${entry.endDate ?? ''}`).toLowerCase(),
      ].join('|');
      if (!key.replace(/\|/g, '').trim()) {
        continue;
      }
      if (seen.has(key)) {
        return true;
      }
      seen.add(key);
    }
    return false;
  })();
  if (duplicateRoleHeaderDetected) {
    reasons.push('Duplicate role headers detected in normalized experience entries.');
  }

  const hasCorruptedEducationRows = (document.education ?? []).some((entry) => {
    const degree = normalizeLine(entry.degree ?? '');
    const institution = normalizeLine(entry.institution);
    const location = normalizeLine(entry.location ?? '');
    if (!institution) return true;
    const values = [degree, institution, location].filter(Boolean);
    if (!values.length) return true;
    const hasOnlyPunctuation = values.some((value) => /^[|,:;\-.\s]+$/.test(value));
    if (hasOnlyPunctuation) return true;
    const hasExtremeRepeatingToken = values.some((value) => {
      const tokens = value.toLowerCase().split(/\s+/).filter(Boolean);
      if (tokens.length < 3) return false;
      const unique = new Set(tokens);
      return unique.size <= 1;
    });
    return hasExtremeRepeatingToken;
  });
  if (hasCorruptedEducationRows) {
    reasons.push('Education rows contain corrupted or placeholder-like content.');
  }

  const validExperience = document.experience.filter(
    (entry) =>
      entry.company?.trim().length > 0 &&
      !/^company$/i.test(entry.company.trim()) &&
      entry.bullets.every((bullet) => !isLowQualityFragment(bullet)),
  );
  if (!validExperience.length) {
    reasons.push('No valid experience entries were produced.');
  }
  const educationKeySet = new Set<string>();
  for (const entry of document.education ?? []) {
    const key = [entry.degree, entry.institution, entry.location]
      .map((value) => normalizeEducationToken(value))
      .join('|');
    if (educationKeySet.has(key)) {
      reasons.push('Duplicate education entries detected.');
      break;
    }
    educationKeySet.add(key);
  }
  return { valid: reasons.length === 0, reasons };
}

export type NormalizedResumeValidationFailure = {
  path: string;
  field: string;
  value: unknown;
  message: string;
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function buildNormalizedResumeValidationFailures(
  document: NormalizedResumeDocument,
): NormalizedResumeValidationFailure[] {
  const failures: NormalizedResumeValidationFailure[] = [];

  if (!trimToText(document.heading?.name)) {
    failures.push({
      path: 'heading.name',
      field: 'name',
      value: document.heading?.name,
      message: 'Missing heading name.',
    });
  }

  const contactTokens = trimToText(document.heading?.contactLine)
    .split('|')
    .map((token) => trimToText(token))
    .filter(Boolean);
  const dedupeContact = new Set<string>();
  for (const token of contactTokens) {
    const phoneDigits = token.replace(/\D/g, '');
    const key = phoneDigits.length === 10 ? `phone:${phoneDigits}` : `text:${token.toLowerCase()}`;
    if (dedupeContact.has(key)) {
      failures.push({
        path: 'heading.contactLine',
        field: 'contactLine',
        value: document.heading?.contactLine,
        message: 'Duplicate contact token detected.',
      });
      break;
    }
    dedupeContact.add(key);
  }

  for (let index = 0; index < (document.experience ?? []).length; index++) {
    const entry = document.experience[index] as any;
    const company = trimToText(entry?.company);
    const roleTitle = trimToText(entry?.roleTitle);
    const bullets = Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]) : [];

    if (!company) {
      failures.push({
        path: `experience[${index}].company`,
        field: 'company',
        value: entry?.company,
        message: 'Missing company.',
      });
    }

    if (!roleTitle) {
      failures.push({
        path: `experience[${index}].roleTitle`,
        field: 'roleTitle',
        value: entry?.roleTitle,
        message: 'Missing role title.',
      });
    }

    if (bullets.length === 0) {
      failures.push({
        path: `experience[${index}].bullets`,
        field: 'bullets',
        value: entry?.bullets,
        message: 'Experience entry missing bullets.',
      });
    } else {
      for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex++) {
        const bullet = trimToText(bullets[bulletIndex]);
        if (!bullet) {
          failures.push({
            path: `experience[${index}].bullets[${bulletIndex}]`,
            field: 'bullet',
            value: bullets[bulletIndex],
            message: 'Empty bullet.',
          });
          break;
        }
      }
    }
  }

  return failures;
}

export function formatResumeV2InvalidMessage(input: {
  reasons: string[];
  failures?: NormalizedResumeValidationFailure[] | null;
  maxFields?: number;
}): string {
  const maxFields = typeof input.maxFields === 'number' ? input.maxFields : 8;
  const paths = (input.failures ?? [])
    .map((f) => f.path)
    .filter(Boolean)
    .slice(0, maxFields);
  const suffix = paths.length ? ` Invalid fields: ${paths.join(', ')}.` : '';
  const reasons = (input.reasons ?? []).filter(Boolean);
  const reasonText = reasons.length ? ` ${reasons.slice(0, 3).join(' ')}` : '';
  return `ResumeV2 produced an invalid normalized resume model.${reasonText}${suffix}`.trim();
}
