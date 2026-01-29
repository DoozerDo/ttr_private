import fs from 'node:fs';
import path from 'node:path';

import { FitAssessmentVerdict } from '../../analysis/fit-assessment.entity';
import {
  FitScoreInput,
  FitScoreResult,
  FitScoreOptions,
  DimensionWeightOverrides,
  FitScoreDimensionScores,
  FitScoreDebugPayload,
  FitScoreDebugDimensionDetail,
} from './fit-score.types';
import { normalizeText, countWords, clamp, buildJobPromptText } from './fit-score.utils';
import { buildStrengths, buildGaps } from './fit-score.explain';
import { verdictFromScore } from './fit-verdict';

const SENIORITY_KEYWORDS = [
  'head of',
  'director of',
  'director',
  'senior director',
  'vice president',
  'vp of',
  'vp',
  'lead and scale',
  'own support function',
  'executive reporting',
  'cross-functional leadership',
  'global support',
];

const BASELINE_DOWNLEVEL_INDICATORS = [
  'individual contributor',
  'individual contributor only',
  'no people management',
  'single function ownership only',
  'team lead',
  'team lead only',
];

const DOMAIN_KEYWORDS = ['accounting', 'compliance'];

const DEFAULT_WEIGHTS: Record<keyof FitScoreDimensionScores, number> = {
  experienceAlignment: 0.3,
  leadershipLevel: 0.25,
  strategicTacticalFit: 0.2,
  industryContext: 0.15,
  technicalPlatformFit: 0.1,
};

const CONTRACT_FILENAME = 'scoring_contract_v1.json';

type CxFitTier = 'strong_match' | 'moderate_match' | 'partial_match' | 'weak_match' | 'no_match';

type EvidenceDetail = {
  matchedSnippets: string[];
  matchedTerms: string[];
};

interface ContractDimension {
  id: string;
  weight: number;
  description: string;
  signals: {
    baseline_positive?: string[];
    baseline_negative?: string[];
    job_positive?: string[];
  };
  scoring_rules: Record<
    CxFitTier,
    {
      points: number;
      criteria: string;
    }
  >;
}

interface ContractPenalty {
  id: string;
  description: string;
  trigger: string;
  deduction: number;
}

interface ScoringContract {
  contract_version: string;
  total_weight: number;
  dimensions: ContractDimension[];
  penalties: ContractPenalty[];
  normalization: {
    method: string;
    minimum_score: number;
    maximum_score: number;
  };
  rounding: {
    method: string;
    precision: number;
    apply_at: string;
  };
}

interface DimensionState {
  baselinePositiveMatches: string[];
  baselineNegativeMatches: string[];
  jobPositiveMatches: string[];
  baselineEffective: number;
  jobEffective: number;
  jobSeniorityMatches: string[];
}

interface DimensionResult {
  id: string;
  points: number;
  tier: CxFitTier;
  evidence: EvidenceDetail;
}

interface PenaltyResult {
  id: string;
  deduction: number;
  evidence: EvidenceDetail;
}

interface ResolvedContractPath {
  contractPath: string;
  attemptedPaths: string[];
}

let cachedContract: ScoringContract | null = null;

export class FitScoreInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitScoreInputError';
  }
}

export class FitScoreEngine {
  constructor(_embeddingProvider?: unknown) {
    /* kept for backwards compatibility */
  }

