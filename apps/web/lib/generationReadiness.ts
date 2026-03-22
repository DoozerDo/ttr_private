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
  supportedClaims: number;
  unsupportedClaims: number;
  totalClaims: number;
  summary: string;
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
  explanation: string;
  sourceContext: string | null;
  recommendedAction: string;
};

export type AggregatedVerificationIssues = {
  primary: VerificationIssue[];
  grouped: Array<{ label: string; count: number }>;
};

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

function issueExplanation(code: VerificationIssue["code"]): string {
  if (code === "unsupported_technology_claim") {
    return "This technology/platform claim could not be verified from the current evidence set used for generation.";
  }
  if (code === "missing_baseline_evidence") {
    return "This claim could not be verified because matching baseline evidence was not found.";
  }
  if (code === "generation_overreach") {
    return "The generated wording appears to exceed what is directly supported by verified evidence.";
  }
  if (code === "role_targeting_emphasis_exceeds_support") {
    return "Role-targeted personalization is currently stronger than the verified evidence available for this context.";
  }
  return "This claim could not be verified from the current generation context.";
}

function issueRecommendedAction(code: VerificationIssue["code"]): string {
  if (code === "unsupported_technology_claim") {
    return "Remove unsupported technology emphasis, or add verified evidence only if this experience is real.";
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
        .map((flag) => pickClaim(flag))
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
    const claim = pickClaim(flag);
    if (claim && !sanitizedClaims.has(claim.trim().toLowerCase())) {
      continue;
    }
    const sourceContext = pickSourceContext(flag);
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
      explanation: issueExplanation(issueCode),
      sourceContext,
      recommendedAction: issueRecommendedAction(issueCode),
    });
  }

  return deduped;
}

function normalizeIssueClaim(claim: string | null): string {
  return (claim ?? "").trim().toLowerCase();
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
  if (groupType === "tooling") return `Multiple unsupported technology claims in ${sourceLabel}`;
  if (groupType === "derived") return `Multiple derived verification limitations in ${sourceLabel}`;
  return `Multiple core verification blockers in ${sourceLabel}`;
}

export function aggregateVerificationIssues(
  issues: VerificationIssue[],
): AggregatedVerificationIssues {
  const deduped: VerificationIssue[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    if (isNoiseClaim(issue.claim)) continue;
    const key = `${issue.severity}:${issue.code}:${issue.source}:${normalizeIssueClaim(issue.claim)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
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
    grouped: Array.from(groupedMap.values()),
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
    explanation: reason.message,
    sourceContext: null,
    recommendedAction: issueRecommendedAction(code),
  });
}

export function getGenerationReadiness(
  result: unknown,
  runState: "ok" | "compliance_blocked" | null,
): GenerationReadiness {
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
          "This role scored highly, but document generation is currently limited by verification constraints.",
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
          "Tailored generation may be limited until verification constraints are resolved.",
      });
    }
  }
  const blocked = reasonCodes.some((code) =>
    ["run_state_blocked", "verdict_blocked", "compliance_blocked_flag", "severity_blocker"].includes(code),
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
        ? "Fit score and generation readiness are separate. Tailored generation is currently limited."
        : "Generation is ready for this scored analysis context.";

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
      ),
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
          ? "Fit score and generation readiness are separate. Tailored generation is currently limited."
          : "Generation is ready for this scored analysis context.",
    verificationIssues,
  };
}

export function deriveVerificationCoverage(readiness: GenerationReadiness): VerificationCoverage {
  const status: VerificationCoverage["status"] =
    readiness.status === "blocked"
      ? "weak"
      : readiness.status === "limited"
        ? "partial"
        : "strong";

  const fallbackTotalClaims = readiness.status === "ready" ? 0 : 1;
  const totalClaims = Math.max(readiness.verificationIssues.length, fallbackTotalClaims);
  const unsupportedClaims = readiness.verificationIssues.filter((issue) => issue.severity === "block").length;
  const supportedClaims = Math.max(totalClaims - unsupportedClaims, 0);

  const summary =
    status === "strong"
      ? "Your baseline can fully support the claims required for this role."
      : status === "partial"
        ? "Some claims required for this role have limited verification support."
        : "Several claims required for this role cannot be verified from your baseline.";

  return {
    status,
    supportedClaims,
    unsupportedClaims,
    totalClaims,
    summary,
  };
}
