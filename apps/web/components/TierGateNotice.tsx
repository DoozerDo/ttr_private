import Link from 'next/link';

import { SubscriptionTier, tierLabels, type TierGateError } from '@/lib/tiers';
import { BILLING_SUPPORT_LINK, getBillingConfig, WAITLIST_ROUTE } from '@/src/lib/billing';

export function TierGateNotice({ error }: { error: TierGateError }) {
  const { billingLive, betaUnlockPro } = getBillingConfig();
  const tierLabel =
    error.requiredTier !== undefined
      ? tierLabels[error.requiredTier]
      : tierLabels[SubscriptionTier.PRO];

  const description =
    error.message || `This feature requires the ${tierLabel} plan.`;

  const primaryLabel = billingLive ? 'View the available plans' : 'Join the waitlist';
  const primaryHref = billingLive ? '/pricing' : WAITLIST_ROUTE;
  const secondaryLabel = 'Contact support';
  const secondaryHref = BILLING_SUPPORT_LINK;

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid rgba(251,191,36,0.55)',
        background: 'rgba(15,23,42,0.9)',
        padding: 16,
        color: 'rgba(226,232,240,0.92)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 15 }}>Upgrade required</div>
      <div style={{ lineHeight: 1.4 }}>{description}</div>
      {!billingLive ? (
        <div style={{ color: 'rgba(248,250,252,0.8)' }}>
          Billing is not live yet. Join the waitlist to be the first invited when we open sign-ups.
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href={primaryHref}
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            background: billingLive ? '#fbbf24' : 'rgba(251,191,36,0.2)',
            color: billingLive ? '#0f172a' : '#fbbf24',
            fontWeight: 600,
            textDecoration: 'none',
            border: '1px solid rgba(251,191,36,0.3)',
          }}
        >
          {primaryLabel}
        </Link>
        <Link
          href={secondaryHref}
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#f8fafc',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {secondaryLabel}
        </Link>
      </div>
      {betaUnlockPro ? (
        <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.95)' }}>
          Beta unlock is enabling Pro access for free right now.
        </div>
      ) : null}
    </div>
  );
}
