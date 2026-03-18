export type ScoreAdjustmentType =
  | 'none'
  | 'role_track_cap'
  | 'core_function_cap'
  | 'seniority_cap'
  | 'domain_penalty'
  | 'combined';

type RoleFamily =
  | 'support_ops'
  | 'product'
  | 'engineering_infra'
  | 'game_design'
  | 'data_science'
  | 'sales'
  | 'marketing'
  | 'other';

export type FitScoreAdjustmentInput = {
  rawScore: number;
  jobTitle?: string | null;
  jobDescription?: string | null;
  normalizedResponsibilities?: string[] | null;
  normalizedRequirements?: string[] | null;
};

export type FitScoreAdjustmentResult = {
  rawScore: number;
  adjustedScore: number;
  scoreAdjustmentApplied: boolean;
  scoreAdjustmentReasons: string[];
  scoreAdjustmentSummary: string | null;
  scoreAdjustmentType: ScoreAdjustmentType;
};

const SUPPORT_OPS_KEYWORDS = [
  'support',
  'customer support',
  'customer operations',
  'customer experience',
  'cx operations',
  'support operations',
  'technical support',
  'service operations',
  'incident management',
  'incident operations',
  'customer service operations',
  'global support',
  'support strategy',
  'support programs',
];

const PRODUCT_KEYWORDS = [
  'product manager',
  'product management',
  'group product manager',
  'principal product manager',
  'product owner',
];

const ENGINEERING_KEYWORDS = [
  'software engineer',
  'software engineering',
  'platform engineer',
  'sre',
  'devops',
  'network operations',
  'noc',
  'infrastructure engineer',
  'systems engineer',
];

const GAME_DESIGN_KEYWORDS = [
  'game designer',
  'economy designer',
  'live operations designer',
  'monetization designer',
  'systems designer',
  'game design',
  'game economy',
];

const DATA_KEYWORDS = ['data scientist', 'data science', 'machine learning engineer'];
const SALES_KEYWORDS = ['account executive', 'sales manager', 'sales director', 'sales'];
const MARKETING_KEYWORDS = ['marketing manager', 'marketing director', 'growth marketing'];

const DOWNLEVEL_KEYWORDS = [
  'associate',
  'junior',
  'mid level',
  'specialist',
  'individual contributor',
  'ic ',
  'coordinator',
];

const LEADERSHIP_KEYWORDS = [
  'manager',
  'senior manager',
  'director',
  'head of',
  'vice president',
  'vp',
  'chief',
];

const PRODUCT_CORE_KEYWORDS = ['roadmap', 'product strategy', 'product definition', 'product discovery'];
const ENGINEERING_CORE_KEYWORDS = ['build features', 'write code', 'software delivery', 'production systems'];
const INFRA_CORE_KEYWORDS = ['site reliability', 'on call', 'infrastructure', 'platform reliability', 'incident commander'];
const GAME_CORE_KEYWORDS = ['monetization systems', 'game economy', 'game systems'];

