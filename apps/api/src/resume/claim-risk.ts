import { BaselineSection } from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';

export type ClaimRiskLevel = 'None' | 'Low' | 'Medium' | 'High';

export interface ClaimRiskFlaggedTerm {
  term: string;
  normalized: string;
  reason: string;
  evidenceFound: false;
}

export interface ClaimRiskResult {
  level: ClaimRiskLevel;
  flaggedTerms: ClaimRiskFlaggedTerm[];
}

export interface ClaimRiskSummary {
  high: number;
  medium: number;
  low: number;
}

export interface BaselineEvidenceTermInventory {
  terms: string[];
  sources: Record<string, string[]>;
}

const HIGH_RISK_KEYWORDS = new Set([
  'aws',
  'azure',
  'gcp',
  'google cloud',
  'kubernetes',
  'docker',
  'terraform',
  'datadog',
  'new relic',
  'splunk',
  'servicenow',
  'salesforce',
  'node.js',
  'nodejs',
  '.net',
  'c++',
  'c#',
  'python',
  'java',
  'react',
  'postgresql',
  'mongodb',
  'pmp',
  'cissp',
  'cka',
  'ckad',
  'itil',
]);

const MEDIUM_RISK_KEYWORDS = new Set([
  'soc2',
  'soc 2',
  'hipaa',
  'pci',
  'pci dss',
  'gdpr',
  'fedramp',
  'iso27001',
  'nist',
  'sox',
  'ccpa',
]);

const GENERIC_EXCLUSIONS = new Set([
  'customer',
  'customers',
  'process',
  'processes',
  'operations',
  'operational',
  'cross functional',
  'team',
  'teams',
  'program',
  'project',
  'projects',
  'support',
  'leadership',
  'management',
  'stakeholders',
]);

const ACTION_WORD_EXCLUSIONS = new Set([
  'led',
  'built',
  'owned',
  'reduced',
  'improved',
  'delivered',
  'implemented',
  'optimized',
  'launched',
  'scaled',
  'managed',
  'drove',
  'created',
  'designed',
  'mentored',
  'automated',
  'expanded',
  'supported',
]);

const MONTH_EXCLUSIONS = new Set([
  'jan',
  'january',
  'feb',
  'february',
  'mar',
  'march',
  'apr',
  'april',
  'may',
  'jun',
  'june',
  'jul',
  'july',
  'aug',
  'august',
  'sep',
  'sept',
  'september',
  'oct',
  'october',
  'nov',
  'november',
  'dec',
  'december',
]);

const TECHNOLOGY_PHRASES = [
  'node.js',
  'new relic',
  'google cloud',
  'machine learning',
  'artificial intelligence',
  'c++',
  'c#',
  '.net',
  'soc 2',
  'pci dss',
];

