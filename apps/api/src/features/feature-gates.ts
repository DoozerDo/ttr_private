import { ForbiddenException, Logger } from '@nestjs/common';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

export enum FeatureKey {
  RESUME_EXPORT = 'RESUME_EXPORT',
  COVER_LETTER_EXPORT = 'COVER_LETTER_EXPORT',
  SEARCH_SET_RUN = 'SEARCH_SET_RUN',
}

const paidTiers = new Set<SubscriptionTier>([
  SubscriptionTier.PRO,
  SubscriptionTier.COACH,
  SubscriptionTier.ENTERPRISE,
]);

const logger = new Logger('FeatureGates');

type EntitlementReason = 'beta_unlocked';

export type Entitlements = {
  tier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  betaUnlockPro: boolean;
  reasons: EntitlementReason[];
};

function isBetaUnlockProEnabled() {
  return process.env.BETA_UNLOCK_PRO === 'true';
}

export function getEntitlementsForTier(
  tierInput?: SubscriptionTier | null,
): Entitlements {
  const tier = tierInput ?? SubscriptionTier.FREE;
  const betaUnlockPro = isBetaUnlockProEnabled();
  const promotesToPro = betaUnlockPro && !paidTiers.has(tier);
  const effectiveTier = promotesToPro ? SubscriptionTier.PRO : tier;
  const reasons: EntitlementReason[] = [];

  if (promotesToPro) {
    reasons.push('beta_unlocked');
  }

  return {
    tier,
    effectiveTier,
    betaUnlockPro,
    reasons,
  };
}

export function resolveEntitlementsFromUser(user?: {
  entitlements?: Entitlements;
  subscriptionTier?: SubscriptionTier;
}): Entitlements {
  if (user?.entitlements) {
    return user.entitlements;
  }

  return getEntitlementsForTier(user?.subscriptionTier ?? undefined);
}

export function wouldBlock(
  feature: FeatureKey,
  requiredTier: SubscriptionTier,
  actualTier: SubscriptionTier,
  effectiveTier: SubscriptionTier,
) {
  if (actualTier === effectiveTier) {
    return;
  }

  logger.log(
    `Feature gate ${feature} would have blocked ${actualTier} (requires ${requiredTier}) but effective tier ${effectiveTier} is allowed via beta unlock.`,
  );
}

export function hasFeature(tier: SubscriptionTier, feature: FeatureKey): boolean {
  switch (feature) {
    case FeatureKey.RESUME_EXPORT:
    case FeatureKey.COVER_LETTER_EXPORT:
    case FeatureKey.SEARCH_SET_RUN:
      return paidTiers.has(tier);
    default:
      return true;
  }
}

function getRequiredTierForFeature(feature: FeatureKey): SubscriptionTier {
  switch (feature) {
    case FeatureKey.RESUME_EXPORT:
    case FeatureKey.COVER_LETTER_EXPORT:
    case FeatureKey.SEARCH_SET_RUN:
      return SubscriptionTier.PRO;
    default:
      return SubscriptionTier.PRO;
  }
}

export function assertFeatureAvailable(
  entitlements: Entitlements,
  feature: FeatureKey,
): void {
  const requiredTier = getRequiredTierForFeature(feature);

  if (!hasFeature(entitlements.effectiveTier, feature)) {
    throw new ForbiddenException({
      errorCode: 'TIER_GATED',
      requiredTier,
      currentTier: entitlements.tier,
      message: `This feature requires the ${requiredTier} plan.`,
    });
  }

  if (!hasFeature(entitlements.tier, feature)) {
    wouldBlock(feature, requiredTier, entitlements.tier, entitlements.effectiveTier);
  }
}
