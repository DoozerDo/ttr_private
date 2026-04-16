import type { ClaimVerificationStatus, NormalizedClaimVerification } from "./claimVerification";

export type GenerationReadiness = {
  status: "ready" | "limited" | "blocked";
  blocked: boolean;
  reasonCodes: string[];
  reasons: Array<{
    code:
      | "full_block"
      | "baseline_verification_gap"
      | "unsupported_technology_claim"
      | "personalization_limitation";
    message: string;
  }>;
  badgeLabel: "READY" | "LIMITED" | "BLOCKED";
  summary: string;
  verificationIssues: VerificationIssue[];
};

export type VerificationCoverage = {
  status: "strong" | "partial" | "weak";
  verifiedClaims: number;
  inferredClaims: number;
  unverifiedClaims: number;
  supportedClaims: number;
  unsupportedClaims: number;
  totalClaims: number;
  summary: string;
};

export type TargetingAdjustmentResult = {
  readiness: GenerationReadiness;
  removedClaims: string[];
};

type ServerReadinessPayload = {
  status?: string;
  reasons?: Array<{ code?: string; message?: string }>;
  compliance_flags?: unknown;
};

export type VerificationIssue = {
  code:
    | "missing_baseline_evidence"
    | "unsupported_technology_claim"
    | "generation_overreach"
    | "role_targeting_emphasis_exceeds_support"
    | "verification_constraint";
  severity: "block" | "warn";
  claim: string | null;
  source: "resume_generation" | "cover_letter_generation" | "targeting_context";
  claimStatus?: ClaimVerificationStatus;
  requirementType?: "platform" | "role";
  explanation: string;
  sourceContext: string | null;
  recommendedAction: string;
};

export type AggregatedVerificationIssues = {
  primary: VerificationIssue[];
  grouped: Array<{ label: string; count: number }>;
};

export function buildVerificationIssuesFromCanonicalClaims(
  claimVerifications: NormalizedClaimVerification[],
): VerificationIssue[] {
  if (!claimVerifications.length) return [];
  return claimVerifications
    .filter((claim) => claim.status === "UNVERIFIED")
    .map((claim) => {
      const normalizedLabel =
        normalizeUserFacingRequirementLabel(claim.label, {}) ?? claim.label;
      const claimLower = normalizedLabel.trim().toLowerCase();
      const requirementType: "platform" | "role" = KNOWN_PLATFORM_TOKENS.has(claimLower)
        ? "platform"
        : "role";
      return {
        code: "unsupported_technology_claim",
        severity: "block",
        claim: normalizedLabel,
        source: "targeting_context",
        claimStatus: "UNVERIFIED" as ClaimVerificationStatus,
        requirementType,
        explanation: issueExplanation("unsupported_technology_claim", requirementType),
        sourceContext: null,
        recommendedAction: issueRecommendedAction("unsupported_technology_claim", requirementType),
      };
    });
}

type NormalizedComplianceFlag = {
  code: string;
  severity: "block" | "warn";
  message: string;
  evidence: Array<{
    baseline?: string;
    generated?: string;
    generatedClaim?: {
      text?: string;
      type?: "company" | "technology" | "concept" | "derived" | "operational_descriptor";
    };
  }>;
};

const hasBlockerSeverity = (flag: unknown): boolean => {
  if (!flag || typeof flag !== "object") return false;
  const typed = flag as {
    severity?: unknown;
    level?: unknown;
    status?: unknown;
  };
  const candidates = [typed.severity, typed.level, typed.status]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  return candidates.some((value) => value.includes("block"));
};

const hasWarningSeverity = (flag: unknown): boolean => {
  if (!flag || typeof flag !== "object") return false;
  const typed = flag as {
    severity?: unknown;
    level?: unknown;
    status?: unknown;
  };
  const candidates = [typed.severity, typed.level, typed.status]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  return candidates.some((value) => value.includes("warn"));
};

function addUniqueReason(
  reasons: GenerationReadiness["reasons"],
  reason: GenerationReadiness["reasons"][number],
) {
  if (reasons.some((existing) => existing.code === reason.code)) return;
  reasons.push(reason);
}

