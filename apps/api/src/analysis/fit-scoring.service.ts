import { Injectable } from '@nestjs/common';
import { FitAssessmentVerdict, FitDimensionScores } from './fit-assessment.entity';

export type FitScoringInput = {
  job: {
    title?: string | null;
    company?: string | null;
    rawDescription: string;
    normalizedResponsibilities: string[];
    normalizedRequirements: string[];
    sourceUrl?: string | null;
  };
  baseline: {
    version?: number | null;
    sections: Array<{ type?: string; content: string }>;
  };
};

export type DimensionWeightOverrides = Partial<Record<keyof FitDimensionScores, number>>;

export type FitScoringResult = {
  overallScore: number;
  verdict: FitAssessmentVerdict;
  dimensionScores: FitDimensionScores;
  strengths: string[];
  gaps: string[];
  complianceFlags: string[];
  summary: string;
};

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'their',
  'they',
  'this',
  'to',
  'we',
  'with',
  'will',
  'you',
  'your',
]);

const LEADERSHIP_CUES = [
  'lead',
  'leader',
  'leading',
  'mentor',
  'mentoring',
  'manage',
  'manager',
  'management',
  'stakeholder',
  'roadmap',
  'strategy',
  'strategic',
  'cross functional',
  'ownership',
  'program',
  'drive',
];

const TECH_TOKENS = [
  'aws',
  'azure',
  'gcp',
  'kubernetes',
  'k8s',
  'docker',
  'terraform',
  'ansible',
  'jenkins',
  'github',
  'gitlab',
  'ci',
  'cd',
  'cicd',
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
  'terraform',
  'helm',
  'prometheus',
  'grafana',
];

const TECH_PHRASES = [
  'github actions',
  'gitlab ci',
  'ci cd',
  'continuous integration',
  'continuous delivery',
  'lambda',
  'cloudformation',
  'cloud formation',
  'ecs',
  'eks',
  'fargate',
  's3',
  'rds',
  'bigquery',
];

const INDUSTRY_TERMS = [
  'healthcare',
  'health care',
  'finance',
  'financial',
  'banking',
  'retail',
  'ecommerce',
  'government',
  'public sector',
  'regulated',
  'hipaa',
  'soc2',
  'pci',
  'gdpr',
  'fedramp',
];

const STRATEGIC_CUES = [
  'strategy',
  'strategic',
  'roadmap',
  'vision',
  'okr',
  'planning',
  'architecture',
  'architect',
  'portfolio',
  'stakeholder',
  'business',
];

const TACTICAL_CUES = [
  'tickets',
  'break fix',
  'on call',
  'oncall',
  'patching',
  'runbook',
  'incident',
  'monitoring',
  'support',
  'operations',
  'sprint',
  'backlog',
];

const VERDICT_THRESHOLDS = {
  APPLY: 80,
  CONSIDER: 60,
};

const MIN_TEXT_LENGTH = 200;

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (text: string) => {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
};

const buildBigrams = (tokens: string[]) => {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const first = tokens[i];
    const second = tokens[i + 1];
    if (first && second) {
      bigrams.push(`${first} ${second}`);
    }
  }
  return bigrams;
};

const toFrequencyMap = (tokens: string[]) => {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
};

const mergeFrequency = (base: Map<string, number>, extra: Map<string, number>) => {
  for (const [key, value] of extra.entries()) {
    base.set(key, (base.get(key) ?? 0) + value);
  }
  return base;
};

const sortByFrequency = (freq: Map<string, number>) =>
  [...freq.keys()].sort((a, b) => {
    const delta = (freq.get(b) ?? 0) - (freq.get(a) ?? 0);
    if (delta !== 0) return delta;
    return a.localeCompare(b);
  });

const containsPhrase = (text: string, phrase: string) => {
  if (!phrase.includes(' ')) return text.includes(phrase);
  return text.includes(phrase);
};

const countCueMatches = (text: string, cues: string[]) => {
  const normalized = normalizeText(text);
  let count = 0;
  for (const cue of cues) {
    if (containsPhrase(normalized, cue)) count += 1;
  }
  return count;
};

