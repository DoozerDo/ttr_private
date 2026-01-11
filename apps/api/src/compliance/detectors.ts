import {
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
  ComplianceTextSection,
} from './compliance.types';

type DetectorPayload = {
  baselineSections?: ComplianceTextSection[] | null;
  generatedSections?: ComplianceTextSection[] | null;
  job?: { title?: string | null; company?: string | null } | null;
};

const COMPANY_CONTEXT_PATTERN =
  /\b(?:at|with|for|from|employer|organization|company|partnered with)\s+([A-Z][\w&\.\-']+(?:\s+[A-Z][\w&\.\-']+)+)/gi;
const COMPANY_SUFFIX_PATTERN =
  /\b([A-Z][\w&\.\-']+(?:\s+[A-Z][\w&\.\-']+)*\s+(?:Inc|Corp|LLC|LTD|Group|Labs|Technologies|Systems|Solutions|Studios|Partners|Agency|Works|Collective|Consulting|Ventures))\b/g;
const COMPANY_UPPERCASE_PATTERN = /\b(?:at|with|for|from)\s+([A-Z]{2,})\b/g;

const ROLE_CONTEXT_PATTERN =
  /\b(?:as|served as|acting as|in the role of|wearing the)\s+([A-Z][\w&\.\-']+(?:\s+[A-Z][\w&\.\-']+)*)/gi;
const ROLE_TRAILING_PATTERN =
  /([A-Z][\w&\.\-']+(?:\s+[A-Z][\w&\.\-']+)*)\s+(?:role|title|position)\b/gi;
const ROLE_GENERAL_PATTERN = /[A-Z][\w&\.\-']+(?:\s+[A-Z][\w&\.\-']+){0,3}/g;

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
]);
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
  `\\b(?:${ROLE_KEYWORDS.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);

function normalizeCandidate(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTokenForComparison(value: string): string {
  return normalizeCandidate(value).toLowerCase();
}

function collectCandidates(
  sections: ComplianceTextSection[] | null | undefined,
  extractor: (text: string) => string[],
): Map<string, string> {
  const candidates = new Map<string, string>();

  for (const section of sections ?? []) {
    const text = [section.title, section.content].filter(Boolean).join(' ');
    if (!text) continue;

    for (const candidate of extractor(text)) {
      const normalized = normalizeTokenForComparison(candidate);
      if (!normalized || candidates.has(normalized)) continue;
      candidates.set(normalized, normalizeCandidate(candidate));
    }
  }

  return candidates;
}

function extractCompanyCandidatesFromText(text: string): string[] {
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

function extractRoleCandidatesFromText(text: string): string[] {
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
  if (COMPANY_ALLOWLIST.has(normalized)) return true;
  if (LOCATION_ALLOWLIST.has(normalized)) return true;
  if (/\b(?:com|org|net|io|co|us|uk|edu|gov)\b/i.test(original)) return true;
  if (original.includes('@') || original.includes('.')) return true;
  return false;
}

function isRoleAllowlisted(normalized: string): boolean {
  return ROLE_ALLOWLIST.has(normalized);
}

function detectInventedEntity(options: {
  baselineSections?: ComplianceTextSection[] | null;
  generatedSections?: ComplianceTextSection[] | null;
  allowedJobValues: string[];
  candidateExtractor: (text: string) => string[];
  allowlist: (normalized: string, original: string) => boolean;
  code: ComplianceFlagCode;
  message: (token: string) => string;
}): ComplianceFlag[] {
  const generated = collectCandidates(options.generatedSections, options.candidateExtractor);
  if (!generated.size) return [];

  const allowedNormalized = new Set<string>(
    options.allowedJobValues.filter(Boolean).map(normalizeTokenForComparison),
  );

  const baselineCandidates = collectCandidates(
    options.baselineSections,
    options.candidateExtractor,
  );
  for (const token of baselineCandidates.keys()) {
    allowedNormalized.add(token);
  }

  const flags: ComplianceFlag[] = [];

  for (const [normalized, original] of generated.entries()) {
    if (allowedNormalized.has(normalized)) continue;
    if (options.allowlist(normalized, original)) continue;

    flags.push({
      code: options.code,
      severity: ComplianceFlagSeverity.BLOCK,
      message: options.message(original),
    });
  }

  return flags;
}

export function detectInventedCompany(payload: DetectorPayload): ComplianceFlag[] {
  return detectInventedEntity({
    baselineSections: payload.baselineSections,
    generatedSections: payload.generatedSections,
    allowedJobValues: payload.job?.company ? [payload.job.company] : [],
    candidateExtractor: extractCompanyCandidatesFromText,
    allowlist: isCompanyAllowlisted,
    code: ComplianceFlagCode.INVENTED_COMPANY,
    message: (token) =>
      `Detected invented company reference "${token}". Only mention companies from your verified baseline or the job context.`,
  });
}

export function detectInventedRole(payload: DetectorPayload): ComplianceFlag[] {
  return detectInventedEntity({
    baselineSections: payload.baselineSections,
    generatedSections: payload.generatedSections,
    allowedJobValues: payload.job?.title ? [payload.job.title] : [],
    candidateExtractor: extractRoleCandidatesFromText,
    allowlist: (normalized) => isRoleAllowlisted(normalized),
    code: ComplianceFlagCode.INVENTED_ROLE,
    message: (token) =>
      `Detected invented role or title "${token}". Describe roles you have actually held or the job you are applying to.`,
  });
}
