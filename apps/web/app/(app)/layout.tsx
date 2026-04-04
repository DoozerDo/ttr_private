import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/src/components/layout/AppShell";
import { AUTH_COOKIE_NAME, decodeJwt } from "@/lib/auth";
import { EntitlementsProvider, type UserProfile } from "@/src/lib/entitlements";
import {
  computeEffectiveEntitlements,
  normalizeTier,
} from "@/src/lib/entitlements-core";
import {
  applyBetaForcePro,
  isBetaForceProEnabled,
} from "@/app/api/users/me/betaForcePro";

type AppLayoutProps = {
  children: ReactNode;
};

function toSerializableProfile(profile: UserProfile | null): UserProfile | null {
  if (!profile) return null;

  return JSON.parse(
    JSON.stringify(profile, (_key, value) => {
      if (typeof value === "bigint") return value.toString();
      return value;
    }),
  ) as UserProfile;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const payload = decodeJwt(token);
  const email = payload?.email ?? null;
  const userId = payload?.sub ?? null;

  const tier = normalizeTier(payload?.subscriptionTier);

  const bootstrapProfile: UserProfile | null =
    email
      ? ({
          id: payload?.sub ?? "",
          email,
          subscriptionTier:
            typeof payload?.subscriptionTier === "string" ? payload.subscriptionTier : null,
          role: typeof payload?.role === "string" ? payload.role : null,
          entitlements: computeEffectiveEntitlements(payload?.entitlements, tier),
        })
      : null;

  const finalProfile =
    isBetaForceProEnabled() && bootstrapProfile
      ? (applyBetaForcePro(
          bootstrapProfile as Record<string, unknown>,
        ) as UserProfile)
      : bootstrapProfile;

  const safeProfile = toSerializableProfile(finalProfile);

  return (
    <EntitlementsProvider entitlements={safeProfile}>
      <AppShell userEmail={email} userId={userId}>
        {children}
      </AppShell>
    </EntitlementsProvider>
  );
}
