export enum ResumeLineType {
  ROLE_HEADER = 'ROLE_HEADER',
  BULLET_CLAIM = 'BULLET_CLAIM',
  BULLET_EVIDENCE_FRAGMENT = 'BULLET_EVIDENCE_FRAGMENT',
  SKILL_STACK = 'SKILL_STACK',
  NOISE = 'NOISE',
}

const NOISE_PATTERNS: RegExp[] = [
  /^\s*professional experience\s*$/i,
  /^\s*employment history\s*$/i,
  /^\s*work history\s*$/i,
  /^\s*references available upon request\.?\s*$/i,
  /^\s*page\s+\d+(?:\s*\|\s*\d+)?\s*$/i,
  /^\s*(?:resume|curriculum vitae)\s*$/i,
];

const ROLE_HEAD_NOUNS = new Set([
  'engineer',
  'manager',
  'director',
  'lead',
  'head',
  'architect',
  'analyst',
  'consultant',
  'administrator',
  'coordinator',
  'specialist',
  'officer',
  'president',
  'chief',
  'supervisor',
  'operator',
  'developer',
  'owner',
  'recruiter',
  'executive',
  'tester',
  'sdet',
]);

const ACTION_VERBS = new Set([
  'led',
  'served',
  'worked',
  'managed',
  'partnered',
  'collaborated',
  'enabled',
  'discussed',
  'reduced',
  'increased',
  'improved',
  'achieved',
  'delivered',
  'saved',
  'decreased',
  'grew',
  'generated',
  'administered',
  'configured',
  'maintained',
  'built',
  'developed',
  'implemented',
  'directed',
  'owned',
  'oversaw',
  'ran',
  'drove',
  'created',
  'designed',
  'supported',
  'coordinated',
  'migrated',
  'automated',
  'delivered',
]);

const TECH_DOMAIN_TERMS = new Set([
  'platform',
  'infrastructure',
  'environment',
  'network',
  'lab',
  'labs',
  'system',
  'systems',
  'deployment',
  'operations',
  'automation',
  'engineering',
  'support',
  'management',
  'device',
  'devices',
  'cloud',
]);

function tokenize(value: string): string[] {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function isNoise(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isSkillStack(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  const hasStackSeparator = /[|,/]/.test(normalized);
  if (!hasStackSeparator) return false;

  const parts = normalized
    .split(/[|,/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return false;
  if (parts.some((part) => part.split(/\s+/).length > 3)) return false;

  const lower = normalized.toLowerCase();
  const hasTechWord = [...TECH_DOMAIN_TERMS].some((term) =>
    lower.includes(term),
  );
  return hasTechWord || /(?:azure|terraform|kubernetes|python|bash|powershell|cisco|arista|sonic)/i.test(normalized);
}

function isRoleHeader(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || /[.!?]$/.test(normalized)) return false;
  if (/[|,/]/.test(normalized)) return false;

  const tokens = tokenize(normalized);
  if (tokens.length < 2 || tokens.length > 9) return false;
  const lowerTokens = tokens.map((token) => token.toLowerCase());
  const headMatches = lowerTokens.filter((token) =>
    ROLE_HEAD_NOUNS.has(token),
  ).length;
  if (headMatches === 0) return false;
  if (
    lowerTokens.some((token) =>
      ['professional', 'experience', 'history', 'references'].includes(token),
    )
  ) {
    return false;
  }
  return true;
}

function isBulletClaim(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  const tokens = tokenize(normalized);
  if (!tokens.length) return false;
  const first = tokens[0].toLowerCase();
  if (!ACTION_VERBS.has(first)) return false;
  if (tokens.length < 4) return false;
  return true;
}

function isBulletEvidenceFragment(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  // Fragments are partial bullet-ish spans; full sentences should be treated as claims so detectors can evaluate them.
  if (/[.!?]$/.test(normalized)) return false;
  if (isRoleHeader(normalized)) return false;
  if (isBulletClaim(normalized)) return false;
  if (isSkillStack(normalized)) return false;

  const lowerTokens = tokenize(normalized).map((token) =>
    token.toLowerCase().replace(/[^a-z0-9]/g, ''),
  );
  const domainMatches = lowerTokens.filter((token) =>
    TECH_DOMAIN_TERMS.has(token),
  ).length;
  const hasConjunction = /\b(?:and|or)\b/i.test(normalized);

  return domainMatches >= 1 && (lowerTokens.length >= 2 || hasConjunction);
}

export function classifyResumeLine(input: string): ResumeLineType {
  const line = String(input ?? '')
    .replace(/^[-*\u2022\u25CF\u25E6\u2043\u2219]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (isNoise(line)) return ResumeLineType.NOISE;
  if (isSkillStack(line)) return ResumeLineType.SKILL_STACK;
  if (isRoleHeader(line)) return ResumeLineType.ROLE_HEADER;
  if (isBulletClaim(line)) return ResumeLineType.BULLET_CLAIM;
  if (isBulletEvidenceFragment(line)) {
    return ResumeLineType.BULLET_EVIDENCE_FRAGMENT;
  }
  if (/\b(?:led|managed|partnered|collaborated|enabled|discussed|reduced|increased|improved|achieved|delivered|saved|decreased|grew|generated|administered|configured|maintained|built|developed|implemented|served as|worked as)\b/i.test(line)) {
    return ResumeLineType.BULLET_CLAIM;
  }
  // Some synthetic/generated artifacts prefix sentences with section-like tokens (e.g. "Experience VP ...").
  // Treat these as claims so role/company/metric detectors still evaluate them.
  if (
    /^experience\s+/i.test(line) &&
    /\b(?:vp|vice president|chief|director|head|manager|engineer|officer|president)\b/i.test(line)
  ) {
    return ResumeLineType.BULLET_CLAIM;
  }
  return ResumeLineType.NOISE;
}
