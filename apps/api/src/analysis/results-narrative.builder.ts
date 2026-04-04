import type { ScoringContractV1DimensionKey } from './cx-fit-scoring-v2';

export type ResultsNarrative = {
  headline: string;
  summary: string;
  strengths: string[];
  gaps: string[];
};

type BuildResultsNarrativeArgs = {
  overallScore: number;
  dimensionScores: Record<ScoringContractV1DimensionKey, number | undefined>;
};

const STRENGTH_THRESHOLD = 75;
const GAP_THRESHOLD = 60;

const DIMENSION_KEYS: ScoringContractV1DimensionKey[] = [
  'role_scope_and_seniority',
  'support_operations_and_process_rigor',
  'tooling_and_platform_experience',
  'domain_and_business_context',
  'change_leadership_and_customer_advocacy',
];

const PUBLIC_DIMENSION_LABELS: Record<ScoringContractV1DimensionKey, string> = {
  role_scope_and_seniority: 'Leadership Level',
  support_operations_and_process_rigor: 'Support Operations',
  tooling_and_platform_experience: 'Tools and Systems',
  domain_and_business_context: 'Industry Experience',
  change_leadership_and_customer_advocacy: 'Change and Customer Impact',
};

const HEADLINES = {
  high: 'Your background aligns very strongly with this role.',
  strong: 'Strong alignment for this role.',
  range: 'You are within range, but there are gaps to close.',
  limited: 'This role expects experience that is not clearly reflected yet.',
  misaligned: 'There is significant misalignment for this role.',
};

const OPENING_SENTENCES = {
  high: 'Your resume reflects a very strong match to what this role describes.',
  strong: 'Your resume reflects many of the core expectations for this role.',
  range: 'Several expectations in this role are reflected in your background.',
  limited: 'Some elements of this role appear in your background, but coverage is limited.',
  misaligned: 'This role emphasizes responsibilities and context that differ meaningfully from your current resume signals.',
};

const CLOSER_60S =
  'These areas can often be improved through clearer positioning and emphasis.';
const CLOSER_50S =
  'These areas may require meaningful repositioning to match this role.';

type Mention = {
  key: ScoringContractV1DimensionKey;
  label: string;
  score: number;
  isNeutral: boolean;
  isLimitedAlignment?: boolean;
};

function normalizeScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return Math.max(0, Math.min(100, rounded));
}

function buildMention(
  entry: { key: ScoringContractV1DimensionKey; label: string; score: number },
  options?: { isNeutral?: boolean; isLimitedAlignment?: boolean },
): Mention {
  return {
    key: entry.key,
    label: entry.label,
    score: entry.score,
    isNeutral: Boolean(options?.isNeutral),
    isLimitedAlignment: Boolean(options?.isLimitedAlignment),
  };
}

function joinNames(labels: string[]): string {
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1);
  return `${rest.join(', ')} and ${last}`;
}

function buildStrengthSentence(
  band: 'high' | 'strong' | 'range' | 'limited' | 'misaligned',
  mentions: Mention[],
  limitedAlignment?: Mention | null,
): string | null {
  if (limitedAlignment) {
    return `Some alignment appears in ${limitedAlignment.label}, but it is not the primary focus of the role.`;
  }

  const trueStrengths = mentions.filter((mention) => !mention.isNeutral && !mention.isLimitedAlignment);
  if (trueStrengths.length) {
    const labels = trueStrengths.map((mention) => mention.label);
    const joined = joinNames(labels);
    return trueStrengths.length > 1
      ? `Clear alignment appears in ${joined}.`
      : `Clear alignment appears in ${joined}.`;
  }

  const neutralStrength = mentions.find((mention) => mention.isNeutral);
  if (neutralStrength) {
    return `The strongest alignment appears in ${neutralStrength.label}.`;
  }

  if (band === 'misaligned') {
    return null;
  }

  return null;
}

function buildGapSentence(
  band: 'high' | 'strong' | 'range' | 'limited' | 'misaligned',
  mentions: Mention[],
): string | null {
  if (!mentions.length) return null;

  const trueGaps = mentions.filter((mention) => !mention.isNeutral);
  if (trueGaps.length) {
    const labels = trueGaps.map((mention) => mention.label);
    const joined = joinNames(labels);
    return trueGaps.length > 1
      ? `However, ${joined} are less emphasized relative to this role.`
      : `However, ${joined} is less emphasized relative to this role.`;
  }

  const neutralGaps = mentions.filter((mention) => mention.isNeutral);
  if (neutralGaps.length) {
    const labels = neutralGaps.map((mention) => mention.label);
    const joined = joinNames(labels);
    return neutralGaps.length > 1
      ? `The thinnest alignment right now is in ${joined}.`
      : `The thinnest alignment right now is in ${joined}.`;
  }

  return null;
}