const buildSectionText = (sections: FitScoringInput['baseline']['sections'], types: string[]) => {
  return sections
    .filter((section) => section.content)
    .filter((section) =>
      section.type ? types.includes(section.type.toUpperCase()) : false,
    )
    .map((section) => section.content)
    .join('\n');
};

const collectTokens = (texts: string[]) => {
  const tokens: string[] = [];
  for (const text of texts) {
    tokens.push(...tokenize(text));
  }
  return tokens;
};

const buildTermFrequencies = (texts: string[]) => {
  const tokens = collectTokens(texts);
  const bigrams = buildBigrams(tokens);
  const freq = toFrequencyMap(tokens);
  mergeFrequency(freq, toFrequencyMap(bigrams));
  for (const term of TECH_TOKENS) {
    if (freq.has(term)) {
      freq.set(term, (freq.get(term) ?? 0) + 2);
    }
  }
  for (const phrase of TECH_PHRASES) {
    if (texts.some((text) => normalizeText(text).includes(phrase))) {
      freq.set(phrase, (freq.get(phrase) ?? 0) + 2);
    }
  }
  return freq;
};

const buildTermSet = (texts: string[]) => {
  const tokens = collectTokens(texts);
  const bigrams = buildBigrams(tokens);
  return new Set([...tokens, ...bigrams]);
};

const extractTechTerms = (texts: string[]) => {
  const normalizedText = texts.map((text) => normalizeText(text)).join(' ');
  const found = new Set<string>();
  for (const token of TECH_TOKENS) {
    if (normalizedText.includes(token)) found.add(token);
  }
  for (const phrase of TECH_PHRASES) {
    if (normalizedText.includes(phrase)) found.add(phrase);
  }
  return [...found];
};

const scoreOverlap = (terms: string[], baselineText: string) => {
  if (terms.length === 0) return 0;
  const baselineSet = buildTermSet([baselineText]);
  const matched = terms.filter((term) => baselineSet.has(term));
  return Math.round((matched.length / terms.length) * 100);
};

const scoreLeadership = (jobText: string, baselineText: string) => {
  const jobCount = countCueMatches(jobText, LEADERSHIP_CUES);
  if (jobCount === 0) return 60;
  const baselineCount = countCueMatches(baselineText, LEADERSHIP_CUES);
  const ratio = Math.min(baselineCount / jobCount, 1);
  return Math.round(ratio * 100);
};

const scoreIndustry = (jobText: string, baselineText: string) => {
  const jobCount = countCueMatches(jobText, INDUSTRY_TERMS);
  if (jobCount === 0) return 60;
  const baselineCount = countCueMatches(baselineText, INDUSTRY_TERMS);
  const ratio = Math.min(baselineCount / jobCount, 1);
  return Math.round(ratio * 100);
};

const scoreStrategicTactical = (jobText: string, baselineText: string) => {
  const jobStrategic = countCueMatches(jobText, STRATEGIC_CUES);
  const jobTactical = countCueMatches(jobText, TACTICAL_CUES);
  const jobTotal = jobStrategic + jobTactical;
  if (jobTotal === 0) return 60;

  const baselineStrategic = countCueMatches(baselineText, STRATEGIC_CUES);
  const baselineTactical = countCueMatches(baselineText, TACTICAL_CUES);
  const baselineTotal = baselineStrategic + baselineTactical;
  const jobOrientation = jobTotal === 0 ? 0 : (jobStrategic - jobTactical) / jobTotal;
  const baselineOrientation =
    baselineTotal === 0 ? 0 : (baselineStrategic - baselineTactical) / baselineTotal;
  const diff = Math.abs(jobOrientation - baselineOrientation);
  const score = Math.max(0, Math.min(100, Math.round((1 - diff / 2) * 100)));
  return score;
};

const scoreTechnicalFit = (jobText: string, baselineText: string) => {
  const terms = extractTechTerms([jobText]);
  if (terms.length === 0) return 60;
  const baselineSet = buildTermSet([baselineText]);
  const matched = terms.filter((term) => baselineSet.has(term));
  return Math.round((matched.length / terms.length) * 100);
};

