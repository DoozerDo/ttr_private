import { ForbiddenException } from '@nestjs/common';
import {
  FeatureKey,
  assertFeatureAvailable,
  getEntitlementsForTier,
  hasFeature,
} from './feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

describe('feature gates', () => {
  it('blocks FREE tier for resume exports', () => {
    const freeEntitlements = getEntitlementsForTier(SubscriptionTier.FREE);
    expect(hasFeature(SubscriptionTier.FREE, FeatureKey.RESUME_EXPORT)).toBe(
      false,
    );
    expect(() =>
      assertFeatureAvailable(freeEntitlements, FeatureKey.RESUME_EXPORT),
    ).toThrow(ForbiddenException);
  });

  it('allows PRO tier for cover letter exports', () => {
    const proEntitlements = getEntitlementsForTier(SubscriptionTier.PRO);
    expect(
      hasFeature(SubscriptionTier.PRO, FeatureKey.COVER_LETTER_EXPORT),
    ).toBe(true);
    expect(() =>
      assertFeatureAvailable(proEntitlements, FeatureKey.COVER_LETTER_EXPORT),
    ).not.toThrow();
  });
});
