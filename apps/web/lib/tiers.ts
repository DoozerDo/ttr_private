// apps/web/lib/tiers.ts

/**
 * Canonical subscription tiers for Target This Role.
 * Exports both runtime values and types used by UI tier gating.
 *
 * Note: Some UI code references uppercase keys (FREE/PLUS/PRO). We support both
 * styles to avoid churn while keeping the canonical values lowercase.
 */

export const SubscriptionTier = {
  // Canonical keys
  Free: "free",
  Plus: "plus",
  Pro: "pro",

  // Back-compat aliases
  FREE: "free",
  PLUS: "plus",
  PRO: "pro",
} as const;

export type SubscriptionTier =
  (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

export const tierLabels: Record<SubscriptionTier, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
};

export type TierGateError = {
  message: string;
  requiredTier?: SubscriptionTier;
  currentTier?: SubscriptionTier;
  code?: string;
  status?: number;
  payload?: unknown;
};

type ParseTierGateInputs = {
  status?: number;
  payload?: unknown;
  error?: unknown;
};

export function parseTierGateError(inputs: ParseTierGateInputs): TierGateError | null {
  const status = inputs.status;

  if (status !== 402 && status !== 403) return null;

  const payload = inputs.payload;

  if (payload && typeof payload === "object") {
    const maybe = payload as Record<string, unknown>;

    const message =
      typeof maybe.message === "string"
        ? maybe.message
        : typeof maybe.error === "string"
          ? maybe.error
          : null;

    if (message) {
      const requiredTier =
        typeof maybe.requiredTier === "string" ? (maybe.requiredTier as SubscriptionTier) : undefined;

      const currentTier =
        typeof maybe.currentTier === "string" ? (maybe.currentTier as SubscriptionTier) : undefined;

      const code = typeof maybe.code === "string" ? maybe.code : undefined;

      return {
        message,
        requiredTier,
        currentTier,
        code,
        status,
        payload,
      };
    }
  }

  return {
    message: "This feature is not available for your subscription tier.",
    status,
    payload,
  };
}
