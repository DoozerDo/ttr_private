export const INTERVIEW_QUESTION_GROUP_ORDER = [
  "Leadership and ownership",
  "Strategy and decision-making",
  "Customer impact and escalation",
  "Execution and operations",
  "Metrics and outcomes",
] as const;

export type InterviewQuestionGroup = (typeof INTERVIEW_QUESTION_GROUP_ORDER)[number];

export type SignalSeverity = "LOW" | "MEDIUM" | "HIGH";

export type SignalDimension =
  | "leadership"
  | "strategy"
  | "industry"
  | "customer"
  | "execution"
  | "metrics";

export interface DiagnosticSignal {
  id?: string;
  dimension?: SignalDimension;
  severity?: SignalSeverity;
  confidence?: number;
  signalLabel: string;
  supportingEvidence?: string;
}

export interface InterviewQuestion {
  signalId: string;
  group: InterviewQuestionGroup;
  dimension: SignalDimension;
  primary: string;
  followUp: string;
  severity: SignalSeverity;
  confidence: number;
  reason: string;
  focusFirst: boolean;
  order: number;
}

type CanonicalSignalDefinition = {
  id: string;
  label: string;
  normalizedLabel: string;
  group: InterviewQuestionGroup;
  dimension: SignalDimension;
  severity: SignalSeverity;
  primary: string;
  followUp: string;
  reason: string;
  sortOrder: number;
};

const CANONICAL_SIGNAL_DEFINITIONS: CanonicalSignalDefinition[] = [
  {
    id: "leadership-muted",
    label: "Leadership signal is muted",
    normalizedLabel: "leadership signal is muted",
    group: "Leadership and ownership",
    dimension: "leadership",
    severity: "HIGH",
    primary:
      "Can you walk me through a time you led a team or initiative, especially when authority or direction was not clearly defined?",
    followUp:
      "What was hardest about leading in that situation, and what did you learn from it?",
    reason: "Leadership experience appears underrepresented relative to the role.",
    sortOrder: 0,
  },
  {
    id: "strategy-reinforcement",
    label: "Strategy orientation needs reinforcement",
    normalizedLabel: "strategy orientation needs reinforcement",
    group: "Strategy and decision-making",
    dimension: "strategy",
    severity: "HIGH",
    primary:
      "Tell me about a time you had to make a strategic decision with incomplete information. How did you approach it?",
    followUp: "How did you balance short-term execution with longer-term impact?",
    reason: "Strategic decision-making exposure needs reinforcement for this opportunity.",
    sortOrder: 1,
  },
  {
    id: "industry-misaligned",
    label: "Industry context feels misaligned",
    normalizedLabel: "industry context feels misaligned",
    group: "Customer impact and escalation",
    dimension: "industry",
    severity: "MEDIUM",
    primary:
      "How have you ramped up quickly in a new domain or industry, and what helped you become effective?",
    followUp: "What signals do you look for to know you truly understand a space?",
    reason: "Industry and customer context appears less developed for this audience.",
    sortOrder: 2,
  },
  {
    id: "customer-impact-weak",
    label: "Customer impact signal is weak",
    normalizedLabel: "customer impact signal is weak",
    group: "Customer impact and escalation",
    dimension: "customer",
    severity: "MEDIUM",
    primary:
      "Can you share an example where a customer issue significantly influenced a product or operational decision you made?",
    followUp: "How did you communicate trade-offs to stakeholders or customers?",
    reason: "Customer impact exposure looks limited relative to the job expectations.",
    sortOrder: 3,
  },
  {
    id: "operations-reinforcement",
    label: "Operational rigor needs reinforcement",
    normalizedLabel: "operational rigor needs reinforcement",
    group: "Execution and operations",
    dimension: "execution",
    severity: "MEDIUM",
    primary:
      "Tell me about a process you improved or rebuilt to make a team more effective or predictable.",
    followUp: "What metrics told you the change was working?",
    reason: "Operational rigor could use reinforcement to keep teams predictable.",
    sortOrder: 4,
  },
  {
    id: "metrics-unclear",
    label: "Metrics and outcomes are unclear",
    normalizedLabel: "metrics and outcomes are unclear",
    group: "Metrics and outcomes",
    dimension: "metrics",
    severity: "MEDIUM",
    primary:
      "How do you typically define success for initiatives you lead, and how do you track progress?",
    followUp: "Can you share a time when the data told you to change course?",
    reason: "The role seems to demand a clearer metrics and outcomes orientation.",
    sortOrder: 5,
  },
];

