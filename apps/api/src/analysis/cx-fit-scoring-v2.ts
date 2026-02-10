import { clamp, normalizeText } from '../scoring/fit-score/fit-score.utils';
import { evaluateToolCoverage } from '../scoring/fit-score/tool-extractor';
import { getCharCount, safeSnippet, sha256 } from '../common/text-metrics';

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
    dimensionPoints: Record<ScoringContractV1DimensionKey, number>;
    dimensionPercents: Record<ScoringContractV1DimensionKey, number>;
    penalties: ScoringContractV1Penalty[];
    finalBeforeClamp: number;
    roundingMethod: string;
    finalScore: number;
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

export type ScoringContractV1PenaltyCode =
  | 'scope_mismatch_downlevel'
  | 'domain_mismatch_hard';

export type ScoringContractV1Penalty = {
  code: ScoringContractV1PenaltyCode;
  points: number; // negative numbers
  reason: string;
};

export type CxFitV2DebugInfo = {
  jobScoringTextSource: 'normalized' | 'raw';
  baselineBand: string;
  roleBand: string;
  bandDelta: number;
  domainTagsBaseline: DomainTag[];
  domainTagsRole: DomainTag[];
  responsibilityOverlapPercent: number;
  baselineCoveragePercent: number;
  baselineRecallPercent: number;
  roleImpliedStrategyFloorApplied: boolean;
  originalStrategyRatioPercent: number;
  flooredStrategyRatioPercent: number;
  originalAdvocacyRatioPercent: number;
  flooredAdvocacyRatioPercent: number;
  toolingCoverage: {
    requiredCoverage: number;
    preferredCoverage: number;
  };
  baselineCoverageDetails?: BaselineCoverageDetails;
  bundle?: FitScoreDebugBundle;
};

export type CxFitV2Result = {
  // canonical
  score: number;

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
  };

  // extra debug info (safe to log / show)
  debug: CxFitV2DebugInfo;
};

const WEIGHTS: ScoringContractV1Weights = {
  role_scope_and_seniority: 25,
  support_operations_and_process_rigor: 25,
  tooling_and_platform_experience: 20,
  domain_and_business_context: 15,
  change_leadership_and_customer_advocacy: 15,
};

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
    id: 'automation_workflow',
    keywords: [
      'automation',
      'workflow design',
      'workflow engineering',
      'runbooks',
    ],
  },
  {
    id: 'contact_center_ops',
    keywords: ['contact center', 'call center', 'contact center ops'],
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
      'dashboards',
      'kpis',
      'key performance indicators',
      'scorecards',
    ],
  },
] as const;

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

