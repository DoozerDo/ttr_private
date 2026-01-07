import { SubscriptionTier, tierLabels, type TierGateError } from "@/lib/tiers";

export function TierGateNotice({ error }: { error: TierGateError }) {
  const tierLabel = error.requiredTier
    ? tierLabels[error.requiredTier]
    : tierLabels[SubscriptionTier.PRO];

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(251,191,36,0.55)",
        background: "rgba(251,191,36,0.08)",
        padding: "12px 14px",
        color: "rgba(226,232,240,0.92)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontWeight: 800 }}>Upgrade required</div>
      <div style={{ fontSize: 13, color: "rgba(226,232,240,0.85)", lineHeight: 1.4 }}>
        {error.message || `This feature requires the ${tierLabel} plan.`}
      </div>
    </div>
  );
}
