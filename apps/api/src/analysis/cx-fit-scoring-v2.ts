import { clamp, normalizeText } from '../scoring/fit-score/fit-score.utils';
import {
  evaluateToolCoverage,
  type ToolRequirementClaim,
} from '../scoring/fit-score/tool-extractor';
import { getCharCount, safeSnippet, sha256 } from '../common/text-metrics';
import { getCapabilityClusterRegistry } from '../scoring-v2/config/capability-clusters';
import { extractCapabilityClusters } from '../scoring-v2/extractors/capability-cluster-extractor';

/**
 * AUTHORITY: Canonical CX Fit scoring implementation (v2).
 *
 * - This module owns the deterministic scoring logic and debug bundle shape.
 * - Runtime scoring MUST flow through orchestration layers (typically `AnalysisService` for
 *   authenticated requests) so that input normalization, persistence, compliance/audit, and
 *   logging stay consistent.
 *
 * Allowed direct callers (intentional bypasses):
 * - `PreviewCanonicalFitScoreService` (public preview; constrained inputs; no persistence/audit)
 * - `RealityCheckService` (special-case; must be reviewed before any additional use)
 *
 * If you are about to import `scoreCxFitV2` in a new runtime service/controller, stop and route
 * through the canonical orchestration path instead.
 */
export const CX_FIT_SCORER_VERSION = '2026-06-25-cx-fit-scoring-v2';

type BaselineSection = { type?: string; content: string };

export type CxFitV2Metadata = {
  baselineId?: string;
  baselineVersionId?: number | string;
  jobId?: string;
};

type FitScoreDebugSnippet = {
  source: 'baseline' | 'job';
  reference: string;
  text: string;
};

type FitScoreDimensionEvidence = {
  signals: string[];
  snippets: FitScoreDebugSnippet[];
};

type FitScoreNormalizedSection = {
  index: number;
  type?: string;
  charCount: number;
  snippet: string;
};

type FitScoreNormalizedSegment = {
  id: string;
  charCount: number;
  snippet: string;
};

export type BaselineCoverageDetails = {
  originalBaselineChars: number;
  includedBaselineChars: number;
  coverageFormula: string;
  source: string;
  selectedSectionGateActive: boolean;
  selectedSectionCount: number;
  normalizedBaselineChars: number;
};

export type BaselineCoverageDetailsInput = Omit<
  BaselineCoverageDetails,
  'normalizedBaselineChars'
> & {
  coverageFormula?: string;
};

export type FitScoreDebugBundle = {
  inputs: {
    baselineId?: string;
    baselineVersionId?: number | string;
    jobId?: string;
    baselineHash: string;
    jobHash: string;
    jobTextSource: "normalized" | "raw";
    truncation: {
      baseline: {
        originalChars: number;
        finalChars: number;
        threshold: number | null;
        truncated: boolean;
      };
      job: {
        originalChars: number;
        finalChars: number;
        threshold: number | null;
        truncated: boolean;
      };
    };
    normalizedBaseline: {
      totalChars: number;
      sections: FitScoreNormalizedSection[];
      preview: string;
      coverageDetails: BaselineCoverageDetails;
    };
    normalizedJob: {
      charCount: number;
      preview: string;
      rawDescriptionIncluded: boolean;
      normalizedResponsibilitiesCount: number;
      normalizedResponsibilitiesChars: number;
      normalizedRequirementsCount: number;
      normalizedRequirementsChars: number;
      responsibilities: FitScoreNormalizedSegment[];
      requirements: FitScoreNormalizedSegment[];
    };
  };
  math: {
    contractVersion: 'scoring_contract_v1';
    weights: ScoringContractV1Weights;
    effectiveWeights: ScoringContractV1Weights;
    dimensionPoints: Record<ScoringContractV1DimensionKey, number>;
    dimensionPercents: Record<ScoringContractV1DimensionKey, number>;
    penalties: ScoringContractV1Penalty[];
    finalBeforeClamp: number;
    roundingMethod: string;
    finalScore: number;
    redistributedWeightFrom: number;
  };
  heuristicInference: {
    usedHeuristicInference: boolean;
    heuristicLiftTotal: number;
    heuristicLiftByDimension: Record<ScoringContractV1DimensionKey, number>;
    heuristicConfidenceSummary: Record<HeuristicConfidence, number>;
    heuristics: HeuristicDebugEntry[];
  };
  evidence: Record<ScoringContractV1DimensionKey, FitScoreDimensionEvidence>;
  determinism: {
    randomSeed: number | null;
    llmTemperature: number;
    llmModel: string | null;
    llmMaxTokens: number | null;
    notes: string;
  };
};

export type CxFitV2Input = {
  job: {
    rawDescription: string;
    normalizedResponsibilities: string[];
    normalizedRequirements: string[];
  };
  baselineSections: BaselineSection[];
  metadata?: CxFitV2Metadata;
  jobTitle?: string;
  normalizedJobResponsibilities?: string[];
  normalizedJobRequirements?: string[];
};

type DomainTag =
  | 'SaaS'
  | 'Enterprise IT'
  | 'MSP'
  | 'Regulated'
  | 'Internal Delivery'
  | 'External Delivery';

export type ScoringContractV1DimensionKey =
  | 'role_scope_and_seniority'
  | 'support_operations_and_process_rigor'
  | 'tooling_and_platform_experience'
  | 'domain_and_business_context'
  | 'change_leadership_and_customer_advocacy';

export type ScoringContractV1Weights = Record<ScoringContractV1DimensionKey, number>;

export type ResumeRubricCategoryKey =
  | 'experience_alignment'
  | 'leadership_level'
  | 'technical_and_platform_fit'
  | 'industry_and_context_fit'
  | 'strategic_vs_tactical_balance';

export type ResumeRubricWeights = Record<ResumeRubricCategoryKey, number>;

export type ScoringContractV1PenaltyCode =
  | 'scope_mismatch_downlevel'
  | 'domain_mismatch_hard'
  | 'insufficient_baseline_support';

export type ScoringContractV1Penalty = {
  code: ScoringContractV1PenaltyCode;
  points: number; // negative numbers
  reason: string;
};

export type CxFitV2DebugInfo = {
  jobScoringTextSource: 'normalized' | 'raw';
  jobTextForScoring: string;
  jobTextForScoringLength: number;
  jobVectorsLength: number;
  jobVectors: string[];
  baselineVectors: string[];
  sharedVectors: string[];
  transferableMatches: {
    jobVector: string;
    matchedVia: string;
    weight: number;
    applied: boolean;
  }[];
  transferableCoveragePercent: number;
  transferableContributionApplied: number;
  transferableVectors: string[];
  droppedTransferableMatches: {
    jobVector: string;
    matchedVia: string;
    weight: number;
    reason: string;
  }[];
  unmatchedVectors: string[];
  adjustedResponsibilityOverlapPercent: number;
  baselineBand: string;
  roleBand: string;
  bandDelta: number;
  domainPercent: number;
  responsibilityOverlapPercent: number;
  baselineCoveragePercent: number;
  baselineRecallPercent: number;
  roleImpliedStrategyFloorApplied: boolean;
  originalStrategyRatioPercent: number;
  flooredStrategyRatioPercent: number;
  strategyMatchesJob: number;
  originalAdvocacyRatioPercent: number;
  flooredAdvocacyRatioPercent: number;
  changeLeadershipAndAdvocacyPercentFloored: number;
  changeLeadershipEligibility: 'eligible' | 'ineligible_ic_role';
  effectiveWeights: ScoringContractV1Weights;
  redistributedWeightFrom: number;
  toolingCoverage: {
    requiredCoverage: number;
    preferredCoverage: number;
    claims: ToolRequirementClaim[];
  };
  platformGroups: {
    totalBoost: number;
    evidence: PlatformGroupEvidence[];
  };
  strategicDensity: {
    baseline: number;
    job: number;
    appliedBoost: boolean;
  };
  executiveScopeDensity: {
    baseline: number;
    job: number;
    appliedBoost: boolean;
  };
  strategicGuard: {
    leadershipLevel: number;
    baselineExecutiveScopeDensity: number;
    executiveScopeThreshold: number;
    leadershipThreshold: number;
    guardEnabled: boolean;
    tacticalSuppressionSkipped: boolean;
  };
  heuristicInference: {
    usedHeuristicInference: boolean;
    heuristicLiftTotal: number;
    heuristicLiftByDimension: Record<ScoringContractV1DimensionKey, number>;
    heuristicConfidenceSummary: Record<'low' | 'medium' | 'high', number>;
    heuristics: HeuristicDebugEntry[];
  };
  industryBundles: {
    evidence: {
      id: string;
      jobHits: number;
      baselineHits: number;
      qualifies: boolean;
      addRoleTags: DomainTag[];
      suppressRoleTags: DomainTag[];
    }[];
  };
  domainTagsBaselineOriginal: DomainTag[];
  domainTagsRoleOriginal: DomainTag[];
  domainTagsBaseline: DomainTag[];
  domainTagsRole: DomainTag[];
  baselineCoverageDetails?: BaselineCoverageDetails;
  bundle?: FitScoreDebugBundle;
  jobClusters: string[];
  baselineClusters: string[];
  sharedClusters: string[];
  jobClusterHits: Record<string, number>;
  baselineClusterHits: Record<string, number>;
};

type HeuristicType =
  | 'adjacency'
  | 'environment_elevation'
  | 'verb_translation'
  | 'trajectory'
  | 'tool_domain_bridge';

type HeuristicConfidence = 'low' | 'medium' | 'high';

type HeuristicDimension = ScoringContractV1DimensionKey;

type HeuristicDebugEntry = {
  type: HeuristicType;
  dimension: HeuristicDimension;
  confidence: HeuristicConfidence;
  rawContribution: number;
  cappedContribution: number;
  evidence: string[];
  reason: string;
};

type HeuristicInferenceResult = {
  usedHeuristicInference: boolean;
  heuristicLiftTotal: number;
  heuristicLiftByDimension: Record<ScoringContractV1DimensionKey, number>;
  heuristicConfidenceSummary: Record<HeuristicConfidence, number>;
  heuristics: HeuristicDebugEntry[];
};

export function assessScoreConfidence(input: {
  score: number;
  debug: CxFitV2DebugInfo;
}): ScoreConfidenceClassification {
  const { score, debug } = input;
  const heuristicInference = debug.heuristicInference;
  const triggeredSanityRules: string[] = [];
  const scoreConfidenceReasons: string[] = [];

  const adjacencyLift =
    (heuristicInference?.heuristicLiftByDimension.tooling_and_platform_experience ?? 0) +
    (heuristicInference?.heuristicLiftByDimension.domain_and_business_context ?? 0);
  const technicalDensity =
    (debug.toolingCoverage?.requiredCoverage ?? 0) +
    (debug.toolingCoverage?.preferredCoverage ?? 0) +
    (debug.platformGroups?.totalBoost ?? 0);
  const supportVerbSignals = debug.toolingCoverage.requiredCoverage > 0.45;
  const overlapDrag =
    debug.responsibilityOverlapPercent < 45 ||
    (debug.adjustedResponsibilityOverlapPercent - debug.responsibilityOverlapPercent >= 4 &&
      score < 70);
  const richAdjacencyButLowScore = adjacencyLift >= 4 && score < 65;
  const supportVerbMismatch =
    technicalDensity >= 0.8 &&
    supportVerbSignals &&
    score < 70 &&
    heuristicInference.usedHeuristicInference;
  const capsDrag =
    heuristicInference.usedHeuristicInference &&
    score < 70 &&
    debug.adjustedResponsibilityOverlapPercent < 75 &&
    debug.responsibilityOverlapPercent < 60;
  const extractionThinness =
    debug.baselineCoveragePercent < 25 || debug.jobVectorsLength === 0 || debug.baselineVectors.length === 0;
  const directFitSignals =
    debug.responsibilityOverlapPercent >= 75 &&
    debug.adjustedResponsibilityOverlapPercent >= 80 &&
    debug.bandDelta <= 1 &&
    !heuristicInference.usedHeuristicInference;

  if (richAdjacencyButLowScore) triggeredSanityRules.push('adjacency_low_score');
  if (supportVerbMismatch) triggeredSanityRules.push('technical_density_support_verb_mismatch');
  if (overlapDrag) triggeredSanityRules.push('overlap_cap_drag');
  if (capsDrag) triggeredSanityRules.push('cap_or_floor_drag');
  if (extractionThinness) triggeredSanityRules.push('extraction_thinness');

  const likelyUnderestimatedFit =
    (richAdjacencyButLowScore || supportVerbMismatch || capsDrag) &&
    score < 70 &&
    adjacencyLift >= 2;

  if (likelyUnderestimatedFit) {
    scoreConfidenceReasons.push(
      'Relevant adjacent infrastructure or tooling evidence is present, but the score looks constrained by literal overlap or phrasing.',
    );
  }
  if (supportVerbMismatch) {
    scoreConfidenceReasons.push(
      'Technical density is present, but support-oriented wording may be understating ownership.',
    );
  }
  if (capsDrag) {
    scoreConfidenceReasons.push(
      'Hard scoring caps appear to be compressing the result despite adjacent evidence.',
    );
  }
  if (extractionThinness) {
    scoreConfidenceReasons.push('Parsed evidence appears thin or incomplete.');
  }
  if (!scoreConfidenceReasons.length) {
    scoreConfidenceReasons.push(
      'Score is grounded in the current evidence set without major contradiction signals.',
    );
  }

  let scoreConfidence: 'high' | 'medium' | 'low' = 'high';
  if (directFitSignals && score >= 85 && triggeredSanityRules.length === 0) {
    scoreConfidence = 'high';
  } else if (likelyUnderestimatedFit || triggeredSanityRules.length >= 2 || score < 45) {
    scoreConfidence = 'low';
  } else if (!directFitSignals && (triggeredSanityRules.length > 0 || score < 75)) {
    scoreConfidence = 'medium';
  }

  const scorePresentationMode =
    scoreConfidence === 'low'
      ? 'fix_first'
      : scoreConfidence === 'medium'
        ? 'caution'
        : 'normal';

  return {
    scoreConfidence,
    scoreConfidenceReasons,
    scoreSanityFlags: triggeredSanityRules,
    likelyUnderestimatedFit,
    scorePresentationMode,
    confidenceDiagnostics: {
      confidenceInputsSummary: {
        score,
        responsibilityOverlapPercent: debug.responsibilityOverlapPercent,
        adjustedResponsibilityOverlapPercent: debug.adjustedResponsibilityOverlapPercent,
        baselineCoveragePercent: debug.baselineCoveragePercent,
        baselineRecallPercent: debug.baselineRecallPercent,
        bandDelta: debug.bandDelta,
        heuristicLiftTotal: heuristicInference?.heuristicLiftTotal ?? 0,
        heuristicUsed: Boolean(heuristicInference?.usedHeuristicInference),
      },
      triggeredSanityRules,
      confidenceDecisionSummary: scorePresentationMode,
    },
  };
}