  async score(input: FitScoreInput, options?: FitScoreOptions): Promise<FitScoreResult> {
    const jobSelection = this.selectJobText(input.job);

    if (jobSelection.wordCount < 300) {
      throw new FitScoreInputError(
        'Job text must contain at least 300 words for reliable scoring.',
      );
    }

    const baselineText = combineSections(input.baseline.sections);
    const baselineWordCount = countWords(baselineText);
    const contract = loadScoringContract();
    const jobText = jobSelection.text;

    const normalizedBaseline = normalizeText(baselineText);
    const normalizedJob = normalizeText(jobText);
    const jobTitle = extractFirstLine(jobText);
    const normalizedTitle = normalizeText(jobTitle);

    const jobSeniorityMatches = Array.from(
      new Set([
        ...detectIndicators(normalizedJob, SENIORITY_KEYWORDS),
        ...detectIndicators(normalizedTitle, SENIORITY_KEYWORDS),
      ]),
    );

    const baselineDownMatches = detectIndicators(normalizedBaseline, BASELINE_DOWNLEVEL_INDICATORS);
    const jobDomainMatches = detectIndicators(normalizedJob, DOMAIN_KEYWORDS);
    const baselineDomainMatches = detectIndicators(normalizedBaseline, DOMAIN_KEYWORDS);

    const dimensionResults = contract.dimensions.map((dimension) =>
      scoreDimension(dimension, baselineText, jobText, jobSeniorityMatches),
    );

    const dimensionScoreMap = dimensionResults.reduce<Record<string, number>>((acc, result) => {
      acc[result.id] = result.points;
      return acc;
    }, {});

    const penalties = evaluatePenalties(
      contract.penalties,
      baselineText,
      jobText,
      jobSeniorityMatches,
      baselineDownMatches,
      jobDomainMatches,
      baselineDomainMatches,
    );

    const penaltiesApplied = penalties.map((penalty) => penalty.id);

    const totalPenalty = penalties.reduce((sum, penalty) => sum + penalty.deduction, 0);
    const rawScoreOfDimensions = dimensionResults.reduce((sum, result) => sum + result.points, 0);
    const rawAfterPenalties = rawScoreOfDimensions - totalPenalty;

    const finalRawScore = clamp(
      rawAfterPenalties,
      contract.normalization.minimum_score,
      contract.normalization.maximum_score,
    );

    const finalRoundedScore = roundHalfUp(finalRawScore, contract.rounding.precision);
    const mappedDimensionScores = mapContractDimensionScores(dimensionScoreMap);

    const strengths = buildStrengths(jobText, baselineText, mappedDimensionScores);
    const gaps = buildGaps([], mappedDimensionScores);

    const verdictLabel = verdictFromScore(finalRoundedScore);
    const persistenceVerdict = this.mapPersistenceVerdict(verdictLabel);

    const debug: FitScoreDebugPayload | undefined = options?.debug
      ? {
          weights: this.applyDimensionWeights(options?.weights),
          rawScore: finalRawScore,
          finalScore: finalRoundedScore,
          signalBoost: 0,
          missingRequiredToolsCount: 0,
          missingRequiredToolsPenalty: 0,
          leadershipOverrideApplied: false,
          chosenTextSource: jobSelection.source,
          jobWordCount: jobSelection.wordCount,
          baselineWordCount,
          verdict: verdictLabel,
          dimensionDetails: createDebugDetails(mappedDimensionScores),
        }
      : undefined;

    return {
      overallScore: finalRoundedScore,
      rawScore: finalRawScore,
      verdict: verdictLabel,
      persistenceVerdict,
      dimensionScores: mappedDimensionScores,
      penaltiesApplied,
      strengths,
      gaps,
      summary: 'CX Fit rubric scored via scoring_contract_v1.',
      missingRequiredTools: [],
      missingRequiredToolsCount: 0,
      missingRequiredToolsPenalty: 0,
      leadershipOverrideApplied: false,
      complianceFlags: [],
      debug,
    };
  }

  private applyDimensionWeights(
    overrides?: DimensionWeightOverrides | null,
  ): Record<keyof FitScoreDimensionScores, number> {
    const weights: Record<keyof FitScoreDimensionScores, number> = {
      experienceAlignment: DEFAULT_WEIGHTS.experienceAlignment,
      leadershipLevel: DEFAULT_WEIGHTS.leadershipLevel,
      strategicTacticalFit: DEFAULT_WEIGHTS.strategicTacticalFit,
      industryContext: DEFAULT_WEIGHTS.industryContext,
      technicalPlatformFit: DEFAULT_WEIGHTS.technicalPlatformFit,
    };

    (Object.keys(weights) as Array<keyof FitScoreDimensionScores>).forEach(
      (dimension) => {
        weights[dimension] = weights[dimension] * (overrides?.[dimension] ?? 1);
      },
    );

    return weights;
  }

  private selectJobText(job: FitScoreInput['job']) {
    const override = job.jobTextOverride?.trim();
    if (override) {
      return {
        text: override,
        wordCount: countWords(override),
        source: 'rawDescription',
      };
    }

    const jobPrompt = buildJobPromptText(job);
    return {
      text: jobPrompt.text,
      wordCount: jobPrompt.wordCount,
      source: jobPrompt.source,
    };
  }

  private mapPersistenceVerdict(label: string): FitAssessmentVerdict {
    if (label === 'Apply') {
      return FitAssessmentVerdict.APPLY;
    }
    if (label === 'Consider') {
      return FitAssessmentVerdict.CONSIDER;
    }
    return FitAssessmentVerdict.SKIP;
  }
}