const inferLeadershipBand = (text: string) => {
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
    normalizedJobSummary.length > 0 ? normalizedJobSummary : jobText;

  const jobScoringTextSource = normalizedJobSummary.length > 0 ? 'normalized' : 'raw';

  const normalizedJobText = normalizeText(jobTextForScoring);
  const normalizedBaselineText = normalizeText(baselineText);

  // vector overlap stats
  const jobVectors = detectVectors(normalizedJobText);
  const baselineVectors = detectVectors(normalizedBaselineText);
  const sharedVectors = jobVectors.filter((vector) => baselineVectors.includes(vector));

  const jobCoveragePercent =
    jobVectors.length === 0 ? 0 : (sharedVectors.length / jobVectors.length) * 100;

  const baselineRecallPercent =
    baselineVectors.length === 0 ? 0 : (sharedVectors.length / baselineVectors.length) * 100;

  const responsibilityOverlapPercent = jobCoveragePercent;

  const baselineCoveragePercent = baselineRecallPercent;

  // leadership band and scope gap
  const baselineBand = inferLeadershipBand(normalizedBaselineText);
  const roleBand = inferLeadershipBand(normalizedJobText);
  const bandDelta = Math.abs(baselineBand - roleBand);

  // domain
  const domainTagsBaseline = detectDomainTags(normalizedBaselineText);
  const domainTagsRole = detectDomainTags(normalizedJobText);
  const domainPercent = computeDomainPercent(domainTagsBaseline, domainTagsRole);

  // strategy and execution signals
  const strategyMatchesJob = countPatternMatches(normalizedJobText, STRATEGY_PATTERNS);
  const strategyMatchesBaseline = countPatternMatches(normalizedBaselineText, STRATEGY_PATTERNS);

  const executionMatchesJob = countPatternMatches(normalizedJobText, EXECUTION_PATTERNS);
  const executionMatchesBaseline = countPatternMatches(normalizedBaselineText, EXECUTION_PATTERNS);

  const advocacyMatchesJob = countPatternMatches(normalizedJobText, CUSTOMER_ADVOCACY_PATTERNS);
  const advocacyMatchesBaseline = countPatternMatches(normalizedBaselineText, CUSTOMER_ADVOCACY_PATTERNS);

  // tooling
  const toolingCoverage = evaluateToolCoverage(jobTextForScoring, baselineText);
  const rawToolingPercent = clamp(
    Math.round(
      toolingCoverage.requiredCoverage * 70 + toolingCoverage.preferredCoverage * 30,
    ),
  );

  const hasMissingHardTools = HARD_TOOL_GUARDS.some(
    (term) => normalizedJobText.includes(term) && !normalizedBaselineText.includes(term),
  );

  const toolingPercent = hasMissingHardTools ? 0 : rawToolingPercent;

  // ---- contract dimension percents (0-100) ----
  // 1) role_scope_and_seniority (scope + seniority alignment)
  // Mix vector overlap with band alignment.
  const bandAlignmentPercent =
    bandDelta <= 1 ? 100 : bandDelta === 2 ? 75 : bandDelta === 3 ? 55 : 40;

  let scopeVectorPercent = clamp(Math.round(responsibilityOverlapPercent));
  if (scopeVectorPercent < 50 && baselineRecallPercent >= 70) {
    scopeVectorPercent = 60;
  }

  const roleScopeAndSeniorityPercent = clamp(
    Math.round(scopeVectorPercent * 0.6 + bandAlignmentPercent * 0.4),
  );

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

  // 3) tooling_and_platform_experience
  const toolingAndPlatformPercent = toolingPercent;

  // 4) domain_and_business_context
  const domainAndContextPercent = domainPercent;

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
  const roleImpliedStrategyFloorApplied = roleBand >= 7 && bandDelta <= 1;
  const flooredStrategyRatioPercent = clamp(
    roleImpliedStrategyFloorApplied
      ? Math.max(originalStrategyRatioPercent, 65)
      : originalStrategyRatioPercent,
  );
  const flooredAdvocacyRatioPercent = clamp(
    roleImpliedStrategyFloorApplied
      ? Math.max(originalAdvocacyRatioPercent, 60)
      : originalAdvocacyRatioPercent,
  );

  const changeLeadershipAndAdvocacyPercent = clamp(
    Math.round(flooredStrategyRatioPercent * 0.55 + flooredAdvocacyRatioPercent * 0.45),
  );
  const changeLeadershipAndAdvocacyPercentFloored = clamp(
    roleImpliedStrategyFloorApplied
      ? Math.max(changeLeadershipAndAdvocacyPercent, 65)
      : changeLeadershipAndAdvocacyPercent,
  );

  const dimensionPercents: Record<ScoringContractV1DimensionKey, number> = {
    role_scope_and_seniority: roleScopeAndSeniorityPercent,
    support_operations_and_process_rigor: opsRigorPercent,
    tooling_and_platform_experience: toolingAndPlatformPercent,
    domain_and_business_context: domainAndContextPercent,
    change_leadership_and_customer_advocacy: changeLeadershipAndAdvocacyPercentFloored,
  };

  // ---- weighted points ----
  const dimensionPoints: Record<ScoringContractV1DimensionKey, number> = {
    role_scope_and_seniority: toWeightedPoints(
      dimensionPercents.role_scope_and_seniority,
      WEIGHTS.role_scope_and_seniority,
    ),
    support_operations_and_process_rigor: toWeightedPoints(
      dimensionPercents.support_operations_and_process_rigor,
      WEIGHTS.support_operations_and_process_rigor,
    ),
    tooling_and_platform_experience: toWeightedPoints(
      dimensionPercents.tooling_and_platform_experience,
      WEIGHTS.tooling_and_platform_experience,
    ),
    domain_and_business_context: toWeightedPoints(
      dimensionPercents.domain_and_business_context,
      WEIGHTS.domain_and_business_context,
    ),
    change_leadership_and_customer_advocacy: toWeightedPoints(
      dimensionPercents.change_leadership_and_customer_advocacy,
      WEIGHTS.change_leadership_and_customer_advocacy,
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

  const penaltyTotal = penalties.reduce((sum, p) => sum + p.points, 0);
  const finalBeforeClamp = subtotal + penaltyTotal;

  // contract rounding: round half up, final only
  const roundedFinal = roundHalfUp(finalBeforeClamp);
  const finalScore = clamp(roundedFinal);
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
          roleImpliedStrategyFloorApplied,
          originalStrategyRatioPercent,
          flooredStrategyRatioPercent,
          originalAdvocacyRatioPercent,
          flooredAdvocacyRatioPercent,
          domainPercent,
          domainTagsBaseline,
          domainTagsRole,
          hasRawDescription,
          dimensionPoints,
          dimensionPercents,
          penalties,
          finalBeforeClamp,
          finalScore,
          rounding: 'round_half_up_final_only',
        })
      : undefined;

  return {
    score: finalScore,
    rubric: {
      id: 'scoring_contract_v1',
      weights: WEIGHTS,
      dimensionPercents,
      dimensionPoints,
      subtotal,
      penalties,
      finalBeforeClamp,
      rounding: 'round_half_up_final_only',
    },
    debug: {
      jobScoringTextSource,
      baselineBand: `L${baselineBand}`,
      roleBand: `L${roleBand}`,
      bandDelta,
      domainTagsBaseline,
      domainTagsRole,
      responsibilityOverlapPercent: clamp(Math.round(responsibilityOverlapPercent)),
      baselineCoveragePercent: clamp(Math.round(baselineCoveragePercent)),
      baselineRecallPercent: clamp(Math.round(baselineRecallPercent)),
      roleImpliedStrategyFloorApplied,
      originalStrategyRatioPercent: clamp(Math.round(originalStrategyRatioPercent)),
      flooredStrategyRatioPercent: clamp(Math.round(flooredStrategyRatioPercent)),
      originalAdvocacyRatioPercent: clamp(Math.round(originalAdvocacyRatioPercent)),
      flooredAdvocacyRatioPercent: clamp(Math.round(flooredAdvocacyRatioPercent)),
      toolingCoverage: {
        requiredCoverage: toolingCoverage.requiredCoverage,
        preferredCoverage: toolingCoverage.preferredCoverage,
      },
      bundle: debugBundle,
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
  responsibilityOverlapPercent: number;
  baselineCoveragePercent: number;
  dimensionPercents: Record<ScoringContractV1DimensionKey, number>;
  bandDelta: number;
  baselineBand: number;
  roleBand: number;
  toolingCoverage: {
    requiredCoverage: number;
    preferredCoverage: number;
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
    domainPercent: number;
    domainTagsRole: DomainTag[];
    domainTagsBaseline: DomainTag[];
    dimensionPoints: Record<ScoringContractV1DimensionKey, number>;
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
    roleImpliedStrategyFloorApplied,
    originalStrategyRatioPercent,
    flooredStrategyRatioPercent,
    originalAdvocacyRatioPercent,
    flooredAdvocacyRatioPercent,
    domainPercent,
    domainTagsBaseline,
    domainTagsRole,
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

  const evidence: Record<ScoringContractV1DimensionKey, FitScoreDimensionEvidence> = {
    role_scope_and_seniority: buildEvidence(
      [
        `shared_vectors=${sharedVectors.length ? sharedVectors.join(',') : 'none'}`,
        `job_vectors=${jobVectors.length ? jobVectors.join(',') : 'none'}`,
        `baseline_vectors=${baselineVectors.length ? baselineVectors.join(',') : 'none'}`,
        `responsibility_overlap=${responsibilityOverlapPercent.toFixed(1)}%`,
        `job_coverage=${jobCoveragePercent.toFixed(1)}%`,
        `baseline_recall=${baselineRecallPercent.toFixed(1)}%`,
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
          `change_percent=${dimensionPercents.change_leadership_and_customer_advocacy.toFixed(1)}%`,
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
    math: {
      contractVersion: 'scoring_contract_v1',
      weights: WEIGHTS,
      dimensionPoints,
      dimensionPercents,
      penalties,
      finalBeforeClamp,
      roundingMethod: rounding,
      finalScore,
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