function toNormalizedComplianceFlags(flags: unknown): NormalizedComplianceFlag[] {
  if (!Array.isArray(flags)) return [];
  const normalized: NormalizedComplianceFlag[] = [];
  for (const entry of flags) {
    if (!entry || typeof entry !== "object") continue;
    const typed = entry as Record<string, unknown>;
    const code = typeof typed.code === "string" ? typed.code.trim().toLowerCase() : "";
    if (!code) continue;
    const severityRaw =
      typeof typed.severity === "string" ? typed.severity.trim().toLowerCase() : "";
    const severity: "block" | "warn" = severityRaw === "warn" ? "warn" : "block";
    const message = typeof typed.message === "string" ? typed.message.trim() : "";
    const evidence: Array<{
      baseline?: string;
      generated?: string;
      generatedClaim?: {
        text?: string;
        type?: "company" | "technology" | "concept" | "derived" | "operational_descriptor";
      };
    }> = [];
    if (Array.isArray(typed.evidence)) {
      for (const evidenceEntry of typed.evidence) {
        if (!evidenceEntry || typeof evidenceEntry !== "object") continue;
        const evidenceTyped = evidenceEntry as Record<string, unknown>;
        evidence.push({
          baseline:
            typeof evidenceTyped.baseline === "string"
              ? evidenceTyped.baseline.trim()
              : undefined,
          generated:
            typeof evidenceTyped.generated === "string"
              ? evidenceTyped.generated.trim()
              : undefined,
          generatedClaim:
            evidenceTyped.generatedClaim && typeof evidenceTyped.generatedClaim === "object"
              ? {
                  text:
                    typeof (evidenceTyped.generatedClaim as Record<string, unknown>).text ===
                    "string"
                      ? String((evidenceTyped.generatedClaim as Record<string, unknown>).text).trim()
                      : undefined,
                  type:
                    typeof (evidenceTyped.generatedClaim as Record<string, unknown>).type ===
                      "string" &&
                    ["company", "technology", "concept", "derived", "operational_descriptor"].includes(
                      String((evidenceTyped.generatedClaim as Record<string, unknown>).type),
                    )
                      ? (evidenceTyped.generatedClaim as {
                          type:
                            | "company"
                            | "technology"
                            | "concept"
                            | "derived"
                            | "operational_descriptor";
                        }).type
                      : undefined,
                }
              : undefined,
        });
      }
    }
    normalized.push({ code, severity, message, evidence });
  }
  return normalized;
}

function pickClaim(flag: NormalizedComplianceFlag): string | null {
  for (const entry of flag.evidence) {
    if (entry.generatedClaim?.text && entry.generatedClaim.text.length > 0) {
      return entry.generatedClaim.text;
    }
    if (entry.generated && entry.generated.length > 0) return entry.generated;
  }
  const quoted = flag.message.match(/"([^"]+)"/);
  if (quoted?.[1]) return quoted[1].trim();
  return null;
}

export function normalizeUserFacingClaimLabel(claim: string | null): string | null {
  return normalizeUserFacingRequirementLabel(claim);
}

function coerceContextText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

const KNOWN_PLATFORM_TOKENS = new Set([
  "five9",
  "salesforce",
  "zendesk",
  "servicenow",
  "service now",
  "talkdesk",
  "jira",
  "kubernetes",
  "aws",
  "azure",
  "gcp",
]);

const SUPPRESSED_JUNK_LABELS = new Set([
  "next",
  "n/a",
  "na",
  "none",
  "unknown",
  "tbd",
]);

const PLATFORM_TOKEN_LABELS: Record<string, string> = {
  aws: "Amazon Web Services (AWS)",
  azure: "Microsoft Azure",
  gcp: "Google Cloud Platform (GCP)",
  servicenow: "ServiceNow",
  "service now": "ServiceNow",
  jira: "Jira",
  kubernetes: "Kubernetes",
  salesforce: "Salesforce",
  zendesk: "Zendesk",
  talkdesk: "Talkdesk",
  five9: "Five9",
};

export function normalizeUserFacingRequirementLabel(
  claim: string | null,
  context?: { sourceContext?: string | null; flagMessage?: string | null; issueCode?: VerificationIssue["code"] },
): string | null {
  if (!claim) return null;
  const trimmed = claim.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length < 3) return null;
  if (!/[a-z0-9]/i.test(trimmed)) return null;
  const lowered = trimmed.toLowerCase();
  if (SUPPRESSED_JUNK_LABELS.has(lowered)) return null;
  if (lowered === "[object object]" || lowered === "object object" || lowered === "undefined" || lowered === "null") {
    return null;
  }
  if (trimmed.split(" ").length === 1 && trimmed.length <= 3 && !KNOWN_PLATFORM_TOKENS.has(lowered)) {
    return null;
  }
  const suppressedExact = new Set([
    "multi-system",
    "multisystem",
    "multi system",
    "platform stack",
    "system stack",
  ]);
  if (suppressedExact.has(lowered)) return null;
  if (/^[a-z]+(?:-[a-z]+)+$/.test(lowered) && !/[0-9]/.test(lowered)) {
    const genericSuffixes = ["system", "platform", "stack", "process"];
    const parts = lowered.split("-");
    if (parts.length <= 2 && genericSuffixes.includes(parts[parts.length - 1] ?? "")) {
      return null;
    }
  }
  if (KNOWN_PLATFORM_TOKENS.has(lowered)) {
    return PLATFORM_TOKEN_LABELS[lowered] ?? trimmed;
  }
  if (lowered === "self-service" || lowered === "self service") {
    const contextText = coerceContextText([
      context?.sourceContext,
      context?.flagMessage,
      context?.issueCode ? String(context.issueCode) : null,
    ]);
    if (contextText.includes("customer")) return "Customer self-service";
    if (contextText.includes("support") || contextText.includes("ticket")) return "Self-service support";
    if (contextText.includes("experience")) return "Self-service experience";
    return null;
  }
  return trimmed;
}

