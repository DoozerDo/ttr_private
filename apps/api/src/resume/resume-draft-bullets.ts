import { BaselineIncludePolicy, BaselineSection } from '../baseline/baseline-section.entity';
import {
  BaselineEvidenceTermInventory,
  ClaimRiskResult,
  detectClaimRiskForBullet,
} from './claim-risk';
import type {
  DocumentStrategyPlanLike as SharedDocumentStrategyPlanLike,
} from '../document-strategy-plan.types';

export type ResumeDraftBulletConfidence = 'High' | 'Medium' | 'Low';

export interface ResumeDraftBulletSource {
  baselineSectionId: string;
  baselineSectionType: string;
  baselineSectionOrder: number;
  bulletIndex: number;
  experienceEntryIndex?: number;
  sourceEvidenceIds?: string[];
  anchorText?: string;
  anchorKind?: 'sentence' | 'bullet_line';
  exactBaselineBullet?: boolean;
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

type ResumeDraftBulletCandidate = {
  evidenceId?: string;
  text: string;
  sourceIndex: number;
  anchorText: string;
  anchorKind: 'sentence' | 'bullet_line';
  exactBaselineBullet: boolean;
};

type EvidenceUnitSourceSpan = {
  startLine: number;
  endLine: number;
  kind: 'bullet_line' | 'logical_bullet' | 'sentence';
};

export type ResumeEvidenceUnit = {
  id: string;
  sectionId: string;
  experienceEntryId?: number;
  sourceText: string;
  normalizedText: string;
  sourceSpan: EvidenceUnitSourceSpan;
  anchorKind: 'sentence' | 'bullet_line';
  exactBaselineBullet: boolean;
};

type LogicalTextUnit = {
  text: string;
  startLine: number;
  endLine: number;
  indent: number;
  explicitBullet: boolean;
  merged: boolean;
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
const PLACEHOLDER_ONLY_PATTERN = /^[\s\u2022\u25CF\u25E6|,;:-]+$/;
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
  /^(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|\d+\s*[/|]\s*\d+|p\.?\s*\d+)$/i;
const SENTENCE_END_PATTERN = /[.!?]$/;
const LEADING_FRAGMENT_PATTERN =
  /^(?:and|or|as\s+well\s+as|well\s+as|including|with|for|to|of)\b/i;
const TRAILING_FRAGMENT_PATTERN =
  /(?:,\s*$|\b(?:and|or|as|with|for|to|of|including)\s*$)/i;
const DANGLING_TERMINAL_WORD_PATTERN =
  /\b(?:the|and|or|because|with|without|as|to|for|of|in|on|by|from|including|across|within|between|while|when|where|which|that)\s*$/i;
const SENTENCE_SPAN_PATTERN = /[^.!?]+[.!?]/g;
const MIN_NON_BULLET_TOKENS = 5;
const MIN_SENTENCE_TOKENS = 6;
const MAX_EXPERIENCE_BULLETS_PER_ROLE = 6;
const KNOWN_SENTENCE_START_PATTERN =
  /^(?:[A-Z]|I\b|We\b|My\b|Our\b|He\b|She\b|They\b|It\b|This\b|That\b|These\b|Those\b)/;
const LEADING_PUNCTUATION_ARTIFACT_PATTERN = /^[,;:)\]}]+/;
const TRAILING_PUNCTUATION_DUPLICATION_PATTERN = /([.!?])(?:\s*[.!?])+$/;

function buildNoClaimRiskResult(): ClaimRiskResult {
  return {
    level: 'None',
    flaggedTerms: [],
  };
}

function normalizeLine(line: string) {
  return line.replace(/\u00a0/g, ' ').trim();
}

function toSentenceCase(text: string): string {
  const trimmed = normalizeLine(text);
  if (!trimmed) return '';
  return trimmed.replace(/^[a-z]/, (char) => char.toUpperCase());
}

function normalizeTrailingPunctuation(text: string): string {
  const trimmed = normalizeLine(text);
  if (!trimmed) return '';
  const deduped = trimmed.replace(TRAILING_PUNCTUATION_DUPLICATION_PATTERN, '$1');
  return deduped.replace(/\s+([.!?])/g, '$1').trim();
}

