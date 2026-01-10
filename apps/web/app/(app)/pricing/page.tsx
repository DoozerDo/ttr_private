'use client';

import { useEffect, useState } from 'react';
import { apiFetchJson } from '../lib/api';
import { InstrumentShell } from '../ui/InstrumentShell';
import { ttrComponents, ttrTypography } from '../ui/ttrStyles';
import { SubscriptionTier, tierLabels } from '@/lib/tiers';

type UserProfile = {
  subscriptionTier?: SubscriptionTier;
  email?: string;
};

type PricingTier = 'FREE' | 'PRO' | 'COACH' | 'ENTERPRISE';

const tierCards: Array<{
  tier: PricingTier;
  title: string;
  price: string;
  highlights: string[];
  footer?: string;
}> = [
  {
    tier: 'FREE',
    title: 'Free',
    price: 'Free',
    highlights: ['Limited Fit Scores', 'Limited tailoring', 'No Baseline Expansion Interview'],
  },
  {
    tier: 'PRO',
    title: 'Pro',
    price: '$12-$15/mo',
    highlights: [
      'Unlimited Fit Scores',
      'Unlimited tailoring',
      'Full Baseline Expansion Interview',
      'Interview Toolkit',
      'Job Tracker',
    ],
  },
  {
    tier: 'COACH',
    title: 'Coach',
    price: '$49-$79/mo',
    highlights: [
      'Manage up to 10 users',
      'White-label exports',
      'Interview transcripts',
      'Private baselines',
    ],
    footer: 'Billing pilot coming soon. Contact us for access.',
  },
  {
    tier: 'ENTERPRISE',
    title: 'Enterprise',
    price: '$10K-$50K annually',
    highlights: [
      'SSO',
      'Outplacement workflow',
      'Admin dashboard',
      'Reporting',
      'Bulk user management',
    ],
    footer: 'Contact your account team for tailored deployment.',
  },
];

function pricingTierMatchesUserTier(pricingTier: PricingTier, userTier: SubscriptionTier | null) {
  if (!userTier) return pricingTier === 'FREE';

  if (pricingTier === 'FREE') return userTier === SubscriptionTier.FREE;
  if (pricingTier === 'PRO') return userTier === SubscriptionTier.PRO;

  return false;
}

export default function PricingPage() {
  const [userTier, setUserTier] = useState<SubscriptionTier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const profile = await apiFetchJson<UserProfile>('/api/users/me');
        if (!cancelled && profile?.subscriptionTier) {
          setUserTier(profile.subscriptionTier);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeLabel = userTier ? tierLabels[userTier] : 'Free';

  return (
    <InstrumentShell
      kicker="Accounts"
      title="Pricing & tiers"
      subtitle="Choose the plan that unlocks the features you need."
    >
      {loading ? (
        <div style={{ ...ttrComponents.warningBox, marginBottom: 12 }}>Loading plan info…</div>
      ) : null}
      {error ? (
        <div style={{ ...ttrComponents.dangerBox, marginBottom: 12 }}>{error}</div>
      ) : null}

      <div style={{ marginBottom: 18 }}>
        <span style={{ ...ttrTypography.paragraph, fontWeight: 700 }}>
          Current plan: <strong>{activeLabel}</strong>
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {tierCards.map((card) => {
          const isActive = pricingTierMatchesUserTier(card.tier, userTier);

          return (
            <div
              key={card.tier}
              style={{
                borderRadius: 18,
                border: isActive ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.2)',
                padding: 18,
                background: isActive
                  ? 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(255,255,255,0.02))'
                  : 'rgba(15,23,42,0.8)',
                boxShadow: isActive ? '0 15px 45px rgba(251,191,36,0.35)' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 16, fontWeight: 900 }}>{card.title}</span>
                <span style={{ fontSize: 14, color: 'rgba(248,250,252,0.75)', fontWeight: 600 }}>
                  {card.price}
                </span>
              </div>
              <ul style={{ paddingLeft: 18, margin: '12px 0', color: 'rgba(226,232,240,0.9)' }}>
                {card.highlights.map((item) => (
                  <li key={item} style={{ fontSize: 13, marginBottom: 6 }}>
                    {item}
                  </li>
                ))}
              </ul>
              {card.footer ? (
                <div style={{ fontSize: 12, color: 'rgba(226,232,240,0.7)', marginTop: 8 }}>
                  {card.footer}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </InstrumentShell>
  );
}