export type CxFitV2Result = {
  // canonical
  score: number;
  scorerVersion: typeof CX_FIT_SCORER_VERSION;
  scoreConfidence: 'high' | 'medium' | 'low';
  scoreConfidenceReasons: string[];
  scoreSanityFlags: string[];
  likelyUnderestimatedFit: boolean;
  scorePresentationMode: 'normal' | 'caution' | 'fix_first';
  confidenceDiagnostics?: ScoreConfidenceClassification['confidenceDiagnostics'];

  // contract v1
  rubric: {
    id: 'scoring_contract_v1';
    weights: ScoringContractV1Weights;
    dimensionPercents: Record<ScoringContractV1DimensionKey, number>; // 0-100 each
    dimensionPoints: Record<ScoringContractV1DimensionKey, number>; // 0-weight each
    subtotal: number; // sum of dimensionPoints (pre penalties)
    penalties: ScoringContractV1Penalty[];
    finalBeforeClamp: number;
    rounding: 'round_half_up_final_only';
    resumeProject: {
      id: 'resume_project_cx_fit_v1';
      weights: ResumeRubricWeights;
      categoryPercents: Record<ResumeRubricCategoryKey, number>;
      categoryPoints: Record<ResumeRubricCategoryKey, number>;
      subtotal: number;
      finalScore: number;
      rounding: 'round_half_up_final_only';
    };
  };

  // extra debug info (safe to log / show)
  debug: CxFitV2DebugInfo;
};

export type ConfidenceReasonLabel =
  | 'missing_job_text'
  | 'missing_baseline_text'
  | 'low_baseline_coverage'
  | 'low_job_coverage'
  | 'low_tooling_coverage'
  | 'low_domain_overlap'
  | 'strategy_floor_applied'
  | 'baseline_text_insufficient'
  | 'baseline_text_low'
  | 'baseline_text_moderate'
  | 'baseline_coverage_very_low'
  | 'baseline_coverage_low'
  | 'large_seniority_gap'
  | 'low_responsibility_overlap'
  | 'moderate_responsibility_overlap'
  | 'no_vectors';

export type ConfidenceScoreResult = {
  confidenceScore: number;
  confidenceReasons: ConfidenceReasonLabel[];
};

export type ScoreConfidenceClassification = {
  scoreConfidence: 'high' | 'medium' | 'low';
  scoreConfidenceReasons: string[];
  scoreSanityFlags: string[];
  likelyUnderestimatedFit: boolean;
  scorePresentationMode: 'normal' | 'caution' | 'fix_first';
  confidenceDiagnostics: {
    confidenceInputsSummary: {
      score: number;
      responsibilityOverlapPercent: number;
      adjustedResponsibilityOverlapPercent: number;
      baselineCoveragePercent: number;
      baselineRecallPercent: number;
      bandDelta: number;
      heuristicLiftTotal: number;
      heuristicUsed: boolean;
    };
    triggeredSanityRules: string[];
    confidenceDecisionSummary: string;
  };
};

const BASE_WEIGHTS: ScoringContractV1Weights = {
  role_scope_and_seniority: 30,
  support_operations_and_process_rigor: 20,
  tooling_and_platform_experience: 20,
  domain_and_business_context: 15,
  change_leadership_and_customer_advocacy: 15,
};

const RESUME_PROJECT_WEIGHTS: ResumeRubricWeights = {
  experience_alignment: 30,
  leadership_level: 20,
  technical_and_platform_fit: 20,
  industry_and_context_fit: 15,
  strategic_vs_tactical_balance: 15,
};

const RESUME_PROJECT_CATEGORY_ORDER: ResumeRubricCategoryKey[] = [
  'experience_alignment',
  'leadership_level',
  'technical_and_platform_fit',
  'industry_and_context_fit',
  'strategic_vs_tactical_balance',
];

const RESPONSIBILITY_VECTORS = [
  {
    id: 'incident_management',
    keywords: [
      'incident management',
      'incident response',
      'incident command',
      'major incident',
    ],
  },
  {
    id: 'escalation_governance',
    keywords: [
      'escalation governance',
      'escalation policy',
      'escalation process',
    ],
  },
  {
    id: 'service_delivery',
    keywords: ['service delivery', 'service operations', 'deliver services'],
  },
  {
    id: 'service_reliability',
    keywords: [
      'service reliability',
      'reliability engineering',
      'availability',
      'resilience',
      'sre',
    ],
  },
  {
    id: 'itsm_process_maturity',
    keywords: [
      'itsm',
      'itsm process',
      'itsm process maturity',
      'process maturity',
      'change governance',
    ],
  },
  {
    id: 'operating_model',
    keywords: ['operating model', 'operating model design'],
  },
  {
    id: 'product_lifecycle',
    keywords: ['product lifecycle', 'lifecycle management', 'lifecycle programs'],
  },
  {
    id: 'product_launch_readiness',
    keywords: ['launch readiness', 'launch planning', 'release readiness'],
  },
  {
    id: 'roadmap_management',
    keywords: ['roadmap management', 'roadmap planning', 'roadmap ownership'],
  },
  {
    id: 'portfolio_operations',
    keywords: ['portfolio operations', 'portfolio management'],
  },
  {
    id: 'cross_functional_product_rhythm',
    keywords: [
      'product review',
      'product reviews',
      'product operating rhythm',
      'cross-functional product rhythm',
    ],
  },
  {
    id: 'product_health_metrics',
    keywords: [
      'product health',
      'activation',
      'retention',
      'adoption',
      'funnel diagnostics',
    ],
  },
  {
    id: 'data_science_partnership',
    keywords: ['data science partnership', 'analytics partnership', 'product analytics'],
  },
  {
    id: 'product_documentation_source_of_truth',
    keywords: [
      'product documentation source of truth',
      'documentation source of truth',
      'product doc source of truth',
    ],
  },
  {
    id: 'gtm_alignment',
    keywords: ['gtm alignment', 'go to market alignment', 'field alignment'],
  },
  {
    id: 'release_planning',
    keywords: ['release planning', 'release calendar', 'launch calendar'],
  },
  {
    id: 'automation_workflow',
    keywords: [
      'automation workflows',
      'workflow design',
      'workflow engineering',
      'runbooks',
    ],
  },
  {
    id: 'contact_center_ops',
    keywords: ['contact center ops', 'call center ops', 'contact center'],
  },
  {
    id: 'global_coverage',
    keywords: [
      'global coverage',
      'global ops',
      'global operations',
      'multi region support',
      'worldwide coverage',
    ],
  },
  {
    id: 'dashboards_kpis',
    keywords: [
      'reporting dashboards',
      'operational dashboards',
      'dashboards',
      'kpis',
      'key performance indicators',
      'scorecards',
    ],
  },
  {
    id: 'network_infrastructure_operations',
    keywords: [
      'network engineer',
      'networking infrastructure',
      'network infrastructure',
      'datacenter networking',
      'data center networking',
      'l3 routing',
      'layer 3 routing',
      'bgp',
      'vlan',
      'dns',
      'dhcp',
      'vpn',
      'switch operations',
      'switch deployment',
      'linux systems',
      'linux infrastructure',
      'firewall',
      'firewalls',
      'monitoring',
      'virtualization',
      'vmware',
    ],
  },
] as const;

const MAX_TRANSFERABLE_CONTRIBUTION = 0.25;

const TRANSFERABLE_SIGNAL_MAP: Record<
  string,
  { target: string; weight: number }[]
> = {
  incident_management: [{ target: 'product_launch_readiness', weight: 0.4 }],
  service_delivery: [{ target: 'product_lifecycle', weight: 0.4 }],
  escalation_governance: [{ target: 'cross_functional_product_rhythm', weight: 0.35 }],
  service_reliability: [{ target: 'product_health_metrics', weight: 0.35 }],
  dashboards_kpis: [{ target: 'product_health_metrics', weight: 0.3 }],
  automation_workflow: [{ target: 'release_planning', weight: 0.35 }],
  itsm_process_maturity: [{ target: 'operating_model', weight: 0.4 }],
};

const buildTransferableMatches = (
  jobVectors: string[],
  baselineVectors: string[],
) => {
  const directVectorSet = new Set(jobVectors.filter((vector) => baselineVectors.includes(vector)));
  const transferableMatches: {
    jobVector: string;
    matchedVia: string;
    weight: number;
    applied: boolean;
  }[] = [];
  const droppedTransferableMatches: {
    jobVector: string;
    matchedVia: string;
    weight: number;
    reason: string;
  }[] = [];
  const transferableVectors = new Set<string>();
  const directMatchSet = new Set(jobVectors.filter((vector) => baselineVectors.includes(vector)));
  let transferableContributionTotal = 0;

  for (const jobVector of jobVectors) {
    if (directMatchSet.has(jobVector)) continue;

    for (const baselineVector of baselineVectors) {
      const mappedVectors = TRANSFERABLE_SIGNAL_MAP[baselineVector];
      const mapping = mappedVectors?.find((entry) => entry.target === jobVector);
      if (!mapping) continue;

      const appliedContribution = mapping.weight * 100;
      const cap = 100 * MAX_TRANSFERABLE_CONTRIBUTION;
      if (transferableContributionTotal >= cap) {
        droppedTransferableMatches.push({
          jobVector,
          matchedVia: baselineVector,
          weight: mapping.weight,
          reason: 'transfer_cap_reached',
        });
        continue;
      }

      transferableMatches.push({
        jobVector,
        matchedVia: baselineVector,
        weight: mapping.weight,
        applied: true,
      });
      transferableVectors.add(jobVector);
      transferableContributionTotal += appliedContribution;
      break;
    }
  }

  const transferableCoveragePercent =
    jobVectors.length === 0
      ? 0
      : clamp(
          Math.round(
            ((directVectorSet.size +
              transferableMatches.reduce((sum, entry) => sum + entry.weight, 0)) /
              jobVectors.length) *
              100,
          ),
        );

  return {
    transferableMatches,
    transferableCoveragePercent,
    transferableVectors: [...transferableVectors],
    droppedTransferableMatches,
    unmatchedVectors: jobVectors.filter(
      (jobVector) => !directVectorSet.has(jobVector) && !transferableVectors.has(jobVector),
    ),
  };
};

const STRATEGY_PATTERNS: RegExp[] = [
  /operating model/,
  /governance (?:creation|design|structure)/,
  /capacity planning/,
  /\bkpi\b/,
  /key performance indicators/,
  /tooling roadmap/,
  /cross[- ]functional prioritization/,
  /program(?:s)? (?:built|launched|led|owned)/,
];

const EXECUTION_PATTERNS: RegExp[] = [
  /\bmttr\b/,
  /\bmtta\b/,
  /\bsla\b/,
  /\bnps\b/,
  /support operations?/,
  /customer operations?/,
  /support leadership/,
  /global support/,
  /service delivery/,
  /service reliability/,
  /incident management/,
  /escalation governance/,
  /operating model/,
  /workflow automation/,
  /customer advocacy/,
  /\bdashboards?\b/,
  /\bkpis?\b/,
  /(?:metrics|metric) (?:moved|improved|owned|tracked)/,
  /systems (?:built|launched|implemented)/,
  /automation (?:delivered|deployed|built)/,
  /incident command/,
  /(cab|change advisory board)/,
  /dashboards? (?:built|launched|owned|maintained|delivered)/,
];

const CUSTOMER_ADVOCACY_PATTERNS: RegExp[] = [
  /\bvoice of the customer\b/,
  /\bvoc\b/,
  /customer experience/,
  /customer advocacy/,
  /csat/,
  /nps/,
  /customer outcomes?/,
  /reduce (?:contacts|time to resolution|steps)/,
  /\bdeflection\b/,
  /knowledge base/,
  /self[- ]service/,
];