const scoreExperienceAlignment = (
  responsibilitiesText: string,
  requirementsText: string,
  baselineExperienceText: string,
) => {
  const responsibilitiesTerms = sortByFrequency(
    buildTermFrequencies([responsibilitiesText]),
  );
  const requirementsTerms = sortByFrequency(buildTermFrequencies([requirementsText]));

  const responsibilitiesScore = scoreOverlap(
    responsibilitiesTerms,
    baselineExperienceText,
  );
  const requirementsScore = scoreOverlap(requirementsTerms, baselineExperienceText);

  if (responsibilitiesTerms.length > 0 && requirementsTerms.length > 0) {
    return Math.round(responsibilitiesScore * 0.7 + requirementsScore * 0.3);
  }

  if (responsibilitiesTerms.length > 0) return responsibilitiesScore;
  if (requirementsTerms.length > 0) return requirementsScore;
  return 0;
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const buildStrengthsAndGaps = (
  requirementText: string,
  responsibilityText: string,
  fallbackText: string,
  baselineText: string,
) => {
  const requirementFreq = buildTermFrequencies([requirementText]);
  const responsibilityFreq = buildTermFrequencies([responsibilityText]);
  const fallbackFreq = buildTermFrequencies([fallbackText]);

  const hasRequirements = requirementFreq.size > 0;
  const hasResponsibilities = responsibilityFreq.size > 0;

  const prioritizedFreq = new Map<string, number>();
  if (hasRequirements) mergeFrequency(prioritizedFreq, requirementFreq);
  if (hasResponsibilities) mergeFrequency(prioritizedFreq, responsibilityFreq);
  if (!hasRequirements && !hasResponsibilities) mergeFrequency(prioritizedFreq, fallbackFreq);

  const sortedTerms = sortByFrequency(prioritizedFreq);
  const baselineSet = buildTermSet([baselineText]);

  const strengths: string[] = [];
  const gaps: string[] = [];

  for (const term of sortedTerms) {
    if (strengths.length >= 10 && gaps.length >= 10) break;
    if (baselineSet.has(term)) {
      if (!strengths.includes(term) && strengths.length < 10) strengths.push(term);
    } else if (!gaps.includes(term) && gaps.length < 10) {
      gaps.push(term);
    }
  }

  return { strengths: strengths.slice(0, 8), gaps: gaps.slice(0, 8) };
};

const buildSummary = (strengths: string[], gaps: string[]) => {
  if (strengths.length === 0 && gaps.length === 0) {
    return 'No keywords found in the job description.';
  }
  const total = strengths.length + gaps.length;
  return `Matched ${strengths.length} of ${total} key terms from the job description.`;
};

const computeComplianceFlags = (
  jobText: string,
  baselineText: string,
  sourceUrl?: string | null,
) => {
  const flags: string[] = [];

  if (baselineText.trim().length < MIN_TEXT_LENGTH) {
    flags.push('Baseline too short for reliable scoring');
  }

  if (jobText.trim().length < MIN_TEXT_LENGTH) {
    flags.push('Job description too short for reliable scoring');
  }

  const normalizedJob = normalizeText(jobText);
  const promptSignals = ['ignore previous instructions', 'system prompt', 'assistant', 'developer message'];
  if (promptSignals.some((signal) => normalizedJob.includes(signal))) {
    flags.push('Job description contains prompt-like content');
  }

  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    flags.push('Suspicious job source URL');
  }

  return flags;
};

const buildVerdict = (overallScore: number) => {
  if (overallScore >= VERDICT_THRESHOLDS.APPLY) return FitAssessmentVerdict.APPLY;
  if (overallScore >= VERDICT_THRESHOLDS.CONSIDER) return FitAssessmentVerdict.CONSIDER;
  return FitAssessmentVerdict.SKIP;
};