export function buildResultsNarrative(args: BuildResultsNarrativeArgs): ResultsNarrative {
  const safeScore = Math.max(0, Math.min(100, Math.round(args.overallScore ?? 0)));
  const entries = DIMENSION_KEYS.map((key) => ({
    key,
    label: PUBLIC_DIMENSION_LABELS[key],
    score: normalizeScore(args.dimensionScores[key]),
  }));

  const sortedDesc = [...entries].sort((a, b) => {
    const delta = b.score - a.score;
    if (delta !== 0) return delta;
    return a.label.localeCompare(b.label);
  });
  const sortedAsc = [...entries].sort((a, b) => {
    const delta = a.score - b.score;
    if (delta !== 0) return delta;
    return a.label.localeCompare(b.label);
  });

  const trueStrengths = sortedDesc.filter((entry) => entry.score >= STRENGTH_THRESHOLD);
  const trueGaps = sortedAsc.filter((entry) => entry.score <= GAP_THRESHOLD);

  const highest = sortedDesc[0];
  const lowest = sortedAsc[0];

  let selectedStrengths: Mention[] = [];
  let selectedGaps: Mention[] = [];
  let limitedAlignmentMention: Mention | null = null;

  const band:
    | 'high'
    | 'strong'
    | 'range'
    | 'limited'
    | 'misaligned' = safeScore >= 90
    ? 'high'
    : safeScore >= 70
    ? 'strong'
    : safeScore >= 60
    ? 'range'
    : safeScore >= 50
    ? 'limited'
    : 'misaligned';

  if (band === 'high') {
    selectedStrengths = trueStrengths.slice(0, 2).map((entry) => buildMention(entry));
  } else if (band === 'strong') {
    const actual = trueStrengths.slice(0, 1).map((entry) => buildMention(entry));
    if (actual.length) {
      selectedStrengths = actual;
    } else if (highest) {
      selectedStrengths = [buildMention(highest, { isNeutral: true })];
    }
    selectedGaps = trueGaps.slice(0, 1).map((entry) => buildMention(entry));
  } else if (band === 'range') {
    const actualStrengths = trueStrengths.slice(0, 2).map((entry) => buildMention(entry));
    if (actualStrengths.length) {
      selectedStrengths = actualStrengths;
    } else if (highest) {
      selectedStrengths = [buildMention(highest, { isNeutral: true })];
    }

    const actualGaps = trueGaps.slice(0, 2).map((entry) => buildMention(entry));
    if (actualGaps.length) {
      selectedGaps = actualGaps;
    } else if (lowest) {
      selectedGaps = [buildMention(lowest, { isNeutral: true })];
    }
  } else if (band === 'limited') {
    selectedStrengths = trueStrengths.slice(0, 1).map((entry) => buildMention(entry));
    const actualGaps = trueGaps.slice(0, 2).map((entry) => buildMention(entry));
    if (actualGaps.length) {
      selectedGaps = actualGaps;
    } else if (lowest) {
      selectedGaps = [buildMention(lowest, { isNeutral: true })];
    }
  } else {
    const limitedMentionCandidate = highest?.score >= 70 ? buildMention(highest, { isNeutral: true, isLimitedAlignment: true }) : null;
    if (limitedMentionCandidate) {
      limitedAlignmentMention = limitedMentionCandidate;
      selectedStrengths = [limitedMentionCandidate];
    }
    const actualGaps = trueGaps.slice(0, 2).map((entry) => buildMention(entry));
    if (actualGaps.length) {
      selectedGaps = actualGaps;
    } else {
      selectedGaps = sortedAsc.slice(0, 2).map((entry) => buildMention(entry, { isNeutral: true }));
    }
  }

  const uniqueStrengthLabels = Array.from(new Set(selectedStrengths.map((mention) => mention.label)));
  const uniqueGapLabels = Array.from(new Set(selectedGaps.map((mention) => mention.label)));

  const sentences: string[] = [];
  sentences.push(OPENING_SENTENCES[band]);

  const strengthSentence = buildStrengthSentence(band, selectedStrengths, limitedAlignmentMention);
  if (strengthSentence) sentences.push(strengthSentence);

  const gapSentence = buildGapSentence(band, selectedGaps);
  if (gapSentence) sentences.push(gapSentence);

  if (band === 'range' && gapSentence) {
    sentences.push(CLOSER_60S);
  }

  const hasTrueGaps = selectedGaps.some((mention) => !mention.isNeutral);
  if (band === 'limited' && gapSentence && hasTrueGaps) {
    sentences.push(CLOSER_50S);
  }

  const summary = sentences.join(' ');

  const headline =
    band === 'high'
      ? HEADLINES.high
      : band === 'strong'
      ? HEADLINES.strong
      : band === 'range'
      ? HEADLINES.range
      : band === 'limited'
      ? HEADLINES.limited
      : HEADLINES.misaligned;

  return {
    headline,
    summary,
    strengths: uniqueStrengthLabels,
    gaps: uniqueGapLabels,
  };
}
