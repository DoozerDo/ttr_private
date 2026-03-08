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

export type StrategicGap = {
  title: string;
  requirementEvidence?: string | null;
  baselineEvidence?: string | null;
  severityScore?: number | null;
};

export type WinFactor = {
  id: string;
  title: string;
  detail: string;
};

export type RiskType = "Hard Gap" | "Soft Gap" | "Evidence Gap";

export type RiskFactor = {
  id: string;
  title: string;
  riskType: RiskType;
  detail: string;
  isCriticalRequirement: boolean;
  impactLine?: string;
};

export type StrategicBrief = {
  strategicSummary: string;
  whyYouCanWin: WinFactor[];
  whatMayHurtYou: RiskFactor[];
  bestNextMove: string;
};

function truncateSentence(value: string, limit = 120): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact.length) return "";
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 3).trimEnd()}...`;
}

function cleanPhrase(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
}

function extractQuotedPhrase(value: string): string | null {
  const match = value.match(/["']([^"']{6,120})["']/);
  if (!match?.[1]) return null;
  return cleanPhrase(match[1]);
}

function extractJobLanguagePhrase(gap: StrategicGap): string {
  const fallback = cleanPhrase(gap.title) || "core role requirement";
  const requirement = cleanPhrase(gap.requirementEvidence ?? "");
  if (!requirement) return fallback;

  const quoted = extractQuotedPhrase(requirement);
  if (quoted) return quoted;

  const segment =
    requirement
      .split(/[.;]|, and |, but |, with /i)
      .map((part) => cleanPhrase(part))
      .find((part) => part.length >= 18) ?? requirement;

  return truncateSentence(segment, 92);
}

function severityBand(score?: number | null): "high" | "medium" | "low" {
  if (typeof score !== "number") return "medium";
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

const OWNERSHIP_KEYWORD_PATTERN =
  /\b(own|lead|build|drive|responsible for|establish)\b/i;

const REQUIREMENT_STOPWORDS = new Set([
  "and",
  "with",
  "for",
  "from",
  "into",
  "across",
  "support",
  "teams",
  "team",
  "experience",
  "required",
  "preferred",
  "role",
  "the",
  "this",
  "that",
]);

function tokenizeRequirement(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length >= 4 && !REQUIREMENT_STOPWORDS.has(token),
  );
}

function buildRequirementTokenFrequency(gaps: StrategicGap[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const gap of gaps) {
    const requirement = cleanPhrase(gap.requirementEvidence ?? gap.title ?? "");
    if (!requirement) continue;
    const tokens = new Set(tokenizeRequirement(requirement));
    for (const token of tokens) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }
  return freq;
}

function detectCriticalRequirement(
  gap: StrategicGap,
  index: number,
  band: "high" | "medium" | "low",
  tokenFrequency: Map<string, number>,
): boolean {
  const requirement = cleanPhrase(gap.requirementEvidence ?? gap.title ?? "");
  const hasOwnershipLanguage = OWNERSHIP_KEYWORD_PATTERN.test(requirement);
  const tokens = tokenizeRequirement(requirement);
  const hasRepeatedKeyword = tokens.some((token) => (tokenFrequency.get(token) ?? 0) >= 2);
  const appearsNearTop = index <= 1;

  if (band !== "high") return false;
  if (appearsNearTop && hasOwnershipLanguage) return true;
  if (appearsNearTop && hasRepeatedKeyword) return true;
  if (hasOwnershipLanguage && hasRepeatedKeyword) return true;
  return false;
}

function classifyRiskType(gap: StrategicGap): RiskType {
  const hasBaselineEvidence = Boolean(gap.baselineEvidence?.trim());
  const severity = typeof gap.severityScore === "number" ? gap.severityScore : null;
  if (!hasBaselineEvidence) return "Hard Gap";
  if (severity !== null && severity >= 0.6) return "Soft Gap";
  return "Evidence Gap";
}

function buildWinFactors(
  strengths: string[],
  gaps: StrategicGap[],
): WinFactor[] {
  const requirementPool = gaps
    .map((gap) => gap.requirementEvidence?.trim())
    .filter((value): value is string => Boolean(value));
  const baselineEvidencePool = gaps
    .map((gap) => gap.baselineEvidence?.trim())
    .filter((value): value is string => Boolean(value));

  const winsFromStrengths = strengths.slice(0, 3).map((strength, index) => {
    const requirement = requirementPool[index] ?? requirementPool[0] ?? "the role's core expectations";
    const baselineEvidence =
      baselineEvidencePool[index] ?? baselineEvidencePool[0] ?? "";
    const detail = baselineEvidence
      ? `The role emphasizes "${truncateSentence(requirement, 95)}" and your baseline shows "${truncateSentence(baselineEvidence, 95)}".`
      : `This maps to "${truncateSentence(requirement, 95)}", which appears as a priority in this job.`;
    return {
      id: `win-${index + 1}`,
      title: strength,
      detail,
    };
  });

  if (winsFromStrengths.length >= 3) return winsFromStrengths;

  const supplemental = baselineEvidencePool.slice(0, 3 - winsFromStrengths.length).map((evidence, index) => ({
    id: `win-supplement-${index + 1}`,
    title: "Baseline evidence aligns with role priorities",
    detail: `Your baseline includes "${truncateSentence(evidence, 95)}", which supports role-relevant execution.`,
  }));

  return [...winsFromStrengths, ...supplemental].slice(0, 3);
}

function buildRiskFactors(gaps: StrategicGap[]): RiskFactor[] {
  const topGaps = gaps.slice(0, 3);
  const tokenFrequency = buildRequirementTokenFrequency(topGaps);
  let criticalImpactUsed = false;

  return topGaps.map((gap, index) => {
    const riskType = classifyRiskType(gap);
    const band = severityBand(gap.severityScore);
    const jdPhrase = extractJobLanguagePhrase(gap);
    const baseline = cleanPhrase(gap.baselineEvidence ?? "");
    const isCriticalRequirement = detectCriticalRequirement(
      gap,
      index,
      band,
      tokenFrequency,
    );

    let detail: string;
    if (riskType === "Hard Gap") {
      if (band === "high") {
        detail = `This role explicitly calls for "${jdPhrase}". This requirement appears central, but your baseline does not currently show direct evidence.`;
      } else {
        detail = `Hiring managers will likely look for "${jdPhrase}", but your baseline does not yet show direct ownership in that area.`;
      }
    } else if (riskType === "Soft Gap") {
      const baselineSnippet = baseline || "adjacent baseline evidence";
      if (band === "high") {
        detail = `The job description prioritizes "${jdPhrase}". Your baseline shows adjacent evidence ("${truncateSentence(
          baselineSnippet,
          92,
        )}") but it may not read as direct ownership yet.`;
      } else {
        detail = `This role explicitly expects "${jdPhrase}", while your baseline currently highlights "${truncateSentence(
          baselineSnippet,
          92,
        )}" which is relevant but still indirect.`;
      }
    } else {
      const baselineSnippet = baseline || "related experience";
      detail = `The JD references "${jdPhrase}". Your baseline includes "${truncateSentence(
        baselineSnippet,
        92,
      )}", so the experience may exist, but it is not clearly surfaced as direct role-fit evidence today.`;
    }

    const qualifiesForCandidacySignal =
      !criticalImpactUsed &&
      riskType === "Hard Gap" &&
      band === "high" &&
      isCriticalRequirement;

    const impactLine = qualifiesForCandidacySignal
      ? "This requirement may materially affect candidacy for this role."
      : undefined;

    if (qualifiesForCandidacySignal) {
      criticalImpactUsed = true;
      detail = `${detail} Hiring managers may view this as a significant gap.`;
    }

    return {
      id: `risk-${index + 1}`,
      title: gap.title,
      riskType,
      detail,
      isCriticalRequirement,
      impactLine,
    };
  });
}