const CANONICAL_LABEL_MAP = new Map(
  CANONICAL_SIGNAL_DEFINITIONS.map((definition) => [
    definition.normalizedLabel,
    definition,
  ]),
);

const SEVERITY_RANK: Record<SignalSeverity, number> = {
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};

const DEFAULT_OPTIONS = {
  maxSignalsPerDimension: 2,
  maxResults: 12,
} as const;

type EligibleSeverity = Exclude<SignalSeverity, "LOW">;

type NormalizedSignalEntry = {
  id: string;
  dimension: SignalDimension;
  severity: EligibleSeverity;
  confidence: number;
  definition: CanonicalSignalDefinition;
};

const isEligibleSeverity = (severity: SignalSeverity): severity is EligibleSeverity =>
  severity !== "LOW";

const isNormalizedSignalEntry = (
  entry: NormalizedSignalEntry | null,
): entry is NormalizedSignalEntry => Boolean(entry);

const normalizeLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const clampConfidence = (value: number): number => {
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
};

export function transformSignalsToInterviewQuestions(
  signals: Array<string | DiagnosticSignal | null | undefined>,
  options?: Partial<typeof DEFAULT_OPTIONS>,
): InterviewQuestion[] {
  if (!signals?.length) return [];

  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const normalized = signals
    .map((entry, index): NormalizedSignalEntry | null => {
      if (!entry) return null;

      const signalLabel = typeof entry === "string" ? entry : entry.signalLabel;
      if (!signalLabel?.trim()) return null;

      const normalizedInput = normalizeLabel(signalLabel);

      const canonical =
        CANONICAL_LABEL_MAP.get(normalizedInput) ??
        CANONICAL_SIGNAL_DEFINITIONS.find((definition) =>
          normalizedInput.includes(definition.normalizedLabel),
        );

      if (!canonical) return null;

      const rawSeverity =
        typeof entry === "object" && entry.severity ? entry.severity : canonical.severity;

      if (!isEligibleSeverity(rawSeverity)) return null;

      const dimension =
        typeof entry === "object" && entry.dimension ? entry.dimension : canonical.dimension;

      const rawConfidence =
        typeof entry === "object" && typeof entry.confidence === "number"
          ? entry.confidence
          : 0.6;

      const confidence = clampConfidence(rawConfidence);

      const entryId =
        typeof entry === "object" && entry?.id ? entry.id : `${canonical.id}-${index}`;

      return {
        id: entryId,
        dimension,
        severity: rawSeverity,
        confidence,
        definition: canonical,
      };
    })
    .filter(isNormalizedSignalEntry);

  const ordered = normalized.sort((a, b) => {
    const severityDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDelta !== 0) return severityDelta;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.definition.sortOrder - b.definition.sortOrder;
  });

  const perDimensionCount = new Map<SignalDimension, number>();
  const output: InterviewQuestion[] = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const entry = ordered[i];
    const dimensionCount = perDimensionCount.get(entry.dimension) ?? 0;

    if (dimensionCount >= mergedOptions.maxSignalsPerDimension) {
      continue;
    }

    perDimensionCount.set(entry.dimension, dimensionCount + 1);

    output.push({
      signalId: entry.id,
      group: entry.definition.group,
      dimension: entry.dimension,
      primary: entry.definition.primary,
      followUp: entry.definition.followUp,
      severity: entry.severity,
      confidence: entry.confidence,
      reason: entry.definition.reason,
      focusFirst: false,
      order: entry.definition.sortOrder,
    });
  }

  const limited = output.slice(0, mergedOptions.maxResults);

  return limited.map((question, index) => ({
    ...question,
    focusFirst: index < 3,
    order: index,
  }));
}