function classifyRequirementType(
  label: string | null,
  issueCode: VerificationIssue["code"],
  hint?: "platform" | "role",
): "platform" | "role" {
  if (hint) return hint;
  const lowered = (label ?? "").trim().toLowerCase();
  if (!lowered) return "role";
  if (KNOWN_PLATFORM_TOKENS.has(lowered)) return "platform";
  if (issueCode === "unsupported_technology_claim") {
    const tokenized = lowered.split(/[^\w+.-]+/).filter(Boolean);
    if (tokenized.some((token) => KNOWN_PLATFORM_TOKENS.has(token))) {
      return "platform";
    }
  }
  return "role";
}

function isSanitizedClaimValid(claim: string): boolean {
  const trimmed = claim.trim();
  if (!trimmed) return false;
  if (trimmed.length < 3) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^\d{3,}$/.test(trimmed)) return false;
  if (/^[0-9\-\s]+$/.test(trimmed)) return false;
  if (/^\d{3}-\d{3}-\d{4}$/.test(trimmed)) return false;
  if (/^\d{3}\s\d{3}\s\d{4}$/.test(trimmed)) return false;
  if (/^\d+[A-Za-z]+$/.test(trimmed)) return false;
  const lowered = trimmed.toLowerCase();
  if (
    [
      "scalable",
      "strategic",
      "high-impact",
      "impactful",
      "collaborative",
      "dynamic",
    ].includes(lowered)
  ) {
    return false;
  }
  if (
    [
      /^[a-z0-9]+-impacting$/i,
      /^[a-z0-9]+-focused$/i,
      /^[a-z0-9]+-driven$/i,
      /^[a-z0-9]+-response$/i,
      /^[a-z0-9]+-volume$/i,
      /^[a-z0-9]+-facing$/i,
      /^[a-z0-9]+-channel$/i,
      /^[a-z0-9]+-team$/i,
    ].some((pattern) => pattern.test(trimmed))
  ) {
    return false;
  }
  if (["first response", "high volume", "cross team", "customer facing"].includes(lowered)) {
    return false;
  }
  if ((/-enabled$/i.test(trimmed) || /\benabled$/i.test(trimmed)) && !["salesforce-enabled", "zendesk-enabled", "servicenow-enabled", "five9-enabled", "kubernetes-enabled"].includes(lowered)) {
    return false;
  }

  const digits = (trimmed.match(/\d/g) ?? []).length;
  if (digits > 0) {
    const nonSpaceChars = trimmed.replace(/\s+/g, "").length;
    if (nonSpaceChars > 0 && digits / nonSpaceChars > 0.5) return false;
  }
  return true;
}

