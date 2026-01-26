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

const buildTokenRegex = (token: string) => {
  const segments = token
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
};

export const extractJobToolRequirements = (
  jobText: string,
): ToolRequirements => {
  const normalized = normalizeText(jobText);
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

export const evaluateToolCoverage = (
  jobText: string,
  baselineText: string,
): ToolCoverage => {
  const normalizedBaseline = normalizeText(baselineText);
  const requirements = extractJobToolRequirements(jobText);

  const matchedRequired: string[] = [];
  const matchedPreferred = new Set<string>();
  const missingRequired: string[] = [];

  const baselineHasTicketing = hasTicketingReference(normalizedBaseline);

  for (const term of requirements.required) {
    if (containsTerm(normalizedBaseline, term)) {
      matchedRequired.push(term);
    } else if (term.includes('servicenow') && baselineHasTicketing) {
      matchedPreferred.add(term);
    } else {
      missingRequired.push(term);
    }
  }

  for (const term of requirements.preferred) {
    if (containsTerm(normalizedBaseline, term)) {
      matchedPreferred.add(term);
    } else if (term.includes('servicenow') && baselineHasTicketing) {
      matchedPreferred.add(term);
    }
  }

  const requiredCoverage =
    requirements.required.length === 0
      ? 1
      : matchedRequired.length / requirements.required.length;

  const preferredCoverage =
    requirements.preferred.length === 0
      ? 0
      : matchedPreferred.size / requirements.preferred.length;

  return {
    matchedRequired,
    matchedPreferred: [...matchedPreferred],
    missingRequired,
    requiredCoverage,
    preferredCoverage,
  };
};
