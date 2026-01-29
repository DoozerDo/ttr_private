import { clamp, normalizeText } from '../scoring/fit-score/fit-score.utils';
import { evaluateToolCoverage } from '../scoring/fit-score/tool-extractor';

type BaselineSection = { type?: string; content: string };

export type CxFitV2Input = {
  job: {
    rawDescription: string;
    normalizedResponsibilities: string[];
    normalizedRequirements: string[];
  };
  baselineSections: BaselineSection[];
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
  debug: {
    baselineBand: string;
    roleBand: string;
    bandDelta: number;
    domainTagsBaseline: DomainTag[];
    domainTagsRole: DomainTag[];
    responsibilityOverlapPercent: number;
    baselineCoveragePercent: number;
    toolingCoverage: {
      requiredCoverage: number;
      preferredCoverage: number;
    };
  };
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

export const scoreCxFitV2 = (input: CxFitV2Input): CxFitV2Result => {
  const baselineText = input.baselineSections
    .map((section) => section.content ?? '')
    .join('\n');

  const jobSegments = [
    ...input.job.normalizedResponsibilities,
    ...input.job.normalizedRequirements,
  ]
    .filter(Boolean)
    .join(' ');

  const jobText = [jobSegments, input.job.rawDescription].filter(Boolean).join('\n');

  const normalizedJobText = normalizeText(jobText);
  const normalizedBaselineText = normalizeText(baselineText);

  // vector overlap stats
  const jobVectors = detectVectors(normalizedJobText);
  const baselineVectors = detectVectors(normalizedBaselineText);
  const sharedVectors = jobVectors.filter((vector) => baselineVectors.includes(vector));

  const responsibilityOverlapPercent =
    jobVectors.length === 0 ? 0 : (sharedVectors.length / jobVectors.length) * 100;

  const baselineCoveragePercent =
    baselineVectors.length === 0 ? 0 : (sharedVectors.length / baselineVectors.length) * 100;

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
  const toolingCoverage = evaluateToolCoverage(jobText, baselineText);
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

  const scopeVectorPercent = clamp(
    Math.round((responsibilityOverlapPercent + baselineCoveragePercent) / 2),
  );

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

  const changeLeadershipAndAdvocacyPercent = clamp(
    Math.round(strategyRatioPercent * 0.55 + advocacyRatioPercent * 0.45),
  );

  const dimensionPercents: Record<ScoringContractV1DimensionKey, number> = {
    role_scope_and_seniority: roleScopeAndSeniorityPercent,
    support_operations_and_process_rigor: opsRigorPercent,
    tooling_and_platform_experience: toolingAndPlatformPercent,
    domain_and_business_context: domainAndContextPercent,
    change_leadership_and_customer_advocacy: changeLeadershipAndAdvocacyPercent,
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
      baselineBand: `L${baselineBand}`,
      roleBand: `L${roleBand}`,
      bandDelta,
      domainTagsBaseline,
      domainTagsRole,
      responsibilityOverlapPercent: clamp(Math.round(responsibilityOverlapPercent)),
      baselineCoveragePercent: clamp(Math.round(baselineCoveragePercent)),
      toolingCoverage: {
        requiredCoverage: toolingCoverage.requiredCoverage,
        preferredCoverage: toolingCoverage.preferredCoverage,
      },
    },
  };
};
