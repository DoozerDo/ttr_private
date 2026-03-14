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
  experienceEntryIndex?: number;
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
const BULLET_GLYPH = '\u2022';
const MOJIBAKE_BULLET = '\u00e2\u20ac\u00a2';
const SECTION_HEADING_PATTERN =
  /^(?:summary|professional summary|skills|technical skills|core competencies|experience|professional experience|education|certifications)\s*:?\s*$/i;
const PLACEHOLDER_ONLY_PATTERN = /^[\s\u2022\u25CF\u25E6|,;:\-]+$/;
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
const PAGE_MARKER_PATTERN =
  /^(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|\d+\s*[\/|]\s*\d+|p\.?\s*\d+)$/i;
const SENTENCE_END_PATTERN = /[.!?;:]$/;
const CONTINUATION_LINE_START_PATTERN =
  /^(?:[a-z]|and\b|or\b|to\b|for\b|with\b|in\b|on\b|of\b|by\b|from\b|that\b|which\b|who\b|where\b|when\b|while\b|as\b|at\b)/;
const BULLET_CONTINUATION_END_PATTERN =
  /(?:,\s*$|\b(?:and|with|including|across)\s*$)/i;

function buildNoClaimRiskResult(): ClaimRiskResult {
  return {
    level: 'None',
    flaggedTerms: [],
  };
}

function normalizeLine(line: string) {
  return line.replace(/\u00a0/g, ' ').trim();
}

function isPaginationArtifact(value: string) {
  return PAGE_MARKER_PATTERN.test(normalizeLine(value));
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
    if (isPaginationArtifact(line)) return;
    const match = line.match(BULLET_LINE_PATTERN);
    if (!match) return;
    const text = normalizeLine(match[1] ?? '');
    if (!text) return;
    bullets.push({ text, sourceIndex: index });
  });

  if (!bullets.length) {
    const text = normalized.trim();
    if (!text || isPaginationArtifact(text)) return [];
    return [{ text, sourceIndex: 0 }];
  }

  return bullets;
}

function extractSummaryBullets(content?: string | null) {
  const lines = (content ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter((line) => !isPaginationArtifact(line))
    .filter(Boolean)
    .map((line) => line.replace(/^(?:professional\s+summary|summary)\s*:\s*/i, '').trim())
    .map((line) =>
      line
        .replace(new RegExp(`^(?:${MOJIBAKE_BULLET}|&&¢|&¢|${BULLET_GLYPH}|[-*])\\s*`), '')
        .trim(),
    )
    .filter(Boolean);

  const normalizedLines = lines.filter((line) => !SECTION_HEADING_PATTERN.test(line));

  if (!normalizedLines.length) {
    return [];
  }

  const bulletLikeCount = normalizedLines.filter(
    (line) =>
      BULLET_LINE_PATTERN.test(line) ||
      line.includes(BULLET_GLYPH) ||
      line.includes(MOJIBAKE_BULLET),
  ).length;
  if (bulletLikeCount > 0 && bulletLikeCount >= Math.ceil(normalizedLines.length / 2)) {
    return [];
  }

  const prose = normalizedLines
    .filter((line) => !BULLET_LINE_PATTERN.test(line))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0 && !PLACEHOLDER_ONLY_PATTERN.test(line));

  if (!prose.length) {
    return [];
  }

  return [{
    text: prose.join(' '),
    sourceIndex: 0,
  }];
}

function extractSkillBullets(content?: string | null) {
  const normalized = (content ?? '')
    .replace(/\r\n/g, '\n')
    .replace(new RegExp(MOJIBAKE_BULLET, 'g'), BULLET_GLYPH)
    .replace(/&&+Â¢|&Â¢/g, BULLET_GLYPH);
  if (!normalized.trim()) return [];

  const tokens = normalized
    .split(/\n|,|;|\||\u2022/)
    .map((token) => normalizeLine(token))
    .map((token) =>
      token.replace(/^(?:skills|technical skills|core competencies)\s*:?\s*/i, '').trim(),
    )
    .filter(Boolean)
    .filter((token) => !SECTION_HEADING_PATTERN.test(token))
    .filter((token) => !PLACEHOLDER_ONLY_PATTERN.test(token))
    .filter((token) => token.length > 1)
    .filter((token) => !isPaginationArtifact(token));

  return tokens.map((text, sourceIndex) => ({ text, sourceIndex }));
}