const DOMAIN_MISMATCH_KEYWORDS = [
  'gaming',
  'game studio',
  'fintech',
  'payments platform',
  'infrastructure vendor',
];

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalize(input?: string | null) {
  return (input ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyRoleFamily(jobTitleText: string, combinedText: string): RoleFamily {
  if (includesAny(jobTitleText, SUPPORT_OPS_KEYWORDS)) return 'support_ops';
  if (includesAny(jobTitleText, PRODUCT_KEYWORDS)) return 'product';
  if (includesAny(jobTitleText, ENGINEERING_KEYWORDS)) return 'engineering_infra';
  if (includesAny(jobTitleText, GAME_DESIGN_KEYWORDS)) return 'game_design';
  if (includesAny(jobTitleText, DATA_KEYWORDS)) return 'data_science';
  if (includesAny(jobTitleText, SALES_KEYWORDS)) return 'sales';
  if (includesAny(jobTitleText, MARKETING_KEYWORDS)) return 'marketing';

  if (includesAny(combinedText, SUPPORT_OPS_KEYWORDS)) return 'support_ops';
  if (includesAny(combinedText, PRODUCT_KEYWORDS)) return 'product';
  if (includesAny(combinedText, ENGINEERING_KEYWORDS)) return 'engineering_infra';
  if (includesAny(combinedText, GAME_DESIGN_KEYWORDS)) return 'game_design';
  if (includesAny(combinedText, DATA_KEYWORDS)) return 'data_science';
  if (includesAny(combinedText, SALES_KEYWORDS)) return 'sales';
  if (includesAny(combinedText, MARKETING_KEYWORDS)) return 'marketing';

  return 'other';
}

function roleFamilyLabel(family: RoleFamily): string {
  switch (family) {
    case 'product':
      return 'Product';
    case 'engineering_infra':
      return 'Engineering';
    case 'game_design':
      return 'Game Design';
    case 'data_science':
      return 'Data Science';
    case 'sales':
      return 'Sales';
    case 'marketing':
      return 'Marketing';
    case 'support_ops':
      return 'Support Operations';
    default:
      return 'a different role track';
  }
}

export function applyFitScoreAdjustment(
  input: FitScoreAdjustmentInput,
): FitScoreAdjustmentResult {
  const rawScore = Math.max(0, Math.min(100, Math.round(input.rawScore)));
  const title = normalize(input.jobTitle);
  const body = normalize(input.jobDescription);
  const responsibilities = normalize((input.normalizedResponsibilities ?? []).join(' '));
  const requirements = normalize((input.normalizedRequirements ?? []).join(' '));
  const combined = [title, body, responsibilities, requirements].filter(Boolean).join(' ');

  const family = classifyRoleFamily(title, combined);
  const reasons: string[] = [];
  const caps: Array<{ type: ScoreAdjustmentType; value: number }> = [];

  if (
    family === 'product' ||
    family === 'engineering_infra' ||
    family === 'game_design' ||
    family === 'data_science' ||
    family === 'sales' ||
    family === 'marketing'
  ) {
    caps.push({ type: 'role_track_cap', value: 65 });
    reasons.push(
      `Role track differs from your baseline focus. This role is centered on ${roleFamilyLabel(
        family,
      )} rather than Support Operations.`,
    );
  }

  const coreFunctionMismatch =
    includesAny(combined, PRODUCT_CORE_KEYWORDS) ||
    includesAny(combined, ENGINEERING_CORE_KEYWORDS) ||
    includesAny(combined, INFRA_CORE_KEYWORDS) ||
    includesAny(combined, GAME_CORE_KEYWORDS);

  if (coreFunctionMismatch && family !== 'support_ops') {
    caps.push({ type: 'core_function_cap', value: 60 });
    reasons.push(
      'Core function differs from your background. This role is primarily focused outside customer and support operations leadership.',
    );
  }

  const looksDownlevel = includesAny(combined, DOWNLEVEL_KEYWORDS);
  const hasLeadershipScope = includesAny(combined, LEADERSHIP_KEYWORDS);
  if (looksDownlevel && !hasLeadershipScope) {
    caps.push({ type: 'seniority_cap', value: 70 });
    reasons.push(
      'Level alignment is weaker. This role appears materially downlevel relative to your recent leadership scope.',
    );
  }

  let adjusted = rawScore;
  let appliedType: ScoreAdjustmentType = 'none';
  if (caps.length) {
    const strictest = caps.reduce((best, current) =>
      current.value < best.value ? current : best,
    );
    adjusted = Math.min(adjusted, strictest.value);
    appliedType = caps.length > 1 ? 'combined' : strictest.type;
  }

  const shouldApplyDomainPenalty =
    !caps.length &&
    rawScore <= 78 &&
    includesAny(combined, DOMAIN_MISMATCH_KEYWORDS) &&
    family !== 'support_ops';
  if (shouldApplyDomainPenalty) {
    adjusted = Math.max(0, adjusted - 10);
    reasons.push(
      'Some transferable skills exist, but the overall role direction is outside your likely target path.',
    );
    appliedType = appliedType === 'none' ? 'domain_penalty' : 'combined';
  }

  const scoreAdjustmentApplied = adjusted !== rawScore;
  const scoreAdjustmentSummary = scoreAdjustmentApplied
    ? reasons[reasons.length - 1] ??
      'Raw overlap scored higher, but this role was adjusted for realistic role alignment.'
    : null;

  return {
    rawScore,
    adjustedScore: adjusted,
    scoreAdjustmentApplied,
    scoreAdjustmentReasons: scoreAdjustmentApplied ? reasons : [],
    scoreAdjustmentSummary,
    scoreAdjustmentType: scoreAdjustmentApplied ? appliedType : 'none',
  };
}
