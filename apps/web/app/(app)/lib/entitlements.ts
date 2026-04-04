export type {
  Entitlements,
  UserProfile,
  SubscriptionTier,
} from "@/src/lib/entitlements-core";

export {
  computeEffectiveEntitlements,
  normalizeTier,
} from "@/src/lib/entitlements-core";

export {
  EntitlementsProvider,
  useEntitlements,
} from "@/src/lib/entitlements";
