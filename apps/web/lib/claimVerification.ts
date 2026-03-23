export type ClaimVerificationStatus = "VERIFIED" | "INFERRED" | "UNVERIFIED";

export type NormalizedClaimVerification = {
  key: string;
  label: string;
  category: string;
  sourceType: string;
  status: ClaimVerificationStatus;
  evidenceRefs: string[];
  generationBlocking: boolean;
  scoreWeight: number;
};

const normalizeClaimStatus = (value: unknown): ClaimVerificationStatus | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "EQUIVALENT" || normalized === "ADJACENT") {
    return "INFERRED";
  }
  if (normalized === "VERIFIED" || normalized === "INFERRED" || normalized === "UNVERIFIED") {
    return normalized as ClaimVerificationStatus;
  }
  return null;
};

export function normalizeClaimVerifications(input: unknown): NormalizedClaimVerification[] {
  if (!Array.isArray(input)) return [];
  const claims: NormalizedClaimVerification[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const typed = entry as Record<string, unknown>;
    const status = normalizeClaimStatus(typed.status);
    if (!status) continue;
    const key =
      typeof typed.key === "string"
        ? typed.key.trim()
        : typeof typed.name === "string"
          ? typed.name.trim()
          : typeof typed.requirement === "string"
            ? typed.requirement.trim()
            : typeof typed.claim === "string"
              ? typed.claim.trim()
          : "";
    const label =
      typeof typed.label === "string"
        ? typed.label.trim()
        : typeof typed.name === "string"
          ? typed.name.trim()
          : typeof typed.requirement === "string"
            ? typed.requirement.trim()
            : typeof typed.claim === "string"
              ? typed.claim.trim()
          : key;
    if (!key || !label) continue;
    claims.push({
      key,
      label,
      category: typeof typed.category === "string" ? typed.category : "unknown",
      sourceType: typeof typed.sourceType === "string" ? typed.sourceType : "unknown",
      status,
      evidenceRefs: Array.isArray(typed.evidenceRefs)
        ? typed.evidenceRefs.filter((value): value is string => typeof value === "string")
        : [],
      generationBlocking: typed.generationBlocking === true,
      scoreWeight: typeof typed.scoreWeight === "number" ? typed.scoreWeight : 0,
    });
  }
  return claims;
}
