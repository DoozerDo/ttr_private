import { ForbiddenException } from '@nestjs/common';
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
  tier: SubscriptionTier | undefined | null,
  feature: FeatureKey,
): void {
  const normalizedTier = tier ?? SubscriptionTier.FREE;

  if (!hasFeature(normalizedTier, feature)) {
    const requiredTier = getRequiredTierForFeature(feature);
    throw new ForbiddenException({
      errorCode: 'TIER_GATED',
      requiredTier,
      message: `This feature requires the ${requiredTier} plan.`,
    });
  }
}