function combineSections(sections: FitScoreInput['baseline']['sections']) {
  return sections
    .filter((section) => section.content)
    .map((section) => section.content)
    .join('\n');
}

function resolveContractPath(): ResolvedContractPath {
  const envPath = process.env.CX_FIT_CONTRACT_PATH?.trim();
  const candidates: string[] = [];

  if (envPath) {
    candidates.push(path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath));
  }

  const distCandidate = path.resolve(
    process.cwd(),
    'dist',
    'scoring',
    'contracts',
    CONTRACT_FILENAME,
  );
  const compiledCandidate = path.resolve(__dirname, '..', 'contracts', CONTRACT_FILENAME);
  const srcCandidate = path.resolve(process.cwd(), 'src', 'scoring', 'contracts', CONTRACT_FILENAME);
  const docsCandidate = path.resolve(process.cwd(), 'docs', CONTRACT_FILENAME);

  [distCandidate, compiledCandidate, srcCandidate, docsCandidate].forEach((candidate) => {
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  });

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return {
          contractPath: candidate,
          attemptedPaths: candidates,
        };
      }
    } catch {
      // ignore and continue
    }
  }

  const debugLines = candidates.map((p) => `- ${p}`).join('\n');
  throw new Error(
    `Could not locate ${CONTRACT_FILENAME}. Tried these paths:\n${debugLines}\n` +
      `Set CX_FIT_CONTRACT_PATH to override.`,
  );
}

function loadScoringContract(): ScoringContract {
  if (cachedContract) return cachedContract;

  const { contractPath } = resolveContractPath();
  const raw = fs.readFileSync(contractPath, 'utf8');
  const parsed = JSON.parse(raw) as ScoringContract;

  if (!parsed.contract_version) {
    throw new Error('Scoring contract must define contract_version');
  }

  if (!Array.isArray(parsed.dimensions) || parsed.dimensions.length === 0) {
    throw new Error('Scoring contract must declare at least one dimension');
  }

  const totalDimensionWeight = parsed.dimensions.reduce(
    (sum, dimension) => sum + (typeof dimension.weight === 'number' ? dimension.weight : 0),
    0,
  );
  if (totalDimensionWeight !== 100) {
    throw new Error(`Dimensions must sum to 100 weight (got ${totalDimensionWeight})`);
  }

  if (parsed.total_weight !== totalDimensionWeight) {
    throw new Error(
      `total_weight (${parsed.total_weight}) must equal the sum of dimension weights (${totalDimensionWeight})`,
    );
  }

  if (!Array.isArray(parsed.penalties)) {
    throw new Error('Scoring contract must include a penalties array');
  }

  parsed.penalties.forEach((penalty) => {
    if (!penalty.id) {
      throw new Error('Each penalty must have an id');
    }
    if (typeof penalty.deduction !== 'number') {
      throw new Error(`Penalty ${penalty.id} must declare a numeric deduction value`);
    }
  });

  if (parsed.rounding.method !== 'round_half_up') {
    throw new Error('Contract rounding.method must be round_half_up');
  }
  if (parsed.rounding.apply_at !== 'final_score_only') {
    throw new Error('Contract rounding.apply_at must be final_score_only');
  }

  cachedContract = parsed;
  return cachedContract;
}

function scoreDimension(
  dimension: ContractDimension,
  baselineText: string,
  jobText: string,
  jobSeniorityMatches: string[],
): DimensionResult {
  const baselinePositives = matchPhrases(baselineText, dimension.signals.baseline_positive ?? []);
  const baselineNegatives = matchPhrases(baselineText, dimension.signals.baseline_negative ?? []);
  const jobPositives = matchPhrases(jobText, dimension.signals.job_positive ?? []);

  const baselineEffective = Math.max(0, baselinePositives.length - baselineNegatives.length);
  const jobEffective = jobPositives.length;

  const state: DimensionState = {
    baselinePositiveMatches: baselinePositives,
    baselineNegativeMatches: baselineNegatives,
    jobPositiveMatches: jobPositives,
    baselineEffective,
    jobEffective,
    jobSeniorityMatches,
  };

  const evidence = createEvidenceDetail();
  gatherEvidence(evidence, 'baseline', baselineText, baselinePositives);
  gatherEvidence(evidence, 'baseline', baselineText, baselineNegatives, ' (negative signal)');
  gatherEvidence(evidence, 'job', jobText, jobPositives);

  const tier = determineTier(dimension.id, state);
  const rule = dimension.scoring_rules[tier];
  const points = rule?.points ?? 0;

  return {
    id: dimension.id,
    points,
    tier,
    evidence,
  };
}

