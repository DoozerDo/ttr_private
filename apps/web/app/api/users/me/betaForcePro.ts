type UserPayload = Record<string, unknown>;

function parseFlag(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function isBetaForceProEnabled(): boolean {
  return (
    parseFlag(process.env.BETA_FORCE_PRO ?? undefined) ||
    parseFlag(process.env.NEXT_PUBLIC_BETA_FORCE_PRO ?? undefined)
  );
}

function cloneEntitlements(entitlements: unknown): Record<string, unknown> {
  if (entitlements && typeof entitlements === "object") {
    return { ...(entitlements as Record<string, unknown>) };
  }
  return {};
}

function ensureReason(reasons: unknown): string[] {
  const normalized = Array.isArray(reasons)
    ? reasons.filter((item): item is string => typeof item === "string")
    : [];

  if (normalized.includes("beta_force_pro")) {
    return normalized;
  }

  return [...normalized, "beta_force_pro"];
}

/**
 * Temporary beta override so every account behaves as PRO while the flag is on.
 */
export function applyBetaForcePro(payload: UserPayload): UserPayload {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const entitlements = cloneEntitlements(payload.entitlements);

  return {
    ...payload,
    subscriptionTier: "PRO",
    accountType: "pro",
    entitlements: {
      ...entitlements,
      tier: "PRO",
      effectiveTier: "PRO",
      betaUnlockPro: true,
      isPro: true,
      source: "beta",
      reasons: ensureReason(entitlements.reasons),
    },
  };
}