type ExperienceEntry = {
  entryIndex: number;
  headerLines: string[];
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

function isValidExperienceBulletText(text: string) {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  if (PLACEHOLDER_ONLY_PATTERN.test(normalized)) return false;
  if (SECTION_HEADING_PATTERN.test(normalized)) return false;
  if (looksLikeExperienceHeader(normalized)) return false;
  if (lineLooksLikeHeaderFragment(normalized) && !ACTION_VERB_PATTERN.test(normalized)) {
    return false;
  }
  return true;
}

function parseExperienceEntries(content?: string | null): ExperienceEntry[] {
  const normalized = (content ?? '').replace(/\r\n/g, '\n');
  const rawLines = normalized
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter((line) => !isPaginationArtifact(line));
  const lines = reconstructWrappedExperienceLines(rawLines);
  if (!lines.some((line) => BULLET_LINE_PATTERN.test(line))) {
    return [];
  }

  const entries: ExperienceEntry[] = [];
  let active: ExperienceEntry = { entryIndex: 0, headerLines: [], bullets: [] };
  let sawHeader = false;

  const flushActive = () => {
    const dedupedBullets = dedupeExperienceBullets(active.bullets);
    if (!dedupedBullets.length) return;
    entries.push({
      ...active,
      bullets: dedupedBullets,
    });
    active = {
      entryIndex: entries.length,
      headerLines: [],
      bullets: [],
    };
    sawHeader = false;
  };

  lines.forEach((line, index) => {
    const bulletMatch = line.match(BULLET_LINE_PATTERN);
    if (bulletMatch) {
      const text = normalizeLine(bulletMatch[1] ?? '');
      if (text) {
        const inlinePieces = text
          .split(new RegExp(`(?:${BULLET_GLYPH}|${MOJIBAKE_BULLET})`))
          .map((segment) => normalizeLine(segment))
          .filter((segment) => isValidExperienceBulletText(segment));

        if (inlinePieces.length > 1) {
          inlinePieces.forEach((piece) => {
            active.bullets.push({ text: piece, sourceIndex: index });
          });
        } else if (isValidExperienceBulletText(text)) {
          active.bullets.push({ text, sourceIndex: index });
        }
      }
      return;
    }

    if (line.includes(BULLET_GLYPH) || line.includes(MOJIBAKE_BULLET)) {
      const inlineBullets = line
        .split(new RegExp(`(?:${BULLET_GLYPH}|${MOJIBAKE_BULLET})`))
        .map((segment) => normalizeLine(segment))
        .filter(Boolean);
      if (inlineBullets.length >= 2) {
        inlineBullets.slice(1).forEach((text) => {
          if (isValidExperienceBulletText(text)) {
            active.bullets.push({ text, sourceIndex: index });
          }
        });
        return;
      }
    }

    if (looksLikeExperienceHeader(line)) {
      flushActive();
      active.headerLines.push(line);
      sawHeader = true;
      return;
    }

    if (sawHeader && !active.bullets.length) {
      // Preserve short role metadata continuation lines (company/date/location).
      if (line.length <= 140 && !SECTION_HEADING_PATTERN.test(line)) {
        active.headerLines.push(line);
      }
    }
  });

  flushActive();

  return entries;
}

function reconstructWrappedExperienceLines(lines: string[]): string[] {
  const merged: string[] = [];

  for (const line of lines) {
    if (!line) continue;

    const previous = merged[merged.length - 1];
    const previousBulletMatch = previous?.match(BULLET_LINE_PATTERN);
    const currentIsBullet = BULLET_LINE_PATTERN.test(line);
    const currentLine = normalizeLine(line);

    const previousBulletText = normalizeLine(previousBulletMatch?.[1] ?? '');
    const previousEndsWithContinuation = BULLET_CONTINUATION_END_PATTERN.test(
      previousBulletText,
    );
    const shouldMergeContinuation =
      Boolean(previousBulletText) &&
      !currentIsBullet &&
      CONTINUATION_LINE_START_PATTERN.test(currentLine) &&
      (previousEndsWithContinuation || !SENTENCE_END_PATTERN.test(previousBulletText));

    if (shouldMergeContinuation && previous) {
      merged[merged.length - 1] = normalizeLine(`${previous} ${currentLine}`);
      continue;
    }

    merged.push(currentLine);
  }

  return merged;
}

function dedupeExperienceBullets(
  bullets: Array<{ text: string; sourceIndex: number }>,
): Array<{ text: string; sourceIndex: number }> {
  const seen = new Set<string>();
  const deduped: Array<{ text: string; sourceIndex: number }> = [];

  for (const bullet of bullets) {
    const normalized = normalizeLine(bullet.text).toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(bullet);
  }

  return deduped;
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

type ScoredDraftBullet = ResumeDraftBullet & {
  relevanceScore: number;
  stableIndex: number;
};

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
  const sectionType = (section.sectionType ?? '').toUpperCase();
  const parsed =
    sectionType === 'SUMMARY'
      ? extractSummaryBullets(section.content)
      : sectionType === 'SKILLS'
      ? extractSkillBullets(section.content)
      : splitSectionContentToBulletTexts(section.content);
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
    experienceEntryIndex?: number,
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
      id: `${section.id}:${experienceEntryIndex ?? 'section'}:${entry.sourceIndex}:${stableIndex}`,
      text: entry.text,
      source: {
        baselineSectionId: section.id,
        baselineSectionType: section.sectionType,
        baselineSectionOrder: section.order,
        bulletIndex: entry.sourceIndex,
        ...(typeof experienceEntryIndex === 'number'
          ? { experienceEntryIndex }
          : {}),
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
      let stableCounter = 0;
      const ordered = entries.flatMap((experienceEntry) => {
        const withScores: ScoredDraftBullet[] = experienceEntry.bullets.map((entry) => {
          const scored = buildBullet(
            entry,
            stableCounter,
            experienceEntry.entryIndex,
          ) as ScoredDraftBullet;
          stableCounter += 1;
          return scored;
        });
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

function formatDraftSectionContent(
  sectionType: string,
  bullets: ResumeDraftBullet[],
  fallbackRawContent?: string,
) {
  const bulletTexts = bullets
    .map((bullet) => normalizeLine(bullet.text))
    .filter((text) => text.length > 0)
    .filter((text) => !PLACEHOLDER_ONLY_PATTERN.test(text));

  if (!bulletTexts.length) {
    return '';
  }

  const upperType = sectionType.toUpperCase();
  if (upperType === 'SUMMARY') {
    return bulletTexts.join('\n\n');
  }
  if (upperType === 'SKILLS') {
    return bulletTexts.join(', ');
  }
  if (upperType === 'EXPERIENCE') {
    const entries = parseExperienceEntries(fallbackRawContent);
    if (entries.length) {
      const renderedLines: string[] = [];

      entries.forEach((entry, idx) => {
        const entryBullets = bullets
          .filter((bullet) => bullet.source.experienceEntryIndex === entry.entryIndex)
          .map((bullet) => normalizeLine(bullet.text))
          .filter((text) => text.length > 0)
          .filter((text) => !PLACEHOLDER_ONLY_PATTERN.test(text));

        if (!entryBullets.length) {
          return;
        }

        const headerLines = entry.headerLines
          .map((line) => normalizeLine(line))
          .filter((line) => line.length > 0)
          .filter((line) => !SECTION_HEADING_PATTERN.test(line))
          .slice(0, 2);

        renderedLines.push(...headerLines);
        renderedLines.push(...entryBullets.map((text) => `${BULLET_GLYPH} ${text}`));
        if (idx < entries.length - 1) {
          renderedLines.push('');
        }
      });

      const scopedContent = renderedLines.join('\n').trim();
      if (scopedContent.length > 0) {
        return scopedContent;
      }
    }
  }

  const rawLines = (fallbackRawContent ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .filter((line) => !BULLET_LINE_PATTERN.test(line))
    .filter((line) => !line.includes(BULLET_GLYPH))
    .filter((line) => !line.includes(MOJIBAKE_BULLET))
    .filter((line) => !SECTION_HEADING_PATTERN.test(line));

  const headerLines = upperType === 'EXPERIENCE' ? rawLines.slice(0, 2) : [];
  const bulletLines = bulletTexts.map((text) => `${BULLET_GLYPH} ${text}`);
  return [...headerLines, ...bulletLines].join('\n');
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

  return sections
    .map<ResumeDraftSection>((section) => {
    const bullets = buildDraftBulletsForSection(section, {
      keywords: keywordSet,
      gapGuidance: options?.gapGuidance,
      claimRiskInventory: options?.claimRiskInventory,
      jobSignals,
    });
    const content = formatDraftSectionContent(
      section.sectionType,
      bullets,
      section.content ?? '',
    );
    return {
      id: section.id,
      type: section.sectionType,
      title: section.title,
      order: section.order,
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      source: 'baseline' as const,
      bullets,
      content,
      rawContent: section.content ?? '',
    };
    })
    .filter((section) => section.bullets.length > 0 && section.content.length > 0);
}
