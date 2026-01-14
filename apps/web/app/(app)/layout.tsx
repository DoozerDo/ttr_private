import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/src/components/layout/AppShell";
import { AUTH_COOKIE_NAME, decodeJwt } from "@/lib/auth";
import { EntitlementsProvider, type UserProfile } from "@/src/lib/entitlements";

type AppLayoutProps = {
  children: ReactNode;
};

type Tier = "FREE" | "PRO" | "ENTERPRISE";

type Entitlements = {
  tier: Tier;
  effectiveTier: Tier;
  betaUnlockPro: boolean;
  reasons: string[];
};

function normalizeTier(candidate: unknown): Tier {
  const value = typeof candidate === "string" ? candidate.trim().toUpperCase() : "";
  if (value === "FREE" || value === "PRO" || value === "ENTERPRISE") {
    return value as Tier;
  }
  return "FREE";
}

function normalizeEntitlements(entitlements: unknown, tier: Tier): Entitlements {
  if (entitlements && typeof entitlements === "object") {
    const e = entitlements as any;
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

export default async function AppLayout({ children }: AppLayoutProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const payload = decodeJwt(token);
  const email = payload?.email ?? null;

  const tier = normalizeTier((payload as any)?.subscriptionTier);

  const bootstrapProfile: UserProfile | null =
    email
      ? ({
          id: (payload as any)?.sub ?? "",
          email,
          subscriptionTier: (payload as any)?.subscriptionTier,
          role: (payload as any)?.role,
          entitlements: normalizeEntitlements((payload as any)?.entitlements, tier),
        } as any)
      : null;

  return (
    <EntitlementsProvider entitlements={bootstrapProfile}>
      <AppShell userEmail={email}>{children}</AppShell>
    </EntitlementsProvider>
  );
}
