import { GeneratedTextSourceType } from './compliance.types';

const ROLE_HEAD_NOUNS = new Set([
  'manager',
  'director',
  'vice',
  'president',
  'head',
  'lead',
  'engineer',
  'specialist',
  'analyst',
  'administrator',
  'consultant',
  'architect',
  'coordinator',
  'officer',
  'chief',
  'owner',
  'supervisor',
  'recruiter',
  'partner',
  'executive',
  'program',
  'product',
  'operations',
  'support',
]);

const ROLE_ASSERTION_PATTERN =
  /\b(?:served as|worked as|promoted to|hired as|currently working as|acted as|functioned as|was(?:\s+an?|\s+the)?|my role was|acting as|appointed)\b/i;
const DANGLING_CONNECTIVE_PHRASE_PATTERN =
  /\b(?:on|in|for|with|at|of|to|and)\s+the\s*$/i;
const DANGLING_LAST_TOKEN_PATTERN =
  /\b(?:on|in|for|with|at|of|to|and|a|an|the)\s*$/i;
const LOWERCASE_NARRATIVE_VERB_PATTERN =
  /^(?:resolve|collaborated|designed|worked|responsible|helped|created|built|managed|drove|led|converted|configured|installed|implemented|implementing|helping|supporting|projects|certification)\b/;
const CAPABILITY_PHRASE_PATTERNS = [
  /\bleadership scope\b/i,
  /\bincident management programs?\b/i,
  /\btechnical depth highlights\b/i,
  /\bcustomer operations strategy\b/i,
  /\bprocess optimization and workflow management\b/i,
  /\brecommended for this role\b/i,
  /\bwhy this focus\b/i,
  /\bfor this role\b/i,
];

type StatementIntegrityOptions = {
  sourceType?: GeneratedTextSourceType | null;
};

export type StatementIntegrityResult = {
  valid: boolean;
  normalized: string;
  reason:
    | 'ok'
    | 'missing_text'
    | 'non_baseline_source'
    | 'dangling_connective_phrase'
    | 'dangling_last_token'
    | 'lowercase_narrative_fragment'
    | 'too_short'
    | 'too_long'
    | 'capability_phrase'
    | 'incomplete_separator'
    | 'malformed_role_title';
  tokenCount: number;
  standaloneRoleTitle: boolean;
};

function normalizeStatement(value: string): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function hasMalformedSeparatorArtifact(value: string): boolean {
  const sanitized = value.replace(/https?:\/\/\S+/g, '');

  if (/[|\u00A6\uFF5C]/.test(sanitized)) {
    if (!/^[^|]{3,}\|[^|]{3,}(?:\|[^|]{3,})*$/.test(sanitized)) {
      return true;
    }
  }

  if (/:/.test(sanitized)) {
    if (!/^[A-Z][^:]{2,}:\s+\S+/.test(sanitized)) {
      return true;
    }
  }

  if (/\s[-\u2013\u2014]\s/.test(sanitized)) {
    const parts = sanitized
      .split(/\s[-\u2013\u2014]\s/)
      .map((part) => part.trim());
    if (parts.some((part) => tokenize(part).length < 2)) {
      return true;
    }
  }

  return false;
}

function isStandaloneRoleTitle(value: string): boolean {
  const normalized = normalizeStatement(value);
  if (!normalized) return false;
  if (/[.!?]$/.test(normalized)) return false;
  const tokens = tokenize(normalized);
  if (tokens.length < 3 || tokens.length > 10) return false;

  const lowerTokens = tokens.map((token) => token.toLowerCase());
  const roleHeadMatches = lowerTokens.filter((token) =>
    ROLE_HEAD_NOUNS.has(token),
  ).length;
  if (roleHeadMatches === 0) return false;
  if (DANGLING_CONNECTIVE_PHRASE_PATTERN.test(normalized)) return false;
  if (DANGLING_LAST_TOKEN_PATTERN.test(normalized)) return false;
  if (CAPABILITY_PHRASE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  const nonTitleNarrativeTokens = lowerTokens.filter((token) =>
    /^(?:scope|strategy|programs|workflow|workflows|signals|highlights|recommended|role|aligned)$/.test(
      token,
    ),
  ).length;
  if (nonTitleNarrativeTokens > Math.floor(tokens.length / 2)) return false;

  return true;
}

export function validateStatementIntegrity(
  statement: string,
  options?: StatementIntegrityOptions,
): StatementIntegrityResult {
  const normalized = normalizeStatement(statement);
  const sourceType =
    options?.sourceType ?? GeneratedTextSourceType.CONNECTIVE_LANGUAGE;
  if (!normalized) {
    return {
      valid: false,
      normalized,
      reason: 'missing_text',
      tokenCount: 0,
      standaloneRoleTitle: false,
    };
  }

  if (sourceType !== GeneratedTextSourceType.BASELINE_EVIDENCE) {
    return {
      valid: false,
      normalized,
      reason: 'non_baseline_source',
      tokenCount: tokenize(normalized).length,
      standaloneRoleTitle: false,
    };
  }

  const tokens = tokenize(normalized);
  const tokenCount = tokens.length;
  const standaloneRoleTitle = isStandaloneRoleTitle(normalized);

  if (DANGLING_CONNECTIVE_PHRASE_PATTERN.test(normalized)) {
    return {
      valid: false,
      normalized,
      reason: 'dangling_connective_phrase',
      tokenCount,
      standaloneRoleTitle,
    };
  }

  if (DANGLING_LAST_TOKEN_PATTERN.test(normalized)) {
    return {
      valid: false,
      normalized,
      reason: 'dangling_last_token',
      tokenCount,
      standaloneRoleTitle,
    };
  }

  const firstToken = tokens[0] ?? '';
  if (
    /^[a-z]/.test(firstToken) &&
    LOWERCASE_NARRATIVE_VERB_PATTERN.test(firstToken) &&
    !ROLE_ASSERTION_PATTERN.test(normalized)
  ) {
    return {
      valid: false,
      normalized,
      reason: 'lowercase_narrative_fragment',
      tokenCount,
      standaloneRoleTitle,
    };
  }

  if (tokenCount < 4 && !standaloneRoleTitle) {
    return {
      valid: false,
      normalized,
      reason: 'too_short',
      tokenCount,
      standaloneRoleTitle,
    };
  }

  if (tokenCount > 60) {
    return {
      valid: false,
      normalized,
      reason: 'too_long',
      tokenCount,
      standaloneRoleTitle,
    };
  }

  if (CAPABILITY_PHRASE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      valid: false,
      normalized,
      reason: 'capability_phrase',
      tokenCount,
      standaloneRoleTitle,
    };
  }

  if (
    hasMalformedSeparatorArtifact(normalized) &&
    !ROLE_ASSERTION_PATTERN.test(normalized)
  ) {
    return {
      valid: false,
      normalized,
      reason: 'incomplete_separator',
      tokenCount,
      standaloneRoleTitle,
    };
  }

  if (!standaloneRoleTitle && !/[.!?]$/.test(normalized) && tokenCount < 6) {
    return {
      valid: false,
      normalized,
      reason: 'malformed_role_title',
      tokenCount,
      standaloneRoleTitle,
    };
  }

  return {
    valid: true,
    normalized,
    reason: 'ok',
    tokenCount,
    standaloneRoleTitle,
  };
}