export function sanitizeClaims(claims: string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const claim of claims) {
    const value = claim.trim();
    if (!isSanitizedClaimValid(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
  }
  return cleaned;
}

function pickSourceContext(flag: NormalizedComplianceFlag): string | null {
  for (const entry of flag.evidence) {
    if (entry.baseline && entry.baseline.length > 0) return entry.baseline;
  }
  return null;
}

function classifyIssueCode(flag: NormalizedComplianceFlag): VerificationIssue["code"] {
  const firstTypedClaim = flag.evidence.find((entry) => entry.generatedClaim?.type)?.generatedClaim;
  if (firstTypedClaim?.type === "company") {
    return "verification_constraint";
  }
  if (firstTypedClaim?.type === "operational_descriptor") {
    return "verification_constraint";
  }
  if (firstTypedClaim?.type === "technology") {
    return "unsupported_technology_claim";
  }
  const code = flag.code;
  if (
    code.includes("fictional_technology") ||
    code.includes("unsupported_technology") ||
    code.includes("tech")
  ) {
    return "unsupported_technology_claim";
  }
  if (
    code.includes("missing_baseline") ||
    code.includes("unverified") ||
    code.includes("baseline_support")
  ) {
    return "missing_baseline_evidence";
  }
  if (code.includes("personalization") || code.includes("limited")) {
    return "role_targeting_emphasis_exceeds_support";
  }
  if (
    code.includes("scope_inflation") ||
    code.includes("invented_company") ||
    code.includes("invented_role") ||
    code.includes("invented_metric") ||
    code.includes("invented_scope")
  ) {
    return "generation_overreach";
  }
  return "verification_constraint";
}

function issueExplanation(
  code: VerificationIssue["code"],
  requirementType: "platform" | "role",
): string {
  if (code === "unsupported_technology_claim") {
    return requirementType === "platform"
      ? "This platform requirement could not be verified from the evidence currently used for generation."
      : "This role requirement could not be verified from the evidence currently used for generation.";
  }
  if (code === "missing_baseline_evidence") {
    return requirementType === "platform"
      ? "This platform requirement could not be verified from the evidence currently used for generation."
      : "This role requirement could not be verified from the evidence currently used for generation.";
  }
  if (code === "generation_overreach") {
    return "The generated wording appears to exceed what is directly supported by verified evidence.";
  }
  if (code === "role_targeting_emphasis_exceeds_support") {
    return "Role-targeted personalization is currently stronger than the verified evidence available for this context.";
  }
  return "This requirement could not be verified from the current generation context.";
}

function issueRecommendedAction(
  code: VerificationIssue["code"],
  requirementType: "platform" | "role",
): string {
  if (code === "unsupported_technology_claim") {
    return requirementType === "platform"
      ? "Remove unsupported platform emphasis, or add verified evidence only if this experience is real."
      : "Remove unsupported requirement emphasis, or add verified evidence only if this experience is real.";
  }
  if (code === "missing_baseline_evidence") {
    return "Review baseline evidence and add missing verified details only if they are true.";
  }
  if (code === "generation_overreach") {
    return "Re-run generation with stricter truth boundaries and keep claims anchored to verified evidence.";
  }
  if (code === "role_targeting_emphasis_exceeds_support") {
    return "Reduce targeting emphasis for unsupported requirements, then re-run generation.";
  }
  return "Review verification constraints and re-run generation with stricter truth boundaries.";
}

function mapFlagsToVerificationIssues(
  flags: unknown,
  source: VerificationIssue["source"],
): VerificationIssue[] {
  const normalized = toNormalizedComplianceFlags(flags);
  const deduped: VerificationIssue[] = [];
  const sanitizedClaims = new Set(
    sanitizeClaims(
      normalized
        .map((flag) =>
          normalizeUserFacingRequirementLabel(pickClaim(flag), {
            sourceContext: pickSourceContext(flag),
            flagMessage: flag.message,
            issueCode: classifyIssueCode(flag),
          }),
        )
        .filter((claim): claim is string => Boolean(claim && claim.trim().length > 0)),
    ).map((claim) => claim.toLowerCase()),
  );

  for (const flag of normalized) {
    const hasCompanyTypedClaim = flag.evidence.some(
      (entry) => entry.generatedClaim?.type === "company",
    );
    const hasOperationalDescriptorTypedClaim = flag.evidence.some(
      (entry) => entry.generatedClaim?.type === "operational_descriptor",
    );
    if (hasCompanyTypedClaim || hasOperationalDescriptorTypedClaim) {
      continue;
    }
    const issueCode = classifyIssueCode(flag);
    const claim = normalizeUserFacingRequirementLabel(pickClaim(flag), {
      sourceContext: pickSourceContext(flag),
      flagMessage: flag.message,
      issueCode,
    });
    if (claim && !sanitizedClaims.has(claim.trim().toLowerCase())) {
      continue;
    }
    const sourceContext = pickSourceContext(flag);
    const requirementTypeHint = flag.evidence.some((entry) => entry.generatedClaim?.type === "technology")
      ? "platform"
      : undefined;
    const requirementType = classifyRequirementType(claim, issueCode, requirementTypeHint);
    const key = `${source}:${issueCode}:${flag.severity}:${(claim ?? "").toLowerCase()}`;
    if (
      deduped.some(
        (issue) =>
          `${issue.source}:${issue.code}:${issue.severity}:${(issue.claim ?? "").toLowerCase()}` === key,
      )
    ) {
      continue;
    }
    deduped.push({
      code: issueCode,
      severity: flag.severity,
      claim,
      source,
      claimStatus:
        issueCode === "role_targeting_emphasis_exceeds_support" ? "INFERRED" : "UNVERIFIED",
      requirementType,
      explanation: issueExplanation(issueCode, requirementType),
      sourceContext,
      recommendedAction: issueRecommendedAction(issueCode, requirementType),
    });
  }

  return deduped;
}

function normalizeIssueClaim(claim: string | null): string {
  return (claim ?? "").trim().toLowerCase();
}

function getUserFacingIssueLabel(issue: VerificationIssue): string | null {
  return normalizeUserFacingRequirementLabel(issue.claim, {
    sourceContext: issue.sourceContext,
    issueCode: issue.code,
  });
}

function isNoiseClaim(claim: string | null): boolean {
  if (!claim) return false;
  const trimmed = claim.trim();
  if (!trimmed) return true;
  if (/^\d+$/.test(trimmed)) return true;
  if (/^[\W_]+$/.test(trimmed)) return true;
  const alnum = trimmed.replace(/[^a-z0-9]/gi, "");
  if (alnum.length > 0 && alnum.length < 3) return true;
  if (/^\d{4}$/.test(trimmed)) return true;
  return false;
}

function issueTypeRank(issue: VerificationIssue): number {
  if (issue.code === "missing_baseline_evidence" || issue.code === "generation_overreach") {
    return 3;
  }
  if (issue.code === "unsupported_technology_claim") {
    return 2;
  }
  return 1;
}

function issueGroupType(issue: VerificationIssue): "core" | "tooling" | "derived" {
  if (issue.code === "unsupported_technology_claim") return "tooling";
  if (issue.code === "role_targeting_emphasis_exceeds_support") return "derived";
  return "core";
}

function issueGroupLabel(groupType: "core" | "tooling" | "derived", source: VerificationIssue["source"]): string {
  const sourceLabel =
    source === "resume_generation"
      ? "resume generation"
      : source === "cover_letter_generation"
        ? "cover letter generation"
        : "targeting context";
  if (groupType === "tooling") return `Multiple unsupported platform requirements in ${sourceLabel}`;
  if (groupType === "derived") return `Multiple derived verification limitations in ${sourceLabel}`;
  return `Multiple core verification blockers in ${sourceLabel}`;
}

function issueGroupLabelWithoutClaim(source: VerificationIssue["source"]): string {
  const sourceLabel =
    source === "resume_generation"
      ? "resume generation"
      : source === "cover_letter_generation"
        ? "cover letter generation"
        : "targeting context";
  return `Additional verification limitations in ${sourceLabel}`;
}

export function aggregateVerificationIssues(
  issues: VerificationIssue[],
): AggregatedVerificationIssues {
  const deduped: VerificationIssue[] = [];
  const hiddenMap = new Map<string, { label: string; count: number }>();
  const seen = new Set<string>();
  for (const issue of issues) {
    const label = getUserFacingIssueLabel(issue);
    if (!label || isNoiseClaim(label)) {
      const key = `hidden:${issue.source}`;
      const existing = hiddenMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        hiddenMap.set(key, { label: issueGroupLabelWithoutClaim(issue.source), count: 1 });
      }
      continue;
    }
    const key = `${issue.severity}:${issue.code}:${issue.source}:${normalizeIssueClaim(label)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      ...issue,
      claim: label,
    });
  }

  deduped.sort((a, b) => {
    const severityRankA = a.severity === "block" ? 2 : 1;
    const severityRankB = b.severity === "block" ? 2 : 1;
    if (severityRankA !== severityRankB) return severityRankB - severityRankA;
    const typeRankDiff = issueTypeRank(b) - issueTypeRank(a);
    if (typeRankDiff !== 0) return typeRankDiff;
    return normalizeIssueClaim(a.claim).localeCompare(normalizeIssueClaim(b.claim));
  });

  const primary = deduped.slice(0, 3);
  const remainder = deduped.slice(3);
  const groupedMap = new Map<string, { label: string; count: number }>();
  for (const issue of remainder) {
    const groupType = issueGroupType(issue);
    const key = `${groupType}:${issue.source}`;
    const existing = groupedMap.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    groupedMap.set(key, {
      label: issueGroupLabel(groupType, issue.source),
      count: 1,
    });
  }

  return {
    primary,
    grouped: [...Array.from(groupedMap.values()), ...Array.from(hiddenMap.values())],
  };
}

function addIssueFallbackFromReason(
  issues: VerificationIssue[],
  reason: { code: string; message: string },
): void {
    const severity: VerificationIssue["severity"] =
    reason.code === "full_block" || reason.code.includes("block") ? "block" : "warn";
  const code: VerificationIssue["code"] =
    reason.code === "unsupported_technology_claim"
      ? "unsupported_technology_claim"
      : reason.code === "baseline_verification_gap"
      ? "missing_baseline_evidence"
      : reason.code === "personalization_limitation"
      ? "role_targeting_emphasis_exceeds_support"
      : "verification_constraint";
  if (issues.some((issue) => issue.code === code && issue.source === "targeting_context")) return;
  issues.push({
    code,
    severity,
    claim: null,
    source: "targeting_context",
    claimStatus: code === "role_targeting_emphasis_exceeds_support" ? "INFERRED" : "UNVERIFIED",
    explanation: reason.message,
    sourceContext: null,
    recommendedAction: issueRecommendedAction(code, "role"),
    requirementType: "role",
  });
}

function debugReadinessPayload(label: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.debug(label, payload);
}

export function getGenerationReadiness(
  result: unknown,
  runState: "ok" | "compliance_blocked" | null,
  fitScore: number | null = null,
): GenerationReadiness {
  const inferredFitScore =
    typeof fitScore === "number" && Number.isFinite(fitScore)
      ? fitScore
      : result && typeof result === "object" && typeof (result as { score?: unknown }).score === "number"
        ? ((result as { score?: number }).score as number)
        : null;

  const reasonCodes: string[] = [];
  const reasons: GenerationReadiness["reasons"] = [];

  if (runState === "compliance_blocked") {
    reasonCodes.push("run_state_blocked");
    addUniqueReason(reasons, {
      code: "full_block",
      message:
        "Some claims required for tailored generation could not be verified against your baseline.",
    });
  }

  if (result && typeof result === "object") {
    const typed = result as {
      verdict?: unknown;
      compliance?: { blocked?: unknown };
      complianceFlags?: unknown;
      compliance_flags?: unknown;
    };

    if (typed.verdict === "blocked") {
      reasonCodes.push("verdict_blocked");
      addUniqueReason(reasons, {
        code: "full_block",
        message:
          "Some claims required for tailored generation could not be verified against your baseline.",
      });
    }

    if (typed.compliance?.blocked === true) {
      reasonCodes.push("compliance_blocked_flag");
      addUniqueReason(reasons, {
        code: "full_block",
        message:
          "Some claims required for tailored generation could not be verified against your baseline.",
      });
    }

    const flags = [
      ...(Array.isArray(typed.complianceFlags) ? typed.complianceFlags : []),
      ...(Array.isArray(typed.compliance_flags) ? typed.compliance_flags : []),
    ];

    if (flags.some((flag) => hasBlockerSeverity(flag))) {
      reasonCodes.push("severity_blocker");
      addUniqueReason(reasons, {
        code: "full_block",
        message:
          "Some claims required for tailored generation could not be verified against your baseline.",
      });
    }

    if (flags.some((flag) => hasWarningSeverity(flag))) {
      reasonCodes.push("severity_warning");
      addUniqueReason(reasons, {
        code: "personalization_limitation",
        message:
          "This role scored highly, but document generation needs more verified evidence.",
      });
    }

    const stringFlags = flags
      .map((flag) => {
        if (typeof flag === "string") return flag.toLowerCase();
        if (flag && typeof flag === "object") {
          const code = (flag as { code?: unknown }).code;
          return typeof code === "string" ? code.toLowerCase() : "";
        }
        return "";
      })
      .filter((value) => value.length > 0);

    if (stringFlags.some((code) => code.includes("unsupported_tech") || code.includes("fictional_tech"))) {
      reasonCodes.push("unsupported_technology_claim");
      addUniqueReason(reasons, {
        code: "unsupported_technology_claim",
        message:
          "Technology claims needed for this role are not currently supported by your verified baseline evidence.",
      });
    }

    if (
      stringFlags.some(
        (code) =>
          code.includes("missing_baseline") ||
          code.includes("baseline_support") ||
          code.includes("unverified"),
      )
    ) {
      reasonCodes.push("baseline_verification_gap");
      addUniqueReason(reasons, {
        code: "baseline_verification_gap",
        message:
          "Some claims required for tailored generation could not be verified against your baseline.",
      });
    }

    if (stringFlags.some((code) => code.includes("personalization") || code.includes("limited"))) {
      reasonCodes.push("personalization_limited");
      addUniqueReason(reasons, {
        code: "personalization_limitation",
        message:
          "Tailored generation needs more verified evidence before it is fully ready.",
      });
    }
  }

  if (inferredFitScore === null || !Number.isFinite(inferredFitScore)) {
    reasonCodes.push("missing_score");
    addUniqueReason(reasons, {
      code: "full_block",
      message: "Fit score is unavailable for this analysis.",
    });
  } else if (inferredFitScore < 70) {
    reasonCodes.push("score_floor_blocked");
    addUniqueReason(reasons, {
      code: "full_block",
      message: "Fit score is below the Studio readiness floor.",
    });
  }
  const blocked = reasonCodes.some((code) =>
    ["run_state_blocked", "verdict_blocked", "compliance_blocked_flag", "severity_blocker", "score_floor_blocked"].includes(code),
  );
  const status: GenerationReadiness["status"] = blocked
    ? "blocked"
    : reasons.length > 0
      ? "limited"
      : "ready";
  const badgeLabel: GenerationReadiness["badgeLabel"] =
    status === "blocked" ? "BLOCKED" : status === "limited" ? "LIMITED" : "READY";
  const summary =
    status === "blocked"
      ? "Strong fit can still be blocked for generation when verification requirements are not met."
      : status === "limited"
        ? "Your baseline needs more verified evidence before generation is fully ready."
        : "Generation is ready for this scored analysis context.";

  if (process.env.NODE_ENV !== "production") {
    console.debug("readinessDebug.reconcile", {
      inputStatus: status,
      inputReasons: reasons,
      status,
      blocked,
      summary,
    });
  }

  return {
    status,
    blocked,
    reasonCodes,
    reasons,
    badgeLabel,
    summary,
    verificationIssues: reasons.map((reason) => ({
      code:
        reason.code === "unsupported_technology_claim"
          ? "unsupported_technology_claim"
          : reason.code === "baseline_verification_gap"
          ? "missing_baseline_evidence"
          : reason.code === "personalization_limitation"
          ? "role_targeting_emphasis_exceeds_support"
          : "verification_constraint",
      severity: reason.code === "full_block" ? "block" : "warn",
      claim: null,
      source: "targeting_context",
      claimStatus:
        reason.code === "personalization_limitation" ? "INFERRED" : "UNVERIFIED",
      explanation: reason.message,
      sourceContext: null,
      recommendedAction: issueRecommendedAction(
        reason.code === "unsupported_technology_claim"
          ? "unsupported_technology_claim"
          : reason.code === "baseline_verification_gap"
          ? "missing_baseline_evidence"
          : reason.code === "personalization_limitation"
          ? "role_targeting_emphasis_exceeds_support"
          : "verification_constraint",
        "role",
      ),
      requirementType: "role",
    })),
  };
}

export function combineGenerationReadinessFromServer(
  resumeReadiness: ServerReadinessPayload | null,
  coverReadiness: ServerReadinessPayload | null,
): GenerationReadiness {
  const statuses = [resumeReadiness?.status, coverReadiness?.status]
    .filter((status): status is string => typeof status === "string")
    .map((status) => status.toLowerCase());
  const reasons = [
    ...(Array.isArray(resumeReadiness?.reasons) ? resumeReadiness.reasons : []),
    ...(Array.isArray(coverReadiness?.reasons) ? coverReadiness.reasons : []),
  ]
    .filter(
      (reason): reason is { code: string; message: string } =>
        Boolean(reason?.code && reason?.message),
    )
    .filter((reason, index, all) => all.findIndex((candidate) => candidate.code === reason.code) === index);

  const status: GenerationReadiness["status"] = statuses.includes("blocked")
    ? "blocked"
    : statuses.includes("limited")
      ? "limited"
      : statuses.length === 2 && statuses.every((value) => value === "ready")
        ? "ready"
        : "limited";

  const badgeLabel: GenerationReadiness["badgeLabel"] =
    status === "blocked" ? "BLOCKED" : status === "limited" ? "LIMITED" : "READY";

  const verificationIssues: VerificationIssue[] = [
    ...mapFlagsToVerificationIssues(resumeReadiness?.compliance_flags, "resume_generation"),
    ...mapFlagsToVerificationIssues(coverReadiness?.compliance_flags, "cover_letter_generation"),
  ];

  if (verificationIssues.length === 0) {
    for (const reason of reasons) {
      addIssueFallbackFromReason(verificationIssues, reason);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("readinessDebug.combine", {
      resumeReadiness,
      coverReadiness,
      status,
      reasons,
      verificationIssues,
    });
  }

  return {
    status,
    blocked: status === "blocked",
    reasonCodes: reasons.map((reason) => reason.code),
    reasons: reasons.map((reason) => ({
      code: reason.code as GenerationReadiness["reasons"][number]["code"],
      message: reason.message,
    })),
    badgeLabel,
    summary:
      status === "blocked"
        ? "Strong fit can still be blocked for generation when verification requirements are not met."
        : status === "limited"
          ? "Your baseline needs more verified evidence before generation is fully ready."
          : "Generation is ready for this scored analysis context.",
    verificationIssues,
  };
}

export function deriveVerificationCoverage(
  readiness: GenerationReadiness,
  claimVerifications: NormalizedClaimVerification[] = [],
): VerificationCoverage {
  if (claimVerifications.length > 0) {
    const verified = claimVerifications.filter((claim) => claim.status === "VERIFIED").length;
    const inferred = claimVerifications.filter((claim) => claim.status === "INFERRED").length;
    const unverified = claimVerifications.filter((claim) => claim.status === "UNVERIFIED").length;
    const total = claimVerifications.length;
    const status: VerificationCoverage["status"] =
      unverified > 0 ? "weak" : inferred > 0 ? "partial" : "strong";
    const summary =
      status === "strong"
        ? "Your baseline explicitly verifies the claim requirements used for tailoring."
        : status === "partial"
        ? "Some role requirements are inferred from adjacent evidence and may need explicit proof for generation."
          : "Some role-specific requirements are not verified from your baseline, which can block generation-safe tailoring.";
    return {
      verifiedClaims: verified,
      inferredClaims: inferred,
      unverifiedClaims: unverified,
      status,
      supportedClaims: verified,
      unsupportedClaims: unverified,
      totalClaims: total,
      summary,
    };
  }
  const status: VerificationCoverage["status"] =
    readiness.status === "blocked"
      ? "weak"
      : readiness.status === "limited"
        ? "partial"
        : "strong";

  const fallbackTotalClaims = readiness.status === "ready" ? 0 : 1;
  const totalClaims = Math.max(readiness.verificationIssues.length, fallbackTotalClaims);
  const unsupportedClaims = readiness.verificationIssues.filter((issue) => issue.severity === "block").length;
  const inferredClaims = readiness.verificationIssues.filter(
    (issue) => issue.claimStatus === "INFERRED",
  ).length;
  const unverifiedClaims = readiness.verificationIssues.filter(
    (issue) => issue.claimStatus === "UNVERIFIED" || issue.severity === "block",
  ).length;
  const verifiedClaims = Math.max(totalClaims - inferredClaims - unverifiedClaims, 0);

  const summary =
    status === "strong"
      ? "Your baseline can fully support the claims required for this role."
      : status === "partial"
        ? "Some role requirements have adjacent support, but still need explicit proof for generation."
        : "Several role-specific requirements cannot be verified from your baseline.";

  return {
    verifiedClaims,
    inferredClaims,
    unverifiedClaims,
    status,
    supportedClaims: verifiedClaims,
    unsupportedClaims: unverifiedClaims,
    totalClaims,
    summary,
  };
}

export function filterClaimVerificationsByExcludedLabels(
  claimVerifications: NormalizedClaimVerification[],
  excludedLabels: Set<string>,
): NormalizedClaimVerification[] {
  if (!excludedLabels.size) return claimVerifications;
  return claimVerifications.filter((claim) => {
    const normalized = normalizeUserFacingRequirementLabel(claim.label, {});
    if (!normalized) return true;
    return !excludedLabels.has(normalized.toLowerCase());
  });
}

export function reconcileReadinessWithClaimVerifications(
  readiness: GenerationReadiness,
  claimVerifications: NormalizedClaimVerification[],
): GenerationReadiness {
  if (!claimVerifications.length) return readiness;

  const normalizedClaims = claimVerifications
    .map((claim) => {
      const normalizedLabel = normalizeUserFacingRequirementLabel(claim.label, {});
      return {
        status: claim.status,
        normalizedLabel: (normalizedLabel ?? claim.label).trim().toLowerCase(),
      };
    })
    .filter((claim) => claim.normalizedLabel.length > 0);

  if (!normalizedClaims.length) return readiness;

  const resolveClaimStatus = (issueLabel: string): ClaimVerificationStatus | null => {
    const normalizedIssue = issueLabel.trim().toLowerCase();
    if (!normalizedIssue) return null;
    const exact = normalizedClaims.find((claim) => claim.normalizedLabel === normalizedIssue);
    if (exact) return exact.status;
    const overlap = normalizedClaims.find(
      (claim) =>
        claim.normalizedLabel.includes(normalizedIssue) ||
        normalizedIssue.includes(claim.normalizedLabel),
    );
    return overlap?.status ?? null;
  };

  const verificationIssues = readiness.verificationIssues.filter((issue) => {
    const normalizedIssueLabel = normalizeUserFacingRequirementLabel(issue.claim, {
      sourceContext: issue.sourceContext,
      issueCode: issue.code,
    });
    if (!normalizedIssueLabel) return true;
    const matchedStatus = resolveClaimStatus(normalizedIssueLabel);
    if (!matchedStatus) return true;
    return matchedStatus === "UNVERIFIED";
  });

  if (verificationIssues.length === readiness.verificationIssues.length) {
    return readiness;
  }

  const hasBlockingIssues = verificationIssues.some((issue) => issue.severity === "block");
  const hasWarnings = verificationIssues.some((issue) => issue.severity === "warn");
  const status: GenerationReadiness["status"] = hasBlockingIssues
    ? "blocked"
    : hasWarnings
      ? "limited"
      : "ready";
  const blocked = status === "blocked";
  const badgeLabel: GenerationReadiness["badgeLabel"] =
    status === "blocked" ? "BLOCKED" : status === "limited" ? "LIMITED" : "READY";
  const summary =
    status === "blocked"
      ? "Strong fit can still be blocked for generation when verification requirements are not met."
      : status === "limited"
        ? "Your baseline needs more verified evidence before generation is fully ready."
        : "Generation is ready for this scored analysis context.";

  return {
    ...readiness,
    status,
    blocked,
    badgeLabel,
    summary,
    reasonCodes: blocked || hasWarnings ? readiness.reasonCodes : [],
    reasons: blocked || hasWarnings ? readiness.reasons : [],
    verificationIssues,
  };
}

export function applyTargetingExclusionsToReadiness(
  readiness: GenerationReadiness,
  excludedLabels: Set<string>,
): TargetingAdjustmentResult {
  if (!excludedLabels.size) {
    return { readiness, removedClaims: [] };
  }
  const removedClaims: string[] = [];
  const nextIssues = readiness.verificationIssues.filter((issue) => {
    const label = normalizeUserFacingRequirementLabel(issue.claim, {
      sourceContext: issue.sourceContext,
      issueCode: issue.code,
    });
    if (!label) return true;
    const shouldExclude = excludedLabels.has(label.toLowerCase());
    if (shouldExclude) {
      removedClaims.push(label);
    }
    return !shouldExclude;
  });

  const hasBlockingIssues = nextIssues.some((issue) => issue.severity === "block");
  const hasWarnings = nextIssues.some((issue) => issue.severity === "warn");
  const status: GenerationReadiness["status"] = hasBlockingIssues
    ? "blocked"
    : hasWarnings
      ? "limited"
      : "ready";

  const reasonCodes = status === "ready" ? [] : readiness.reasonCodes;
  const reasons = status === "ready" ? [] : readiness.reasons;
  const badgeLabel: GenerationReadiness["badgeLabel"] =
    status === "blocked" ? "BLOCKED" : status === "limited" ? "LIMITED" : "READY";
  const summary =
    status === "blocked"
      ? "Targeting was narrowed, but generation is still blocked until remaining requirements are verified."
      : status === "limited"
        ? "Targeting was narrowed to supported requirements, but some limitations still remain."
        : "Targeting was narrowed to verified experience and generation is now ready.";

  if (process.env.NODE_ENV !== "production") {
    console.debug("readinessDebug.applyExclusions", {
      inputStatus: readiness.status,
      excludedLabels: Array.from(excludedLabels),
      removedClaims: Array.from(new Set(removedClaims)),
      nextIssues,
      status,
      summary,
    });
  }

  return {
    removedClaims: Array.from(new Set(removedClaims)),
    readiness: {
      ...readiness,
      status,
      blocked: status === "blocked",
      reasonCodes,
      reasons,
      badgeLabel,
      summary,
      verificationIssues: nextIssues,
    },
  };
}