const DOMAIN_MATCHERS: Array<{ tag: DomainTag; patterns: RegExp[] }> = [
  { tag: 'SaaS', patterns: [/saas/, /software as a service/] },
  {
    tag: 'Enterprise IT',
    patterns: [
      /enterprise it/,
      /enterprise technology/,
      /it operations/,
      /enterprise operations/,
      /network infrastructure/,
      /datacenter/,
      /data center/,
      /linux systems?/,
      /virtualization/,
      /firewalls?/,
      /routing/,
      /switch(?:es|ing)?/,
    ],
  },
  {
    tag: 'MSP',
    patterns: [/managed service provider/, /\bmsp\b/, /managed services/],
  },
  {
    tag: 'Regulated',
    patterns: [
      /regulated/,
      /security sensitive/,
      /compliance/,
      /hipaa/,
      /pci/,
      /sox/,
      /fedramp/,
    ],
  },
  {
    tag: 'Internal Delivery',
    patterns: [
      /internal (?:operations|support|teams|stakeholders|services)/,
      /employee facing/,
      /internal customers/,
      /lab infrastructure/,
      /physical infrastructure/,
      /device operations/,
      /network runs?/,
    ],
  },
  {
    tag: 'External Delivery',
    patterns: [
      /\bcustomer(s)?\b/,
      /\bclient(s)?\b/,
      /field services/,
      /contact center/,
      /external delivery/,
      /outsourced/,
    ],
  },
];

const HARD_TOOL_GUARDS = ['servicenow', 'service desk'];

const HEURISTIC_LIFT_CAPS: Record<HeuristicDimension, number> = {
  role_scope_and_seniority: 2,
  support_operations_and_process_rigor: 4,
  tooling_and_platform_experience: 6,
  domain_and_business_context: 5,
  change_leadership_and_customer_advocacy: 2,
};

const HEURISTIC_TOTAL_LIFT_CAP = 10;

const HIGH_COMPLEXITY_ENVIRONMENT_TERMS = [
  'microsoft schie',
  'schie',
  'hardware infrastructure engineering',
  'infra lab',
  'infrastructure lab',
  'research and development',
  'r&d',
  'advanced datacenter',
  'advanced data center',
];

const SUPPORT_TRANSLATION_TERMS = ['supported', 'maintained', 'configured', 'operated'];
const INFRA_CONTEXT_TERMS = [
  'vm lifecycle',
  'virtual machine',
  'monitoring',
  'automation',
  'remote access',
  'linux',
  'infrastructure',
  'systems',
  'networking',
];
const TRAJECTORY_TERMS = [
  'technician',
  'infrastructure engineer',
  'infrastructure',
  'system administrator',
  'systems administrator',
  'linux administrator',
  'cloud',
  'network',
];

const HEURISTIC_CONFIDENCE_POINTS: Record<HeuristicConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const STRATEGIC_SIGNAL_TERMS = [
  'define',
  'defined',
  'execute',
  'executed',
  'establish',
  'established',
  'build',
  'built',
  'scale',
  'scaled',
  'direct',
  'directed',
  'own',
  'owned',
  'p&l',
  'governance',
  'strategy',
  'vision',
  'enterprise',
  'organizational',
  'operationalized',
  'architected',
  'instituted',
  'executive',
  'global',
  'framework',
  'program',
  'portfolio',
  'board',
  'cab',
];

const EXECUTIVE_SCOPE_TERMS = [
  'p&l',
  'global',
  'enterprise',
  'board',
  'cab',
  'portfolio',
  'program',
  'organizational',
  'governance',
  'executive',
  'multi region',
  'cross regional',
  'enterprise level',
  'global team',
  'follow the sun',
];

const EXEC_THRESHOLD = 0.002;
const STRATEGIC_THRESHOLD = 0.004;
const EXECUTIVE_STRATEGIC_GUARD_LEADERSHIP_THRESHOLD = 85;

type PlatformGroup = {
  id: string;
  terms: string[];
  minHitsJob: number;
  minHitsBaseline: number;
  boost: number;
};

type PlatformGroupEvidence = {
  id: string;
  jobHits: number;
  baselineHits: number;
  qualifies: boolean;
  boost: number;
};

const PLATFORM_GROUPS: PlatformGroup[] = [
  {
    id: 'cloud_native_operations',
    terms: [
      'saas',
      'cloud',
      'cloud native',
      'cloud-native',
      'distributed',
      'multi cloud',
      'multi-cloud',
      'edge',
      'service reliability',
      'high availability',
      'uptime',
      'slo',
      'sla',
      'mttr',
      'mttd',
      'incident',
      'major incident',
      'on call',
      'on-call',
      'runbook',
      'post incident',
      'post-incident',
      'rca',
      'root cause',
      'pagerduty',
      'jira service management',
      'service now',
      'servicenow',
    ],
    minHitsJob: 3,
    minHitsBaseline: 3,
    boost: 8,
  },
  {
    id: 'security_and_compliance_operations',
    terms: [
      'security',
      'cybersecurity',
      'soc 2',
      'soc2',
      'iso 27001',
      'iso27001',
      'iso/iec 27035',
      '27035',
      'sirt',
      'fedramp',
      'compliance',
      'governance',
      'risk management',
      'incident response',
      'security incident',
    ],
    minHitsJob: 2,
    minHitsBaseline: 2,
    boost: 6,
  },
];

type IndustryBundle = {
  id: string;
  terms: string[];
  minHitsJob: number;
  minHitsBaseline: number;
  addRoleTags: DomainTag[];
  addBaselineTags: DomainTag[];
  suppressRoleTags: DomainTag[];
};

const INDUSTRY_BUNDLES: IndustryBundle[] = [
  {
    id: 'cybersecurity_saas_cloud',
    terms: [
      'saas',
      'cloud',
      'cloud native',
      'cloud-native',
      'distributed cloud',
      'distributed',
      'multi cloud',
      'multi-cloud',
      'edge',
      'security',
      'cybersecurity',
      'zero trust',
      'soc 2',
      'soc2',
      'iso 27001',
      'iso27001',
      'iso/iec 27035',
      '27035',
      'sirt',
      'incident response',
      'security incident',
      'customer trust',
      'service reliability',
    ],
    minHitsJob: 4,
    minHitsBaseline: 2,
    addRoleTags: ['SaaS', 'External Delivery'],
    addBaselineTags: [],
    suppressRoleTags: ['Enterprise IT', 'Internal Delivery'],
  },
];

const detectVectors = (text: string) =>
  RESPONSIBILITY_VECTORS.filter((vector) =>
    vector.keywords.some((keyword) => text.includes(keyword)),
  ).map((vector) => vector.id);

const detectDomainTags = (text: string): DomainTag[] => {
  const detected = new Set<DomainTag>();
  for (const matcher of DOMAIN_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(text))) {
      detected.add(matcher.tag);
    }
  }
  return Array.from(detected);
};

const countPatternMatches = (text: string, patterns: RegExp[]) =>
  patterns.filter((pattern) => pattern.test(text)).length;

const IC_TITLE_KEYWORDS = ['junior', 'jr', 'associate', 'entry', 'intern'];
const SENIOR_TITLE_KEYWORDS = ['director', 'head', 'vp', 'chief', 'principal'];

const LEVEL_TITLE_PATTERNS = (terms: string[]) =>
  terms.map((term) => new RegExp(`\\b${term}\\b`, 'i'));

const IC_TITLE_PATTERNS = LEVEL_TITLE_PATTERNS(IC_TITLE_KEYWORDS);
const SENIOR_TITLE_PATTERNS = LEVEL_TITLE_PATTERNS(SENIOR_TITLE_KEYWORDS);