@Injectable()
export class FitScoringService {
  score(
    input: FitScoringInput,
    dimensionWeights?: DimensionWeightOverrides | null,
  ): FitScoringResult {
    const jobText = [
      input.job.title ?? '',
      input.job.company ?? '',
      input.job.rawDescription,
      ...input.job.normalizedResponsibilities,
      ...input.job.normalizedRequirements,
    ].join('\n');

    const baselineText = input.baseline.sections.map((section) => section.content).join('\n');
    const baselineSkillsText =
      buildSectionText(input.baseline.sections, ['SKILLS']) || baselineText;
    const baselineExperienceText =
      buildSectionText(input.baseline.sections, ['EXPERIENCE', 'PROJECT', 'SUMMARY']) ||
      baselineText;

    const responsibilitiesText = input.job.normalizedResponsibilities.join('\n');
    const requirementsText = input.job.normalizedRequirements.join('\n');

    const experienceAlignment = scoreExperienceAlignment(
      responsibilitiesText,
      requirementsText,
      baselineExperienceText,
    );
    const leadershipLevel = scoreLeadership(jobText, baselineText);
    const technicalPlatformFit = scoreTechnicalFit(jobText, baselineSkillsText);
    const industryContext = scoreIndustry(jobText, baselineText);
    const strategicTacticalFit = scoreStrategicTactical(jobText, baselineExperienceText);

    const dimensionScores: FitDimensionScores = {
      experienceAlignment,
      leadershipLevel,
      technicalPlatformFit,
      industryContext,
      strategicTacticalFit,
    };

    const defaultWeights: Record<keyof FitDimensionScores, number> = {
      experienceAlignment: 0.3,
      technicalPlatformFit: 0.25,
      leadershipLevel: 0.2,
      strategicTacticalFit: 0.15,
      industryContext: 0.1,
    };

    const appliedWeights: Record<keyof FitDimensionScores, number> = {
      experienceAlignment: dimensionWeights?.experienceAlignment ?? 1,
      technicalPlatformFit: dimensionWeights?.technicalPlatformFit ?? 1,
      leadershipLevel: dimensionWeights?.leadershipLevel ?? 1,
      strategicTacticalFit: dimensionWeights?.strategicTacticalFit ?? 1,
      industryContext: dimensionWeights?.industryContext ?? 1,
    };

    const weightedDefaults = (Object.keys(defaultWeights) as Array<keyof FitDimensionScores>)
      .map((key) => ({
        key,
        weight: defaultWeights[key] * appliedWeights[key],
      }))
      .reduce(
        (acc, { key, weight }) => {
          acc.total += weight;
          acc.values[key] = weight;
          return acc;
        },
        { total: 0, values: {} as Record<keyof FitDimensionScores, number> },
      );

    const normalizedTotal =
      weightedDefaults.total > 0
        ? weightedDefaults.total
        : (Object.values(defaultWeights).reduce((sum, value) => sum + value, 0));

    const overallScore = clampScore(
      (experienceAlignment * weightedDefaults.values.experienceAlignment +
        technicalPlatformFit * weightedDefaults.values.technicalPlatformFit +
        leadershipLevel * weightedDefaults.values.leadershipLevel +
        strategicTacticalFit * weightedDefaults.values.strategicTacticalFit +
        industryContext * weightedDefaults.values.industryContext) /
        normalizedTotal,
    );

    const { strengths, gaps } = buildStrengthsAndGaps(
      requirementsText,
      responsibilitiesText,
      jobText,
      baselineText,
    );

    const complianceFlags = computeComplianceFlags(
      jobText,
      baselineText,
      input.job.sourceUrl,
    );

    return {
      overallScore,
      verdict: buildVerdict(overallScore),
      dimensionScores,
      strengths,
      gaps,
      complianceFlags,
      summary: buildSummary(strengths, gaps),
    };
  }

  buildComplianceFlags(jobText: string, baselineText: string, sourceUrl?: string | null) {
    return computeComplianceFlags(jobText, baselineText, sourceUrl);
  }
}

// VERIFY:
// - Weighted aggregation uses per-dimension overrides and defaults to 1.0 when absent.
// - Verdict thresholds remain aligned with the weighted overall score.
