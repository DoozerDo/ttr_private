import { ForbiddenException, Logger } from '@nestjs/common';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { resolveUserTier } from '../subscription/resolve-user-tier';

export enum FeatureKey {
  RESUME_EXPORT = 'RESUME_EXPORT',
  COVER_LETTER_EXPORT = 'COVER_LETTER_EXPORT',
}

const paidTiers = new Set<SubscriptionTier>([
  SubscriptionTier.PRO,
  SubscriptionTier.COACH,
  SubscriptionTier.ENTERPRISE,
]);

const logger = new Logger('FeatureGates');

type EntitlementReason = 'beta_unlocked' | 'beta_user';

export type Entitlements = {
  tier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  betaUnlockPro: boolean;
  betaUserPro: boolean;
  reasons: EntitlementReason[];
};

function isBetaUnlockProEnabled() {
  return process.env.BETA_UNLOCK_PRO === 'true';
}

export function getEntitlementsForUser(input?: {
  subscriptionTier?: SubscriptionTier | null;
  betaAccessApproved?: boolean | null;
}): Entitlements {
  const inputTier = input?.subscriptionTier ?? SubscriptionTier.FREE;
  const tier = resolveUserTier(input);
  const betaUnlockPro = isBetaUnlockProEnabled();
  const betaUserPro = Boolean(input?.betaAccessApproved);
  const promotesToPro = betaUnlockPro && !paidTiers.has(tier);
  const effectiveTier = promotesToPro ? SubscriptionTier.PRO : tier;
  const reasons: EntitlementReason[] = [];

  if (betaUserPro) {
    reasons.push('beta_user');
  }

  if (betaUnlockPro && !paidTiers.has(inputTier) && !betaUserPro) {
    reasons.push('beta_unlocked');
  }

  return {
    tier,
    effectiveTier,
    betaUnlockPro,
    betaUserPro,
    reasons,
  };
}

export function getEntitlementsForTier(
  tierInput?: SubscriptionTier | null,
): Entitlements {
  return getEntitlementsForUser({ subscriptionTier: tierInput ?? undefined });
}

export function resolveEntitlementsFromUser(user?: {
  entitlements?: Entitlements;
  subscriptionTier?: SubscriptionTier;
  betaAccessApproved?: boolean;
}): Entitlements {
  if (user?.entitlements) {
    return user.entitlements;
  }

  return getEntitlementsForUser({
    subscriptionTier: user?.subscriptionTier ?? undefined,
    betaAccessApproved: user?.betaAccessApproved,
  });
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
    `Feature gate ${feature} would have blocked ${actualTier} (requires ${requiredTier}) but effective tier ${effectiveTier} is allowed via beta entitlement.`,
  );
}

export function hasFeature(
  tier: SubscriptionTier,
  feature: FeatureKey,
): boolean {
  switch (feature) {
    case FeatureKey.RESUME_EXPORT:
    case FeatureKey.COVER_LETTER_EXPORT:
      return paidTiers.has(tier);
    default:
      return true;
  }
}

function getRequiredTierForFeature(feature: FeatureKey): SubscriptionTier {
  switch (feature) {
    case FeatureKey.RESUME_EXPORT:
    case FeatureKey.COVER_LETTER_EXPORT:
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
    wouldBlock(
      feature,
      requiredTier,
      entitlements.tier,
      entitlements.effectiveTier,
    );
  }
}