const PSEUDO_TITLE_HINT_PATTERNS = [
  /(?:role|position|title)\s*[:-]?\s*(?:an?|the)?\s*([^\n.,]+)/i,
  /(?:we(?:'re| are)?|our team is|looking for|seeking|hiring(?: for)?)(?: an?| the)?\s*([^\n.,]+)/i,
];

const extractPseudoTitleHints = (text: string) => {
  if (!text) {
    return '';
  }
  const hints: string[] = [];
  for (const pattern of PSEUDO_TITLE_HINT_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      hints.push(match[1].trim());
    }
  }
  return hints.join(' ');
};

const inferBaselineBand = (text: string) => inferLeadershipBandFromText(text);

type InferRoleBandOptions = {
  normalizedJobText: string;
  normalizedJobPreview: string;
  jobTitle?: string;
};

const inferRoleBand = (options: InferRoleBandOptions) => {
  const baseBand = inferLeadershipBandFromText(options.normalizedJobText);
  const pseudoTitleHints = extractPseudoTitleHints(options.normalizedJobPreview);
  const signalText = [
    options.jobTitle,
    options.normalizedJobPreview,
    pseudoTitleHints,
    options.normalizedJobText,
  ]
    .filter(Boolean)
    .join(' ');

  const hasIcTerm = IC_TITLE_PATTERNS.some((pattern) => pattern.test(signalText));
  const hasSeniorTerm = SENIOR_TITLE_PATTERNS.some((pattern) =>
    pattern.test(signalText),
  );

  if (hasIcTerm) {
    return Math.min(baseBand, 6);
  }

  if (hasSeniorTerm) {
    return Math.max(baseBand, 7);
  }

  return baseBand;
};

const inferLeadershipBandFromText = (text: string) => {
  let band = 3;

  const elevate = (value: number) => {
    band = Math.max(band, Math.min(value, 8));
  };

  if (/(budget authority|revenue ownership|p\s*&?\s*l|profit and loss)/.test(text)) {
    elevate(8);
  }
  if (
    /(directs|oversees|lead(?:s|ing)?).*global/.test(text) ||
    /(global (?:coverage|ops|operations|delivery|org|organization|service))/.test(text)
  ) {
    elevate(7);
  }
  if (/enterprise[- ]wide/.test(text) || /global (?:org|organization|ops)/.test(text)) {
    elevate(7);
  }
  if (/(manages|managing|leads|leading).*(?:managers|leaders)/.test(text)) {
    elevate(6);
  }
  if (/reports to (?:the )?(?:executive|c[- ]suite|board)/.test(text)) {
    elevate(6);
  }
  if (/(multi|cross)[ -]?function/.test(text)) {
    elevate(6);
  }
  if (/(24 ?x ?7|24\/7|24 by 7)/.test(text)) {
    elevate(6);
  }
  if (/(manages|managing|leads|leading).*(?:team|teams)/.test(text)) {
    elevate(5);
  }

  return band;
};

const computeDomainPercent = (baselineTags: DomainTag[], roleTags: DomainTag[]) => {
  const baselineSet = new Set(baselineTags);
  const roleSet = new Set(roleTags);

  if (roleSet.size === 0 && baselineSet.size === 0) return 60;
  if (roleSet.size > 0 && baselineSet.size === 0) return 40;

  const overlap = [...roleSet].filter((tag) => baselineSet.has(tag)).length;
  if (overlap === roleSet.size && roleSet.size > 0) return 100;
  if (overlap > 0) return 75;
  return 40;
};

// round half up, final only (contract)
const roundHalfUp = (value: number) => {
  // value should be non-negative for our scoring, but keep it safe
  return value >= 0 ? Math.floor(value + 0.5) : -Math.floor(Math.abs(value) + 0.5);
};

const toWeightedPoints = (percent: number, weight: number) => {
  const pct = clamp(Math.round(percent));
  const raw = (pct / 100) * weight;
  return raw;
};

const capabilityClusterRegistry = getCapabilityClusterRegistry();

const buildResumeProjectRubric = (
  dimensionPoints: Record<ScoringContractV1DimensionKey, number>,
  finalScore: number,
): CxFitV2Result['rubric']['resumeProject'] => {
  const rawCategoryPoints: Record<ResumeRubricCategoryKey, number> = {
    experience_alignment: dimensionPoints.role_scope_and_seniority,
    leadership_level: dimensionPoints.support_operations_and_process_rigor,
    technical_and_platform_fit: dimensionPoints.tooling_and_platform_experience,
    industry_and_context_fit: dimensionPoints.domain_and_business_context,
    strategic_vs_tactical_balance: dimensionPoints.change_leadership_and_customer_advocacy,
  };

  const categoryPoints: Record<ResumeRubricCategoryKey, number> = {
    ...rawCategoryPoints,
  };

  const maxPoints: Record<ResumeRubricCategoryKey, number> = {
    experience_alignment: RESUME_PROJECT_WEIGHTS.experience_alignment,
    leadership_level: RESUME_PROJECT_WEIGHTS.leadership_level,
    technical_and_platform_fit: RESUME_PROJECT_WEIGHTS.technical_and_platform_fit,
    industry_and_context_fit: RESUME_PROJECT_WEIGHTS.industry_and_context_fit,
    strategic_vs_tactical_balance: RESUME_PROJECT_WEIGHTS.strategic_vs_tactical_balance,
  };

  const rawSubtotal = RESUME_PROJECT_CATEGORY_ORDER.reduce(
    (sum, category) => sum + rawCategoryPoints[category],
    0,
  );
  let remainingDelta = finalScore - rawSubtotal;

  const distributeDelta = (
    direction: 1 | -1,
    categories: ResumeRubricCategoryKey[],
  ) => {
    for (const category of categories) {
      if (remainingDelta === 0) return;
      if (Math.sign(remainingDelta) !== direction) continue;
      const room =
        direction > 0 ? maxPoints[category] - categoryPoints[category] : categoryPoints[category];
      if (room <= 0) continue;
      const adjustment = Math.min(Math.abs(remainingDelta), room);
      categoryPoints[category] += direction * adjustment;
      remainingDelta -= direction * adjustment;
    }
  };

  // Preserve the raw shape while deterministically reconciling the nested rubric to the
  // authoritative final score. Positive deltas are added in rubric order; negative deltas are
  // removed in reverse order so the sum remains exact and bounded within each category weight.
  if (remainingDelta > 0) {
    distributeDelta(1, RESUME_PROJECT_CATEGORY_ORDER);
    if (remainingDelta > 0) {
      distributeDelta(1, [...RESUME_PROJECT_CATEGORY_ORDER].reverse());
    }
  } else if (remainingDelta < 0) {
    distributeDelta(-1, [...RESUME_PROJECT_CATEGORY_ORDER].reverse());
    if (remainingDelta < 0) {
      distributeDelta(-1, RESUME_PROJECT_CATEGORY_ORDER);
    }
  }

  if (Math.abs(remainingDelta) > 1e-9) {
    const correctionCategory =
      remainingDelta > 0
        ? RESUME_PROJECT_CATEGORY_ORDER[RESUME_PROJECT_CATEGORY_ORDER.length - 1]
        : RESUME_PROJECT_CATEGORY_ORDER[0];
    const correctedValue = categoryPoints[correctionCategory] + remainingDelta;
    categoryPoints[correctionCategory] = Math.max(
      0,
      Math.min(maxPoints[correctionCategory], correctedValue),
    );
    remainingDelta = 0;
  }

  const normalizedCategoryPoints: Record<ResumeRubricCategoryKey, number> = {
    experience_alignment: categoryPoints.experience_alignment,
    leadership_level: categoryPoints.leadership_level,
    technical_and_platform_fit: categoryPoints.technical_and_platform_fit,
    industry_and_context_fit: categoryPoints.industry_and_context_fit,
    strategic_vs_tactical_balance: categoryPoints.strategic_vs_tactical_balance,
  };
  const normalizedCategoryPercents: Record<ResumeRubricCategoryKey, number> = {
    experience_alignment:
      (normalizedCategoryPoints.experience_alignment / RESUME_PROJECT_WEIGHTS.experience_alignment) * 100,
    leadership_level:
      (normalizedCategoryPoints.leadership_level / RESUME_PROJECT_WEIGHTS.leadership_level) * 100,
    technical_and_platform_fit:
      (normalizedCategoryPoints.technical_and_platform_fit /
        RESUME_PROJECT_WEIGHTS.technical_and_platform_fit) *
      100,
    industry_and_context_fit:
      (normalizedCategoryPoints.industry_and_context_fit /
        RESUME_PROJECT_WEIGHTS.industry_and_context_fit) *
      100,
    strategic_vs_tactical_balance:
      (normalizedCategoryPoints.strategic_vs_tactical_balance /
        RESUME_PROJECT_WEIGHTS.strategic_vs_tactical_balance) *
      100,
  };

  const subtotal = RESUME_PROJECT_CATEGORY_ORDER.reduce(
    (sum, category) => sum + normalizedCategoryPoints[category],
    0,
  );

  return {
    id: 'resume_project_cx_fit_v1',
    weights: RESUME_PROJECT_WEIGHTS,
    categoryPercents: normalizedCategoryPercents,
    categoryPoints: normalizedCategoryPoints,
    subtotal,
    finalScore,
    rounding: 'round_half_up_final_only',
  };
};

const formatClusterList = (clusters: string[]) => {
  if (!clusters.length) return 'none';
  if (clusters.length <= 8) {
    return clusters.join(',');
  }
  return `${clusters.slice(0, 8).join(',')}...`;
};

const SUPPORT_OPERATIONS_FAMILY_PATTERNS = [
  /support operations?/,
  /customer operations?/,
  /support leadership/,
  /global support/,
  /support process ownership/,
  /support management/,
  /support manager/,
  /support leader(ship)?/,
  /support team(s)?/,
  /customer support/,
  /process ownership/,
  /service delivery/,
  /escalation management/,
  /incident management/,
  /incident response/,
  /incident command/,
  /escalation ownership/,
  /triage/,
  /workflow/,
  /sla/,
  /kpi/,
  /support queue/,
];

const LEADERSHIP_ACTION_PATTERNS = /led|leading|lead(?:s|ership)?|managed|managing|manage|owned|owns?|built|building|improved|improving|scaled|scaling|optimized|optimizing|directed|directing|supervised|supervising|drove|driving|orchestrated|orchestrating|oversee|oversees|overseeing|responsible/;

const CHANGE_LEADERSHIP_FAMILY_PATTERNS = [
  /change leadership/,
  /change management/,
  /transformation/,
  /transformational/,
  /rollout/,
  /adoption/,
  /migration/,
  /operating model/,
  /operational transformation/,
  /process rollout/,
  /reorganization/,
  /redesign/,
  /launch/,
];

const LEADERSHIP_SCOPE_FAMILY_PATTERNS = [
  /led|leading|managed|owned|directed|supervised|built|drove|orchestrated|championed|spearheaded/,
  /team of \d+/,
  /\d+\+/,
  /across \d+/,
  /org(?:anization)?-?wide/,
  /global/,
  /enterprise/,
  /multi-site/,
  /cross-functional/,
  /portfolio/,
  /division/,
  /department/,
  /region/,
];

function hasFamilyEvidence(text: string, family: 'support' | 'change' | 'scope'): boolean {
  const lower = text.toLowerCase();
  if (family === 'support') {
    return (
      SUPPORT_OPERATIONS_FAMILY_PATTERNS.some((pattern) => pattern.test(lower)) &&
      LEADERSHIP_ACTION_PATTERNS.test(lower)
    );
  }
  if (family === 'change') {
    return (
      CHANGE_LEADERSHIP_FAMILY_PATTERNS.some((pattern) => pattern.test(lower)) &&
      LEADERSHIP_ACTION_PATTERNS.test(lower) &&
      /championed|spearheaded|transformation|rollout|adoption|migration|operating model/.test(lower)
    );
  }
  return (
    LEADERSHIP_SCOPE_FAMILY_PATTERNS.some((pattern) => pattern.test(lower)) &&
    LEADERSHIP_ACTION_PATTERNS.test(lower)
  );
}

function countTermHits(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
}

function buildHeuristicInference(params: {
  normalizedBaselineText: string;
  normalizedJobText: string;
  jobTitle?: string;
  responsibilityOverlapPercent: number;
  adjustedResponsibilityOverlapPercent: number;
  baselineCoveragePercent: number;
  baselineBand: number;
  roleBand: number;
}): {
  heuristicLiftByDimension: Record<ScoringContractV1DimensionKey, number>;
  heuristicLiftTotal: number;
  heuristicInference: {
    usedHeuristicInference: boolean;
    heuristicLiftTotal: number;
    heuristicLiftByDimension: Record<ScoringContractV1DimensionKey, number>;
    heuristicConfidenceSummary: Record<HeuristicConfidence, number>;
    heuristics: HeuristicDebugEntry[];
  };
} {
  const {
    normalizedBaselineText,
    normalizedJobText,
    jobTitle,
    responsibilityOverlapPercent,
    adjustedResponsibilityOverlapPercent,
    baselineCoveragePercent,
    baselineBand,
    roleBand,
  } = params;

  const heuristicLiftByDimension: Record<ScoringContractV1DimensionKey, number> = {
    role_scope_and_seniority: 0,
    support_operations_and_process_rigor: 0,
    tooling_and_platform_experience: 0,
    domain_and_business_context: 0,
    change_leadership_and_customer_advocacy: 0,
  };
  const heuristics: HeuristicDebugEntry[] = [];
  const confidenceSummary: Record<HeuristicConfidence, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };
  let heuristicLiftTotal = 0;

  const addHeuristic = (
    type: HeuristicType,
    dimension: HeuristicDimension,
    confidence: HeuristicConfidence,
    rawContribution: number,
    evidence: string[],
    reason: string,
  ) => {
    if (rawContribution <= 0) return;
    if (heuristicLiftTotal >= HEURISTIC_TOTAL_LIFT_CAP) return;
    const remainingGlobal = HEURISTIC_TOTAL_LIFT_CAP - heuristicLiftTotal;
    const remainingDimension = HEURISTIC_LIFT_CAPS[dimension] - heuristicLiftByDimension[dimension];
    const cappedContribution = Math.max(
      0,
      Math.min(rawContribution, remainingGlobal, remainingDimension),
    );
    if (cappedContribution <= 0) return;
    heuristicLiftByDimension[dimension] += cappedContribution;
    heuristicLiftTotal += cappedContribution;
    confidenceSummary[confidence] += 1;
    heuristics.push({
      type,
      dimension,
      confidence,
      rawContribution,
      cappedContribution,
      evidence,
      reason,
    });
  };

  const adjacencyTerms = [
    'bgp',
    'l3 routing',
    'routing',
    'switching',
    'networking',
    'network devices',
    'arista',
    'cisco',
    'juniper',
    'mellanox',
    'vlan',
    'dns',
    'dhcp',
    'vpn',
    'datacenter',
    'data center',
    'fabric',
    'linux infrastructure',
  ];
  const environmentTerms = [
    'microsoft schie',
    'schie',
    'hardware infrastructure engineering',
    'infrastructure lab',
    'advanced datacenter',
    'advanced data center',
    'research and development',
    'r&d',
  ];
  const translationVerbs = ['supported', 'maintained', 'configured', 'operated'];
  const trajectoryTerms = [
    'technician',
    'infrastructure engineer',
    'system administrator',
    'systems administrator',
    'linux administrator',
    'cloud',
    'network',
  ];
  const bridgeTerms = ['bgp', 'mellanox', 'vlan', 'dns', 'dhcp', 'vpn', 'linux'];

  const adjacencySignals =
    countTermHits(normalizedBaselineText, adjacencyTerms) +
    countTermHits(normalizedJobText, adjacencyTerms);
  const environmentSignals =
    countTermHits(normalizedBaselineText, environmentTerms) +
    countTermHits(normalizedJobText, environmentTerms);
  const translationSignals =
    countTermHits(normalizedBaselineText, translationVerbs) +
    countTermHits(normalizedJobText, translationVerbs);
  const trajectorySignals =
    countTermHits(normalizedBaselineText, trajectoryTerms) +
    countTermHits(normalizedJobText, trajectoryTerms);
  const bridgeSignals =
    countTermHits(normalizedBaselineText, bridgeTerms) +
    countTermHits(normalizedJobText, bridgeTerms);

  const baselineContextRich =
    countTermHits(normalizedBaselineText, ['network', 'infrastructure', 'datacenter', 'linux']) >=
    2;
  const jobContextRich =
    countTermHits(normalizedJobText, ['network', 'infrastructure', 'datacenter', 'linux']) >= 2;
  const contextRich = baselineContextRich || jobContextRich;
  const supportsTrajectory = /technician|engineer|administrator|admin|sysadmin/.test(
    `${normalizedBaselineText} ${normalizedJobText}`,
  );
  const hasStrongAdjacentEvidence =
    adjacencySignals >= 2 && contextRich && responsibilityOverlapPercent >= 25;

  if (hasStrongAdjacentEvidence) {
    addHeuristic(
      'adjacency',
      'tooling_and_platform_experience',
      adjacencySignals >= 4 ? 'high' : 'medium',
      adjacencySignals >= 4 ? 4 : 3,
      ['networking', 'datacenter', 'infra adjacency'],
      'Adjacent networking and infrastructure evidence supports partial tooling/platform credit',
    );
    addHeuristic(
      'adjacency',
      'domain_and_business_context',
      adjacencySignals >= 4 ? 'medium' : 'low',
      adjacencySignals >= 4 ? 2 : 1,
      ['adjacent domain signal'],
      'Adjacency modestly strengthens domain relevance without becoming direct match evidence',
    );
  }

  if (environmentSignals > 0 && hasStrongAdjacentEvidence) {
    addHeuristic(
      'environment_elevation',
      'tooling_and_platform_experience',
      environmentSignals >= 2 ? 'high' : 'medium',
      environmentSignals >= 2 ? 2 : 1,
      [jobTitle ?? '', 'high-complexity technical environment'].filter(Boolean),
      'High-complexity environment increases the credibility of adjacent technical work',
    );
  }

  if (translationSignals > 0 && contextRich) {
    addHeuristic(
      'verb_translation',
      'support_operations_and_process_rigor',
      translationSignals >= 3 ? 'high' : 'medium',
      translationSignals >= 3 ? 3 : 2,
      ['supported', 'maintained', 'configured', 'complex infra context'],
      'Support-oriented verbs become partial operational ownership in a technically rich context',
    );
    addHeuristic(
      'verb_translation',
      'tooling_and_platform_experience',
      'low',
      1,
      ['support verbs plus infra tooling'],
      'Operational verbs contribute a small amount of tooling/platform confidence',
    );
  }

  if (trajectorySignals >= 2 && supportsTrajectory && roleBand >= baselineBand - 1) {
    addHeuristic(
      'trajectory',
      'role_scope_and_seniority',
      trajectorySignals >= 4 ? 'medium' : 'low',
      trajectorySignals >= 4 ? 2 : 1,
      ['career progression signal'],
      'Career progression toward the target role is recognized as a small partial credit signal',
    );
  }

  if (bridgeSignals >= 2 && responsibilityOverlapPercent >= 20) {
    addHeuristic(
      'tool_domain_bridge',
      'tooling_and_platform_experience',
      bridgeSignals >= 4 ? 'high' : 'medium',
      bridgeSignals >= 4 ? 4 : 2,
      bridgeTerms.filter((term) => normalizedBaselineText.includes(term) || normalizedJobText.includes(term)),
      'Concrete tools and protocols bridge into adjacent platform relevance',
    );
    addHeuristic(
      'tool_domain_bridge',
      'domain_and_business_context',
      bridgeSignals >= 4 ? 'medium' : 'low',
      bridgeSignals >= 4 ? 2 : 1,
      ['network architecture fundamentals'],
      'Technical tools support the adjacent domain signal, but only with a small bounded lift',
    );
  }

  return {
    heuristicLiftByDimension,
    heuristicLiftTotal,
    heuristicInference: {
      usedHeuristicInference: heuristics.length > 0,
      heuristicLiftTotal,
      heuristicLiftByDimension,
      heuristicConfidenceSummary: confidenceSummary,
      heuristics,
    },
  };
}

