import {
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
  ComplianceTextSection,
  DocumentType,
  JobApplicationContext,
} from './compliance.types';
import type { BaselineAllowlistSnapshot } from './baseline-allowlist.types';
import { BaselineSectionType } from '../baseline/baseline-section.entity';

type DetectorPayload = {
  baselineSections?: ComplianceTextSection[] | null;
  generatedSections?: ComplianceTextSection[] | null;
  job?: { title?: string | null; company?: string | null } | null;
  baselineAllowlist?: BaselineAllowlistSnapshot | null;
  jobContext?: JobApplicationContext | null;
  documentType?: DocumentType;
};

const COMPANY_CONTEXT_PATTERN =
  /\b(?:at|with|for|from|employer|organization|company|partnered with)\s+([A-Z][\w&.'-]+(?:\s+[A-Z][\w&.'-]+)+)/gi;
const COMPANY_SUFFIX_PATTERN =
  /\b([A-Z][\w&.'-]+(?:\s+[A-Z][\w&.'-]+)*\s+(?:Inc|Corp|LLC|LTD|Group|Labs|Technologies|Systems|Solutions|Studios|Partners|Agency|Works|Collective|Consulting|Ventures))\b/g;
const COMPANY_UPPERCASE_PATTERN = /\b(?:at|with|for|from)\s+([A-Z]{2,})\b/g;
const COMPANY_SUFFIXES = [
  'inc',
  'corporation',
  'corp',
  'llc',
  'ltd',
  'limited',
  'co',
  'company',
  'group',
  'partners',
  'ventures',
  'studios',
  'technologies',
  'systems',
  'solutions',
  'labs',
  'collective',
  'consulting',
];
const MONTHS = new Set([
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]);
const BASELINE_ROLE_SECTION_TYPES = new Set<string>([
  BaselineSectionType.EXPERIENCE,
  BaselineSectionType.SUMMARY,
]);
const EXPERIENCE_HEADER_DELIMITERS = /[-@|/]+/;

const ROLE_CONTEXT_PATTERN =
  /\b(?:as|served as|acting as|in the role of|wearing the)\s+([A-Za-z][\w&'.-]*(?:\s+(?:of\s+)?[A-Za-z][\w&'.-]*){0,4})/gi;
const ROLE_TRAILING_PATTERN =
  /([A-Za-z][\w&'.-]*(?:\s+(?:of\s+)?[A-Za-z][\w&'.-]*){0,4})\s+(?:role|title|position)\b/gi;
const ROLE_GENERAL_PATTERN =
  /\b[A-Za-z][\w&'.-]*(?:\s+(?:of\s+)?[A-Za-z][\w&'.-]*){0,4}\b/gi;

const COMPANY_ALLOWLIST = new Set([
  'team',
  'org',
  'organization',
  'leadership',
  'stakeholders',
  'interview panel',
  'recruiter',
  'hiring manager',
  'panel',
  'experience',
  'work experience',
  'professional experience',
  'summary',
  'professional summary',
  'project',
  'projects',
  'skills',
  'education',
  'background',
  'role',
  'position',
  'responsibility',
  'responsibilities',
]);
const LOCATION_ALLOWLIST = new Set([
  'new york',
  'san francisco',
  'los angeles',
  'seattle',
  'austin',
  'denver',
  'toronto',
  'remote',
  'global',
  'international',
  'americas',
  'europe',
  'asia',
  'london',
  'chicago',
  'hybrid',
]);
const NON_COMPANY_EXACT_ALLOWLIST = new Set([
  'real world merchandise',
  'gift card',
  'gift cards',
  'electronics',
  'consumer electronics',
  'compensation',
  'compensation range',
  'salary',
  'salary range',
  'pay range',
  'base salary',
  'annual salary',
  'hourly pay',
  'total compensation',
  'bonus',
  'equity',
  'benefits',
  'package',
  'platform',
  'platform label',
  'reward',
  'rewards',
]);
const NON_COMPANY_TOKEN_ALLOWLIST = new Set([
  'salary',
  'compensation',
  'wage',
  'wages',
  'hourly',
  'bonus',
  'equity',
  'benefits',
  'pay',
  'range',
  'gift',
  'gifts',
  'cards',
  'electronics',
  'merchandise',
  'reward',
  'rewards',
]);
const NON_COMPANY_PATTERNS = [
  /\b(?:salary|compensation|pay|wage|bonus|equity|benefits)\b/i,
  /[$€£]\s?\d/i,
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|m)?\s*(?:-|to)\s*\$?\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|m)?\b/i,
  /\b(?:gift\s*cards?|real\s*world\s*merchandise|electronics?)\b/i,
];
const ROLE_ALLOWLIST = new Set([
  'hiring manager',
  'recruiter',
  'interview panel',
  'team',
  'org',
  'organization',
  'leadership',
  'stakeholders',
  'this role',
  'the role',
  'the position',
  'the position',
]);