const determineTier = ((id: string, state: DimensionState): CxFitTier => {
  switch (id) {
    case 'role_scope_and_seniority':
      return evaluateRoleScopeState(state);
    case 'support_operations_and_process_rigor':
      return evaluateSupportOperationsState(state);
    case 'tooling_and_platform_experience':
      return evaluateToolingState(state);
    case 'domain_and_business_context':
      return evaluateDomainState(state);
    case 'change_leadership_and_customer_advocacy':
      return evaluateChangeLeadershipState(state);
    default:
      return evaluateGenericState(state);
  }
}) as (id: string, state: DimensionState) => CxFitTier;

function evaluateRoleScopeState(state: DimensionState): CxFitTier {
  if (state.baselineEffective >= 2 && (state.jobEffective >= 1 || state.jobSeniorityMatches.length > 0)) {
    return 'strong_match';
  }
  if (state.baselineEffective >= 1 && (state.jobEffective >= 1 || state.jobSeniorityMatches.length > 0)) {
    return 'moderate_match';
  }
  if (state.baselineEffective >= 1) {
    return 'partial_match';
  }
  if (state.jobEffective >= 1 || state.jobSeniorityMatches.length > 0) {
    return 'weak_match';
  }
  return 'no_match';
}

function evaluateSupportOperationsState(state: DimensionState): CxFitTier {
  if (state.baselineEffective >= 3 && state.jobEffective >= 1) {
    return 'strong_match';
  }
  if (state.baselineEffective >= 2) {
    return 'moderate_match';
  }
  if (state.baselineEffective >= 1) {
    return 'partial_match';
  }
  if (state.jobEffective >= 1) {
    return 'weak_match';
  }
  return 'no_match';
}

function evaluateToolingState(state: DimensionState): CxFitTier {
  if (state.baselineEffective >= 3) {
    return 'strong_match';
  }
  if (state.baselineEffective >= 2) {
    return 'moderate_match';
  }
  if (state.baselineEffective >= 1) {
    return 'partial_match';
  }
  if (state.jobEffective >= 1) {
    return 'weak_match';
  }
  return 'no_match';
}

function evaluateDomainState(state: DimensionState): CxFitTier {
  if (state.baselineEffective >= 2 && state.jobEffective >= 1) {
    return 'strong_match';
  }
  if (state.baselineEffective >= 1 && state.jobEffective >= 1) {
    return 'moderate_match';
  }
  if (state.baselineEffective >= 1) {
    return 'partial_match';
  }
  if (state.jobEffective >= 1) {
    return 'weak_match';
  }
  return 'no_match';
}

function evaluateChangeLeadershipState(state: DimensionState): CxFitTier {
  if (state.baselineEffective >= 2 && state.jobEffective >= 1) {
    return 'strong_match';
  }
  if (state.baselineEffective >= 1 && state.jobEffective >= 1) {
    return 'moderate_match';
  }
  if (state.baselineEffective >= 1) {
    return 'partial_match';
  }
  if (state.jobEffective >= 1) {
    return 'weak_match';
  }
  return 'no_match';
}

function evaluateGenericState(state: DimensionState): CxFitTier {
  if (state.baselineEffective >= 1 && state.jobEffective >= 1) {
    return 'strong_match';
  }
  if (state.baselineEffective >= 1) {
    return 'moderate_match';
  }
  if (state.jobEffective >= 1) {
    return 'partial_match';
  }
  return 'no_match';
}

