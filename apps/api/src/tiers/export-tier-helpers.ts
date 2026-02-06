import { ForbiddenException } from '@nestjs/common';
import { Entitlements, FeatureKey, hasFeature } from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

export type ExportFeatureName = 'EXPORT_RESUME' | 'EXPORT_COVER';

export function createTierRequiredException(
  feature: ExportFeatureName,
  currentTier: SubscriptionTier,
) {
  return new ForbiddenException({
    code: 'TIER_REQUIRED',
    message: 'Upgrade to Pro to download documents.',
    details: {
      requiredTier: SubscriptionTier.PRO,
      currentTier,
      feature,
    },
  });
}

export function ensureExportTierAvailable(
  entitlements: Entitlements,
  gate: FeatureKey,
  feature: ExportFeatureName,
) {
  const currentTier = entitlements.tier ?? SubscriptionTier.FREE;

  if (hasFeature(entitlements.effectiveTier, gate)) {
    return;
  }

  throw createTierRequiredException(feature, currentTier);
}