const ROLE_KEYWORDS = [
  'manager',
  'engineer',
  'developer',
  'architect',
  'director',
  'designer',
  'specialist',
  'consultant',
  'coordinator',
  'analyst',
  'scientist',
  'officer',
  'producer',
  'owner',
  'partner',
  'lead',
  'principal',
  'chief',
  'head',
  'advisor',
  'representative',
  'administrator',
  'strategist',
  'technologist',
  'operator',
  'vp',
  'cto',
  'cfo',
  'ceo',
  'founder',
];

const ROLE_KEYWORD_PATTERN = new RegExp(
  `\\b(?:${ROLE_KEYWORDS.map((keyword) =>
    keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|')})\\b`,
  'i',
);

const APPLICATION_WINDOW = 400;
const APPLICATION_PHRASE_DISTANCE = 120;
const APPLICATION_PHRASE_PATTERNS = [
  /\bi am (?:writing to )?(?:excited to )?apply(?:ing)? for\b/,
  /\bi am interested in (?:the )?(?:role|position|opportunity|job)\b/,
  /\bthis role aligns with my\b/,
];
const APPLICATION_SUBSTRING_PREFIX =
  /^(?:for\s+(?:the|a)?|about|as\s+(?:a|the)?)\s+/;

// Header delimiters used for detecting "header-like" fragments when scanning text.
const HEADER_DELIMITERS = new Set<string>([':', '-', '–', '—', '|', '/', '@']);

function hasSentenceTerminatorBeforeIndex(
  text: string,
  index: number,
): boolean {
  let cursor = index - 1;
  while (cursor >= 0) {
    const char = text[cursor];
    if (char === '\n' || char === '\r' || char === ' ' || char === '\t') {
      cursor -= 1;
      continue;
    }
    return /[.!?]/.test(char);
  }
  return false;
}

function isLikelyHeaderStart(text: string, index: number): boolean {
  if (index <= 0) return true;
  let cursor = index - 1;

  while (cursor >= 0) {
    const char = text[cursor];

    if (char === '\n' || char === '\r') {
      if (hasSentenceTerminatorBeforeIndex(text, cursor)) {
        return false;
      }
      return true;
    }

    if (char === ' ' || char === '\t') {
      cursor -= 1;
      continue;
    }

    return HEADER_DELIMITERS.has(char);
  }

  return true;
}

function matchesBaselineAllowlistSuffix(
  normalized: string,
  allowedTokens: Set<string>,
): boolean {
  if (!normalized || !allowedTokens.size) return false;
  for (const token of allowedTokens) {
    if (!token) continue;
    if (normalized === token) return true;
    if (token && normalized.startsWith(`${token} `)) return true;
    if (token && normalized.endsWith(` ${token}`)) return true;
  }
  return false;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const METRIC_CONTEXT_KEYWORDS = [
  'reduce',
  'reduced',
  'reducing',
  'increase',
  'increased',
  'increasing',
  'improve',
  'improved',
  'improving',
  'grow',
  'grew',
  'growing',
  'save',
  'saved',
  'saving',
  'decrease',
  'decreased',
  'decreasing',
  'delivered',
  'achieved',
  'sla',
  'csat',
  'nps',
  'aht',
  'backlog',
  'tickets',
  'volume',
  'time',
  'revenue',
  'churn',
];
const METRIC_CONTEXT_PATTERNS = METRIC_CONTEXT_KEYWORDS.map(
  (keyword) => new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i'),
);
const METRIC_CONTEXT_WINDOW = 40;
const METRIC_VALUE_PATTERN =
  /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s*(?:percent(?:age)?|%))?\b/gi;
const METRIC_IGNORE_CONTEXT_PATTERNS = [
  /\b24\s*\/\s*7\b/i,
  /\btier\s+[123]\b/i,
  /\bsoc\s*2\b/i,
  /\biso\s*27001\b/i,
  /\bhipaa\b/i,
];
const METRIC_PHONE_PATTERN = /\b(?:\d{3}[-.\s]?){2}\d{4}\b/;
const METRIC_EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const METRIC_DATE_PATTERNS = [
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
];
const METRIC_YEAR_PATTERN = /^(?:19|20)\d{2}$/;

const SPELLED_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 5,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};
const SPELLED_ONES_PATTERN = 'one|two|three|four|five|six|seven|eight|nine';
const SPELLED_NUMBER_PATTERN = new RegExp(
  `\\b(?:${Object.keys(SPELLED_NUMBER_WORDS).join(
    '|',
  )})(?:[ -](?:${SPELLED_ONES_PATTERN}))?\\b`,
  'gi',
);
const METRIC_PERCENT_SUFFIX_PATTERN = /^\s*(?:percent(?:age)?|%)\b/i;

