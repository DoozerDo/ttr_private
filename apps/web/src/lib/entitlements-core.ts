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
type EntitlementsInput = {
  tier?: unknown;
  effectiveTier?: unknown;
  betaUnlockPro?: unknown;
  reasons?: unknown;
};

export function computeEffectiveEntitlements(
  input: unknown,
  tierCandidate?: unknown,
): Entitlements {
  const tier = normalizeTier(tierCandidate);

  if (input && typeof input === "object") {
    const candidate = input as EntitlementsInput;
    const normalizedTier = normalizeTier(candidate.tier ?? tier);
    const normalizedEffective = normalizeTier(candidate.effectiveTier ?? normalizedTier);
    const reasons = Array.isArray(candidate.reasons)
      ? candidate.reasons.filter((item): item is string => typeof item === "string")
      : [];

    return {
      tier: normalizedTier,
      effectiveTier: normalizedEffective,
      betaUnlockPro: Boolean(candidate.betaUnlockPro),
      reasons,
    };
  }

  return {
    tier,
    effectiveTier: tier,
    betaUnlockPro: false,
    reasons: [],
  };
}
