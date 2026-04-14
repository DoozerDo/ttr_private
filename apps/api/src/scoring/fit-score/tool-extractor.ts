import { normalizeText } from './fit-score.utils';

const TOOL_TOKENS = [
  'aws',
  'azure',
  'gcp',
  'kubernetes',
  'docker',
  'terraform',
  'ansible',
  'jenkins',
  'github',
  'gitlab',
  'python',
  'typescript',
  'javascript',
  'node',
  'react',
  'next',
  'postgres',
  'mysql',
  'redis',
  'kafka',
  'spark',
  'databricks',
  'snowflake',
  'linux',
  'helm',
  'prometheus',
  'grafana',
  'salesforce',
  'zendesk',
  'five9',
  'talkdesk',
  'servicenow',
  'service now',
  'jira',
  'ci',
  'cd',
  'cicd',
  'lambda',
  'ecs',
  'eks',
  'fargate',
  's3',
  'rds',
  'bigquery',
  'cloudformation',
  'cloud formation',
];

const TOOL_PHRASES = [
  'github actions',
  'gitlab ci',
  'ci cd',
  'continuous integration',
  'continuous delivery',
  'ticketing system',
  'service desk',
  'self service support',
];

const REQUIRED_INDICATORS = [
  'must have',
  'required',
  'experience with',
  'proven experience',
  'expert in',
  'strong experience',
  'hands-on experience',
  'extensive experience',
  'demonstrated experience',
  'primary focus',
];

const PREFERRED_INDICATORS = [
  'preferred',
  'nice to have',
  'bonus',
  'optional',
  'bonus points',
  'extra credit',
  'nice-to-have',
  'strongly preferred',
  'value added',
];

const WINDOW_SIZE = 40;

const PLATFORM_REQUIREMENTS = new Set([
  'salesforce',
  'zendesk',
  'five9',
  'talkdesk',
  'servicenow',
  'service now',
]);

const VERIFICATION_ALIASES: Record<string, string[]> = {
  salesforce: ['salesforce service cloud', 'sfdc'],
  servicenow: ['service now'],
  'service now': ['servicenow'],
  self_service: ['self service', 'self-service', 'selfservice'],
  five9: ['five 9'],
};

export const normalizeRequirementText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[/_-]+/g, ' ')
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STATUS_THRESHOLDS = {
  verified: 80,
  inferred: 55,
} as const;

type EvidenceMatchType =
  | 'exact_normalized'
  | 'alias'
  | 'containment'
  | 'token_overlap'
  | 'semantic_similarity'
  | 'weak_keyword'
  | 'none';

type RequirementEvidenceResult = {
  requirementKey: string;
  normalizedRequirement: string;
  score: number;
  status: ClaimVerificationStatus;
  bestScore: number;
  bestMatchType: EvidenceMatchType;
  matchedEvidence: string | null;
  matchedEvidenceText: string | null;
  matchedEvidenceSource: string | null;
  matchType: EvidenceMatchType;
  debug: {
    candidatesConsidered: number;
    topCandidates: Array<{
      text: string;
      source: string | null;
      score: number;
      matchType: EvidenceMatchType;
    }>;
  };
};

type EvaluateRequirementEvidenceOptions = {
  isPlatformRequirement?: boolean;
  semanticSimilarityFn?: (requirement: string, evidence: string) => number | null | undefined;
};

export type BaselineEvidenceEntry = {
  text: string;
  source?: string | null;
};

export type BaselineCorpusSection = {
  title?: string | null;
  type?: string | null;
  sectionType?: string | null;
  content?: string | null;
};

export type BaselineCorpusInput =
  | string
  | {
      text?: string | null;
      sections?: BaselineCorpusSection[];
      evidence?: BaselineEvidenceEntry[];
    };