export function normalizeCandidate(value: string): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTokenForComparison(value: string): string {
  const normalized = normalizeCandidate(value);
  if (!normalized) return '';
  const cleaned = normalized
    .replace(/[^0-9a-zA-Z&'\s]/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return cleaned;
}

function stripCompanySuffixes(value: string): string {
  let stripped = value.trim();
  if (!stripped) return '';

  let removed = true;
  while (removed) {
    removed = false;
    for (const suffix of COMPANY_SUFFIXES) {
      const pattern = new RegExp(`\\b${suffix}\\b$`, 'i');
      if (pattern.test(stripped)) {
        stripped = stripped.replace(pattern, '').trim();
        removed = true;
      }
    }
  }

  return stripped;
}

export function normalizeCompanyTokenForComparison(value: string): string {
  const normalized = normalizeTokenForComparison(value);
  if (!normalized) return '';
  return stripCompanySuffixes(normalized);
}

export function addCandidate(
  map: Map<string, string>,
  candidate: string,
  normalizer: (value: string) => string,
): void {
  const normalized = normalizer(candidate);
  if (!normalized || map.has(normalized)) {
    return;
  }
  map.set(normalized, normalizeCandidate(candidate));
}

export function collectCandidates(
  sections: ComplianceTextSection[] | null | undefined,
  extractor: (text: string) => string[],
  normalizer: (value: string) => string = normalizeTokenForComparison,
): Map<string, string> {
  const candidates = new Map<string, string>();

  for (const section of sections ?? []) {
    const text = [section.title, section.content].filter(Boolean).join(' ');
    if (!text) continue;

    for (const candidate of extractor(text)) {
      addCandidate(candidates, candidate, normalizer);
    }
  }

  return candidates;
}

function looksLikeCompanyName(value: string): boolean {
  const normalized = normalizeTokenForComparison(value);
  if (!normalized) return false;
  if (isNonCompanyReference(normalized, value)) return false;
  if (COMPANY_ALLOWLIST.has(normalized)) return false;
  if (LOCATION_ALLOWLIST.has(normalized)) return false;
  if (MONTHS.has(normalized)) return false;
  return normalized.length >= 3;
}

function splitCompanyTitleParts(title: string): string[] {
  return title
    .split(EXPERIENCE_HEADER_DELIMITERS)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractCompanyFromHeaderLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const fieldMatch =
    /\b(?:company|employer|organization)\s*[:\-–]\s*(.+)$/i.exec(trimmed);
  if (fieldMatch) {
    const candidate = fieldMatch[1].trim();
    if (looksLikeCompanyName(candidate)) {
      return candidate;
    }
  }

  const roleFirstMatch = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(trimmed);
  if (roleFirstMatch) {
    const candidate = roleFirstMatch[2].trim();
    if (looksLikeCompanyName(candidate)) {
      return candidate;
    }
  }

  const companySeparatorMatch = /^(.+?)\s+[-–—@|/]+\s+(.+)$/i.exec(trimmed);
  if (companySeparatorMatch) {
    const [, firstPart, secondPart] = companySeparatorMatch;
    if (looksLikeCompanyName(firstPart)) {
      return firstPart.trim();
    }

    if (looksLikeCompanyName(secondPart)) {
      return secondPart.trim();
    }
  }

  const atStartMatch = /^\bat\s+(.+)$/i.exec(trimmed);
  if (atStartMatch) {
    const candidate = atStartMatch[1].trim();
    if (looksLikeCompanyName(candidate)) {
      return candidate;
    }
  }

  if (looksLikeCompanyName(trimmed)) {
    return trimmed;
  }

  return null;
}

function extractStructuredCompanyCandidatesFromSections(
  sections: ComplianceTextSection[] | null | undefined,
): string[] {
  const candidates = new Set<string>();

  for (const section of sections ?? []) {
    if (section.title) {
      for (const part of splitCompanyTitleParts(section.title)) {
        if (looksLikeCompanyName(part)) {
          candidates.add(part);
        }
      }
    }

    const firstLine = section.content?.split('\n')[0]?.trim();
    if (firstLine) {
      const candidate = extractCompanyFromHeaderLine(firstLine);
      if (candidate) {
        candidates.add(candidate);
      }
    }
  }

  return [...candidates];
}

function extractExperienceHeaderCompanyCandidates(
  sections: ComplianceTextSection[] | null | undefined,
): string[] {
  const candidates = new Set<string>();

  for (const section of sections ?? []) {
    const titleText = section.title ?? '';
    const isExperienceSection =
      section.sectionType === BaselineSectionType.EXPERIENCE ||
      (!section.sectionType && /experience/i.test(titleText));
    if (!isExperienceSection) continue;

    const headerLines: string[] = [];
    if (section.title) {
      headerLines.push(section.title);
    }

    if (section.content) {
      headerLines.push(
        ...section.content
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 2),
      );
    }

    for (const line of headerLines) {
      const candidate = extractCompanyFromHeaderLine(line);
      if (candidate) {
        candidates.add(candidate);
      }
    }
  }

  return [...candidates];
}

export function extractBaselineCompanyTokens(
  sections: ComplianceTextSection[] | null | undefined,
): string[] {
  const structured = extractStructuredCompanyCandidatesFromSections(sections);
  if (structured.length) {
    return structured;
  }

  return extractExperienceHeaderCompanyCandidates(sections);
}

export function shouldUseForRoleDetection(
  sectionType?: string | null,
): boolean {
  if (!sectionType) return true;
  return BASELINE_ROLE_SECTION_TYPES.has(sectionType);
}

function buildNormalizedGeneratedText(
  sections: ComplianceTextSection[] | null | undefined,
): string {
  const text = (sections ?? [])
    .map((section) => `${section.title ?? ''} ${section.content ?? ''}`)
    .join(' ');

  return normalizeCandidate(text).toLowerCase();
}

function containsJobContextSubstring(
  normalizedCandidate: string,
  jobContextSet: Set<string>,
): boolean {
  if (!normalizedCandidate || !jobContextSet.size) return false;

  for (const allowed of jobContextSet) {
    if (!allowed) continue;
    if (normalizedCandidate.includes(allowed)) {
      return true;
    }
  }

  return false;
}

function isCoverLetterAboutPhrase(normalizedCandidate: string): boolean {
  if (!normalizedCandidate) return false;
  const trimmed = normalizedCandidate.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('about ') ||
    trimmed.startsWith('and about ') ||
    trimmed === 'about' ||
    trimmed === 'and about'
  );
}