function buildBestNextMove(
  verdict: string,
  risks: RiskFactor[],
  wins: WinFactor[],
): string {
  const leadRisk = risks[0]?.title ?? "the top documented gap";
  const leadWin = wins[0]?.title ?? "your strongest aligned experience";

  const normalizedVerdict = verdict.toLowerCase();
  if (normalizedVerdict === "apply") {
    return `Apply and tailor your resume around ${leadWin.toLowerCase()}, then proactively address ${leadRisk.toLowerCase()} in your cover letter and interview prep.`;
  }
  if (normalizedVerdict === "borderline") {
    return `Apply only if this role is a priority, and lead with ${leadWin.toLowerCase()} while directly addressing ${leadRisk.toLowerCase()}.`;
  }
  if (normalizedVerdict === "skip") {
    return `Skip unless you have additional relevant evidence not yet captured in your baseline; if you continue, first close ${leadRisk.toLowerCase()}.`;
  }
  return "Load the latest analysis to get a role-specific next move.";
}

export function buildStrategicBrief(input: {
  verdict: string;
  strengths?: string[] | null;
  criticalGaps?: StrategicGap[] | null;
  verdictExplanation?: string | null;
}): StrategicBrief {
  const strengths = (input.strengths ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  const criticalGaps = (input.criticalGaps ?? []).filter(Boolean);

  const whyYouCanWin = buildWinFactors(strengths, criticalGaps);
  const whatMayHurtYou = buildRiskFactors(criticalGaps);
  const bestNextMove = buildBestNextMove(input.verdict, whatMayHurtYou, whyYouCanWin);

  const winTitles = whyYouCanWin.slice(0, 2).map((item) => item.title.toLowerCase());
  const riskTitle = whatMayHurtYou[0]?.title.toLowerCase();
  const strategicSummary = [
    `${input.verdict}.`,
    winTitles.length
      ? `You are competitive because of ${winTitles.join(" and ")}.`
      : input.verdictExplanation?.trim() || "Review the structured fit signals before applying.",
    riskTitle ? `You may be challenged on ${riskTitle}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    strategicSummary,
    whyYouCanWin,
    whatMayHurtYou,
    bestNextMove,
  };
}