function normalizeTerm(value: string): string {
  const lowered = value.toLowerCase().trim();
  const collapsed = lowered.replace(/\s+/g, ' ');
  return collapsed
    .replace(/^[^a-z0-9.+#]+/g, '')
    .replace(/[^a-z0-9.+#]+$/g, '')
    .trim();
}

function isNumericOrYear(value: string): boolean {
  return /^\d+$/.test(value) || /^(19|20)\d{2}$/.test(value);
}

function shouldExcludeTerm(value: string): boolean {
  if (!value) return true;
  if (GENERIC_EXCLUSIONS.has(value)) return true;
  if (ACTION_WORD_EXCLUSIONS.has(value)) return true;
  if (MONTH_EXCLUSIONS.has(value)) return true;
  if (isNumericOrYear(value)) return true;
  if (value.length <= 1) return true;
  return false;
}

function addSource(
  sources: Record<string, string[]>,
  normalized: string,
  sourceSnippet: string,
) {
  if (!normalized || !sourceSnippet) return;
  const existing = sources[normalized] ?? [];
  if (existing.length >= 2) return;
  if (existing.includes(sourceSnippet)) return;
  sources[normalized] = [...existing, sourceSnippet];
}

function extractTermsFromText(text: string): Array<{ surface: string; normalized: string }> {
  const candidates = new Map<string, string>();
  const input = text ?? '';
  if (!input.trim()) return [];

  const addCandidate = (surface: string) => {
    const normalized = normalizeTerm(surface);
    if (shouldExcludeTerm(normalized)) return;
    if (!candidates.has(normalized)) {
      candidates.set(normalized, surface.trim());
    }
  };

  for (const phrase of TECHNOLOGY_PHRASES) {
    const matcher = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = input.match(matcher) ?? [];
    matches.forEach(addCandidate);
  }

  const techLike = input.match(/\b[a-z0-9]+(?:[.+#][a-z0-9]+)+\b/gi) ?? [];
  techLike.forEach(addCandidate);

  const wordTokens = input.match(/\b[a-zA-Z][a-zA-Z0-9.+#]{1,}\b/g) ?? [];
  for (const token of wordTokens) {
    const normalized = normalizeTerm(token);
    if (HIGH_RISK_KEYWORDS.has(normalized) || MEDIUM_RISK_KEYWORDS.has(normalized)) {
      addCandidate(token);
    }
  }

  const acronyms = input.match(/\b[A-Z]{2,6}\b/g) ?? [];
  acronyms.forEach(addCandidate);

  const properNounPattern = /\b[A-Z][a-zA-Z0-9+#.]{2,}\b/g;
  let match: RegExpExecArray | null;
  while ((match = properNounPattern.exec(input)) !== null) {
    const surface = match[0];
    const index = match.index;
    if (index === 0) continue;
    addCandidate(surface);
  }

  return [...candidates.entries()].map(([normalized, surface]) => ({
    normalized,
    surface,
  }));
}

function classifyRisk(normalized: string): ClaimRiskLevel {
  if (MEDIUM_RISK_KEYWORDS.has(normalized)) {
    return 'Medium';
  }
  if (
    HIGH_RISK_KEYWORDS.has(normalized) ||
    normalized.includes('+') ||
    normalized.includes('#') ||
    normalized.includes('.')
  ) {
    return 'High';
  }
  return 'Low';
}

function reasonForLevel(level: ClaimRiskLevel): string {
  if (level === 'High') {
    return 'Specific technology, tool, platform, or certification not found in baseline evidence.';
  }
  if (level === 'Medium') {
    return 'Domain specific term not found in baseline evidence.';
  }
  return 'Named term not found in baseline evidence.';
}

export function buildBaselineEvidenceTermInventory(params: {
  sections: BaselineSection[];
  baselineVersion?: BaselineVersion | null;
}): BaselineEvidenceTermInventory {
  const terms = new Set<string>();
  const sources: Record<string, string[]> = {};

  const registerText = (text: string, sourceLabel: string) => {
    for (const candidate of extractTermsFromText(text)) {
      terms.add(candidate.normalized);
      addSource(sources, candidate.normalized, sourceLabel);
    }
  };

  for (const section of params.sections) {
    const sourceLabel = `section:${section.id}`;
    registerText(section.title ?? '', sourceLabel);
    registerText(section.content ?? '', sourceLabel);
  }

  const version = params.baselineVersion;
  if (version) {
    const structuredFields = [
      ...(version.allowedCompanies ?? []),
      ...(version.allowedRoles ?? []),
      ...(version.allowedTechnologies ?? []),
      ...(version.verifiedAdditions ?? []),
    ];
    for (const fieldValue of structuredFields) {
      registerText(fieldValue, 'baselineVersion:structured');
    }
  }

  return {
    terms: [...terms].sort((a, b) => a.localeCompare(b)),
    sources,
  };
}

export function detectClaimRiskForBullet(
  bulletText: string,
  inventory: BaselineEvidenceTermInventory,
): ClaimRiskResult {
  const normalizedInventory = new Set(inventory.terms);
  const flaggedTerms: ClaimRiskFlaggedTerm[] = [];
  const seen = new Set<string>();

  for (const candidate of extractTermsFromText(bulletText)) {
    if (normalizedInventory.has(candidate.normalized)) continue;
    if (seen.has(candidate.normalized)) continue;
    seen.add(candidate.normalized);

    const level = classifyRisk(candidate.normalized);
    flaggedTerms.push({
      term: candidate.surface,
      normalized: candidate.normalized,
      reason: reasonForLevel(level),
      evidenceFound: false,
    });
  }

  let level: ClaimRiskLevel = 'None';
  for (const entry of flaggedTerms) {
    const entryLevel = classifyRisk(entry.normalized);
    if (entryLevel === 'High') {
      level = 'High';
      break;
    }
    if (entryLevel === 'Medium' && level !== 'High') {
      level = 'Medium';
      continue;
    }
    if (entryLevel === 'Low' && level === 'None') {
      level = 'Low';
    }
  }

  return {
    level,
    flaggedTerms,
  };
}

export function summarizeClaimRisk(
  risks: Array<{ level: ClaimRiskLevel }>,
): ClaimRiskSummary {
  const summary: ClaimRiskSummary = { high: 0, medium: 0, low: 0 };
  for (const risk of risks) {
    if (risk.level === 'High') summary.high += 1;
    if (risk.level === 'Medium') summary.medium += 1;
    if (risk.level === 'Low') summary.low += 1;
  }
  return summary;
}