function collectJobContextNormalizedSet(
  jobContext: JobApplicationContext | null | undefined,
  field: keyof JobApplicationContext,
  normalizer: (value: string) => string,
): Set<string> {
  const normalized = new Set<string>();
  const values = jobContext?.[field] ?? [];
  for (const value of values ?? []) {
    const cleaned = normalizer(String(value ?? ''));
    if (cleaned) {
      normalized.add(cleaned);
    }
  }
  return normalized;
}

function shouldSkipForJobContextApplication(
  normalizedText: string,
  candidate: string,
): boolean {
  if (!normalizedText || !candidate) return false;
  const window = normalizedText.slice(0, APPLICATION_WINDOW);
  const candidateIndex = window.indexOf(candidate);
  if (candidateIndex === -1) {
    return false;
  }

  for (const pattern of APPLICATION_PHRASE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(window);
    if (!match) {
      continue;
    }

    const afterMatch = match.index + match[0].length;
    const candidateEnd = candidateIndex + candidate.length;
    const overlapDistance = Math.abs(candidateIndex - afterMatch);

    if (
      candidateEnd >= afterMatch &&
      overlapDistance <= APPLICATION_PHRASE_DISTANCE
    ) {
      return true;
    }

    if (
      candidateIndex >= afterMatch &&
      candidateIndex - afterMatch <= APPLICATION_PHRASE_DISTANCE
    ) {
      return true;
    }
  }

  return false;
}

function normalizeForSuppression(value: string): string {
  const normalized = normalizeTokenForComparison(value);
  if (!normalized) return '';
  return normalized.replace(APPLICATION_SUBSTRING_PREFIX, '').trim();
}

function isMeaningfulCandidate(value: string): boolean {
  if (!value) return false;
  const cleaned = value.trim();
  if (!cleaned) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  return cleaned.length >= 8 || words.length >= 2;
}

function shouldSuppressRoleForCoverLetter(options: {
  rawCandidate: string;
  normalizedCandidate: string;
  normalizedText: string;
  normalizedJobTitles: string[];
}): boolean {
  if (!isMeaningfulCandidate(options.normalizedCandidate)) return false;
  if (
    !shouldSkipForJobContextApplication(
      options.normalizedText,
      options.rawCandidate,
    )
  ) {
    return false;
  }

  for (const jobTitle of options.normalizedJobTitles) {
    if (
      (jobTitle && jobTitle.includes(options.normalizedCandidate)) ||
      options.normalizedCandidate.includes(jobTitle)
    ) {
      return true;
    }
  }

  return false;
}

function hasWordBoundary(text: string, substring: string): boolean {
  if (!text || !substring) return false;

  let cursor = 0;
  while (true) {
    const index = text.indexOf(substring, cursor);
    if (index === -1) {
      return false;
    }

    const before = index === 0 || text[index - 1] === ' ';
    const after =
      index + substring.length === text.length ||
      text[index + substring.length] === ' ';

    if (before && after) {
      return true;
    }

    cursor = index + 1;
  }
}

