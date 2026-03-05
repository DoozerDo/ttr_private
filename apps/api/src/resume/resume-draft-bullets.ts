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

export function extractJobKeywords(jobText?: string | null, maxKeywords = 40): string[] {
  const tokens = tokenize(jobText ?? '');
  if (!tokens.length) return [];

  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
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

export function buildDraftBulletsForSection(
  section: Pick<BaselineSection, 'id' | 'sectionType' | 'order' | 'content'>,
  options?: {
    keywords?: Set<string>;
    claimRiskInventory?: BaselineEvidenceTermInventory;
  },
): ResumeDraftBullet[] {
  const parsed = splitSectionContentToBulletTexts(section.content);
  const withScores = parsed.map((entry, index) => {
    const overlap = options?.keywords
      ? countKeywordOverlap(entry.text, options.keywords)
      : 0;
    const claimRisk = options?.claimRiskInventory
      ? detectClaimRiskForBullet(entry.text, options.claimRiskInventory)
      : { level: 'None', flaggedTerms: [] };
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
      keywordOverlapCount: overlap,
      claimRisk,
      _stableIndex: index,
    };
  });

  withScores.sort((a, b) => {
    const overlapA = a.keywordOverlapCount ?? 0;
    const overlapB = b.keywordOverlapCount ?? 0;
    if (overlapB !== overlapA) return overlapB - overlapA;
    return a._stableIndex - b._stableIndex;
  });

  return withScores.map(({ _stableIndex, ...bullet }) => bullet);
}

export function buildResumeDraftSections(
  sections: BaselineSection[],
  options?: {
    jobText?: string | null;
    claimRiskInventory?: BaselineEvidenceTermInventory;
  },
): ResumeDraftSection[] {
  const keywords = extractJobKeywords(options?.jobText);
  const keywordSet = keywords.length ? new Set(keywords) : undefined;

  return sections.map((section) => {
    const bullets = buildDraftBulletsForSection(section, {
      keywords: keywordSet,
      claimRiskInventory: options?.claimRiskInventory,
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
