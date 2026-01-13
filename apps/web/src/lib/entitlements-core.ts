export type SubscriptionTier = "FREE" | "PRO" | "ENTERPRISE";

export type Entitlements = {
  tier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  betaUnlockPro: boolean;
  reasons: string[];
};

export type UserProfile = {
  id: string;
  email: string;
  role?: string | null;
  subscriptionTier?: string | null;
  entitlements: Entitlements;
};

export function normalizeTier(candidate: unknown): SubscriptionTier {
  const value = typeof candidate === "string" ? candidate.trim().toUpperCase() : "";
  if (value === "FREE" || value === "PRO" || value === "ENTERPRISE") {
    return value as SubscriptionTier;
  }
  return "FREE";
}

/**
 * Server-safe. Do NOT put this in a "use client" file.
 * Used by app/(app)/layout.tsx during bootstrap.
 */
export function computeEffectiveEntitlements(
  input: unknown,
  tierCandidate?: unknown,
): Entitlements {
  const tier = normalizeTier(tierCandidate);

  if (input && typeof input === "object") {
    const e = input as any;
    const normalizedTier = normalizeTier(e.tier ?? tier);
    const normalizedEffective = normalizeTier(e.effectiveTier ?? normalizedTier);

    return {
      tier: normalizedTier,
      effectiveTier: normalizedEffective,
      betaUnlockPro: Boolean(e.betaUnlockPro),
      reasons: Array.isArray(e.reasons)
        ? e.reasons.filter((item: unknown) => typeof item === "string")
        : [],
    };
  }

  return {
    tier,
    effectiveTier: tier,
    betaUnlockPro: false,
    reasons: [],
  };
}