export const scoreCxFitV2 = (
  input: CxFitV2Input,
  options?: { debugBundle?: boolean },
): CxFitV2Result => {
  const baselineText = input.baselineSections
    .map((section) => section.content ?? '')
    .join('\n');

  const normalizedJobResponsibilities = (
    input.normalizedJobResponsibilities ??
    input.job.normalizedResponsibilities ??
    []
  ).filter(Boolean);
  const normalizedJobRequirements = (
    input.normalizedJobRequirements ??
    input.job.normalizedRequirements ??
    []
  ).filter(Boolean);

  const jobSegments = [...normalizedJobResponsibilities, ...normalizedJobRequirements]
    .join(' ');

  const jobText = [jobSegments, input.job.rawDescription].filter(Boolean).join('\n');
  const baselineRawText = baselineText;
  const jobRawText = jobText;

  const hasRawDescription = Boolean((input.job.rawDescription ?? '').trim());

  const responsibilitiesText = normalizedJobResponsibilities
    .slice(0, 40)
    .map((line) => `- ${line}`)
    .join('\n');

  const requirementsText = normalizedJobRequirements
    .slice(0, 40)
    .map((line) => `- ${line}`)
    .join('\n');

  const normalizedJobSummary = [
    responsibilitiesText ? `Responsibilities:\n${responsibilitiesText}` : '',
    requirementsText ? `Requirements:\n${requirementsText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const jobTextForScoring =
    normalizedJobSummary.length > 0
      ? `${jobText} ${normalizedJobSummary}`
      : jobText;

  const jobScoringTextSource = normalizedJobSummary.length > 0 ? 'normalized' : 'raw';

  const normalizedJobText = normalizeText(jobTextForScoring);
  const normalizedBaselineText = normalizeText(baselineText);
  const jobClusterData = extractCapabilityClusters(
    normalizedJobText,
    capabilityClusterRegistry,
  );
  const baselineClusterData = extractCapabilityClusters(
    normalizedBaselineText,
    capabilityClusterRegistry,
  );
  const jobClustersList = jobClusterData.clusters;
  const baselineClustersList = baselineClusterData.clusters;
  const jobClusterSet = new Set(jobClustersList);
  const jobClusterHits = jobClusterData.hitsByCluster;
  const baselineClusterHits = baselineClusterData.hitsByCluster;
  const sharedClusters = baselineClustersList
    .filter((clusterId) => jobClusterSet.has(clusterId))
    .sort((a, b) => {
      const jobHitsA = jobClusterHits[a] ?? 0;
      const jobHitsB = jobClusterHits[b] ?? 0;
      if (jobHitsB !== jobHitsA) {
        return jobHitsB - jobHitsA;
      }
      const baselineHitsA = baselineClusterHits[a] ?? 0;
      const baselineHitsB = baselineClusterHits[b] ?? 0;
      if (baselineHitsB !== baselineHitsA) {
        return baselineHitsB - baselineHitsA;
      }
      return a.localeCompare(b);
    });


  // vector overlap stats
  const jobVectors = detectVectors(normalizedJobText);
  const baselineVectors = detectVectors(normalizedBaselineText);
  const sharedVectors = jobVectors.filter((vector) => baselineVectors.includes(vector));
  const transferableSignalTrace = buildTransferableMatches(jobVectors, baselineVectors);

  const jobCoveragePercent =
    jobVectors.length === 0 ? 0 : (sharedVectors.length / jobVectors.length) * 100;

  const baselineRecallPercent =
    baselineVectors.length === 0 ? 0 : (sharedVectors.length / baselineVectors.length) * 100;

  const jobClustersDenominator = Math.max(1, jobClustersList.length);
  const baselineClustersDenominator = Math.max(1, baselineClustersList.length);
  const jobClusterCoveragePercent = (sharedClusters.length / jobClustersDenominator) * 100;
  const baselineClusterCoveragePercent =
    (sharedClusters.length / baselineClustersDenominator) * 100;

  const responsibilityOverlapPercent = (jobCoveragePercent + jobClusterCoveragePercent) / 2;
  const transferableContributionCapped = Math.min(
    transferableSignalTrace.transferableCoveragePercent,
    responsibilityOverlapPercent * MAX_TRANSFERABLE_CONTRIBUTION,
  );
  const transferableContributionApplied =
    transferableContributionCapped * (responsibilityOverlapPercent >= 80 ? 0.18 : 0.5);
  const adjustedResponsibilityOverlapPercent = Math.min(
    80,
    responsibilityOverlapPercent + transferableContributionApplied,
  );

  const baselineCoveragePercent =
    (baselineRecallPercent + baselineClusterCoveragePercent) / 2;

  // leadership band and scope gap
  const baselineBand = inferBaselineBand(normalizedBaselineText);
  const roleBand = inferRoleBand({
    normalizedJobText,
    normalizedJobPreview: normalizedJobSummary,
    jobTitle: input.jobTitle,
  });
  const bandDelta = baselineBand - roleBand;
  const bandGap = Math.abs(bandDelta);
  const leadershipLevel = clamp(100 - Math.min(100, bandGap * 15));

  // domain
  const domainTagsBaselineOriginal = detectDomainTags(normalizedBaselineText);
  const domainTagsRoleOriginal = detectDomainTags(normalizedJobText);

  const jobScoringTextForBundles = jobTextForScoring;
  const baselineScoringTextForBundles = baselineText;

  let domainTagsRole = [...domainTagsRoleOriginal];
  const domainTagsBaseline = [...domainTagsBaselineOriginal];

  const industryBundleEvidence = INDUSTRY_BUNDLES.map((bundle) => {
    const jobHits = countBundleHits(jobScoringTextForBundles, bundle.terms);
    const baselineHits = countBundleHits(baselineScoringTextForBundles, bundle.terms);
    const qualifies =
      jobHits >= bundle.minHitsJob && baselineHits >= bundle.minHitsBaseline;

    return {
      id: bundle.id,
      jobHits,
      baselineHits,
      qualifies,
      addRoleTags: qualifies ? bundle.addRoleTags : [],
      suppressRoleTags: qualifies ? bundle.suppressRoleTags : [],
    };
  });

  for (const evidence of industryBundleEvidence) {
    if (!evidence.qualifies) continue;

    const bundle = INDUSTRY_BUNDLES.find((b) => b.id === evidence.id);
    if (!bundle) continue;

    for (const tag of evidence.addRoleTags) {
      if (!domainTagsRole.includes(tag)) {
        domainTagsRole.push(tag);
      }
    }

    for (const tag of bundle?.addBaselineTags ?? []) {
      if (!domainTagsBaseline.includes(tag)) {
        domainTagsBaseline.push(tag);
      }
    }

    for (const tag of evidence.suppressRoleTags) {
      domainTagsRole = domainTagsRole.filter((x) => x !== tag);
    }
  }

  if (
    domainTagsRoleOriginal.includes('External Delivery') &&
    !domainTagsRole.includes('External Delivery')
  ) {
    domainTagsRole.push('External Delivery');
  }

  const domainTagPercent = computeDomainPercent(
    domainTagsBaseline,
    domainTagsRole,
  );
  let adjustedDomainPercent = clamp(
    Math.round(domainTagPercent * 0.55 + adjustedResponsibilityOverlapPercent * 0.45),
  );
  const strongDomainAdjacency =
    domainTagsBaseline.includes('SaaS') &&
    domainTagsBaseline.includes('External Delivery') &&
    (domainTagsRole.includes('External Delivery') || domainTagsRole.includes('SaaS'));
  if (
    strongDomainAdjacency &&
    baselineCoveragePercent >= 20 &&
    responsibilityOverlapPercent >= 60
  ) {
    adjustedDomainPercent = Math.max(adjustedDomainPercent, 55);
  }
  if (baselineCoveragePercent < 40) {
    adjustedDomainPercent = Math.min(adjustedDomainPercent, 75);
  }
  adjustedDomainPercent = clamp(adjustedDomainPercent);
  const domainPercent = adjustedDomainPercent;

  const baselineExecDensity = calculateExecutiveScopeDensity(baselineRawText);
  const jobExecDensity = calculateExecutiveScopeDensity(jobRawText);
  const executiveOperationalGuardEnabled =
    leadershipLevel >= EXECUTIVE_STRATEGIC_GUARD_LEADERSHIP_THRESHOLD &&
    baselineExecDensity > EXEC_THRESHOLD;

  // strategy and execution signals
  const strategyMatchesJob = countPatternMatches(normalizedJobText, STRATEGY_PATTERNS);
  const strategyMatchesBaseline = countPatternMatches(normalizedBaselineText, STRATEGY_PATTERNS);

  const executionMatchesJob = countPatternMatches(normalizedJobText, EXECUTION_PATTERNS);
  const executionMatchesBaseline = countPatternMatches(normalizedBaselineText, EXECUTION_PATTERNS);

  const advocacyMatchesJob = countPatternMatches(normalizedJobText, CUSTOMER_ADVOCACY_PATTERNS);
  const advocacyMatchesBaseline = countPatternMatches(normalizedBaselineText, CUSTOMER_ADVOCACY_PATTERNS);

  // tooling
  const toolingCoverage = evaluateToolCoverage(jobTextForScoring, baselineText, {
    baselineSections: input.baselineSections.map((section) => ({
      title: section.type ?? null,
      content: section.content,
    })),
  });
  const rawToolingPercent = clamp(
    Math.round(
      toolingCoverage.requiredCoverage * 70 + toolingCoverage.preferredCoverage * 30,
    ),
  );

  const hasMissingHardTools = HARD_TOOL_GUARDS.some(
    (term) => normalizedJobText.includes(term) && !normalizedBaselineText.includes(term),
  );

  const toolingPercent = hasMissingHardTools ? 0 : rawToolingPercent;
  let toolingAndPlatformPercent = toolingPercent;

  const platformGroupEvidence: PlatformGroupEvidence[] = PLATFORM_GROUPS.map(
    (group) => {
      const jobHits = countGroupHits(jobTextForScoring, group.terms);
      const baselineHits = countGroupHits(baselineText, group.terms);
      const qualifies =
        jobHits >= group.minHitsJob && baselineHits >= group.minHitsBaseline;

      return {
        id: group.id,
        jobHits,
        baselineHits,
        qualifies,
        boost: qualifies ? group.boost : 0,
      };
    },
  );

  const platformGroupBoost = platformGroupEvidence.reduce(
    (sum, evidence) => sum + evidence.boost,
    0,
  );

  toolingAndPlatformPercent = Math.min(
    100,
    toolingAndPlatformPercent + platformGroupBoost,
  );

  const roleFitAnchor = adjustedResponsibilityOverlapPercent;
  const dependentDimensionAnchorCap = roleFitAnchor + 5;

  // ---- contract dimension percents (0-100) ----
  // 1) role_scope_and_seniority (scope + seniority alignment)
  // Mix vector overlap with band alignment.
  const bandAlignmentPercent =
    bandGap <= 1 ? 100 : bandGap === 2 ? 75 : bandGap === 3 ? 55 : 40;

  let scopeVectorPercent = clamp(Math.round(responsibilityOverlapPercent));
  scopeVectorPercent = clamp(Math.round(adjustedResponsibilityOverlapPercent));
  if (scopeVectorPercent < 50 && baselineRecallPercent >= 70) {
    scopeVectorPercent = 60;
  }

  const roleScopeAndSeniorityPercent = clamp(
    Math.round(scopeVectorPercent * 0.6 + bandAlignmentPercent * 0.4),
  );
  let anchoredRoleScopeAndSeniorityPercent = Math.min(
    roleScopeAndSeniorityPercent,
    dependentDimensionAnchorCap,
  );
  if (responsibilityOverlapPercent < 70) {
    anchoredRoleScopeAndSeniorityPercent = Math.min(
      anchoredRoleScopeAndSeniorityPercent,
      78,
    );
  }

  // 2) support_operations_and_process_rigor
  // Use execution and ops vectors overlap. Execution ratio is computed vs job asks.
  let executionRatioPercent: number;
  if (executionMatchesJob === 0) {
    executionRatioPercent = executionMatchesBaseline > 0 ? 60 : 40;
  } else {
    executionRatioPercent = clamp(
      Math.round(Math.min(1, executionMatchesBaseline / executionMatchesJob) * 100),
    );
  }

  const opsRigorPercent = clamp(
    Math.round(scopeVectorPercent * 0.55 + executionRatioPercent * 0.45),
  );
  let anchoredOpsRigorPercent = Math.min(
    opsRigorPercent,
    dependentDimensionAnchorCap,
  );
  if (responsibilityOverlapPercent < 70) {
    anchoredOpsRigorPercent = Math.min(anchoredOpsRigorPercent, 78);
  }

  // 3) tooling_and_platform_experience
  // 4) domain_and_business_context
  let anchoredToolingAndPlatformPercent = Math.min(
    toolingAndPlatformPercent,
    dependentDimensionAnchorCap,
  );
  if (responsibilityOverlapPercent < 70) {
    anchoredToolingAndPlatformPercent = Math.min(anchoredToolingAndPlatformPercent, 75);
  }

  const domainAndContextPercent = adjustedDomainPercent;

  // 5) change_leadership_and_customer_advocacy
  // Combine strategy ratio and advocacy ratio.
  let strategyRatioPercent: number;
  if (strategyMatchesJob === 0) {
    strategyRatioPercent = strategyMatchesBaseline > 0 ? 50 : 0;
  } else {
    strategyRatioPercent = clamp(
      Math.round(Math.min(1, strategyMatchesBaseline / strategyMatchesJob) * 100),
    );
  }

  let advocacyRatioPercent: number;
  if (advocacyMatchesJob === 0) {
    advocacyRatioPercent = advocacyMatchesBaseline > 0 ? 50 : 25;
  } else {
    advocacyRatioPercent = clamp(
      Math.round(Math.min(1, advocacyMatchesBaseline / advocacyMatchesJob) * 100),
    );
  }

  const originalStrategyRatioPercent = strategyRatioPercent;
  const originalAdvocacyRatioPercent = advocacyRatioPercent;
  const roleImpliedStrategyFloorApplied = roleBand >= 7 && bandGap <= 1;
  const flooredStrategyRatioPercent = clamp(
    roleImpliedStrategyFloorApplied
      ? Math.max(originalStrategyRatioPercent, 40)
      : originalStrategyRatioPercent,
  );
  const flooredAdvocacyRatioPercent = clamp(
    roleImpliedStrategyFloorApplied
      ? Math.max(originalAdvocacyRatioPercent, 35)
      : originalAdvocacyRatioPercent,
  );

  const defaultStrategicTacticalFit = clamp(
    Math.round(flooredStrategyRatioPercent * 0.55 + flooredAdvocacyRatioPercent * 0.45),
  );

  let strategicTacticalFit: number;
  let tacticalSuppressionSkipped = false;

  if (executiveOperationalGuardEnabled) {
    tacticalSuppressionSkipped = true;
    strategicTacticalFit = clamp(
      Math.round(Math.max(flooredStrategyRatioPercent, flooredAdvocacyRatioPercent)),
    );
  } else {
    strategicTacticalFit = defaultStrategicTacticalFit;
  }

  const baselineStrategicDensity = calculateStrategicDensity(baselineRawText);
  const jobStrategicDensity = calculateStrategicDensity(jobRawText);

  let execBoostApplied = false;
  if (
    baselineExecDensity > EXEC_THRESHOLD &&
    jobExecDensity > EXEC_THRESHOLD
  ) {
    strategicTacticalFit += 10;
    execBoostApplied = true;
  }

  strategicTacticalFit = Math.min(strategicTacticalFit, 100);

  if (strategyMatchesJob < 2) {
    strategicTacticalFit = Math.min(strategicTacticalFit, 70);
  }
  if (baselineCoveragePercent < 40) {
    strategicTacticalFit = Math.min(strategicTacticalFit, 70);
  }

  let strategicBoostApplied = false;
  if (
    baselineStrategicDensity > STRATEGIC_THRESHOLD &&
    jobStrategicDensity > STRATEGIC_THRESHOLD
  ) {
    strategicTacticalFit = strategicTacticalFit * 1.15;
    strategicBoostApplied = true;
  }

  strategicTacticalFit = Math.min(strategicTacticalFit, 100);

  let changeLeadershipAndAdvocacyPercentFloored = clamp(
    roleImpliedStrategyFloorApplied
      ? Math.max(strategicTacticalFit, 40)
      : strategicTacticalFit,
  );
  if (strategyMatchesJob < 2 || baselineCoveragePercent < 40) {
    changeLeadershipAndAdvocacyPercentFloored = Math.min(
      changeLeadershipAndAdvocacyPercentFloored,
      strategyMatchesJob >= 2 || transferableSignalTrace.transferableCoveragePercent >= 25
        ? 75
        : 70,
    );
  }
  if (adjustedResponsibilityOverlapPercent < 70) {
    adjustedDomainPercent = Math.min(adjustedDomainPercent, 70);
    changeLeadershipAndAdvocacyPercentFloored = Math.min(
      changeLeadershipAndAdvocacyPercentFloored,
      72,
    );
  }
  const changeLeadershipEligibility: 'eligible' | 'ineligible_ic_role' =
    roleBand < 7 ? 'ineligible_ic_role' : 'eligible';
  const changeLeadershipRedistributedWeight =
    changeLeadershipEligibility === 'ineligible_ic_role'
      ? BASE_WEIGHTS.change_leadership_and_customer_advocacy
      : 0;
  const effectiveWeights: ScoringContractV1Weights = {
    ...BASE_WEIGHTS,
  };
  if (changeLeadershipRedistributedWeight > 0) {
    effectiveWeights.change_leadership_and_customer_advocacy = 0;
    const remainingWeight = 100 - changeLeadershipRedistributedWeight;
    for (const key of [
      'role_scope_and_seniority',
      'support_operations_and_process_rigor',
      'tooling_and_platform_experience',
      'domain_and_business_context',
    ] as const) {
      effectiveWeights[key] =
        BASE_WEIGHTS[key] +
        (BASE_WEIGHTS[key] / remainingWeight) * changeLeadershipRedistributedWeight;
    }
  }
  const changeLeadershipPercentUsed =
    changeLeadershipEligibility === 'eligible'
      ? Math.min(
          changeLeadershipAndAdvocacyPercentFloored,
          baselineCoveragePercent < 40
            ? strategyMatchesJob >= 1 && roleBand >= 7
              ? 75
              : 70
            : 100,
        )
      : 0;

  const dimensionPercents: Record<ScoringContractV1DimensionKey, number> = {
    role_scope_and_seniority: anchoredRoleScopeAndSeniorityPercent,
    support_operations_and_process_rigor: anchoredOpsRigorPercent,
    tooling_and_platform_experience: anchoredToolingAndPlatformPercent,
    domain_and_business_context: domainAndContextPercent,
    change_leadership_and_customer_advocacy: changeLeadershipPercentUsed,
  };

  const heuristicResult = buildHeuristicInference({
    normalizedBaselineText,
    normalizedJobText,
    jobTitle: input.jobTitle,
    responsibilityOverlapPercent,
    adjustedResponsibilityOverlapPercent,
    baselineCoveragePercent,
    baselineBand,
    roleBand,
  });

  const calibratedDimensionPercents: Record<ScoringContractV1DimensionKey, number> = {
    ...dimensionPercents,
  };
  const supportFamilyEvidence =
    hasFamilyEvidence(baselineText, 'support') || hasFamilyEvidence(jobTextForScoring, 'support');
  const changeFamilyEvidence =
    hasFamilyEvidence(baselineText, 'change') || hasFamilyEvidence(jobTextForScoring, 'change');
  const scopeFamilyEvidence =
    hasFamilyEvidence(baselineText, 'scope') || hasFamilyEvidence(jobTextForScoring, 'scope');
  if (supportFamilyEvidence) {
    calibratedDimensionPercents.support_operations_and_process_rigor = Math.min(
      100,
      calibratedDimensionPercents.support_operations_and_process_rigor + 6,
    );
    calibratedDimensionPercents.role_scope_and_seniority = Math.min(
      100,
      calibratedDimensionPercents.role_scope_and_seniority + 1,
    );
  }

  if (changeFamilyEvidence) {
    calibratedDimensionPercents.change_leadership_and_customer_advocacy = Math.min(
      100,
      calibratedDimensionPercents.change_leadership_and_customer_advocacy + 3,
    );
    calibratedDimensionPercents.role_scope_and_seniority = Math.min(
      100,
      calibratedDimensionPercents.role_scope_and_seniority + 1,
    );
  }

  if (scopeFamilyEvidence) {
    calibratedDimensionPercents.role_scope_and_seniority = Math.min(
      100,
      calibratedDimensionPercents.role_scope_and_seniority + 2,
    );
  }

  const moderateStrongAlignment =
    responsibilityOverlapPercent >= 45 &&
    adjustedResponsibilityOverlapPercent >= 50 &&
    baselineCoveragePercent >= 40 &&
    baselineRecallPercent >= 40;
  const strongVerifiedAlignment =
    responsibilityOverlapPercent >= 85 &&
    adjustedResponsibilityOverlapPercent >= 75 &&
    baselineCoveragePercent >= 75 &&
    baselineRecallPercent >= 70;

  for (const [dimension, lift] of Object.entries(heuristicResult.heuristicLiftByDimension) as [
    ScoringContractV1DimensionKey,
    number,
  ][]) {
    calibratedDimensionPercents[dimension] = Math.min(100, calibratedDimensionPercents[dimension] + lift);
  }

  // ---- weighted points ----
  const dimensionPoints: Record<ScoringContractV1DimensionKey, number> = {
    role_scope_and_seniority: toWeightedPoints(
      calibratedDimensionPercents.role_scope_and_seniority,
      effectiveWeights.role_scope_and_seniority,
    ),
    support_operations_and_process_rigor: toWeightedPoints(
      calibratedDimensionPercents.support_operations_and_process_rigor,
      effectiveWeights.support_operations_and_process_rigor,
    ),
    tooling_and_platform_experience: toWeightedPoints(
      calibratedDimensionPercents.tooling_and_platform_experience,
      effectiveWeights.tooling_and_platform_experience,
    ),
    domain_and_business_context: toWeightedPoints(
      calibratedDimensionPercents.domain_and_business_context,
      effectiveWeights.domain_and_business_context,
    ),
    change_leadership_and_customer_advocacy: toWeightedPoints(
      calibratedDimensionPercents.change_leadership_and_customer_advocacy,
      effectiveWeights.change_leadership_and_customer_advocacy,
    ),
  };

  const subtotal =
    dimensionPoints.role_scope_and_seniority +
    dimensionPoints.support_operations_and_process_rigor +
    dimensionPoints.tooling_and_platform_experience +
    dimensionPoints.domain_and_business_context +
    dimensionPoints.change_leadership_and_customer_advocacy;

  // ---- penalties (contract) ----
  const penalties: ScoringContractV1Penalty[] = [];

  // scope_mismatch_downlevel: apply when the role band is materially higher than baseline
  if (roleBand - baselineBand >= 3) {
    penalties.push({
      code: 'scope_mismatch_downlevel',
      points: -10,
      reason: `Role seniority band L${roleBand} is 3+ levels above baseline band L${baselineBand}.`,
    });
  }

  // domain_mismatch_hard: apply when we see explicit domain tags in role and essentially none matched
  const roleHasDomainSignal = domainTagsRole.length > 0;
  const baselineHasDomainSignal = domainTagsBaseline.length > 0;
  const domainHardMismatch =
    roleHasDomainSignal && (!baselineHasDomainSignal || domainAndContextPercent <= 40);

  if (domainHardMismatch) {
    penalties.push({
      code: 'domain_mismatch_hard',
      points: -5,
      reason: `Role domain tags do not match baseline domain tags.`,
    });
  }

  // insufficient_baseline_support: apply when baseline evidence is too thin to justify a strong score
  // This is a guardrail against inflated scores when the job description is rich but the baseline lacks
  // enough directly relevant, structured coverage.
  // Note: score guardrails for baseline insufficiency are applied later as a cap (post-penalty),
  // so we don't disturb other calibration expectations.

  const penaltyTotal = penalties.reduce((sum, p) => sum + p.points, 0);
  const finalBeforeClamp = subtotal + penaltyTotal;

  // contract rounding: round half up, final only
  const roundedFinal = roundHalfUp(finalBeforeClamp);
  let finalScore = clamp(roundedFinal);

  if (moderateStrongAlignment && finalScore < 80) {
    finalScore = 80;
  }

  if (strongVerifiedAlignment && finalScore < 85) {
    finalScore = 85;
  }

  // Guardrail: cap scores in "strong apply" territory when baseline evidence coverage is clearly insufficient.
  // This prevents inflated 80s scores when experience depth/scope is materially unsupported.
  const baselineEvidenceInsufficient =
    baselineCoveragePercent < 12 &&
    responsibilityOverlapPercent < 45 &&
    toolingCoverage.requiredCoverage < 0.15;
  if (baselineEvidenceInsufficient && finalScore >= 80) {
    finalScore = 79;
    penalties.push({
      code: 'insufficient_baseline_support',
      points: -0,
      reason:
        `Score capped below strong-apply territory due to insufficient baseline evidence ` +
        `(baseline_recall=${baselineCoveragePercent.toFixed(1)}% responsibility_overlap=${responsibilityOverlapPercent.toFixed(
          1,
        )}% required_tool_coverage=${(toolingCoverage.requiredCoverage * 100).toFixed(1)}%).`,
    });
  }
  const scoreConfidenceClassification = assessScoreConfidence({
    score: finalScore,
    debug: {
      jobScoringTextSource,
      jobTextForScoring,
      jobTextForScoringLength: jobTextForScoring.length,
      jobVectorsLength: jobVectors.length,
      jobVectors,
      baselineVectors,
      sharedVectors,
      transferableMatches: transferableSignalTrace.transferableMatches,
      transferableCoveragePercent: transferableSignalTrace.transferableCoveragePercent,
      transferableContributionApplied,
      transferableVectors: transferableSignalTrace.transferableVectors,
      droppedTransferableMatches: transferableSignalTrace.droppedTransferableMatches,
      unmatchedVectors: transferableSignalTrace.unmatchedVectors,
      adjustedResponsibilityOverlapPercent,
      baselineBand: `L${baselineBand}`,
      roleBand: `L${roleBand}`,
      bandDelta,
      domainTagsBaseline: domainTagsBaseline,
      domainTagsRole: domainTagsRole,
      domainTagsBaselineOriginal,
      domainTagsRoleOriginal,
      domainPercent: adjustedDomainPercent,
      responsibilityOverlapPercent: clamp(Math.round(responsibilityOverlapPercent)),
      baselineCoveragePercent: clamp(Math.round(baselineCoveragePercent)),
      baselineRecallPercent: clamp(Math.round(baselineRecallPercent)),
      roleImpliedStrategyFloorApplied,
      originalStrategyRatioPercent: clamp(Math.round(originalStrategyRatioPercent)),
      flooredStrategyRatioPercent: clamp(Math.round(flooredStrategyRatioPercent)),
      strategyMatchesJob,
      originalAdvocacyRatioPercent: clamp(Math.round(originalAdvocacyRatioPercent)),
      flooredAdvocacyRatioPercent: clamp(Math.round(flooredAdvocacyRatioPercent)),
      changeLeadershipAndAdvocacyPercentFloored,
      jobClusters: jobClustersList,
      baselineClusters: baselineClustersList,
      sharedClusters,
      jobClusterHits,
      baselineClusterHits,
      toolingCoverage: {
        requiredCoverage: toolingCoverage.requiredCoverage,
        preferredCoverage: toolingCoverage.preferredCoverage,
        claims: toolingCoverage.claims,
      },
      platformGroups: {
        totalBoost: platformGroupBoost,
        evidence: platformGroupEvidence,
      },
      industryBundles: {
        evidence: industryBundleEvidence,
      },
      strategicDensity: {
        baseline: baselineStrategicDensity,
        job: jobStrategicDensity,
        appliedBoost: strategicBoostApplied,
      },
      executiveScopeDensity: {
        baseline: baselineExecDensity,
        job: jobExecDensity,
        appliedBoost: execBoostApplied,
      },
      strategicGuard: {
        leadershipLevel,
        baselineExecutiveScopeDensity: baselineExecDensity,
        executiveScopeThreshold: EXEC_THRESHOLD,
        leadershipThreshold: EXECUTIVE_STRATEGIC_GUARD_LEADERSHIP_THRESHOLD,
        guardEnabled: executiveOperationalGuardEnabled,
        tacticalSuppressionSkipped,
      },
      bundle: undefined,
      heuristicInference: heuristicResult.heuristicInference,
      changeLeadershipEligibility,
      effectiveWeights,
      redistributedWeightFrom: changeLeadershipRedistributedWeight,
    },
  });
  const debugBundle =
    options?.debugBundle
      ? buildFitScoreDebugBundle({
          baselineText,
          normalizedBaselineText,
          baselineSections: input.baselineSections,
          jobText,
          normalizedJobText,
          normalizedResponsibilities: normalizedJobResponsibilities,
          normalizedRequirements: normalizedJobRequirements,
          metadata: input.metadata,
          sharedVectors,
          jobVectors,
          baselineVectors,
          transferableMatches: transferableSignalTrace.transferableMatches,
          transferableCoveragePercent: transferableSignalTrace.transferableCoveragePercent,
          transferableContributionApplied,
          transferableVectors: transferableSignalTrace.transferableVectors,
          droppedTransferableMatches: transferableSignalTrace.droppedTransferableMatches,
          unmatchedVectors: transferableSignalTrace.unmatchedVectors,
          adjustedResponsibilityOverlapPercent,
          responsibilityOverlapPercent,
          baselineCoveragePercent,
          jobCoveragePercent,
          baselineRecallPercent,
          bandDelta,
          baselineBand,
          roleBand,
          toolingCoverage,
          toolingPercent,
          hasMissingHardTools,
          strategyMatchesJob,
          strategyMatchesBaseline,
          executionMatchesJob,
          executionMatchesBaseline,
          advocacyMatchesJob,
          advocacyMatchesBaseline,
          changeLeadershipEligibility,
          changeLeadershipPercentUsed,
          effectiveWeights,
          changeLeadershipRedistributedWeight,
          roleImpliedStrategyFloorApplied,
          originalStrategyRatioPercent,
          flooredStrategyRatioPercent,
          originalAdvocacyRatioPercent,
          flooredAdvocacyRatioPercent,
          domainPercent,
          heuristicInference: heuristicResult.heuristicInference,
          jobClusters: jobClustersList,
          baselineClusters: baselineClustersList,
          sharedClusters,
          jobClusterHits,
          baselineClusterHits,
    domainTagsBaseline: domainTagsBaseline,
    domainTagsRole: domainTagsRole,
          hasRawDescription,
          dimensionPoints,
          dimensionPercents: calibratedDimensionPercents,
          penalties,
          finalBeforeClamp,
          finalScore,
          rounding: 'round_half_up_final_only',
        })
      : undefined;

  return {
    score: finalScore,
    scorerVersion: CX_FIT_SCORER_VERSION,
    scoreConfidence: scoreConfidenceClassification.scoreConfidence,
    scoreConfidenceReasons: scoreConfidenceClassification.scoreConfidenceReasons,
    scoreSanityFlags: scoreConfidenceClassification.scoreSanityFlags,
    likelyUnderestimatedFit: scoreConfidenceClassification.likelyUnderestimatedFit,
    scorePresentationMode: scoreConfidenceClassification.scorePresentationMode,
    rubric: {
      id: 'scoring_contract_v1',
      weights: BASE_WEIGHTS,
      dimensionPercents: calibratedDimensionPercents,
      dimensionPoints,
      subtotal,
      penalties,
      finalBeforeClamp,
      rounding: 'round_half_up_final_only',
      resumeProject: buildResumeProjectRubric(dimensionPoints, finalScore),
    },
    debug: {
      jobScoringTextSource,
      jobTextForScoring,
      jobTextForScoringLength: jobTextForScoring.length,
      jobVectorsLength: jobVectors.length,
      jobVectors,
      baselineVectors,
      sharedVectors,
      transferableMatches: transferableSignalTrace.transferableMatches,
      transferableCoveragePercent: transferableSignalTrace.transferableCoveragePercent,
      transferableContributionApplied,
      transferableVectors: transferableSignalTrace.transferableVectors,
      droppedTransferableMatches: transferableSignalTrace.droppedTransferableMatches,
      unmatchedVectors: transferableSignalTrace.unmatchedVectors,
      adjustedResponsibilityOverlapPercent,
      baselineBand: `L${baselineBand}`,
      roleBand: `L${roleBand}`,
      bandDelta,
      domainTagsBaseline: domainTagsBaseline,
      domainTagsRole: domainTagsRole,
      domainTagsBaselineOriginal,
      domainTagsRoleOriginal,
      domainPercent: adjustedDomainPercent,
      responsibilityOverlapPercent: clamp(Math.round(responsibilityOverlapPercent)),
      baselineCoveragePercent: clamp(Math.round(baselineCoveragePercent)),
      baselineRecallPercent: clamp(Math.round(baselineRecallPercent)),
      roleImpliedStrategyFloorApplied,
      originalStrategyRatioPercent: clamp(Math.round(originalStrategyRatioPercent)),
      flooredStrategyRatioPercent: clamp(Math.round(flooredStrategyRatioPercent)),
      strategyMatchesJob,
      originalAdvocacyRatioPercent: clamp(Math.round(originalAdvocacyRatioPercent)),
      flooredAdvocacyRatioPercent: clamp(Math.round(flooredAdvocacyRatioPercent)),
      changeLeadershipAndAdvocacyPercentFloored,
      jobClusters: jobClustersList,
      baselineClusters: baselineClustersList,
      sharedClusters,
      jobClusterHits,
      baselineClusterHits,
      toolingCoverage: {
        requiredCoverage: toolingCoverage.requiredCoverage,
        preferredCoverage: toolingCoverage.preferredCoverage,
        claims: toolingCoverage.claims,
      },
      platformGroups: {
        totalBoost: platformGroupBoost,
        evidence: platformGroupEvidence,
      },
      industryBundles: {
        evidence: industryBundleEvidence,
      },
      strategicDensity: {
        baseline: baselineStrategicDensity,
        job: jobStrategicDensity,
        appliedBoost: strategicBoostApplied,
      },
      executiveScopeDensity: {
        baseline: baselineExecDensity,
        job: jobExecDensity,
        appliedBoost: execBoostApplied,
      },
      strategicGuard: {
        leadershipLevel,
        baselineExecutiveScopeDensity: baselineExecDensity,
        executiveScopeThreshold: EXEC_THRESHOLD,
        leadershipThreshold: EXECUTIVE_STRATEGIC_GUARD_LEADERSHIP_THRESHOLD,
        guardEnabled: executiveOperationalGuardEnabled,
        tacticalSuppressionSkipped,
      },
      bundle: debugBundle,
      heuristicInference: heuristicResult.heuristicInference,
      changeLeadershipEligibility,
      effectiveWeights,
      redistributedWeightFrom: changeLeadershipRedistributedWeight,
    },
  };
};

type BuildFitScoreDebugBundleParams = {
  baselineText: string;
  normalizedBaselineText: string;
  baselineSections: BaselineSection[];
  jobText: string;
  normalizedJobText: string;
  normalizedResponsibilities: string[];
  normalizedRequirements: string[];
  metadata?: CxFitV2Metadata;
  sharedVectors: string[];
  jobVectors: string[];
  baselineVectors: string[];
  transferableMatches: {
    jobVector: string;
    matchedVia: string;
    weight: number;
    applied: boolean;
  }[];
  transferableCoveragePercent: number;
  transferableContributionApplied: number;
  transferableVectors: string[];
  droppedTransferableMatches: {
    jobVector: string;
    matchedVia: string;
    weight: number;
    reason: string;
  }[];
  unmatchedVectors: string[];
  adjustedResponsibilityOverlapPercent: number;
  responsibilityOverlapPercent: number;
  baselineCoveragePercent: number;
  dimensionPercents: Record<ScoringContractV1DimensionKey, number>;
  bandDelta: number;
  baselineBand: number;
  roleBand: number;
  toolingCoverage: {
    requiredCoverage: number;
    preferredCoverage: number;
    claims: ToolRequirementClaim[];
  };
  toolingPercent: number;
  hasMissingHardTools: boolean;
  strategyMatchesJob: number;
  strategyMatchesBaseline: number;
  executionMatchesJob: number;
  executionMatchesBaseline: number;
  advocacyMatchesJob: number;
  advocacyMatchesBaseline: number;
  roleImpliedStrategyFloorApplied: boolean;
  originalStrategyRatioPercent: number;
  flooredStrategyRatioPercent: number;
  originalAdvocacyRatioPercent: number;
  flooredAdvocacyRatioPercent: number;
  changeLeadershipEligibility: 'eligible' | 'ineligible_ic_role';
  changeLeadershipPercentUsed: number;
  effectiveWeights: ScoringContractV1Weights;
  changeLeadershipRedistributedWeight: number;
  domainPercent: number;
  jobClusters: string[];
  baselineClusters: string[];
  sharedClusters: string[];
  jobClusterHits: Record<string, number>;
  baselineClusterHits: Record<string, number>;
  domainTagsRole: DomainTag[];
  domainTagsBaseline: DomainTag[];
  dimensionPoints: Record<ScoringContractV1DimensionKey, number>;
  heuristicInference: {
    usedHeuristicInference: boolean;
    heuristicLiftTotal: number;
    heuristicLiftByDimension: Record<ScoringContractV1DimensionKey, number>;
    heuristicConfidenceSummary: Record<HeuristicConfidence, number>;
    heuristics: HeuristicDebugEntry[];
  };
  penalties: ScoringContractV1Penalty[];
  finalBeforeClamp: number;
  finalScore: number;
  rounding: string;
    hasRawDescription: boolean;
    jobCoveragePercent: number;
    baselineRecallPercent: number;
  };

const buildFitScoreDebugBundle = (
  params: BuildFitScoreDebugBundleParams,
): FitScoreDebugBundle => {
  const {
    baselineText,
    normalizedBaselineText,
    baselineSections,
    jobText,
    normalizedJobText,
    normalizedResponsibilities,
    normalizedRequirements,
    metadata,
    sharedVectors,
    jobVectors,
    baselineVectors,
    transferableMatches,
    transferableCoveragePercent,
    transferableContributionApplied,
    transferableVectors,
    droppedTransferableMatches,
    unmatchedVectors,
    adjustedResponsibilityOverlapPercent,
    responsibilityOverlapPercent,
    baselineCoveragePercent,
    dimensionPercents,
    bandDelta,
    baselineBand,
    roleBand,
    toolingCoverage,
    toolingPercent,
    hasMissingHardTools,
    strategyMatchesJob,
    strategyMatchesBaseline,
    executionMatchesJob,
    executionMatchesBaseline,
    advocacyMatchesJob,
    advocacyMatchesBaseline,
    changeLeadershipEligibility,
    changeLeadershipPercentUsed,
    effectiveWeights,
  changeLeadershipRedistributedWeight,
  roleImpliedStrategyFloorApplied,
  originalStrategyRatioPercent,
  flooredStrategyRatioPercent,
  originalAdvocacyRatioPercent,
  flooredAdvocacyRatioPercent,
  domainPercent,
  domainTagsBaseline,
    domainTagsRole,
    jobClusters,
    baselineClusters,
    sharedClusters,
    jobClusterHits,
    baselineClusterHits,
    heuristicInference,
    dimensionPoints,
    penalties,
    finalBeforeClamp,
    finalScore,
    rounding,
    hasRawDescription,
    jobCoveragePercent,
    baselineRecallPercent,
  } = params;

  const baselineId = metadata?.baselineId;
  const baselineVersionId = metadata?.baselineVersionId;
  const jobId = metadata?.jobId;
  const baselineHash = sha256(baselineText);
  const jobHash = sha256(jobText);

  const baselineSectionSummaries = baselineSections.map((section, index) => ({
    index,
    type: section.type,
    charCount: getCharCount(section.content ?? ''),
    snippet: safeSnippet(section.content ?? '', 120) || '<empty section>',
  }));

  const responsibilitySegments = normalizedResponsibilities.map((text, index) => ({
    id: `responsibility-${index + 1}`,
    charCount: getCharCount(text),
    snippet: safeSnippet(text, 120) || '<empty responsibility>',
  }));

  const requirementSegments = normalizedRequirements.map((text, index) => ({
    id: `requirement-${index + 1}`,
    charCount: getCharCount(text),
    snippet: safeSnippet(text, 120) || '<empty requirement>',
  }));

  const normalizedResponsibilitiesCount = normalizedResponsibilities.length;
  const normalizedRequirementsCount = normalizedRequirements.length;
  const normalizedResponsibilitiesChars = responsibilitySegments.reduce(
    (sum, segment) => sum + segment.charCount,
    0,
  );
  const normalizedRequirementsChars = requirementSegments.reduce(
    (sum, segment) => sum + segment.charCount,
    0,
  );
  const jobTextSource =
    normalizedResponsibilitiesCount + normalizedRequirementsCount > 0 ? 'normalized' : 'raw';

  const baselinePreview = safeSnippet(normalizedBaselineText, 140) || '<empty normalized baseline>';
  const jobPreview = safeSnippet(normalizedJobText, 140) || '<empty normalized job text>';
  const jobRawPreview = safeSnippet(jobText, 140) || '<empty job text>';
  const baselineRawPreview = safeSnippet(baselineText, 140) || '<empty baseline text>';

  const changePercentSignal =
    changeLeadershipEligibility === 'eligible'
      ? `change_percent=${changeLeadershipPercentUsed.toFixed(1)}%`
      : 'change_percent=ineligible_ic_role';
  const changeIneligibleSignal =
    changeLeadershipEligibility === 'ineligible_ic_role'
      ? 'dimension_ineligible_ic_role=true'
      : 'dimension_ineligible_ic_role=false';

  const evidence: Record<ScoringContractV1DimensionKey, FitScoreDimensionEvidence> = {
    role_scope_and_seniority: buildEvidence(
      [
        `shared_vectors=${sharedVectors.length ? sharedVectors.join(',') : 'none'}`,
        `job_vectors=${jobVectors.length ? jobVectors.join(',') : 'none'}`,
        `baseline_vectors=${baselineVectors.length ? baselineVectors.join(',') : 'none'}`,
        `responsibility_overlap=${responsibilityOverlapPercent.toFixed(1)}%`,
        `job_coverage=${responsibilityOverlapPercent.toFixed(1)}%`,
        `baseline_recall=${baselineCoveragePercent.toFixed(1)}%`,
        `job_clusters=${formatClusterList(jobClusters)}`,
        `baseline_clusters=${formatClusterList(baselineClusters)}`,
        `shared_clusters=${formatClusterList(sharedClusters)}`,
        `band_delta=${bandDelta}`,
        `baseline_band=L${baselineBand}`,
        `role_band=L${roleBand}`,
      ],
      [
        { source: 'job', reference: 'normalized job summary', text: normalizedJobText },
        { source: 'baseline', reference: 'normalized baseline summary', text: normalizedBaselineText },
        { source: 'job', reference: 'job text preview', text: jobText },
        { source: 'baseline', reference: 'baseline text preview', text: baselineText },
      ],
    ),
    support_operations_and_process_rigor: buildEvidence(
      [
        `execution_matches_job=${executionMatchesJob}`,
        `execution_matches_baseline=${executionMatchesBaseline}`,
        `ops_rigor_percent=${dimensionPercents.support_operations_and_process_rigor.toFixed(
          1,
        )}%`,
      ],
      [
        { source: 'job', reference: 'normalized job summary', text: normalizedJobText },
        { source: 'baseline', reference: 'normalized baseline summary', text: normalizedBaselineText },
      ],
    ),
    tooling_and_platform_experience: buildEvidence(
      [
        `tooling_percent=${toolingPercent.toFixed(1)}%`,
        `required_coverage=${(toolingCoverage.requiredCoverage * 100).toFixed(1)}%`,
        `preferred_coverage=${(toolingCoverage.preferredCoverage * 100).toFixed(1)}%`,
        `missing_hard_tools=${hasMissingHardTools}`,
      ],
      [
        { source: 'job', reference: 'normalized job summary', text: normalizedJobText },
        { source: 'job', reference: 'job text preview', text: jobText },
      ],
    ),
    domain_and_business_context: buildEvidence(
      [
        `domain_percent=${domainPercent.toFixed(1)}%`,
        `domain_tags_role=${formatDomainTags(domainTagsRole)}`,
        `domain_tags_baseline=${formatDomainTags(domainTagsBaseline)}`,
      ],
      [
        { source: 'baseline', reference: 'normalized baseline summary', text: normalizedBaselineText },
        { source: 'baseline', reference: 'baseline text preview', text: baselineText },
      ],
    ),
    change_leadership_and_customer_advocacy: buildEvidence(
      [
        `strategy_matches_job=${strategyMatchesJob}`,
        `strategy_matches_baseline=${strategyMatchesBaseline}`,
        `advocacy_matches_job=${advocacyMatchesJob}`,
        `advocacy_matches_baseline=${advocacyMatchesBaseline}`,
        `role_implied_strategy_floor_applied=${roleImpliedStrategyFloorApplied}`,
        `strategy_ratio_original=${originalStrategyRatioPercent.toFixed(1)}%`,
        `strategy_ratio_floored=${flooredStrategyRatioPercent.toFixed(1)}%`,
        `advocacy_ratio_original=${originalAdvocacyRatioPercent.toFixed(1)}%`,
        `advocacy_ratio_floored=${flooredAdvocacyRatioPercent.toFixed(1)}%`,
        changeIneligibleSignal,
        changePercentSignal,
      ],
      [
        { source: 'job', reference: 'normalized job summary', text: normalizedJobText },
        { source: 'job', reference: 'job text preview', text: jobText },
      ],
    ),
  };

  return {
    inputs: {
      baselineId,
      baselineVersionId,
      jobId,
      baselineHash,
      jobHash,
      jobTextSource,
      truncation: {
        baseline: {
          originalChars: getCharCount(baselineText),
          finalChars: getCharCount(normalizedBaselineText),
          threshold: null,
          truncated: false,
        },
        job: {
          originalChars: getCharCount(jobText),
          finalChars: getCharCount(normalizedJobText),
          threshold: null,
          truncated: false,
        },
      },
      normalizedBaseline: {
        totalChars: getCharCount(normalizedBaselineText),
        sections: baselineSectionSummaries,
        preview: baselinePreview,
        coverageDetails: {
          originalBaselineChars: 0,
          includedBaselineChars: 0,
          coverageFormula: 'includedBaselineChars / originalBaselineChars',
          source: 'unknown',
          selectedSectionGateActive: false,
          selectedSectionCount: 0,
          normalizedBaselineChars: getCharCount(normalizedBaselineText),
        },
      },
      normalizedJob: {
        charCount: getCharCount(normalizedJobText),
        preview: jobPreview,
        rawDescriptionIncluded: hasRawDescription,
        normalizedResponsibilitiesCount,
        normalizedResponsibilitiesChars,
        normalizedRequirementsCount,
        normalizedRequirementsChars,
        responsibilities: responsibilitySegments,
        requirements: requirementSegments,
      },
    },
    heuristicInference,
    math: {
      contractVersion: 'scoring_contract_v1',
      weights: BASE_WEIGHTS,
      effectiveWeights,
      dimensionPoints,
      dimensionPercents,
      penalties,
      finalBeforeClamp,
      roundingMethod: rounding,
      finalScore,
      redistributedWeightFrom: changeLeadershipRedistributedWeight,
    },
    evidence,
    determinism: {
      randomSeed: 0,
      llmTemperature: 0,
      llmModel: null,
      llmMaxTokens: null,
      notes: 'Deterministic rule-based scoring without randomness or LLMs.',
    },
  };
};

const buildEvidence = (
  signals: string[],
  snippetSources: Array<{ source: 'baseline' | 'job'; reference: string; text: string }>,
): FitScoreDimensionEvidence => ({
  signals,
  snippets: snippetSources
    .map(({ source, reference, text }) => createSnippet(source, reference, text))
    .filter((snippet): snippet is FitScoreDebugSnippet => Boolean(snippet)),
});

const createSnippet = (
  source: 'baseline' | 'job',
  reference: string,
  text: string,
): FitScoreDebugSnippet | null => {
  const snippet = safeSnippet(text, 120);
  if (!snippet) return null;
  return { source, reference, text: snippet };
};

const formatDomainTags = (tags: DomainTag[]): string => {
  return tags.length ? tags.join(', ') : 'none';
};

function calculateStrategicDensity(text: string): number {
  if (!text) return 0;

  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, ' ');

  const words = normalized.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount === 0) return 0;

  let matches = 0;

  for (const term of STRATEGIC_SIGNAL_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, 'g');
    const found = normalized.match(regex);
    if (found) {
      matches += found.length;
    }
  }

  return matches / wordCount;
}

function calculateExecutiveScopeDensity(text: string): number {
  if (!text) return 0;

  const normalized = text.toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount === 0) return 0;

  let matches = 0;

  for (const term of EXECUTIVE_SCOPE_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, 'g');
    const found = normalized.match(regex);
    if (found) {
      matches += found.length;
    }
  }

  return matches / wordCount;
}

function countGroupHits(text: string, terms: string[]): number {
  if (!text) return 0;

  const normalized = text.toLowerCase();
  let hits = 0;

  for (const term of terms) {
    const t = term.toLowerCase().trim();
    if (!t) continue;

    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'g');
    const found = normalized.match(re);
    if (found) {
      hits += found.length;
    }
  }

  return hits;
}

function countBundleHits(text: string, terms: string[]): number {
  return countGroupHits(text, terms);
}

export function computeConfidenceScore(
  debug: CxFitV2DebugInfo,
): ConfidenceScoreResult {
  const reasons: ConfidenceReasonLabel[] = [];
  let score = 100;

  const baselineChars =
    debug.bundle?.inputs?.normalizedBaseline?.totalChars ??
    debug.baselineCoverageDetails?.normalizedBaselineChars;

  let baselineInsufficient = false;
  if (typeof baselineChars === 'number') {
    if (baselineChars < 200) {
      score -= 70;
      reasons.push('baseline_text_insufficient');
      baselineInsufficient = true;
    } else if (baselineChars < 800) {
      score -= 45;
      reasons.push('baseline_text_low');
    } else if (baselineChars < 1500) {
      score -= 25;
      reasons.push('baseline_text_moderate');
    }
  }

  const coverageDetails =
    debug.baselineCoverageDetails ??
    debug.bundle?.inputs?.normalizedBaseline?.coverageDetails;
  const originalChars = coverageDetails?.originalBaselineChars;
  const includedChars = coverageDetails?.includedBaselineChars;
  if (
    typeof originalChars === 'number' &&
    originalChars > 0 &&
    typeof includedChars === 'number'
  ) {
    const coverageRatio = includedChars / originalChars;
    if (coverageRatio < 0.05) {
      score -= 35;
      reasons.push('baseline_coverage_very_low');
      baselineInsufficient = true;
    } else if (coverageRatio < 0.15) {
      score -= 20;
      reasons.push('baseline_coverage_low');
    }
  }

  const baselineTags = debug.domainTagsBaseline ?? [];
  const roleTags = debug.domainTagsRole ?? [];
  const baselineTextForPenalty =
    debug.bundle?.inputs?.normalizedBaseline?.sections
      ?.map((section) => section.snippet)
      .join(' ') ?? '';
  const jobTextForPenalty =
    [
      ...(debug.bundle?.inputs?.normalizedJob?.responsibilities ?? []),
      ...(debug.bundle?.inputs?.normalizedJob?.requirements ?? []),
    ]
      .map((segment) => segment.snippet)
      .join(' ') ?? '';
  const baselineInfraNetworkSignals = countTermHits(baselineTextForPenalty, [
    'network infrastructure',
    'networking',
    'linux systems',
    'linux infrastructure',
    'datacenter',
    'data center',
    'routing',
    'l3 routing',
    'layer 3 routing',
    'bgp',
    'vlan',
    'firewall',
    'firewalls',
    'switch',
    'switches',
    'virtualization',
    'vmware',
    'monitoring',
  ]);
  const roleInfraNetworkSignals = countTermHits(jobTextForPenalty, [
    'network infrastructure',
    'networking',
    'linux systems',
    'linux infrastructure',
    'datacenter',
    'data center',
    'routing',
    'l3 routing',
    'layer 3 routing',
    'bgp',
    'vlan',
    'firewall',
    'firewalls',
    'switch',
    'switches',
    'virtualization',
    'vmware',
    'monitoring',
  ]);
  const strongInfraNetworkMatch =
    baselineInfraNetworkSignals >= 6 && roleInfraNetworkSignals >= 2;
  if (roleTags.length && !baselineTags.length) {
    score -= strongInfraNetworkMatch ? 5 : 15;
    reasons.push('low_domain_overlap');
  } else if (roleTags.length && baselineTags.length) {
    const overlap = roleTags.some((tag) => baselineTags.includes(tag));
    if (!overlap) {
      score -= strongInfraNetworkMatch ? 4 : 10;
      reasons.push('low_domain_overlap');
    }
  }

  if (typeof debug.bandDelta === 'number' && Math.abs(debug.bandDelta) >= 3) {
    score -= 15;
    reasons.push('large_seniority_gap');
  }

  if (!baselineInsufficient && typeof debug.responsibilityOverlapPercent === 'number') {
    if (debug.responsibilityOverlapPercent < 35) {
      score -= strongInfraNetworkMatch ? 6 : 15;
      reasons.push('low_responsibility_overlap');
    } else if (debug.responsibilityOverlapPercent < 50) {
      score -= strongInfraNetworkMatch ? 4 : 8;
      reasons.push('moderate_responsibility_overlap');
    }
  }

  const bundleEvidence = debug.bundle?.evidence;
  if (bundleEvidence) {
    const hasMissingSharedVectors = Object.values(bundleEvidence).some(
      (evidence) =>
        evidence.signals?.some((signal) => signal === 'shared_vectors=none'),
    );
    if (hasMissingSharedVectors) {
      score -= 5;
      reasons.push('no_vectors');
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  const finalScore = Math.round(clamp(score));
  return {
    confidenceScore: finalScore,
    confidenceReasons: uniqueReasons,
  };
}