function evaluatePenalties(
  penalties: ContractPenalty[],
  baselineText: string,
  jobText: string,
  jobSeniorityMatches: string[],
  baselineDownMatches: string[],
  jobDomainMatches: string[],
  baselineDomainMatches: string[],
): PenaltyResult[] {
  const triggered: PenaltyResult[] = [];

  penalties.forEach((penalty) => {
    if (penalty.id === 'scope_mismatch_downlevel') {
      const jobHasSeniorScope = jobSeniorityMatches.length > 0;
      const baselineDownlevel = baselineDownMatches.length > 0;
      if (jobHasSeniorScope && baselineDownlevel) {
        const evidence = createEvidenceDetail();
        gatherEvidence(evidence, 'job', jobText, jobSeniorityMatches);
        gatherEvidence(
          evidence,
          'baseline',
          baselineText,
          baselineDownMatches,
          ' (downlevel indicator)',
        );
        triggered.push({
          id: penalty.id,
          deduction: penalty.deduction,
          evidence,
        });
      }
    }

    if (penalty.id === 'domain_mismatch_hard') {
      if (jobDomainMatches.length > 0 && baselineDomainMatches.length === 0) {
        const evidence = createEvidenceDetail();
        gatherEvidence(evidence, 'job', jobText, jobDomainMatches);
        const baselineSnippet =
          baselineText.trim().length === 0
            ? 'baseline | baseline text is empty; no accounting/compliance signals'
            : 'baseline | no accounting or compliance terms detected';
        if (!evidence.matchedSnippets.includes(baselineSnippet)) {
          evidence.matchedSnippets.push(baselineSnippet);
        }
        if (!evidence.matchedTerms.includes('baseline_missing_domain')) {
          evidence.matchedTerms.push('baseline_missing_domain');
        }
        triggered.push({
          id: penalty.id,
          deduction: penalty.deduction,
          evidence,
        });
      }
    }
  });

  return triggered;
}

function gatherEvidence(
  evidence: EvidenceDetail,
  source: 'baseline' | 'job',
  text: string,
  matches: string[],
  suffix?: string,
) {
  matches.forEach((match) => {
    const entry = suffix ? `${match}${suffix}` : match;
    if (!evidence.matchedTerms.includes(entry)) {
      evidence.matchedTerms.push(entry);
    }
    const snippetText = snippetForPhrase(text, match);
    const labeledSnippet = `${source} | ${snippetText}${suffix ?? ''}`;
    if (!evidence.matchedSnippets.includes(labeledSnippet)) {
      evidence.matchedSnippets.push(labeledSnippet);
    }
  });
}

function snippetForPhrase(text: string, phrase: string): string {
  const normalizedTextValue = normalizeText(text);
  const normalizedPhrase = normalizeText(phrase);
  const index = normalizedTextValue.indexOf(normalizedPhrase);
  if (index === -1) {
    return phrase;
  }
  const lineStart = text.lastIndexOf('\n', index);
  const lineEnd = text.indexOf('\n', index);
  const snippet = text
    .slice(lineStart === -1 ? 0 : lineStart + 1, lineEnd === -1 ? undefined : lineEnd)
    .trim();
  return snippet || phrase;
}

function matchPhrases(text: string, phrases: string[]): string[] {
  const normalized = normalizeText(text);
  const matches = new Set<string>();
  phrases.forEach((phrase) => {
    const trimmed = phrase.trim();
    if (!trimmed) {
      return;
    }
    const normalizedPhrase = normalizeText(trimmed);
    if (normalized.includes(normalizedPhrase)) {
      matches.add(trimmed);
    }
  });
  return Array.from(matches);
}

function createEvidenceDetail(): EvidenceDetail {
  return {
    matchedSnippets: [],
    matchedTerms: [],
  };
}

function extractFirstLine(text: string): string {
  const line = text.split(/\r?\n/).find((candidate) => candidate.trim().length > 0);
  return line?.trim() ?? '';
}

function detectIndicators(text: string, keywords: string[]): string[] {
  const matches = new Set<string>();
  keywords.forEach((keyword) => {
    if (text.includes(keyword)) {
      matches.add(keyword);
    }
  });
  return Array.from(matches);
}

function roundHalfUp(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.floor(value * factor + 0.5) / factor;
}

function mapContractDimensionScores(
  source: Record<string, number>,
): FitScoreDimensionScores {
  return {
    experienceAlignment: source['support_operations_and_process_rigor'] ?? 0,
    leadershipLevel: source['role_scope_and_seniority'] ?? 0,
    strategicTacticalFit: source['change_leadership_and_customer_advocacy'] ?? 0,
    industryContext: source['domain_and_business_context'] ?? 0,
    technicalPlatformFit: source['tooling_and_platform_experience'] ?? 0,
  };
}

function createDebugDetails(
  scores: FitScoreDimensionScores,
): Record<keyof FitScoreDimensionScores, FitScoreDebugDimensionDetail> {
  return {
    experienceAlignment: { score: scores.experienceAlignment },
    leadershipLevel: { score: scores.leadershipLevel },
    strategicTacticalFit: { score: scores.strategicTacticalFit },
    industryContext: { score: scores.industryContext },
    technicalPlatformFit: { score: scores.technicalPlatformFit },
  };
}
