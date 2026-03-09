import { BaselineIncludePolicy, BaselineSection } from '../baseline/baseline-section.entity';
import {
  BaselineEvidenceTermInventory,
  ClaimRiskResult,
  detectClaimRiskForBullet,
} from './claim-risk';

export type ResumeDraftBulletConfidence = 'High' | 'Medium' | 'Low';

export interface ResumeDraftBulletSource {
  baselineSectionId: string;
  baselineSectionType: string;
  baselineSectionOrder: number;
  bulletIndex: number;
}

export interface ResumeDraftBullet {
  id: string;
  text: string;
  source: ResumeDraftBulletSource;
  confidence: ResumeDraftBulletConfidence;
  keywordOverlapCount?: number;
  relevance?: {
    totalScore: number;
    matchedTerms: string[];
    matchedPhrases: string[];
    matchedCategories: string[];
  };
  claimRisk: ClaimRiskResult;
}

export interface ResumeDraftSection {
  id: string;
  type: string;
  title: string | null;
  order: number;
  includePolicy: string;
  source: 'baseline';
  bullets: ResumeDraftBullet[];
  content: string;
  rawContent?: string;
}

type ResumeDraftGapGuidance = {
  strengthSignals?: string[];
  gapSignals?: string[];
};

type JobSignalCategory =
  | 'leadership'
  | 'operations'
  | 'incident'
  | 'process'
  | 'kpi'
  | 'automation'
  | 'platform'
  | 'domain';

type JobSignalSet = {
  keywordWeights: Map<string, number>;
  phraseWeights: Map<string, number>;
  categoryTerms: Map<JobSignalCategory, Set<string>>;
  extractionStrength: number;
  isWeak: boolean;
};

const ACTION_VERB_PATTERN =
  /\b(led|built|owned|reduced|improved|delivered|implemented|optimized|launched|scaled|managed|drove|created|designed|mentored|automated)\b/i;
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
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'you',
  'your',
  'our',
  'their',
  'this',
  'those',
  'these',
  'into',
  'over',
  'under',
  'about',
  'than',
  'then',
  'also',
]);

const BULLET_LINE_PATTERN =
  /^\s*(?:[-*•●◦▪▹►‣]\s+|(?:\(?\d{1,3}\)?[.)])\s+|(?:[a-zA-Z][.)])\s+)(.+)$/;

function buildNoClaimRiskResult(): ClaimRiskResult {
  return {
    level: 'None',
    flaggedTerms: [],
  };
}

function normalizeLine(line: string) {
  return line.replace(/\u00a0/g, ' ').trim();
}

function lineLooksLikeHeaderFragment(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.length < 15) return true;
  const words = trimmed.split(/\s+/);
  if (words.length <= 2 && !ACTION_VERB_PATTERN.test(trimmed)) return true;
  if (/^[A-Z\s/&-]+:?$/.test(trimmed)) return true;
  return false;
}

export function inferBulletConfidence(text: string): ResumeDraftBulletConfidence {
  const length = text.trim().length;
  if (!length) return 'Low';
  if (length < 15 || lineLooksLikeHeaderFragment(text)) return 'Low';
  if (length >= 25 && length <= 220 && ACTION_VERB_PATTERN.test(text)) return 'High';
  return 'Medium';
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length >= 3 && !STOPWORDS.has(token),
  );
}

const ROLE_HEADER_PATTERN =
  /\b(?:director|head|manager|lead|engineer|architect|consultant|specialist|analyst|program)\b/i;
const DATE_HINT_PATTERN =
  /\b(?:19|20)\d{2}\b|\b(?:present|current)\b|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i;
