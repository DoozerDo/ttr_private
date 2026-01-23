type ReasonItemType = "strength" | "gap";

export type ReasonItem = {
  type: ReasonItemType;
  message: string;
};

export type ReasonSummary = {
  primary: ReasonItem[];
  extras: ReasonItem[];
};

const GAP_SANITIZATION_MAP: Record<string, string> = {
  "Leadership signal is muted": "Leadership contributions feel understated",
  "Strategy orientation needs reinforcement": "Strategy experience could use more emphasis",
  "Industry context feels misaligned": "Industry impact could align more closely with the role",
};

const PRIMARY_REASON_LIMITS = {
  minStrengths: 2,
  minGaps: 1,
};

export function sanitizeGapMessage(value: string): string {
  return GAP_SANITIZATION_MAP[value] ?? value;
}

export function buildReasonSummary(
  strengths?: string[] | null,
  gaps?: string[] | null,
): ReasonSummary {
  const normalizedStrengths = (strengths ?? []).filter(Boolean);
  const normalizedGaps = (gaps ?? []).filter(Boolean).map(sanitizeGapMessage);

  const primary: ReasonItem[] = [
    ...normalizedStrengths
      .slice(0, PRIMARY_REASON_LIMITS.minStrengths)
      .map((message) => ({ type: "strength" as const, message })),
    ...normalizedGaps
      .slice(0, PRIMARY_REASON_LIMITS.minGaps)
      .map((message) => ({ type: "gap" as const, message })),
  ].slice(0, PRIMARY_REASON_LIMITS.minStrengths + PRIMARY_REASON_LIMITS.minGaps);

  const extras: ReasonItem[] = [
    ...normalizedStrengths
      .slice(PRIMARY_REASON_LIMITS.minStrengths)
      .map((message) => ({ type: "strength" as const, message })),
    ...normalizedGaps
      .slice(PRIMARY_REASON_LIMITS.minGaps)
      .map((message) => ({ type: "gap" as const, message })),
  ];

  return {
    primary,
    extras,
  };
}

type FlagSeverity = "block" | "warn";

export type ComplianceDisplayFlag = {
  id: string;
  message: string;
  severity: FlagSeverity;
};

const WARN_PATTERNS = [/too short/i, /limited/i];

function computeFlagSeverity(message: string): FlagSeverity {
  const match = WARN_PATTERNS.some((pattern) => pattern.test(message));
  return match ? "warn" : "block";
}

export function mapComplianceFlags(flags?: string[] | null): ComplianceDisplayFlag[] {
  if (!flags?.length) return [];
  return flags.map((flag, index) => ({
    id: `${flag}-${index}`,
    message: flag,
    severity: computeFlagSeverity(flag),
  }));
}

const SEVERITY_ORDER: Record<FlagSeverity, number> = {
  block: 0,
  warn: 1,
};

export function sortComplianceFlagsBySeverity(
  flags: ComplianceDisplayFlag[],
): ComplianceDisplayFlag[] {
  return [...flags].sort((a, b) => {
    const diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (diff !== 0) return diff;
    return a.message.localeCompare(b.message);
  });
}
