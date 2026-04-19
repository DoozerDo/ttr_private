import { SubscriptionTier } from './subscription-tier.enum';

export function resolveUserTier(user?: {
  betaAccessApproved?: boolean | null;
  subscriptionTier?: SubscriptionTier | null;
}): SubscriptionTier {
  if (user?.betaAccessApproved === true) {
    return SubscriptionTier.PRO;
  }

  return user?.subscriptionTier ?? SubscriptionTier.FREE;
}