function matchesJobContextValue(
  normalizedCandidate: string,
  allowedSet: Set<string>,
): boolean {
  if (!normalizedCandidate || !allowedSet.size) return false;

  for (const allowed of allowedSet) {
    if (!allowed) continue;
    if (hasWordBoundary(normalizedCandidate, allowed)) {
      return true;
    }
  }

  return false;
}

type MetricCandidate = {
  normalized: string;
  original: string;
  context: string;
};

function normalizeMetricToken(value: string): string {
  let normalized = String(value ?? '')
    .replace(/,/g, '')
    .replace(/\+/g, '')
    .trim();

  normalized = normalized.replace(/\s*percent(?:age)?\b/gi, '%');
  normalized = normalized.replace(/\s*%/g, '%');
  normalized = normalized.replace(/\s+/g, ' ').trim().toLowerCase();

  if (!normalized || normalized === '%') {
    return '';
  }

  return normalized;
}

function parseSpelledNumber(value: string): number | null {
  const normalized = value.toLowerCase().replace(/-/g, ' ').trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (!parts.length || parts.length > 2) return null;

  if (parts.length === 1) {
    if (parts[0] === 'hundred') return 100;

    return SPELLED_NUMBER_WORDS[parts[0]] ?? null;
  }

  const [first, second] = parts;
  if (second === 'hundred') {
    return 100;
  }

  const firstValue = SPELLED_NUMBER_WORDS[first];
  const secondValue = SPELLED_NUMBER_WORDS[second];

  if (
    typeof firstValue === 'number' &&
    typeof secondValue === 'number' &&
    firstValue >= 20 &&
    secondValue > 0 &&
    secondValue < 10
  ) {
    return firstValue + secondValue;
  }

  return null;
}

export function collectMetricCandidatesFromSections(
  sections: ComplianceTextSection[] | null | undefined,
): MetricCandidate[] {
  const candidates: MetricCandidate[] = [];

  for (const section of sections ?? []) {
    const text = [section.title, section.content].filter(Boolean).join(' ');
    if (!text) continue;

    METRIC_VALUE_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = METRIC_VALUE_PATTERN.exec(text))) {
      const original = match[0];
      const normalized = normalizeMetricToken(original);
      if (!normalized) continue;

      const contextStart = Math.max(0, match.index - METRIC_CONTEXT_WINDOW);
      const contextEnd = Math.min(
        text.length,
        match.index + original.length + METRIC_CONTEXT_WINDOW,
      );
      const context = text.slice(contextStart, contextEnd).toLowerCase();

      candidates.push({
        normalized,
        original: normalizeCandidate(original),
        context,
      });
    }

    SPELLED_NUMBER_PATTERN.lastIndex = 0;
    let spelledMatch: RegExpExecArray | null;
    while ((spelledMatch = SPELLED_NUMBER_PATTERN.exec(text))) {
      const numberValue = parseSpelledNumber(spelledMatch[0]);
      if (numberValue === null) continue;

      const suffixSlice = text.slice(
        spelledMatch.index + spelledMatch[0].length,
        spelledMatch.index + spelledMatch[0].length + 15,
      );
      const percentMatch = suffixSlice.match(METRIC_PERCENT_SUFFIX_PATTERN);
      const normalizedValue = normalizeMetricToken(
        `${numberValue}${percentMatch ? '%' : ''}`,
      );

      if (!normalizedValue) continue;

      const contextStart = Math.max(
        0,
        spelledMatch.index - METRIC_CONTEXT_WINDOW,
      );
      const context = text
        .slice(
          contextStart,
          Math.min(
            text.length,
            spelledMatch.index + spelledMatch[0].length + METRIC_CONTEXT_WINDOW,
          ),
        )
        .toLowerCase();

      candidates.push({
        normalized: normalizedValue,
        original: normalizeCandidate(
          normalizedValue.endsWith('%')
            ? `${spelledMatch[0]} ${percentMatch?.[0] ?? ''}`.trim()
            : spelledMatch[0],
        ),
        context,
      });
    }
  }

  return candidates;
}

function hasMetricContext(context: string): boolean {
  return METRIC_CONTEXT_PATTERNS.some((pattern) => pattern.test(context));
}

function isIgnoredMetricCandidate(candidate: MetricCandidate): boolean {
  if (METRIC_YEAR_PATTERN.test(candidate.normalized)) return true;
  if (METRIC_DATE_PATTERNS.some((pattern) => pattern.test(candidate.context)))
    return true;
  if (
    METRIC_IGNORE_CONTEXT_PATTERNS.some((pattern) =>
      pattern.test(candidate.context),
    )
  )
    return true;
  if (METRIC_PHONE_PATTERN.test(candidate.context)) return true;
  if (METRIC_EMAIL_PATTERN.test(candidate.context)) return true;
  return false;
}

