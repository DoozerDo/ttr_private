"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Entitlements, UserProfile } from "./entitlements-core";
import { computeEffectiveEntitlements } from "./entitlements-core";

export type EntitlementsContextValue = {
  profile: UserProfile | null;
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
      // No API wiring yet. For now, normalize what we already have.
      setStateProfile((current) => {
        if (!current) return current;

        const tierCandidate =
          (current as any)?.subscriptionTier ?? (current as any)?.entitlements?.tier;

        return {
          ...current,
          entitlements: computeEffectiveEntitlements(
            (current as any)?.entitlements,
            tierCandidate,
          ),
        };
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh entitlements");
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo<EntitlementsContextValue>(() => {
    return { profile: stateProfile, loading, error, refresh };
  }, [stateProfile, loading, error, refresh]);

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