export const buildVerificationBaselineEvidence = (
  baseline: BaselineCorpusInput,
): BaselineEvidenceEntry[] => {
  const corpus: BaselineEvidenceEntry[] = [];
  if (typeof baseline === 'string') {
    corpus.push({ text: baseline, source: 'baseline_text' });
  } else {
    if (baseline.text && baseline.text.trim().length > 0) {
      corpus.push({ text: baseline.text, source: 'baseline_text' });
    }
    if (Array.isArray(baseline.sections)) {
      for (const section of baseline.sections) {
        if (!section) continue;
        const title =
          (typeof section.title === 'string' ? section.title.trim() : '') ||
          (typeof section.type === 'string' ? section.type.trim() : '') ||
          (typeof section.sectionType === 'string'
            ? section.sectionType.trim()
            : '');
        const content = typeof section.content === 'string' ? section.content : '';
        if (!content.trim()) continue;
        corpus.push({
          text: content,
          source: title ? `baseline_section:${title}` : 'baseline_section',
        });
        const lines = content
          .split(/[\n\r]+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        for (const line of lines) {
          corpus.push({
            text: line,
            source: title ? `baseline_section_line:${title}` : 'baseline_section_line',
          });
        }
      }
    }
    if (Array.isArray(baseline.evidence)) {
      for (const entry of baseline.evidence) {
        if (!entry?.text?.trim()) continue;
        corpus.push({ text: entry.text, source: entry.source ?? 'baseline_evidence' });
      }
    }
  }
  const seen = new Set<string>();
  const deduped: BaselineEvidenceEntry[] = [];
  for (const entry of corpus) {
    const normalized = normalizeRequirementText(entry.text);
    if (!normalized) continue;
    const key = `${normalized}::${entry.source ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
};

export const buildBaselineCorpus = buildVerificationBaselineEvidence;

const STOP_WORDS = new Set([
  'and',
  'or',
  'for',
  'the',
  'with',
  'from',
  'into',
  'of',
  'to',
  'in',
  'on',
  'a',
  'an',
]);

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containsNormalizedPhrase = (normalizedText: string, normalizedPhrase: string): boolean => {
  if (!normalizedText || !normalizedPhrase) return false;
  const pattern = `(?:^|\\s)${escapeRegex(normalizedPhrase)}(?:\\s|$)`;
  return new RegExp(pattern, 'i').test(normalizedText);
};

const resolveRequirementVariants = (requirement: string): string[] => {
  const normalized = normalizeRequirementText(requirement);
  if (!normalized) return [];
  const aliases = VERIFICATION_ALIASES[normalized] ?? [];
  const selfServiceAliases =
    normalized.includes('self service') || normalized.includes('selfservice')
      ? VERIFICATION_ALIASES['self_service'] ?? []
      : [];
  const variants = new Set<string>([normalized]);
  for (const alias of [...aliases, ...selfServiceAliases]) {
    const normalizedAlias = normalizeRequirementText(alias);
    if (normalizedAlias) variants.add(normalizedAlias);
  }
  return [...variants];
};

export const findVerifiedEvidenceRefs = (
  requirement: string,
  baselineText: string,
): string[] => {
  const normalizedBaseline = normalizeRequirementText(baselineText);
  if (!normalizedBaseline) return [];
  const variants = resolveRequirementVariants(requirement);
  const matches: string[] = [];
  for (const variant of variants.sort((a, b) => b.length - a.length)) {
    if (!variant || variant.length < 3) continue;
    if (containsNormalizedPhrase(normalizedBaseline, variant)) {
      matches.push(variant);
    }
  }
  return [...new Set(matches)];
};

const toMeaningfulTokens = (normalized: string): string[] =>
  normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));

const isPlatformRequirement = (requirement: string): boolean =>
  PLATFORM_REQUIREMENTS.has(normalizeRequirementText(requirement));

const scoreSemanticSimilarity = (
  requirement: string,
  evidence: string,
  semanticSimilarityFn?: (requirement: string, evidence: string) => number | null | undefined,
): number => {
  if (!semanticSimilarityFn) return 0;
  const similarity = semanticSimilarityFn(requirement, evidence);
  if (typeof similarity !== 'number' || Number.isNaN(similarity)) return 0;
  const clamped = Math.max(0, Math.min(1, similarity));
  return Math.round(50 + clamped * 30);
};

const evaluatePlatformEvidenceMatch = (
  normalizedRequirement: string,
  normalizedEvidence: string,
): { score: number; matchType: EvidenceMatchType } | null => {
  const variants = resolveRequirementVariants(normalizedRequirement);
  for (const variant of variants) {
    if (!variant) continue;
    if (normalizedEvidence === variant) {
      return {
        score: variant === normalizedRequirement ? 100 : 90,
        matchType: variant === normalizedRequirement ? 'exact_normalized' : 'alias',
      };
    }
    if (containsNormalizedPhrase(normalizedEvidence, variant)) {
      return {
        score: variant === normalizedRequirement ? 82 : 90,
        matchType: variant === normalizedRequirement ? 'containment' : 'alias',
      };
    }
  }
  return null;
};

const evaluateEvidencePairScore = (
  requirement: string,
  evidence: string,
  options: EvaluateRequirementEvidenceOptions,
): { score: number; matchedEvidence: string | null; matchType: EvidenceMatchType } => {
  const normalizedRequirement = normalizeRequirementText(requirement);
  const normalizedEvidence = normalizeRequirementText(evidence);
  if (!normalizedRequirement || !normalizedEvidence) {
    return { score: 0, matchedEvidence: null, matchType: 'none' };
  }

  if (options.isPlatformRequirement) {
    const platformMatch = evaluatePlatformEvidenceMatch(
      normalizedRequirement,
      normalizedEvidence,
    );
    if (platformMatch) {
      return {
        score: platformMatch.score,
        matchedEvidence: evidence,
        matchType: platformMatch.matchType,
      };
    }
  }

  if (normalizedRequirement === normalizedEvidence) {
    return { score: 100, matchedEvidence: evidence, matchType: 'exact_normalized' };
  }

  const aliases = resolveRequirementVariants(normalizedRequirement).filter(
    (variant) => variant !== normalizedRequirement,
  );
  if (aliases.some((alias) => normalizedEvidence === alias || containsNormalizedPhrase(normalizedEvidence, alias))) {
    return { score: 90, matchedEvidence: evidence, matchType: 'alias' };
  }

  if (
    containsNormalizedPhrase(normalizedEvidence, normalizedRequirement) ||
    (normalizedRequirement.length >= 10 &&
      containsNormalizedPhrase(normalizedRequirement, normalizedEvidence))
  ) {
    return { score: 82, matchedEvidence: evidence, matchType: 'containment' };
  }

  const requirementTokens = new Set(toMeaningfulTokens(normalizedRequirement));
  const evidenceTokens = new Set(toMeaningfulTokens(normalizedEvidence));
  const overlapCount = [...requirementTokens].filter((token) => evidenceTokens.has(token)).length;
  if (overlapCount >= 2) {
    return { score: 68, matchedEvidence: evidence, matchType: 'token_overlap' };
  }

  const semanticScore = scoreSemanticSimilarity(
    normalizedRequirement,
    normalizedEvidence,
    options.semanticSimilarityFn,
  );
  if (semanticScore >= 50) {
    return { score: semanticScore, matchedEvidence: evidence, matchType: 'semantic_similarity' };
  }

  if (overlapCount >= 1) {
    return { score: 35, matchedEvidence: evidence, matchType: 'weak_keyword' };
  }

  return { score: 0, matchedEvidence: null, matchType: 'none' };
};

export const evaluateRequirementEvidence = (
  requirement: string,
  baselineEvidence: Array<string | BaselineEvidenceEntry>,
  options: EvaluateRequirementEvidenceOptions = {},
): RequirementEvidenceResult => {
  const normalizedRequirement = normalizeRequirementText(requirement);
  const requirementKey = normalizedRequirement || requirement.trim().toLowerCase();
  const candidates = baselineEvidence
    .map((entry) =>
      typeof entry === 'string'
        ? { text: entry, source: null as string | null }
        : { text: entry.text, source: entry.source ?? null },
    )
    .filter((entry) => typeof entry.text === 'string' && entry.text.trim().length > 0);
  let best = { score: 0, matchedEvidence: null as string | null, matchType: 'none' as EvidenceMatchType, source: null as string | null };
  const scoredCandidates = candidates.map((candidate) => {
    const scored = evaluateEvidencePairScore(requirement, candidate.text, options);
    if (scored.score > best.score) {
      best = { ...scored, source: candidate.source };
    }
    return {
      text: candidate.text,
      source: candidate.source,
      score: scored.score,
      matchType: scored.matchType,
    };
  });

  let finalScore = best.score;
  let finalMatchType = best.matchType;
  if (
    options.isPlatformRequirement &&
    (best.matchType === 'semantic_similarity' || best.matchType === 'token_overlap' || best.matchType === 'weak_keyword') &&
    best.score >= STATUS_THRESHOLDS.verified
  ) {
    finalScore = 79;
    finalMatchType = best.matchType;
  }

  const status: ClaimVerificationStatus =
    finalScore >= STATUS_THRESHOLDS.verified
      ? 'VERIFIED'
      : finalScore >= STATUS_THRESHOLDS.inferred
        ? 'INFERRED'
        : 'UNVERIFIED';

  return {
    requirementKey,
    normalizedRequirement,
    score: finalScore,
    bestScore: finalScore,
    status,
    bestMatchType: finalMatchType,
    matchedEvidence: best.matchedEvidence,
    matchedEvidenceText: best.matchedEvidence,
    matchedEvidenceSource: best.source,
    matchType: finalMatchType,
    debug: {
      candidatesConsidered: candidates.length,
      topCandidates: scoredCandidates.sort((a, b) => b.score - a.score).slice(0, 3),
    },
  };
};

const buildTokenRegex = (token: string) => {
  const normalizedToken = normalizeRequirementText(token);
  const segments = normalizedToken
    .split(/\s+/)
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = segments.join('\\s+');
  return new RegExp(`\\b${pattern}\\b`, 'i');
};

const containsTerm = (text: string, term: string) => {
  const regex = buildTokenRegex(term);
  return regex.test(text);
};

const findContext = (text: string, term: string) => {
  const regex = buildTokenRegex(term);
  const match = regex.exec(text);
  if (!match) return '';
  const index = match.index;
  const end = index + match[0].length;
  const start = Math.max(0, index - WINDOW_SIZE);
  const slice = text.slice(start, Math.min(text.length, end + WINDOW_SIZE));
  return slice;
};

const classifyTerm = (text: string, term: string): 'required' | 'preferred' => {
  const context = findContext(text, term);
  if (REQUIRED_INDICATORS.some((indicator) => context.includes(indicator))) {
    return 'required';
  }
  if (PREFERRED_INDICATORS.some((indicator) => context.includes(indicator))) {
    return 'preferred';
  }
  return 'preferred';
};

export type ToolRequirements = {
  required: string[];
  preferred: string[];
};

export type ToolMatchSummary = {
  matchedRequired: string[];
  matchedPreferred: string[];
  missingRequired: string[];
};

export type ToolCoverage = ToolMatchSummary & {
  requiredCoverage: number;
  preferredCoverage: number;
  claims: ToolRequirementClaim[];
};

export type ClaimVerificationStatus = 'VERIFIED' | 'INFERRED' | 'UNVERIFIED';

export type ToolRequirementClaim = {
  key: string;
  label: string;
  category: 'technology' | 'platform' | 'tooling';
  sourceType: 'job_required' | 'job_preferred';
  status: ClaimVerificationStatus;
  evidenceRefs: string[];
  generationBlocking: boolean;
  scoreWeight: number;
};

export const extractJobToolRequirements = (
  jobText: string,
): ToolRequirements => {
  const normalized = normalizeRequirementText(normalizeText(jobText));
  const found = new Set<string>();

  for (const phrase of TOOL_PHRASES) {
    if (containsTerm(normalized, phrase)) {
      found.add(phrase);
    }
  }

  for (const token of TOOL_TOKENS) {
    if (containsTerm(normalized, token)) {
      found.add(token);
    }
  }

  const required: string[] = [];
  const preferred: string[] = [];

  for (const term of found) {
    const classification = classifyTerm(normalized, term);
    if (classification === 'required') {
      required.push(term);
    } else {
      preferred.push(term);
    }
  }

  return { required, preferred };
};

const hasTicketingReference = (baselineText: string) =>
  /ticketing/.test(baselineText) || /service\s+desk/.test(baselineText);

const hasContactCenterReference = (baselineText: string) =>
  /contact\s*center/.test(baselineText) ||
  /call\s*center/.test(baselineText) ||
  /voice\s*support/.test(baselineText);

const hasAdjacentSupportForTerm = (term: string, baselineText: string): string[] => {
  const evidenceRefs: string[] = [];
  const ticketing = hasTicketingReference(baselineText);
  const contactCenter = hasContactCenterReference(baselineText);
  const normalizedTerm = term.trim().toLowerCase();

  if (normalizedTerm === 'ticketing system' && ticketing) {
    evidenceRefs.push('ticketing system');
  }

  if (normalizedTerm.includes('servicenow') && ticketing) {
    evidenceRefs.push('ticketing system');
  }

  if ((normalizedTerm.includes('five9') || normalizedTerm.includes('talkdesk')) && contactCenter) {
    return evidenceRefs;
  }

  if (normalizedTerm.includes('salesforce') && ticketing) {
    return evidenceRefs;
  }

  return evidenceRefs;
};

export const evaluateToolCoverage = (
  jobText: string,
  baselineText: string,
  options?: {
    baselineSections?: BaselineCorpusSection[];
    baselineEvidence?: BaselineEvidenceEntry[];
  },
): ToolCoverage => {
  const normalizedBaseline = normalizeRequirementText(normalizeText(baselineText));
  const baselineEvidence = buildVerificationBaselineEvidence({
    text: baselineText,
    sections: options?.baselineSections,
    evidence: options?.baselineEvidence,
  });
  const requirements = extractJobToolRequirements(jobText);

  const matchedRequired: string[] = [];
  const matchedPreferred = new Set<string>();
  const missingRequired: string[] = [];

  const claims: ToolRequirementClaim[] = [];
  const requiredStatusWeights: number[] = [];
  const preferredStatusWeights: number[] = [];

  const toWeight = (status: ClaimVerificationStatus): number =>
    status === 'VERIFIED' ? 1 : status === 'INFERRED' ? 0.4 : 0;

  for (const term of requirements.required) {
    let status: ClaimVerificationStatus = 'UNVERIFIED';
    let evidenceRefs: string[] = [];
    const isPlatform = isPlatformRequirement(term);
    const evidenceResult = evaluateRequirementEvidence(term, baselineEvidence, {
      isPlatformRequirement: isPlatform,
    });
    if (evidenceResult.status === 'VERIFIED') {
      matchedRequired.push(term);
      status = 'VERIFIED';
      evidenceRefs = evidenceResult.matchedEvidenceText ? [evidenceResult.matchedEvidenceText] : [];
    } else if (evidenceResult.status === 'INFERRED') {
      matchedPreferred.add(term);
      status = 'INFERRED';
      evidenceRefs = evidenceResult.matchedEvidenceText ? [evidenceResult.matchedEvidenceText] : [];
    } else {
      const adjacentEvidence = hasAdjacentSupportForTerm(term, normalizedBaseline);
      if (adjacentEvidence.length > 0) {
        matchedPreferred.add(term);
        status = 'INFERRED';
        evidenceRefs = adjacentEvidence;
      } else {
        missingRequired.push(term);
      }
    }
    requiredStatusWeights.push(toWeight(status));
    claims.push({
      key: term,
      label: term,
      category: isPlatform ? 'platform' : 'tooling',
      sourceType: 'job_required',
      status,
      evidenceRefs,
      generationBlocking: status !== 'VERIFIED',
      scoreWeight: toWeight(status),
    });
  }

  for (const term of requirements.preferred) {
    let status: ClaimVerificationStatus = 'UNVERIFIED';
    let evidenceRefs: string[] = [];
    const isPlatform = isPlatformRequirement(term);
    const evidenceResult = evaluateRequirementEvidence(term, baselineEvidence, {
      isPlatformRequirement: isPlatform,
    });
    if (evidenceResult.status === 'VERIFIED') {
      matchedPreferred.add(term);
      status = 'VERIFIED';
      evidenceRefs = evidenceResult.matchedEvidenceText ? [evidenceResult.matchedEvidenceText] : [];
    } else if (evidenceResult.status === 'INFERRED') {
      matchedPreferred.add(term);
      status = 'INFERRED';
      evidenceRefs = evidenceResult.matchedEvidenceText ? [evidenceResult.matchedEvidenceText] : [];
    } else {
      const adjacentEvidence = hasAdjacentSupportForTerm(term, normalizedBaseline);
      if (adjacentEvidence.length > 0) {
        matchedPreferred.add(term);
        status = 'INFERRED';
        evidenceRefs = adjacentEvidence;
      }
    }
    preferredStatusWeights.push(toWeight(status));
    claims.push({
      key: term,
      label: term,
      category: 'tooling',
      sourceType: 'job_preferred',
      status,
      evidenceRefs,
      generationBlocking: false,
      scoreWeight: toWeight(status),
    });
  }

  const requiredCoverage =
    requirements.required.length === 0
      ? 1
      : requiredStatusWeights.reduce((sum, value) => sum + value, 0) /
        requirements.required.length;

  const preferredCoverage =
    requirements.preferred.length === 0
      ? 0
      : preferredStatusWeights.reduce((sum, value) => sum + value, 0) /
        requirements.preferred.length;

  return {
    matchedRequired,
    matchedPreferred: [...matchedPreferred],
    missingRequired,
    requiredCoverage,
    preferredCoverage,
    claims,
  };
};