export function detectInventedMetric(
  payload: DetectorPayload,
): ComplianceFlag[] {
  const generatedCandidates = collectMetricCandidatesFromSections(
    payload.generatedSections,
  );
  if (!generatedCandidates.length) return [];

  const baselineSet = payload.baselineAllowlist?.allowedMetricTokens?.length
    ? new Set(payload.baselineAllowlist.allowedMetricTokens)
    : new Set<string>(
        collectMetricCandidatesFromSections(payload.baselineSections).map(
          (candidate) => candidate.normalized,
        ),
      );

  const flagged = new Set<string>();
  const flags: ComplianceFlag[] = [];

  for (const candidate of generatedCandidates) {
    if (baselineSet.has(candidate.normalized)) continue;
    if (flagged.has(candidate.normalized)) continue;
    if (!hasMetricContext(candidate.context)) continue;
    if (isIgnoredMetricCandidate(candidate)) continue;

    flagged.add(candidate.normalized);
    flags.push({
      code: ComplianceFlagCode.INVENTED_METRIC,
      severity: ComplianceFlagSeverity.BLOCK,
      message: `Detected invented metric "${candidate.original}". Only mention measurable outcomes you can trace back to your verified baseline or scoped job context.`,
      confidence: 0.96,
    });
  }

  return flags;
}

export function extractCompanyCandidatesFromText(text: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null;

  const capture = (pattern: RegExp) => {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text))) {
      matches.add(match[1]);
    }
  };

  capture(COMPANY_CONTEXT_PATTERN);
  capture(COMPANY_SUFFIX_PATTERN);
  capture(COMPANY_UPPERCASE_PATTERN);

  return [...matches];
}

export function extractRoleCandidatesFromText(text: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null;

  const capture = (pattern: RegExp) => {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text))) {
      matches.add(match[1]);
    }
  };

  capture(ROLE_CONTEXT_PATTERN);
  capture(ROLE_TRAILING_PATTERN);

  ROLE_GENERAL_PATTERN.lastIndex = 0;
  while ((match = ROLE_GENERAL_PATTERN.exec(text))) {
    const candidate = match[0];
    const startIndex = typeof match.index === 'number' ? match.index : 0;
    if (!isLikelyHeaderStart(text, startIndex)) {
      continue;
    }
    if (containsRoleKeyword(candidate)) {
      matches.add(candidate);
    }
  }

  return [...matches];
}

function containsRoleKeyword(value: string): boolean {
  return ROLE_KEYWORD_PATTERN.test(value);
}

function isCompanyAllowlisted(normalized: string, original: string): boolean {
  if (isNonCompanyReference(normalized, original)) return true;
  if (COMPANY_ALLOWLIST.has(normalized)) return true;
  if (LOCATION_ALLOWLIST.has(normalized)) return true;
  if (MONTHS.has(normalized)) return true;
  if (/\b(?:com|org|net|io|co|us|uk|edu|gov)\b/i.test(original)) return true;
  if (original.includes('@') || original.includes('.')) return true;
  return false;
}

function isNonCompanyReference(normalized: string, original: string): boolean {
  if (!normalized) return true;
  if (NON_COMPANY_EXACT_ALLOWLIST.has(normalized)) return true;

  const tokenList = normalized.split(/\s+/).filter(Boolean);
  if (
    tokenList.length > 0 &&
    tokenList.every((token) => NON_COMPANY_TOKEN_ALLOWLIST.has(token))
  ) {
    return true;
  }

  const value = `${normalized} ${original}`.trim();
  return NON_COMPANY_PATTERNS.some((pattern) => pattern.test(value));
}

function buildRoleAllowlist(
  baselineTokens: Iterable<string>,
): (normalized: string, _original: string) => boolean {
  const baselineSet = new Set<string>();
  for (const token of baselineTokens) {
    if (token) {
      baselineSet.add(token);
    }
  }

  return (normalized: string) => {
    if (ROLE_ALLOWLIST.has(normalized)) return true;
    if (baselineSet.has(normalized)) return true;
    return false;
  };
}