const HEADING_HINT_PATTERN =
  /^(?:responsibilities|requirements|qualifications|preferred|must have|what you(?:'|’)ll do|about the role)/i;

const CATEGORY_TERM_SETS: Record<JobSignalCategory, string[]> = {
  leadership: ['lead', 'leadership', 'mentor', 'manager', 'director', 'head', 'coach', 'owner'],
  operations: ['operations', 'operational', 'support', 'service', 'workflow', 'delivery'],
  incident: ['incident', 'escalation', 'outage', 'response', 'sev', 'postmortem', 'oncall'],
  process: ['process', 'playbook', 'standard', 'governance', 'quality', 'sop', 'improvement'],
  kpi: ['kpi', 'sla', 'csat', 'metric', 'dashboard', 'performance', 'target'],
  automation: ['automation', 'automate', 'script', 'scripting', 'integrations', 'orchestration'],
  platform: ['salesforce', 'zendesk', 'servicenow', 'jira', 'aws', 'sql', 'tableau', 'python'],
  domain: ['saas', 'enterprise', 'b2b', 'customer', 'cx', 'support', 'platform', 'operations'],
};

function extractJobSignals(jobText?: string | null): JobSignalSet {
  const normalizedText = (jobText ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalizedText) {
    return {
      keywordWeights: new Map(),
      phraseWeights: new Map(),
      categoryTerms: new Map(),
      extractionStrength: 0,
      isWeak: true,
    };
  }

  const keywordWeights = new Map<string, number>();
  const phraseWeights = new Map<string, number>();
  const categoryTerms = new Map<JobSignalCategory, Set<string>>();
  const lines = normalizedText.split('\n').map((line) => normalizeLine(line)).filter(Boolean);

  lines.forEach((line, index) => {
    const headingBoost =
      HEADING_HINT_PATTERN.test(line) || HEADING_HINT_PATTERN.test(lines[index - 1] ?? '')
        ? 1.4
        : 1;
    const tokens = tokenize(line);
    for (const token of tokens) {
      keywordWeights.set(token, (keywordWeights.get(token) ?? 0) + 1 * headingBoost);
      for (const [category, terms] of Object.entries(CATEGORY_TERM_SETS) as Array<
        [JobSignalCategory, string[]]
      >) {
        if (terms.includes(token)) {
          const existing = categoryTerms.get(category) ?? new Set<string>();
          existing.add(token);
          categoryTerms.set(category, existing);
        }
      }
    }

    for (let i = 0; i < tokens.length - 1; i += 1) {
      const pair = `${tokens[i]} ${tokens[i + 1]}`;
      phraseWeights.set(pair, (phraseWeights.get(pair) ?? 0) + 0.7 * headingBoost);
    }
    for (let i = 0; i < tokens.length - 2; i += 1) {
      const tri = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
      phraseWeights.set(tri, (phraseWeights.get(tri) ?? 0) + 0.45 * headingBoost);
    }
  });

  const rankedKeywordWeights = new Map(
    [...keywordWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60),
  );
  const rankedPhraseWeights = new Map(
    [...phraseWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 35),
  );

  const extractionStrength = [...rankedKeywordWeights.values()].reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    keywordWeights: rankedKeywordWeights,
    phraseWeights: rankedPhraseWeights,
    categoryTerms,
    extractionStrength,
    isWeak: rankedKeywordWeights.size < 5 || extractionStrength < 8,
  };
}

export function extractJobKeywords(jobText?: string | null, maxKeywords = 40): string[] {
  const signalSet = extractJobSignals(jobText);
  if (!signalSet.keywordWeights.size) return [];
  return [...signalSet.keywordWeights.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, maxKeywords)
    .map(([token]) => token);
}

function countKeywordOverlap(text: string, keywords: Set<string>) {
  if (!keywords.size) return 0;
  const bulletTokens = new Set(tokenize(text));
  let overlap = 0;
  for (const token of bulletTokens) {
    if (keywords.has(token)) overlap += 1;
  }
  return overlap;
}

function countSignalOverlap(text: string, signals: Set<string>) {
  if (!signals.size) return 0;
  const tokens = new Set(tokenize(text));
  let overlap = 0;
  for (const token of tokens) {
    if (signals.has(token)) overlap += 1;
  }
  return overlap;
}

export function splitSectionContentToBulletTexts(
  content?: string | null,
): Array<{ text: string; sourceIndex: number }> {
  const normalized = (content ?? '').replace(/\r\n/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const bullets: Array<{ text: string; sourceIndex: number }> = [];
  lines.forEach((line, index) => {
    const match = line.match(BULLET_LINE_PATTERN);
    if (!match) return;
    const text = normalizeLine(match[1] ?? '');
    if (!text) return;
    bullets.push({ text, sourceIndex: index });
  });

  if (!bullets.length) {
    const text = normalized.trim();
    if (!text) return [];
    return [{ text, sourceIndex: 0 }];
  }

  return bullets;
}

type ExperienceEntry = {
  entryIndex: number;
  bullets: Array<{ text: string; sourceIndex: number }>;
};

function looksLikeExperienceHeader(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (BULLET_LINE_PATTERN.test(trimmed)) return false;
  if (trimmed.length > 140) return false;
  return (
    trimmed.includes('|') ||
    DATE_HINT_PATTERN.test(trimmed) ||
    ROLE_HEADER_PATTERN.test(trimmed)
  );
}

function parseExperienceEntries(content?: string | null): ExperienceEntry[] {
  const normalized = (content ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').map((line) => normalizeLine(line));
  if (!lines.some((line) => BULLET_LINE_PATTERN.test(line))) {
    return [];
  }

  const entries: ExperienceEntry[] = [];
  let active: ExperienceEntry = { entryIndex: 0, bullets: [] };

  lines.forEach((line, index) => {
    const bulletMatch = line.match(BULLET_LINE_PATTERN);
    if (bulletMatch) {
      const text = normalizeLine(bulletMatch[1] ?? '');
      if (text) {
        active.bullets.push({ text, sourceIndex: index });
      }
      return;
    }

    if (line.includes('â€¢')) {
      const inlineBullets = line
        .split('â€¢')
        .map((segment) => normalizeLine(segment))
        .filter(Boolean);
      if (inlineBullets.length >= 2) {
        inlineBullets.slice(1).forEach((text) => {
          active.bullets.push({ text, sourceIndex: index });
        });
        return;
      }
    }

    if (looksLikeExperienceHeader(line)) {
      if (active.bullets.length) {
        entries.push(active);
      }
      active = {
        entryIndex: entries.length,
        bullets: [],
      };
    }
  });

  if (active.bullets.length) {
    entries.push(active);
  }

  return entries;
}

type BulletScoreResult = {
  totalScore: number;
  matchedTerms: string[];
  matchedPhrases: string[];
  matchedCategories: string[];
};

function scoreBulletRelevance(
  text: string,
  signals: JobSignalSet | null,
  strengthSignals: Set<string> | null,
  gapSignals: Set<string> | null,
): BulletScoreResult {
  const matchedTerms: string[] = [];
  const matchedPhrases: string[] = [];
  const matchedCategories: string[] = [];
  const tokens = new Set(tokenize(text));
  const lowered = text.toLowerCase();
  let totalScore = 0;

  if (signals) {
    for (const token of tokens) {
      const weight = signals.keywordWeights.get(token);
      if (!weight) continue;
      matchedTerms.push(token);
      totalScore += weight;
    }

    for (const [phrase, weight] of signals.phraseWeights.entries()) {
      if (!lowered.includes(phrase)) continue;
      matchedPhrases.push(phrase);
      totalScore += weight * 2;
    }

    for (const [category, terms] of signals.categoryTerms.entries()) {
      let matched = false;
      for (const term of terms) {
        if (tokens.has(term)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        matchedCategories.push(category);
        totalScore += 1.15;
      }
    }
  }

  const strengthOverlap = strengthSignals
    ? countSignalOverlap(text, strengthSignals)
    : 0;
  const gapOverlap = gapSignals ? countSignalOverlap(text, gapSignals) : 0;
  totalScore += strengthOverlap * 0.8;
  totalScore += gapOverlap * 0.6;

  return {
    totalScore,
    matchedTerms,
    matchedPhrases,
    matchedCategories,
  };
}

function orderBulletsByRelevance<T extends { stableIndex: number; relevanceScore: number }>(
  bullets: T[],
  shouldRank: boolean,
): T[] {
  if (!shouldRank) return [...bullets].sort((a, b) => a.stableIndex - b.stableIndex);

  const topScore = Math.max(...bullets.map((bullet) => bullet.relevanceScore));
  if (!Number.isFinite(topScore) || topScore < 0.75) {
    return [...bullets].sort((a, b) => a.stableIndex - b.stableIndex);
  }

  const tieEpsilon = 0.35;
  return [...bullets].sort((a, b) => {
    const diff = b.relevanceScore - a.relevanceScore;
    if (Math.abs(diff) <= tieEpsilon) {
      return a.stableIndex - b.stableIndex;
    }
    return diff;
  });
}

type DraftBulletBuildOptions =
  | {
      keywords?: Set<string>;
      gapGuidance?: ResumeDraftGapGuidance;
      claimRiskInventory?: BaselineEvidenceTermInventory;
      jobSignals?: JobSignalSet;
    }
  | Set<string>
  | undefined;

function normalizeBuildOptions(options?: DraftBulletBuildOptions) {
  if (options instanceof Set) {
    return {
      keywords: options,
      gapGuidance: undefined,
      claimRiskInventory: undefined,
      jobSignals: undefined,
    };
  }

  return {
    keywords: options?.keywords,
    gapGuidance: options?.gapGuidance,
    claimRiskInventory: options?.claimRiskInventory,
    jobSignals: options?.jobSignals,
  };
}

export function buildDraftBulletsForSection(
  section: Pick<BaselineSection, 'id' | 'sectionType' | 'order' | 'content'>,
  options?: DraftBulletBuildOptions,
): ResumeDraftBullet[] {
  const normalizedOptions = normalizeBuildOptions(options);
  const parsed = splitSectionContentToBulletTexts(section.content);
  const strengthSignals = normalizedOptions.gapGuidance?.strengthSignals?.length
    ? new Set(normalizedOptions.gapGuidance.strengthSignals.map((value) => value.toLowerCase()))
    : null;
  const gapSignals = normalizedOptions.gapGuidance?.gapSignals?.length
    ? new Set(normalizedOptions.gapGuidance.gapSignals.map((value) => value.toLowerCase()))
    : null;
  const jobSignals = normalizedOptions.jobSignals ?? null;
  const keywordFallback = normalizedOptions.keywords;
  const shouldRank = Boolean(
    (jobSignals && !jobSignals.isWeak) ||
      (keywordFallback && keywordFallback.size >= 5),
  );

  const buildBullet = (
    entry: { text: string; sourceIndex: number },
    stableIndex: number,
  ) => {
    const scoreResult = scoreBulletRelevance(
      entry.text,
      jobSignals,
      strengthSignals,
      gapSignals,
    );
    const keywordOverlapFallback = keywordFallback
      ? countKeywordOverlap(entry.text, keywordFallback)
      : 0;
    const relevanceScore = scoreResult.totalScore || keywordOverlapFallback;
    const overlapCount =
      scoreResult.matchedTerms.length +
      scoreResult.matchedPhrases.length +
      scoreResult.matchedCategories.length ||
      keywordOverlapFallback;
    const claimRisk = normalizedOptions.claimRiskInventory
      ? detectClaimRiskForBullet(entry.text, normalizedOptions.claimRiskInventory)
      : buildNoClaimRiskResult();

    return {
      id: `${section.id}:${entry.sourceIndex}`,
      text: entry.text,
      source: {
        baselineSectionId: section.id,
        baselineSectionType: section.sectionType,
        baselineSectionOrder: section.order,
        bulletIndex: entry.sourceIndex,
      },
      confidence: inferBulletConfidence(entry.text),
      keywordOverlapCount: overlapCount,
      relevance: {
        totalScore: Number(relevanceScore.toFixed(3)),
        matchedTerms: scoreResult.matchedTerms,
        matchedPhrases: scoreResult.matchedPhrases,
        matchedCategories: scoreResult.matchedCategories,
      },
      claimRisk,
      relevanceScore,
      stableIndex,
    };
  };

  if (section.sectionType === 'EXPERIENCE') {
    const entries = parseExperienceEntries(section.content);
    if (entries.length) {
      const ordered = entries.flatMap((experienceEntry) => {
        const withScores = experienceEntry.bullets.map((entry, index) =>
          buildBullet(entry, index),
        );
        return orderBulletsByRelevance(withScores, shouldRank);
      });
      return ordered.map(({ relevanceScore, stableIndex, ...bullet }) => bullet);
    }
  }

  const withScores = parsed.map((entry, index) => buildBullet(entry, index));
  return orderBulletsByRelevance(withScores, shouldRank).map(
    ({ relevanceScore, stableIndex, ...bullet }) => bullet,
  );
}

export function buildResumeDraftSections(
  sections: BaselineSection[],
  options?: {
    jobText?: string | null;
    gapGuidance?: ResumeDraftGapGuidance;
    claimRiskInventory?: BaselineEvidenceTermInventory;
  },
): ResumeDraftSection[] {
  const keywords = extractJobKeywords(options?.jobText);
  const keywordSet = keywords.length ? new Set(keywords) : undefined;
  const jobSignals = extractJobSignals(options?.jobText);

  return sections.map((section) => {
    const bullets = buildDraftBulletsForSection(section, {
      keywords: keywordSet,
      gapGuidance: options?.gapGuidance,
      claimRiskInventory: options?.claimRiskInventory,
      jobSignals,
    });
    return {
      id: section.id,
      type: section.sectionType,
      title: section.title,
      order: section.order,
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      source: 'baseline',
      bullets,
      content: section.content ?? '',
      rawContent: section.content ?? '',
    };
  });
}
