export type StrengtheningImpactType =
  | 'new_match'
  | 'strengthened_match'
  | 'no_match'
  | 'low_quality'
  | 'duplicate';

export type StrengtheningImpactResult = {
  impactType: StrengtheningImpactType;
  scoreDelta: number;
  explanation: string;
  matchedRequirement: string | null;
};

const ACTION_VERBS = [
  'led',
  'owned',
  'improved',
  'built',
  'designed',
  'implemented',
  'reduced',
  'increased',
  'created',
  'delivered',
  'launched',
  'managed',
  'coordinated',
  'scaled',
  'optimized',
  'streamlined',
  'restructured',
  'transformed',
  'ran',
  'drove',
  'improved',
];

const CONTEXT_WORDS = [
  'team',
  'teams',
  'customer',
  'customers',
  'system',
  'systems',
  'platform',
  'platforms',
  'workflow',
  'workflows',
  'program',
  'programs',
  'project',
  'projects',
  'scale',
  'enterprise',
  'sla',
  'csat',
  'domain',
  'ops',
  'operations',
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string) {
  return normalize(text)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

function jaccardSimilarity(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function hasActionVerb(text: string) {
  const normalized = normalize(text);
  return ACTION_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`).test(normalized));
}

function hasSpecificity(text: string) {
  return /\b\d+(\.\d+)?%?\b/.test(text) || /\b(weeks?|months?|quarter|quarterly|annual|annually|latency|backlog|csat|sla|revenue|volume|users?|customers?|tickets?|incidents?)\b/i.test(text);
}

function hasContext(text: string) {
  const normalized = normalize(text);
  return CONTEXT_WORDS.some((word) => new RegExp(`\\b${word}\\b`).test(normalized));
}

function qualityScore(text: string) {
  let score = 0;
  if (hasActionVerb(text)) score += 1;
  if (hasSpecificity(text)) score += 1;
  if (hasContext(text)) score += 1;
  return score;
}

function keywordOverlap(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap;
}

export function classifyStrengtheningImpact(params: {
  addition: string;
  existingEvidence: string[];
  unmetRequirements: string[];
}): StrengtheningImpactResult {
  const addition = params.addition.trim();
  const evidence = params.existingEvidence;
  const gaps = params.unmetRequirements;

  const strongestDuplicateSimilarity = evidence.reduce(
    (best, existing) => Math.max(best, jaccardSimilarity(addition, existing)),
    0,
  );
  if (strongestDuplicateSimilarity >= 0.82) {
    return {
      impactType: 'duplicate',
      scoreDelta: 0,
      matchedRequirement: null,
      explanation: 'This addition appears to already be covered by existing baseline evidence.',
    };
  }

  const quality = qualityScore(addition);
  if (quality < 2) {
    return {
      impactType: 'low_quality',
      scoreDelta: 0,
      matchedRequirement: null,
      explanation:
        'This addition is too vague to affect scoring yet. Add a specific action, context, or measurable detail.',
    };
  }

  const matchedRequirement = gaps
    .map((gap) => ({
      gap,
      overlap: keywordOverlap(addition, gap),
      similarity: jaccardSimilarity(addition, gap),
    }))
    .filter((entry) => entry.overlap > 0 || entry.similarity >= 0.2)
    .sort((left, right) => right.overlap - left.overlap || right.similarity - left.similarity)[0];

  if (!matchedRequirement) {
    return {
      impactType: 'no_match',
      scoreDelta: 0,
      matchedRequirement: null,
      explanation:
        'This addition was saved, but it did not map to an unmet job requirement yet.',
    };
  }

  const relatedEvidenceSimilarity = evidence.reduce(
    (best, existing) => Math.max(best, jaccardSimilarity(addition, existing)),
    0,
  );
  if (relatedEvidenceSimilarity >= 0.25) {
    return {
      impactType: 'strengthened_match',
      scoreDelta: 2,
      matchedRequirement: matchedRequirement.gap,
      explanation: `This strengthens an existing requirement match: ${matchedRequirement.gap}`,
    };
  }

  return {
    impactType: 'new_match',
    scoreDelta: 3,
    matchedRequirement: matchedRequirement.gap,
    explanation: `This addition matched a previously unmet requirement: ${matchedRequirement.gap}`,
  };
}