function detectInventedEntity(options: {
  baselineSections?: ComplianceTextSection[] | null;
  generatedSections?: ComplianceTextSection[] | null;
  allowedJobValues: string[];
  candidateExtractor: (text: string) => string[];
  allowlist: (normalized: string, original: string) => boolean;
  code: ComplianceFlagCode;
  message: (token: string) => string;
  normalizer?: (value: string) => string;
  baselineTokenExtractor?: (
    sections: ComplianceTextSection[] | null | undefined,
  ) => string[];
  baselineAllowlist?: string[];
  confidence?: number;
  confidenceFactory?: (token: string) => number;
  baselineSuffixAllowlist?: boolean;
  jobContext?: JobApplicationContext | null;
  jobContextField?: keyof JobApplicationContext;
  contextualSkip?: (
    normalized: string,
    normalizedText: string,
  ) => boolean;
  generatedText?: string;
  documentType?: DocumentType;
}): ComplianceFlag[] {
  const normalizer = options.normalizer ?? normalizeTokenForComparison;

  const generated = collectCandidates(
    options.generatedSections,
    options.candidateExtractor,
    normalizer,
  );
  if (process.env.DEBUG_DETECTORS === 'true') {
    console.log(
      'generated candidates',
      [...generated.keys()],
      'from text',
      buildNormalizedGeneratedText(options.generatedSections),
    );
  }
  if (!generated.size) return [];

  const normalizedGeneratedText = (
    options.generatedText ??
    buildNormalizedGeneratedText(options.generatedSections)
  ).toLowerCase();

  const jobContextSet = options.jobContextField
    ? collectJobContextNormalizedSet(
        options.jobContext,
        options.jobContextField,
        normalizer,
      )
    : new Set<string>();

  const normalizedJobTitles = (options.jobContext?.allowedRoleTitles ?? [])
    .map((title) => normalizeForSuppression(normalizer(title)))
    .filter(Boolean);

  const allowedNormalized = new Set<string>();
  const precomputed = options.baselineAllowlist ?? [];
  const baselineSuffixSet =
    options.baselineSuffixAllowlist && precomputed.length
      ? new Set(precomputed.filter(Boolean))
      : null;

  if (precomputed.length) {
    for (const token of precomputed) {
      if (token) {
        allowedNormalized.add(token);
      }
    }
  } else {
    const baselineCandidates = new Map<string, string>();
    if (options.baselineTokenExtractor) {
      for (const candidate of options.baselineTokenExtractor(
        options.baselineSections,
      )) {
        addCandidate(baselineCandidates, candidate, normalizer);
      }
    }

    const baselineFromText = collectCandidates(
      options.baselineSections,
      options.candidateExtractor,
      normalizer,
    );
    for (const [normalized, original] of baselineFromText.entries()) {
      if (!baselineCandidates.has(normalized)) {
        baselineCandidates.set(normalized, original);
      }
    }

    for (const token of baselineCandidates.keys()) {
      allowedNormalized.add(token);
    }
  }

  for (const value of options.allowedJobValues.filter(Boolean)) {
    const normalized = normalizer(value);
    if (normalized) {
      allowedNormalized.add(normalized);
    }
  }

  const flags: ComplianceFlag[] = [];

  for (const [normalized, original] of generated.entries()) {
    if (allowedNormalized.has(normalized)) continue;
    if (
      baselineSuffixSet &&
      matchesBaselineAllowlistSuffix(normalized, baselineSuffixSet)
    ) {
      continue;
    }
    if (options.allowlist(normalized, original)) continue;

    if (
      options.documentType === DocumentType.COVER_LETTER &&
      options.contextualSkip &&
      matchesJobContextValue(normalized, jobContextSet) &&
      options.contextualSkip(normalized, normalizedGeneratedText)
    ) {
      continue;
    }

    if (
      options.documentType === DocumentType.COVER_LETTER &&
      options.jobContextField &&
      containsJobContextSubstring(normalized, jobContextSet)
    ) {
      continue;
    }

    if (
      options.documentType === DocumentType.COVER_LETTER &&
      options.jobContextField === 'allowedRoleTitles' &&
      isCoverLetterAboutPhrase(normalized)
    ) {
      continue;
    }

    if (
      options.documentType === DocumentType.COVER_LETTER &&
      options.jobContextField &&
      jobContextSet.size &&
      !/[A-Z]/.test(original)
    ) {
      continue;
    }

    const normalizedCandidateForSuppression = normalizeForSuppression(normalized);
    if (
      options.documentType === DocumentType.COVER_LETTER &&
      normalizedJobTitles.length &&
      shouldSuppressRoleForCoverLetter({
        normalizedCandidate: normalizedCandidateForSuppression,
        rawCandidate: normalized,
        normalizedText: normalizedGeneratedText,
        normalizedJobTitles,
      })
    ) {
      continue;
    }

    const confidence =
      typeof options.confidence === 'number'
        ? options.confidence
        : options.confidenceFactory
          ? options.confidenceFactory(original)
          : 0.92;

    flags.push({
      code: options.code,
      severity: ComplianceFlagSeverity.BLOCK,
      message: options.message(original),
      confidence,
    });
  }

  return flags;
}

