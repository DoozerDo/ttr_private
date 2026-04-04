"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type {
  Entitlements,
  SubscriptionTier,
  UserProfile,
} from "./entitlements-core";
import { computeEffectiveEntitlements } from "./entitlements-core";

type StructuredEntitlements = Entitlements & {
  source: string;
  isPro: boolean;
};

const defaultEntitlements: StructuredEntitlements = {
  tier: "FREE",
  effectiveTier: "FREE",
  betaUnlockPro: false,
  reasons: [],
  isPro: false,
  source: "real",
};

function resolveUnknownErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as { message?: unknown };
  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message;
  }
  return undefined;
}

function isPaidTier(tier: SubscriptionTier): boolean {
  return tier !== "FREE";
}

function resolveStructuredEntitlements(profile: UserProfile | null): StructuredEntitlements {
  if (!profile) {
    return { ...defaultEntitlements };
  }

  const baseEntitlements = computeEffectiveEntitlements(
    profile.entitlements,
    profile.subscriptionTier,
  );
  const rawEntitlements = profile.entitlements as Record<string, unknown> | undefined;

  const source =
    typeof rawEntitlements?.source === "string" ? rawEntitlements.source : "real";
  const isPro =
    typeof rawEntitlements?.isPro === "boolean"
      ? rawEntitlements.isPro
      : isPaidTier(baseEntitlements.effectiveTier);
  const reasons = Array.isArray(baseEntitlements.reasons)
    ? baseEntitlements.reasons.filter((item): item is string => typeof item === "string")
    : [];

  return {
    ...baseEntitlements,
    isPro,
    source,
    reasons,
  };
}

export type EntitlementsContextValue = {
  profile: UserProfile | null;
  entitlements: StructuredEntitlements;
  tier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  isPro: boolean;
  betaUnlockPro: boolean;
  reasons: string[];
  source: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

type EntitlementsProviderProps = {
  /**
   * Preferred prop name used by app/(app)/layout.tsx
   */
  profile?: UserProfile | null;

  /**
   * Backward-compatible alias if any older code passes `entitlements`
   */
  entitlements?: UserProfile | null;

  children: React.ReactNode;
};

export function EntitlementsProvider({
  profile,
  entitlements,
  children,
}: EntitlementsProviderProps) {
  const initial = profile ?? entitlements ?? null;

  const [stateProfile, setStateProfile] = useState<UserProfile | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setStateProfile((current) => {
        if (!current) return current;

        const tierCandidate =
          current.subscriptionTier ?? current.entitlements?.tier;

        return {
          ...current,
          entitlements: computeEffectiveEntitlements(current.entitlements, tierCandidate),
        };
      });
    } catch (error: unknown) {
      setError(resolveUnknownErrorMessage(error) ?? "Failed to refresh entitlements");
    } finally {
      setLoading(false);
    }
  }, []);

  const resolvedEntitlements = useMemo(
    () => resolveStructuredEntitlements(stateProfile),
    [stateProfile],
  );

  const value = useMemo<EntitlementsContextValue>(() => {
    return {
      profile: stateProfile,
      entitlements: resolvedEntitlements,
      tier: resolvedEntitlements.tier,
      effectiveTier: resolvedEntitlements.effectiveTier,
      isPro: resolvedEntitlements.isPro,
      betaUnlockPro: resolvedEntitlements.betaUnlockPro,
      reasons: resolvedEntitlements.reasons,
      source: resolvedEntitlements.source,
      loading,
      error,
      refresh,
    };
  }, [stateProfile, resolvedEntitlements, loading, error, refresh]);

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error("useEntitlements must be used within EntitlementsProvider");
  }
  return ctx;
}

// Re-export types so existing imports keep working
export type { Entitlements, UserProfile } from "./entitlements-core";
export type { SubscriptionTier } from "./entitlements-core";
export { computeEffectiveEntitlements, normalizeTier } from "./entitlements-core";