function toSingleSentence(text: string): string {
  const spans = extractSentenceSpans(text);
  if (spans.length > 0) {
    const first = spans[0] ?? '';
    const second = spans[1] ?? '';
    // Avoid splitting on common abbreviations inside a single bullet line (e.g. "Alt. Positions, ...").
    if (
      second &&
      /\b(?:alt|sr|jr|mr|ms|dr|st|vs|etc)\.$/i.test(first.trim())
    ) {
      return normalizeLine(`${first} ${second}`);
    }
    return first;
  }
  const normalized = normalizeLine(text);
  if (!normalized) return '';
  const cutoff = normalized.search(/[.!?](?:\s|$)/);
  if (cutoff >= 0) {
    return normalizeLine(normalized.slice(0, cutoff + 1));
  }
  return normalized;
}

function sanitizeDraftBulletText(raw: string): string {
  const withoutLead = String(raw ?? '')
    .replace(/^[\s\u2022\u25CF\u25E6*-]+/, '')
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withoutLead) return '';
  const singleSentence = toSingleSentence(withoutLead);
  const cased = toSentenceCase(singleSentence);
  const punctuated = normalizeTrailingPunctuation(cased);
  return punctuated;
}

function countTokens(text: string) {
  return (normalizeLine(text).match(/[A-Za-z0-9][A-Za-z0-9'/-]*/g) ?? []).length;
}

function hasValidSentenceStart(text: string) {
  return KNOWN_SENTENCE_START_PATTERN.test(normalizeLine(text));
}

function isLowercaseStart(text: string) {
  return /^[a-z]/.test(normalizeLine(text));
}

function isCompleteSentenceSpan(text: string) {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  if (LEADING_PUNCTUATION_ARTIFACT_PATTERN.test(normalized)) return false;
  if (isLowercaseStart(normalized)) return false;
  if (!hasValidSentenceStart(normalized)) return false;
  if (!SENTENCE_END_PATTERN.test(normalized)) return false;
  if (countTokens(normalized) < MIN_SENTENCE_TOKENS) return false;
  if (LEADING_FRAGMENT_PATTERN.test(normalized)) return false;
  if (TRAILING_FRAGMENT_PATTERN.test(normalized)) return false;
  return true;
}

function extractSentenceSpans(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const collectSpans = (value: string) =>
    value.match(SENTENCE_SPAN_PATTERN)?.map((entry) => normalizeLine(entry)) ?? [];

  const segmenterCtor = (Intl as unknown as { Segmenter?: new (
    locales?: string | string[],
    options?: { granularity: 'sentence' },
  ) => { segment: (value: string) => Iterable<{ segment: string }> } }).Segmenter;

  if (segmenterCtor) {
    const segmenter = new segmenterCtor('en', { granularity: 'sentence' });
    const segmented: string[] = [];
    for (const part of segmenter.segment(normalized)) {
      const spanMatches = collectSpans(part.segment);
      if (spanMatches.length) {
        segmented.push(...spanMatches);
        continue;
      }
      const candidate = normalizeLine(part.segment);
      if (candidate && SENTENCE_END_PATTERN.test(candidate)) {
        segmented.push(candidate);
      }
    }
    return segmented;
  }

  return collectSpans(normalized);
}

function hasFragmentBoundary(text: string, exactBaselineBullet: boolean) {
  const normalized = normalizeLine(text);
  if (!normalized) return true;
  if (LEADING_PUNCTUATION_ARTIFACT_PATTERN.test(normalized)) return true;
  if (!exactBaselineBullet && isLowercaseStart(normalized)) return true;
  if (LEADING_FRAGMENT_PATTERN.test(normalized)) return true;
  if (TRAILING_FRAGMENT_PATTERN.test(normalized)) return true;
  if (DANGLING_TERMINAL_WORD_PATTERN.test(normalized)) return true;
  if (!exactBaselineBullet && countTokens(normalized) < MIN_NON_BULLET_TOKENS) return true;
  if (!exactBaselineBullet && !SENTENCE_END_PATTERN.test(normalized)) return true;
  return false;
}

function isValidBulletCandidateText(text: string, exactBaselineBullet: boolean) {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  if (PLACEHOLDER_ONLY_PATTERN.test(normalized)) return false;
  if (SECTION_HEADING_PATTERN.test(normalized)) return false;
  if (looksLikeExperienceHeader(normalized)) return false;
  // Exact baseline bullets that start lowercase are usually wrapped fragments ("needed", "well as ...").
  if (exactBaselineBullet && isLowercaseStart(normalized)) {
    return false;
  }
  if (!exactBaselineBullet && lineLooksLikeHeaderFragment(normalized) && !ACTION_VERB_PATTERN.test(normalized)) {
    return false;
  }
  if (hasFragmentBoundary(normalized, exactBaselineBullet)) return false;
  return true;
}

function isPaginationArtifact(value: string) {
  return PAGE_MARKER_PATTERN.test(normalizeLine(value));
}

function getLineIndent(rawLine: string) {
  const match = rawLine.match(/^\s*/);
  return match ? match[0].length : 0;
}

function startsWithContinuationCue(text: string) {
  const normalized = normalizeLine(text).toLowerCase();
  if (!normalized) return false;
  return (
    /^[a-z]/.test(normalized) ||
    /^(?:and|or|but|as\s+well\s+as|well\s+as)\b/.test(normalized)
  );
}

function hasTerminalPunctuation(text: string) {
  return SENTENCE_END_PATTERN.test(normalizeLine(text));
}

function shouldMergeLogicalContinuation(previous: LogicalTextUnit, current: {
  text: string;
  indent: number;
  explicitBullet: boolean;
}) {
  if (!previous.text) return false;
  if (current.explicitBullet) return false;
  if (hasTerminalPunctuation(previous.text)) return false;
  if (/^[A-Z]/.test(current.text) && looksLikeExperienceHeader(current.text)) return false;
  if (startsWithContinuationCue(current.text)) return true;
  if (
    previous.explicitBullet &&
    previous.indent === current.indent &&
    !/^[A-Z]/.test(current.text)
  ) {
    return true;
  }
  if (current.indent > previous.indent) return true;
  return false;
}

export function reconstructLogicalTextUnits(content?: string | null): LogicalTextUnit[] {
  const normalized = (content ?? '').replace(/\r\n/g, '\n');
  const rawLines = normalized.split('\n');
  const units: LogicalTextUnit[] = [];
  let active: LogicalTextUnit | null = null;

  const flush = () => {
    if (!active) return;
    const text = normalizeLine(active.text);
    if (!text || isPaginationArtifact(text)) {
      active = null;
      return;
    }
    units.push({
      ...active,
      text,
    });
    active = null;
  };

  rawLines.forEach((rawLine, lineIndex) => {
    const trimmed = normalizeLine(rawLine);
    if (!trimmed || isPaginationArtifact(trimmed)) return;
    const bulletMatch = trimmed.match(BULLET_LINE_PATTERN);
    const explicitBullet = Boolean(bulletMatch);
    const candidateText = normalizeLine(bulletMatch?.[1] ?? trimmed);
    if (!candidateText) return;
    const indent = getLineIndent(rawLine);

    if (!active) {
      active = {
        text: candidateText,
        startLine: lineIndex,
        endLine: lineIndex,
        indent,
        explicitBullet,
        merged: false,
      };
      return;
    }

    if (explicitBullet) {
      flush();
      active = {
        text: candidateText,
        startLine: lineIndex,
        endLine: lineIndex,
        indent,
        explicitBullet: true,
        merged: false,
      };
      return;
    }

    if (shouldMergeLogicalContinuation(active, { text: candidateText, indent, explicitBullet })) {
      active.text = normalizeLine(`${active.text} ${candidateText}`);
      active.endLine = lineIndex;
      active.merged = true;
      return;
    }

    const startsUppercase = /^[A-Z]/.test(candidateText);
    if (startsUppercase && hasTerminalPunctuation(active.text)) {
      flush();
      active = {
        text: candidateText,
        startLine: lineIndex,
        endLine: lineIndex,
        indent,
        explicitBullet: false,
        merged: false,
      };
      return;
    }

    flush();
    active = {
      text: candidateText,
      startLine: lineIndex,
      endLine: lineIndex,
      indent,
      explicitBullet: false,
      merged: false,
    };
  });

  flush();
  return units;
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

function mapEvidenceUnitsToCandidates(units: ResumeEvidenceUnit[]): ResumeDraftBulletCandidate[] {
  return units.map((unit) => ({
    evidenceId: unit.id,
    text: unit.normalizedText,
    sourceIndex: unit.sourceSpan.startLine,
    anchorText: unit.sourceText,
    anchorKind: unit.anchorKind,
    exactBaselineBullet: unit.exactBaselineBullet,
  }));
}

export function extractEvidenceUnitsFromLogicalUnits(
  sectionId: string,
  units: LogicalTextUnit[],
): ResumeEvidenceUnit[] {
  const evidenceUnits: ResumeEvidenceUnit[] = [];

  units.forEach((unit, index) => {
    const normalizedUnitText = normalizeLine(unit.text);
    if (!normalizedUnitText) return;

    if (unit.explicitBullet) {
      const inlinePieces = normalizedUnitText
        .split(new RegExp(`(?:${BULLET_GLYPH}|${MOJIBAKE_BULLET})`))
        .map((piece) => normalizeLine(piece))
        .filter(Boolean);
      const bulletPieces = inlinePieces.length > 1 ? inlinePieces : [normalizedUnitText];
      bulletPieces.forEach((piece, pieceIndex) => {
        if (!isValidBulletCandidateText(piece, true)) return;
        evidenceUnits.push({
          id: `${sectionId}:evidence:${index}:${pieceIndex}`,
          sectionId,
          sourceText: piece,
          normalizedText: piece,
          sourceSpan: {
            startLine: unit.startLine,
            endLine: unit.endLine,
            kind: unit.merged ? 'logical_bullet' : 'bullet_line',
          },
          anchorKind: 'bullet_line',
          exactBaselineBullet: true,
        });
      });
      return;
    }

    const sentenceSpans = extractSentenceSpans(normalizedUnitText)
      .map((sentence) => normalizeLine(sentence))
      .filter((sentence) => isCompleteSentenceSpan(sentence))
      .filter((sentence) => isValidBulletCandidateText(sentence, false));

    if (sentenceSpans.length) {
      sentenceSpans.forEach((span, sentenceIndex) => {
        evidenceUnits.push({
          id: `${sectionId}:evidence:${index}:${sentenceIndex}`,
          sectionId,
          sourceText: span,
          normalizedText: span,
          sourceSpan: {
            startLine: unit.startLine,
            endLine: unit.endLine,
            kind: 'sentence',
          },
          anchorKind: 'sentence',
          exactBaselineBullet: false,
        });
      });
      return;
    }

    const hasDelimiterSignal =
      normalizedUnitText.includes('|') ||
      normalizedUnitText.includes(';') ||
      normalizedUnitText.includes(BULLET_GLYPH) ||
      normalizedUnitText.includes(MOJIBAKE_BULLET) ||
      /\s[-/]\s/.test(normalizedUnitText);
    const hasAchievementSignal =
      ACTION_VERB_PATTERN.test(normalizedUnitText) ||
      /\b\d+(?:%|x|k|m|million|billion)?\b/i.test(normalizedUnitText);
    if (
      hasDelimiterSignal &&
      hasAchievementSignal &&
      countTokens(normalizedUnitText) >= MIN_SENTENCE_TOKENS &&
      !startsWithContinuationCue(normalizedUnitText) &&
      isValidBulletCandidateText(normalizedUnitText, true)
    ) {
      evidenceUnits.push({
        id: `${sectionId}:evidence:${index}`,
        sectionId,
        sourceText: normalizedUnitText,
        normalizedText: normalizedUnitText,
        sourceSpan: {
          startLine: unit.startLine,
          endLine: unit.endLine,
          kind: unit.merged ? 'logical_bullet' : 'bullet_line',
        },
        anchorKind: 'bullet_line',
        exactBaselineBullet: true,
      });
    }
  });

  return evidenceUnits;
}

export function splitSectionContentToBulletTexts(
  content?: string | null,
): ResumeDraftBulletCandidate[] {
  const logicalUnits = reconstructLogicalTextUnits(content);
  const evidenceUnits = extractEvidenceUnitsFromLogicalUnits('section', logicalUnits);
  return mapEvidenceUnitsToCandidates(evidenceUnits);
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

  const spans = extractSentenceSpans(prose.join(' '))
    .map((sentence) => normalizeLine(sentence))
    .filter((sentence) => isCompleteSentenceSpan(sentence))
    .filter((sentence) => isValidBulletCandidateText(sentence, false));

  if (!spans.length) return [];

  return spans.slice(0, 4).map((text) => ({
    text: sanitizeDraftBulletText(text),
    sourceIndex: 0,
    anchorText: text,
    anchorKind: 'sentence' as const,
    exactBaselineBullet: false,
  })).filter((entry) => entry.text.length > 0);
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

  return tokens.map((text, sourceIndex) => ({
    text,
    sourceIndex,
    anchorText: text,
    anchorKind: 'bullet_line' as const,
    exactBaselineBullet: true,
  }));
}

function extractEducationBullets(content?: string | null) {
  const lines = (content ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .filter((line) => !isPaginationArtifact(line))
    .filter((line) => !SECTION_HEADING_PATTERN.test(line));

  return lines.map((text, sourceIndex) => ({
    text,
    sourceIndex,
    anchorText: text,
    anchorKind: 'bullet_line' as const,
    exactBaselineBullet: true,
  }));
}

type ExperienceEntry = {
  entryIndex: number;
  headerLines: string[];
  bullets: ResumeDraftBulletCandidate[];
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
  return isValidBulletCandidateText(text, true);
}

function parseExperienceEntries(
  sectionId: string,
  content?: string | null,
): ExperienceEntry[] {
  const logicalUnits = reconstructLogicalTextUnits(content);
  if (!logicalUnits.length) return [];
  const sectionEvidenceUnits = extractEvidenceUnitsFromLogicalUnits(sectionId, logicalUnits);

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

  logicalUnits.forEach((unit, unitIndex) => {
    const text = normalizeLine(unit.text);
    if (!text) return;

    if (!unit.explicitBullet && looksLikeExperienceHeader(text)) {
      flushActive();
      active.headerLines.push(text);
      sawHeader = true;
      return;
    }

    const evidenceUnits = sectionEvidenceUnits.filter(
      (evidence) =>
        evidence.sourceSpan.startLine >= unit.startLine &&
        evidence.sourceSpan.endLine <= unit.endLine,
    );
    if (evidenceUnits.length) {
      evidenceUnits.forEach((evidence) => {
        const sanitizedText = sanitizeDraftBulletText(evidence.normalizedText);
        if (!isValidExperienceBulletText(sanitizedText)) return;
        active.bullets.push({
          evidenceId: evidence.id,
          text: sanitizedText,
          sourceIndex: evidence.sourceSpan.startLine ?? unit.startLine ?? unitIndex,
          anchorText: evidence.sourceText,
          anchorKind: evidence.anchorKind,
          exactBaselineBullet: evidence.exactBaselineBullet,
        });
      });
      return;
    }

    if (sawHeader && !active.bullets.length) {
      if (text.length <= 140 && !SECTION_HEADING_PATTERN.test(text)) {
        active.headerLines.push(text);
      }
    }
  });

  flushActive();
  return entries;
}

function dedupeExperienceBullets(
  bullets: ResumeDraftBulletCandidate[],
): ResumeDraftBulletCandidate[] {
  const seen = new Set<string>();
  const deduped: ResumeDraftBulletCandidate[] = [];

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

type DocumentStrategySignalSet = {
  priorityTokens: Set<string>;
  emphasisTokens: Set<string>;
  suppressionTokens: Set<string>;
  leadTokens: Set<string>;
};

function normalizeStrategyTokens(values?: string[] | null): Set<string> {
  return new Set(
    (values ?? [])
      .flatMap((value) => tokenize(String(value ?? '')))
      .filter((token) => token.length > 0),
  );
}

function buildDocumentStrategySignalSet(
  plan?: SharedDocumentStrategyPlanLike | null,
): DocumentStrategySignalSet {
  const priorityTokens = normalizeStrategyTokens([
    ...(plan?.roleLens?.priorities ?? []),
    ...(plan?.roleLens?.requiredSignals ?? []),
    ...(plan?.roleLens?.targetKeywords ?? []),
  ]);
  const emphasisTokens = normalizeStrategyTokens([
    ...(plan?.qualityPass?.topNarrativeAxes ?? []),
    ...(plan?.selectedEvidence ?? []).flatMap((evidence) => [
      ...(evidence.matchedSignals ?? []),
      ...(evidence.approvedClaims ?? []),
    ]),
  ]);
  const suppressionTokens = normalizeStrategyTokens([
    ...(plan?.qualityPass?.cutCandidates ?? []),
    ...(plan?.suppressionNotes ?? []),
  ]);
  const leadTokens = normalizeStrategyTokens(plan?.qualityPass?.mustLeadWith ?? []);

  return {
    priorityTokens,
    emphasisTokens,
    suppressionTokens,
    leadTokens,
  };
}

function scoreBulletRelevance(
  text: string,
  signals: JobSignalSet | null,
  strengthSignals: Set<string> | null,
  gapSignals: Set<string> | null,
  strategySignals?: DocumentStrategySignalSet | null,
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
  if (strategySignals) {
    const strategyTokens = new Set(tokenize(text));
    const priorityOverlap = [...strategySignals.priorityTokens].filter((token) => strategyTokens.has(token)).length;
    const emphasisOverlap = [...strategySignals.emphasisTokens].filter((token) => strategyTokens.has(token)).length;
    const leadOverlap = [...strategySignals.leadTokens].filter((token) => strategyTokens.has(token)).length;
    const suppressionOverlap = [...strategySignals.suppressionTokens].filter((token) => strategyTokens.has(token)).length;
    totalScore += priorityOverlap * 0.75;
    totalScore += emphasisOverlap * 0.6;
    totalScore += leadOverlap * 0.9;
    totalScore -= suppressionOverlap * 0.55;
  }

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
      documentStrategyPlan?: SharedDocumentStrategyPlanLike | null;
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
      documentStrategyPlan: undefined,
    };
  }

  return {
    keywords: options?.keywords,
    gapGuidance: options?.gapGuidance,
    claimRiskInventory: options?.claimRiskInventory,
    jobSignals: options?.jobSignals,
    documentStrategyPlan: options?.documentStrategyPlan,
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
      : sectionType === 'EDUCATION' ||
        sectionType === 'CERTIFICATION' ||
        sectionType === 'CERTIFICATIONS'
      ? extractEducationBullets(section.content)
      : splitSectionContentToBulletTexts(section.content);
  const strengthSignals = normalizedOptions.gapGuidance?.strengthSignals?.length
    ? new Set(normalizedOptions.gapGuidance.strengthSignals.map((value) => value.toLowerCase()))
    : null;
  const gapSignals = normalizedOptions.gapGuidance?.gapSignals?.length
    ? new Set(normalizedOptions.gapGuidance.gapSignals.map((value) => value.toLowerCase()))
    : null;
  const jobSignals = normalizedOptions.jobSignals ?? null;
  const keywordFallback = normalizedOptions.keywords;
  const strategySignals = buildDocumentStrategySignalSet(normalizedOptions.documentStrategyPlan);
  const shouldRank = Boolean(
    (jobSignals && !jobSignals.isWeak) ||
      (keywordFallback && keywordFallback.size >= 5) ||
      strategySignals.priorityTokens.size > 0 ||
      strategySignals.emphasisTokens.size > 0,
  );
  const maxExperienceBullets =
    normalizedOptions.documentStrategyPlan?.qualityPass?.emphasisConfidence === 'high'
      ? 4
      : normalizedOptions.documentStrategyPlan?.qualityPass?.emphasisConfidence === 'medium'
        ? 5
        : MAX_EXPERIENCE_BULLETS_PER_ROLE;

  const buildBullet = (
    entry: ResumeDraftBulletCandidate,
    stableIndex: number,
    experienceEntryIndex?: number,
  ) => {
    const sanitizedText = sanitizeDraftBulletText(entry.text);
    if (!sanitizedText) {
      return null;
    }
    const scoreResult = scoreBulletRelevance(
      sanitizedText,
      jobSignals,
      strengthSignals,
      gapSignals,
      strategySignals,
    );
    const keywordOverlapFallback = keywordFallback
      ? countKeywordOverlap(sanitizedText, keywordFallback)
      : 0;
    const relevanceScore = scoreResult.totalScore || keywordOverlapFallback;
    const overlapCount =
      scoreResult.matchedTerms.length +
      scoreResult.matchedPhrases.length +
      scoreResult.matchedCategories.length ||
      keywordOverlapFallback;
    const claimRisk = normalizedOptions.claimRiskInventory
      ? detectClaimRiskForBullet(sanitizedText, normalizedOptions.claimRiskInventory)
      : buildNoClaimRiskResult();

    return {
      id: `${section.id}:${experienceEntryIndex ?? 'section'}:${entry.sourceIndex}:${stableIndex}`,
      text: sanitizedText,
      source: {
        baselineSectionId: section.id,
        baselineSectionType: section.sectionType,
        baselineSectionOrder: section.order,
        bulletIndex: entry.sourceIndex,
        sourceEvidenceIds: entry.evidenceId ? [entry.evidenceId] : [],
        anchorText: entry.anchorText,
        anchorKind: entry.anchorKind,
        exactBaselineBullet: entry.exactBaselineBullet,
        ...(typeof experienceEntryIndex === 'number'
          ? { experienceEntryIndex }
          : {}),
      },
      confidence: inferBulletConfidence(sanitizedText),
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
    } as (ResumeDraftBullet & { relevanceScore: number; stableIndex: number });
  };

  if (section.sectionType === 'EXPERIENCE') {
    const entries = parseExperienceEntries(section.id, section.content);
    if (entries.length) {
      let stableCounter = 0;
      const ordered = entries.flatMap((experienceEntry) => {
        const withScores: ScoredDraftBullet[] = experienceEntry.bullets.map((entry) => {
          const scored = buildBullet(
            entry,
            stableCounter,
            experienceEntry.entryIndex,
          );
          stableCounter += 1;
          return scored as ScoredDraftBullet;
        }).filter((entry): entry is ScoredDraftBullet => Boolean(entry));
        return orderBulletsByRelevance(withScores, shouldRank).slice(
          0,
          maxExperienceBullets,
        );
      });
      return ordered.map(({ relevanceScore: _relevanceScore, stableIndex: _stableIndex, ...bullet }) => bullet);
    }
  }

  const withScores = parsed
    .map((entry, index) => buildBullet(entry, index))
    .filter((entry): entry is ScoredDraftBullet => Boolean(entry));
  return orderBulletsByRelevance(withScores, shouldRank).map(
    ({ relevanceScore: _relevanceScore, stableIndex: _stableIndex, ...bullet }) => bullet,
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

  const upperType = sectionType.toUpperCase();
  if (!bulletTexts.length) {
    if (upperType === 'EXPERIENCE') {
      const rawLines = (fallbackRawContent ?? '')
        .split(/\r?\n/)
        .map((line) => normalizeLine(line))
        .filter(Boolean);
      const hasBulletLikeSource = rawLines.some(
        (line) =>
          BULLET_LINE_PATTERN.test(line) ||
          line.includes(BULLET_GLYPH) ||
          line.includes(MOJIBAKE_BULLET),
      );
      if (hasBulletLikeSource) {
        return rawLines
          .filter((line) => !SECTION_HEADING_PATTERN.test(line))
          .join('\n')
          .trim();
      }
      if (rawLines.length) {
        return rawLines
          .filter((line) => !SECTION_HEADING_PATTERN.test(line))
          .join('\n')
          .trim();
      }
    }
    return '';
  }

  if (upperType === 'SUMMARY') {
    return bulletTexts.join('\n\n');
  }
  if (upperType === 'SKILLS') {
    return bulletTexts.join(', ');
  }
  if (upperType === 'EXPERIENCE') {
    const entries = parseExperienceEntries('experience', fallbackRawContent);
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

function normalizeForAnchorMatch(text: string) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenizeForCompression(text: string): string[] {
  return normalizeForAnchorMatch(text).match(/[a-z0-9]+/g) ?? [];
}

function isTokenSubsequence(tokens: string[], within: string[]) {
  if (!tokens.length) return false;
  let pointer = 0;
  for (const token of within) {
    if (token !== tokens[pointer]) continue;
    pointer += 1;
    if (pointer === tokens.length) return true;
  }
  return false;
}

function isCompleteSentenceCompression(sentence: string, candidate: string) {
  const normalizedSentence = normalizeForAnchorMatch(sentence);
  const normalizedCandidate = normalizeForAnchorMatch(candidate);
  if (!normalizedSentence || !normalizedCandidate) return false;
  if (normalizedSentence === normalizedCandidate) return true;
  const sentenceTokens = tokenizeForCompression(normalizedSentence);
  const candidateTokens = tokenizeForCompression(normalizedCandidate);
  if (candidateTokens.length < MIN_SENTENCE_TOKENS) return false;
  if (candidateTokens.length > sentenceTokens.length) return false;
  return isTokenSubsequence(candidateTokens, sentenceTokens);
}

export function validateResumeDraftBulletAnchors(
  draftedSections: ResumeDraftSection[],
  baselineSections: Array<Pick<BaselineSection, 'id' | 'content'>>,
): { valid: boolean; reasons: string[] } {
  const baselineEvidenceById = new Map<string, ResumeEvidenceUnit>();
  baselineSections.forEach((section) => {
    const logicalUnits = reconstructLogicalTextUnits(section.content ?? '');
    const evidenceUnits = extractEvidenceUnitsFromLogicalUnits(section.id, logicalUnits);
    evidenceUnits.forEach((evidence) => {
      baselineEvidenceById.set(evidence.id, evidence);
    });
    const parsedEntries = parseExperienceEntries(section.id, section.content ?? '');
    parsedEntries.forEach((entry) => {
      entry.bullets.forEach((bullet) => {
        if (!bullet.evidenceId) return;
        baselineEvidenceById.set(bullet.evidenceId, {
          id: bullet.evidenceId,
          sectionId: section.id,
          sourceText: bullet.anchorText,
          normalizedText: bullet.text,
          sourceSpan: {
            startLine: bullet.sourceIndex,
            endLine: bullet.sourceIndex,
            kind: bullet.anchorKind === 'sentence' ? 'sentence' : 'bullet_line',
          },
          anchorKind: bullet.anchorKind,
          exactBaselineBullet: bullet.exactBaselineBullet,
        });
      });
    });
  });
  const baselineContentBySectionId = new Map(
    baselineSections.map((section) => [
      section.id,
      normalizeForAnchorMatch(section.content ?? ''),
    ]),
  );
  const reasons: string[] = [];

  draftedSections.forEach((section) => {
    if (String(section.type ?? '').toUpperCase() !== 'EXPERIENCE') {
      return;
    }
    section.bullets.forEach((bullet) => {
      if (String(bullet.source.baselineSectionType ?? '').toUpperCase() !== 'EXPERIENCE') {
        return;
      }
      const sourceSectionId = bullet.source.baselineSectionId;
      const baselineContent = baselineContentBySectionId.get(sourceSectionId) ?? '';
      const anchorText = normalizeForAnchorMatch(
        bullet.source.anchorText ?? bullet.text,
      );
      const sourceEvidenceIds = bullet.source.sourceEvidenceIds ?? [];
      const exactBaselineBullet = Boolean(bullet.source.exactBaselineBullet);

      if (!anchorText) {
        reasons.push(
          `Bullet "${bullet.text}" is missing baseline anchor text for section ${sourceSectionId}.`,
        );
        return;
      }

      if (hasFragmentBoundary(bullet.text, exactBaselineBullet)) {
        reasons.push(`Bullet "${bullet.text}" looks like a sentence fragment.`);
        return;
      }

      if (!sourceEvidenceIds.length) {
        reasons.push(`Bullet "${bullet.text}" is missing sourceEvidenceIds.`);
        return;
      }

      const matchedEvidence = sourceEvidenceIds
        .map((evidenceId) => baselineEvidenceById.get(evidenceId))
        .filter((evidence): evidence is ResumeEvidenceUnit => Boolean(evidence))
        .filter((evidence) => evidence.sectionId === sourceSectionId);

      if (!matchedEvidence.length) {
        reasons.push(
          `Bullet "${bullet.text}" references evidence ids that are not present in baseline section ${sourceSectionId}.`,
        );
        return;
      }

      if (bullet.source.anchorKind === 'sentence') {
        if (!isCompleteSentenceSpan(bullet.text)) {
          reasons.push(`Bullet "${bullet.text}" is not a complete sentence span.`);
          return;
        }
        const hasSentenceMatch = matchedEvidence.some((evidence) =>
          evidence.anchorKind === 'sentence' &&
          isCompleteSentenceCompression(evidence.normalizedText, bullet.text),
        );
        if (!hasSentenceMatch) {
          reasons.push(
            `Bullet "${bullet.text}" is not equal to or a compression of a full baseline sentence span in section ${sourceSectionId}.`,
          );
          return;
        }
      }

      const hasEvidenceMatch = matchedEvidence.some((evidence) =>
        exactBaselineBullet
          ? normalizeForAnchorMatch(evidence.normalizedText) === normalizeForAnchorMatch(bullet.text)
          : isCompleteSentenceCompression(evidence.normalizedText, bullet.text),
      );
      if (!hasEvidenceMatch) {
        reasons.push(
          `Bullet "${bullet.text}" is not equal to or a compression of referenced evidence units.`,
        );
        return;
      }

      if (!baselineContent || !baselineContent.includes(anchorText)) {
        reasons.push(
          `Bullet "${bullet.text}" does not map to baseline sentence spans for section ${sourceSectionId}.`,
        );
      }
    });
  });

  const dedupedReasons = Array.from(new Set(reasons));
  return {
    valid: dedupedReasons.length === 0,
    reasons: dedupedReasons.slice(0, 8),
  };
}

export function buildResumeDraftSections(
  sections: BaselineSection[],
  options?: {
    jobText?: string | null;
    gapGuidance?: ResumeDraftGapGuidance;
    claimRiskInventory?: BaselineEvidenceTermInventory;
    documentStrategyPlan?: SharedDocumentStrategyPlanLike | null;
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
      documentStrategyPlan: options?.documentStrategyPlan ?? undefined,
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
    .filter((section) => {
      if (section.content.length === 0) {
        return false;
      }
      if (section.bullets.length > 0) {
        return true;
      }
      return String(section.type ?? '').toUpperCase() === 'EXPERIENCE';
    });
}