export function detectInventedCompany(
  payload: DetectorPayload,
): ComplianceFlag[] {
  return detectInventedEntity({
    baselineSections: payload.baselineSections,
    generatedSections: payload.generatedSections,
    allowedJobValues: [
      ...(payload.job?.company ? [payload.job.company] : []),
      ...(payload.jobContext?.allowedCompanies ?? []),
    ],
    jobContext: payload.jobContext,
    jobContextField: 'allowedCompanies',
    contextualSkip: (normalized, normalizedText) =>
      shouldSkipForJobContextApplication(normalizedText, normalized),
    candidateExtractor: extractCompanyCandidatesFromText,
    allowlist: isCompanyAllowlisted,
    code: ComplianceFlagCode.INVENTED_COMPANY,
    message: (token) =>
      `Detected invented company reference "${token}". Only mention companies from your verified baseline or the job context.`,
    normalizer: normalizeCompanyTokenForComparison,
    baselineTokenExtractor: extractBaselineCompanyTokens,
    baselineAllowlist: payload.baselineAllowlist?.allowedCompanies ?? [],
    confidence: 0.95,
    documentType: payload.documentType,
  });
}

export function detectInventedRole(payload: DetectorPayload): ComplianceFlag[] {
  const baselineSectionsForRoles = (payload.baselineSections ?? []).filter(
    (section) => shouldUseForRoleDetection(section.sectionType),
  );

  const baselineRoleTokens = payload.baselineAllowlist?.allowedRoles ?? [];

  return detectInventedEntity({
    baselineSections: baselineSectionsForRoles,
    generatedSections: payload.generatedSections,
    allowedJobValues: [
      ...(payload.job?.title ? [payload.job.title] : []),
      ...(payload.jobContext?.allowedRoleTitles ?? []),
    ],
    jobContext: payload.jobContext,
    jobContextField: 'allowedRoleTitles',
    contextualSkip: (normalized, normalizedText) =>
      shouldSkipForJobContextApplication(normalizedText, normalized),
    candidateExtractor: extractRoleCandidatesFromText,
    allowlist: buildRoleAllowlist(baselineRoleTokens),
    code: ComplianceFlagCode.INVENTED_ROLE,
    message: (token) =>
      `Detected invented role or title "${token}". Describe roles you have actually held or the job you are applying to.`,
    baselineAllowlist: baselineRoleTokens,
    baselineSuffixAllowlist: true,
    confidence: 0.95,
    documentType: payload.documentType,
  });
}

const TECHNOLOGY_TOKEN_PATTERN = /\b[A-Za-z0-9][-A-Za-z0-9.#_+]{1,}\b/g;

function isTechnologyTokenCandidate(value: string): boolean {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length < 3) return false;

  if (/[.#+-]/.test(value)) return true;
  if (/\d/.test(cleaned)) return true;

  const remainder = cleaned.slice(1);
  if (!/[A-Z]/.test(remainder)) return false;
  if (!/[a-z]/.test(cleaned)) return false;

  return true;
}

export function collectTechnologyTokensFromSections(
  sections: ComplianceTextSection[] | null | undefined,
): Map<string, string> {
  const tokens = new Map<string, string>();

  for (const section of sections ?? []) {
    const text = [section.title, section.content].filter(Boolean).join(' ');
    if (!text) continue;

    TECHNOLOGY_TOKEN_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TECHNOLOGY_TOKEN_PATTERN.exec(text))) {
      const candidate = normalizeCandidate(match[0]);
      if (!candidate || !isTechnologyTokenCandidate(candidate)) continue;
      addCandidate(tokens, candidate, normalizeTokenForComparison);
    }
  }

  return tokens;
}

export function computeTechnologyConfidence(token: string): number {
  const normalized = normalizeCandidate(token ?? '');
  if (!normalized) return 0.5;

  let score = 0.4;
  score += Math.min(0.35, normalized.length / 20);
  if (/[A-Z]/.test(normalized)) score += 0.2;
  if (/[0-9]/.test(normalized)) score += 0.1;
  if (/[.+#_]/.test(normalized)) score += 0.1;
  if (/\./.test(normalized)) score += 0.05;
  return Math.min(0.98, score);
}

export function detectFictionalTechnology(
  payload: DetectorPayload,
): ComplianceFlag[] {
  const generatedTokens = collectTechnologyTokensFromSections(
    payload.generatedSections,
  );
  if (!generatedTokens.size) return [];

  const baselineTokenSet = payload.baselineAllowlist?.allowedTechnologies
    ?.length
    ? new Set(payload.baselineAllowlist.allowedTechnologies)
    : new Set(
        collectTechnologyTokensFromSections(payload.baselineSections).keys(),
      );
  const flags: ComplianceFlag[] = [];

  for (const [normalized, original] of generatedTokens.entries()) {
    if (baselineTokenSet.has(normalized)) continue;
    const tokenForConfidence = original ?? normalized;
    const confidence = computeTechnologyConfidence(tokenForConfidence);

    flags.push({
      code: ComplianceFlagCode.FICTIONAL_TECHNOLOGY,
      severity: ComplianceFlagSeverity.BLOCK,
      message: `Technology "${original}" not found in baseline.`,
      confidence,
    });
  }

  return flags;
}
