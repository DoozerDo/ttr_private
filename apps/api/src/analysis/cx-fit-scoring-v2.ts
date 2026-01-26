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

export type CxFitV2Result = {
  score: number;
  components: {
    scope: number;
    leadership: number;
    domain: number;
    strategy: number;
    execution: number;
    tooling: number;
  };
  adjustments: {
    selfSimilarityApplied: boolean;
    selfSimilarityFloor: number;
    stretchDampenerApplied: boolean;
    stretchDampenerPoints: number;
    toolingFloorApplied: boolean;
  };
  bands: {
    baselineBand: string;
    roleBand: string;
    bandDelta: number;
  };
  debug: {
    domainTagsBaseline: string[];
    domainTagsRole: string[];
    responsibilityOverlapPercent: number;
    baselineCoveragePercent: number;
  };
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
];

const OWNERSHIP_TERMS = [
  'accountable for',
  'lead',
  'govern',
  'chair',
  'direct',
  'establish',
  'design',
  'operationalize',
  'teams',
  'outcomes',
  'slas',
  'mttr',
  'mtta',
  'backlog health',
  'change governance',
  'dashboards',
  'runbooks',
];

const STRATEGY_PATTERNS: RegExp[] = [
  /operating model/,
  /governance (?:creation|design|structure)/,
  /capacity planning/,
  /\bkpi\b/,
  /key performance indicators/,
  /tooling roadmap/,
  /cross[- ]functional prioritization/,
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

const OWNERSHIP_GAP_INDICATORS = [
  'budget authority',
  'revenue ownership',
  'utilization ownership',
  'margin ownership',
  'field services org',
  'field services organization',
  'field services organization ownership',
  'budget owner',
  'revenue owner',
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

  if (
    /(?:budget authority|revenue ownership|p\s*&?\s*l|profit and loss)/.test(
      text,
    )
  ) {
    elevate(8);
  }
  if (
    /(directs|oversees|lead(?:s|ing)?).*global/.test(text) ||
    /(global (?:coverage|ops|operations|delivery|org|organization|service))/.test(
      text,
    )
  ) {
    elevate(7);
  }
  if (
    /enterprise[- ]wide/.test(text) ||
    /global (?:org|organization|ops)/.test(text)
  ) {
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

const computeDomainScore = (
  baselineTags: DomainTag[],
  roleTags: DomainTag[],
) => {
  const baselineSet = new Set(baselineTags);
  const roleSet = new Set(roleTags);

  if (
    baselineSet.size > 0 &&
    roleSet.size > 0 &&
    baselineSet.size === roleSet.size &&
    [...baselineSet].every((tag) => roleSet.has(tag))
  ) {
    return 100;
  }

  if ([...roleSet].some((tag) => baselineSet.has(tag))) {
    return 75;
  }

  return 40;
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
  const jobText = [jobSegments, input.job.rawDescription]
    .filter(Boolean)
    .join('\n');

  const normalizedJobText = normalizeText(jobText);
  const normalizedBaselineText = normalizeText(baselineText);

  const jobVectors = detectVectors(normalizedJobText);
  const baselineVectors = detectVectors(normalizedBaselineText);
  const sharedVectors = jobVectors.filter((vector) =>
    baselineVectors.includes(vector),
  );
  const responsibilityOverlapPercent =
    jobVectors.length === 0
      ? 0
      : (sharedVectors.length / jobVectors.length) * 100;
  const baselineCoveragePercent =
    baselineVectors.length === 0
      ? 0
      : (sharedVectors.length / baselineVectors.length) * 100;
  const ownershipMatches = OWNERSHIP_TERMS.filter(
    (term) =>
      normalizedJobText.includes(term) && normalizedBaselineText.includes(term),
  ).length;
  const baseScope =
    (responsibilityOverlapPercent + baselineCoveragePercent) / 2;
  let scopeScore = clamp(
    Math.round(baseScope + Math.min(15, ownershipMatches * 4)),
  );
  if (responsibilityOverlapPercent >= 70) {
    scopeScore = Math.max(scopeScore, 80);
  }

  const domainTagsBaseline = detectDomainTags(normalizedBaselineText);
  const domainTagsRole = detectDomainTags(normalizedJobText);
  const domainScore = computeDomainScore(domainTagsBaseline, domainTagsRole);

  const baselineBand = inferLeadershipBand(normalizedBaselineText);
  const roleBand = inferLeadershipBand(normalizedJobText);
  const bandDelta = Math.abs(baselineBand - roleBand);
  const leadershipScore = bandDelta <= 1 ? 100 : bandDelta === 2 ? 80 : 60;

  const strategyMatchesJob = countPatternMatches(
    normalizedJobText,
    STRATEGY_PATTERNS,
  );
  const strategyMatchesBaseline = countPatternMatches(
    normalizedBaselineText,
    STRATEGY_PATTERNS,
  );
  let strategyScore: number;
  if (strategyMatchesJob === 0) {
    strategyScore = strategyMatchesBaseline > 0 ? 50 : 0;
  } else {
    const ratio = Math.min(1, strategyMatchesBaseline / strategyMatchesJob);
    strategyScore = Math.round(ratio * 100);
  }

  const executionMatchesJob = countPatternMatches(
    normalizedJobText,
    EXECUTION_PATTERNS,
  );
  const executionMatchesBaseline = countPatternMatches(
    normalizedBaselineText,
    EXECUTION_PATTERNS,
  );
  let executionScore: number;
  if (executionMatchesJob === 0) {
    executionScore = executionMatchesBaseline > 0 ? 60 : 40;
  } else {
    const ratio = Math.min(1, executionMatchesBaseline / executionMatchesJob);
    executionScore = Math.round(ratio * 100);
  }

  const toolingCoverage = evaluateToolCoverage(jobText, baselineText);
  const rawToolingScore = clamp(
    Math.round(
      toolingCoverage.requiredCoverage * 70 +
        toolingCoverage.preferredCoverage * 30,
    ),
  );
  const hasMissingHardTools = HARD_TOOL_GUARDS.some(
    (term) =>
      normalizedJobText.includes(term) &&
      !normalizedBaselineText.includes(term),
  );
  const toolingScore = hasMissingHardTools ? 0 : rawToolingScore;
  const toolingMismatchPenalty = hasMissingHardTools ? 15 : 0;

  let totalScore =
    scopeScore * 0.35 +
    leadershipScore * 0.25 +
    domainScore * 0.15 +
    strategyScore * 0.1 +
    executionScore * 0.1 +
    toolingScore * 0.05;
  totalScore -= toolingMismatchPenalty;

  let selfSimilarityApplied = false;
  let selfSimilarityFloor = 0;
  if (scopeScore >= 75 && leadershipScore >= 75 && domainScore >= 70) {
    selfSimilarityApplied = true;
    selfSimilarityFloor = 85;
    totalScore = Math.max(totalScore, 85);
  }

  const missingOwnershipRequirements = OWNERSHIP_GAP_INDICATORS.filter(
    (term) =>
      normalizedJobText.includes(term) &&
      !normalizedBaselineText.includes(term),
  );
  let stretchDampenerApplied = false;
  let stretchDampenerPoints = 0;
  if (missingOwnershipRequirements.length > 0) {
    stretchDampenerApplied = true;
    stretchDampenerPoints = Math.min(
      12,
      5 + (missingOwnershipRequirements.length - 1) * 3,
    );
    totalScore -= stretchDampenerPoints;
  }

  let finalScore = clamp(Math.round(totalScore));
  let toolingFloorApplied = false;
  if (scopeScore >= 70 && leadershipScore >= 70 && finalScore < 70) {
    toolingFloorApplied = true;
    finalScore = 70;
  }

  return {
    score: finalScore,
    components: {
      scope: scopeScore,
      leadership: leadershipScore,
      domain: domainScore,
      strategy: strategyScore,
      execution: executionScore,
      tooling: toolingScore,
    },
    adjustments: {
      selfSimilarityApplied,
      selfSimilarityFloor,
      stretchDampenerApplied,
      stretchDampenerPoints,
      toolingFloorApplied,
    },
    bands: {
      baselineBand: `L${baselineBand}`,
      roleBand: `L${roleBand}`,
      bandDelta,
    },
    debug: {
      domainTagsBaseline,
      domainTagsRole,
      responsibilityOverlapPercent: Math.round(responsibilityOverlapPercent),
      baselineCoveragePercent: Math.round(baselineCoveragePercent),
    },
  };
};
