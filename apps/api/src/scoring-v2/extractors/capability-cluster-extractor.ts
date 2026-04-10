import { normalizeText } from '../../scoring/fit-score/fit-score.utils';
import type {
  CapabilityClusterDefinition,
  CapabilityClusterRegistry,
} from '../config/capability-clusters';

const NEGATION_WINDOW = 40;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isNegatedMatch = (
  normalized: string,
  start: number,
  end: number,
  negations: string[],
) => {
  if (!negations.length) return false;
  const contextStart = Math.max(0, start - NEGATION_WINDOW);
  const contextEnd = Math.min(normalized.length, end + NEGATION_WINDOW);
  const context = normalized.slice(contextStart, contextEnd);
  return negations.some((negation) => context.includes(negation));
};

const matchKeyword = (
  normalized: string,
  term: string,
  negations: string[],
  hits: number,
  matched: string[],
) => {
  const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (isNegatedMatch(normalized, start, end, negations)) {
      continue;
    }
    hits++;
    matched.push(term);
  }
  return hits;
};

const matchPhrase = (
  normalized: string,
  phrase: string,
  negations: string[],
  hits: number,
  matched: string[],
) => {
  let offset = 0;
  while (true) {
    const index = normalized.indexOf(phrase, offset);
    if (index === -1) break;
    const end = index + phrase.length;
    if (!isNegatedMatch(normalized, index, end, negations)) {
      hits++;
      matched.push(phrase);
    }
    offset = index + phrase.length;
  }
  return hits;
};

const matchRegex = (
  normalized: string,
  pattern: string,
  negations: string[],
  hits: number,
  matched: string[],
) => {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'g');
  } catch {
    return hits;
  }
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    const start = match.index;
    const end = start + (match[0]?.length ?? 0);
    if (isNegatedMatch(normalized, start, end, negations)) {
      continue;
    }
    hits++;
    matched.push(pattern);
  }
  return hits;
};

export type CapabilityClusterExtraction = {
  hitsByCluster: Record<string, number>;
  clusters: string[];
  matchedTerms: Record<string, string[]>;
};

export const extractCapabilityClusters = (
  text: string,
  registry: CapabilityClusterRegistry,
): CapabilityClusterExtraction => {
  const normalized = normalizeText(text);
  const hitsByCluster: Record<string, number> = {};
  const matchedTerms: Record<string, string[]> = {};

  const clusterResults: {
    id: string;
    hits: number;
    minHits: number;
  }[] = [];

  for (const cluster of registry.clusters) {
    let clusterHits = 0;
    const matched: string[] = [];
    const negations = cluster.negations;

    for (const keyword of [...cluster.keywords, ...cluster.aliases]) {
      clusterHits = matchKeyword(normalized, keyword, negations, clusterHits, matched);
    }
    for (const phrase of cluster.phrases) {
      clusterHits = matchPhrase(normalized, phrase, negations, clusterHits, matched);
    }
    for (const expression of cluster.regex) {
      clusterHits = matchRegex(normalized, expression, negations, clusterHits, matched);
    }

    hitsByCluster[cluster.id] = clusterHits;
    matchedTerms[cluster.id] = matched;
    clusterResults.push({
      id: cluster.id,
      hits: clusterHits,
      minHits: cluster.minHits ?? 1,
    });
  }

  const clusters = clusterResults
    .filter(({ hits, minHits }) => hits >= (minHits ?? 1))
    .sort((a, b) => {
      if (b.hits !== a.hits) {
        return b.hits - a.hits;
      }
      return a.id.localeCompare(b.id);
    })
    .map((result) => result.id);

  return {
    hitsByCluster,
    clusters,
    matchedTerms,
  };
};
