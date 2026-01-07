import { ForbiddenException } from '@nestjs/common';
import {
  FeatureKey,
  assertFeatureAvailable,
  hasFeature,
} from './feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

describe('feature gates', () => {
  it('blocks FREE tier for resume exports', () => {
    expect(hasFeature(SubscriptionTier.FREE, FeatureKey.RESUME_EXPORT)).toBe(false);
    expect(() => assertFeatureAvailable(SubscriptionTier.FREE, FeatureKey.RESUME_EXPORT)).toThrow(
      ForbiddenException,
    );
  });

  it('allows PRO tier for cover letter exports', () => {
    expect(hasFeature(SubscriptionTier.PRO, FeatureKey.COVER_LETTER_EXPORT)).toBe(true);
    expect(() => assertFeatureAvailable(SubscriptionTier.PRO, FeatureKey.COVER_LETTER_EXPORT)).not.toThrow();
  });
});
