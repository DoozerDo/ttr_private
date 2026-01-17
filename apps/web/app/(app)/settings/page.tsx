"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { useEntitlements } from "@/src/lib/entitlements";
import {
  DEFAULT_AUTO_GENERATE_THRESHOLD,
  useAutoGenerateThreshold,
} from "../lib/settings";
import { ttrComponents } from "../ui/ttrStyles";

const NOT_AVAILABLE = "Not available";

type SectionRow = {
  label: string;
  value: string;
};

const formatBetaAccess = (value?: boolean) => {
  if (typeof value === "undefined") {
    return NOT_AVAILABLE;
  }
  return value ? "Enabled" : "Disabled";
};

const renderRows = (rows: SectionRow[]) =>
  rows.map((row) => (
    <div key={row.label} className="flex justify-between gap-6 text-sm text-slate-200">
      <span className="text-slate-300">{row.label}</span>
      <span className="font-semibold leading-tight text-slate-100">{row.value}</span>
    </div>
  ));

export default function SettingsPage() {
  const { profile } = useEntitlements();

  const email = profile?.email ?? NOT_AVAILABLE;
  const userId = profile?.id ?? NOT_AVAILABLE;
  const role = profile?.role ?? NOT_AVAILABLE;

  const subscriptionTier = profile?.subscriptionTier ?? NOT_AVAILABLE;
  const effectiveTier = profile?.entitlements?.effectiveTier ?? NOT_AVAILABLE;
  const betaAccess = formatBetaAccess(profile?.entitlements?.betaUnlockPro);
  const entitlementNotes =
    profile?.entitlements?.reasons && profile.entitlements.reasons.length > 0
      ? profile.entitlements.reasons.join(", ")
      : "None";

  const accountRows: SectionRow[] = [
    { label: "Email", value: email },
    { label: "User ID", value: userId },
    { label: "Role", value: role },
    { label: "Auth provider", value: NOT_AVAILABLE },
  ];

  const planRows: SectionRow[] = [
    { label: "Subscription tier", value: subscriptionTier },
    { label: "Effective tier", value: effectiveTier },
    { label: "Beta access", value: betaAccess },
    { label: "Entitlement notes", value: entitlementNotes },
  ];

  const defaultRows: SectionRow[] = [
    { label: "Default locale", value: NOT_AVAILABLE },
    { label: "Default timezone", value: NOT_AVAILABLE },
    { label: "Default notification cadence", value: NOT_AVAILABLE },
  ];

  const systemRows: SectionRow[] = [
    { label: "Platform health", value: NOT_AVAILABLE },
    { label: "Data sync queue", value: NOT_AVAILABLE },
    { label: "Notification delivery", value: NOT_AVAILABLE },
  ];

  const trustRows: SectionRow[] = [
    { label: "Privacy policy", value: NOT_AVAILABLE },
    { label: "Terms of service", value: NOT_AVAILABLE },
    { label: "Data retention", value: NOT_AVAILABLE },
  ];

  const sectionStyle = { ...ttrComponents.basePanel, flex: "none", minWidth: 0 };
  const [autoGenerateThreshold, updateAutoGenerateThreshold] = useAutoGenerateThreshold();
  const [thresholdInput, setThresholdInput] = useState(String(autoGenerateThreshold));

  useEffect(() => {
    setThresholdInput(String(autoGenerateThreshold));
  }, [autoGenerateThreshold]);

  const applyThreshold = () => {
    const parsed = Number.parseInt(thresholdInput, 10);
    if (Number.isNaN(parsed)) {
      updateAutoGenerateThreshold(DEFAULT_AUTO_GENERATE_THRESHOLD);
      return;
    }
    updateAutoGenerateThreshold(parsed);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Identity and entitlement controls only. No CX Fit Scores, job data, or journey tasks appear here."
      />

      <section style={sectionStyle} className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-400">Account</p>
          <h2 className="text-xl font-semibold text-slate-100">Account</h2>
          <p className="text-sm text-slate-300">Read-only identity details from your session token.</p>
        </div>
        <div className="space-y-3">{renderRows(accountRows)}</div>
      </section>

      <section style={sectionStyle} className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-400">
            Plan and entitlements
          </p>
          <h2 className="text-xl font-semibold text-slate-100">Plan and entitlements</h2>
          <p className="text-sm text-slate-300">Current subscription and entitlement flags.</p>
        </div>
        <div className="space-y-3">{renderRows(planRows)}</div>
      </section>

      <section style={sectionStyle} className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-400">Preferences</p>
          <h2 className="text-xl font-semibold text-slate-100">Preferences</h2>
          <p className="text-sm text-slate-300">Client-only flags that you can update in this browser.</p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              Auto generate threshold
            </label>
            <input
              type="number"
              step={1}
              min={50}
              max={100}
              value={thresholdInput}
              onChange={(event) => setThresholdInput(event.target.value)}
              onBlur={() => void applyThreshold()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyThreshold();
                  (event.target as HTMLInputElement).blur();
                }
              }}
              style={{ ...ttrComponents.input, maxWidth: 160 }}
              aria-describedby="auto-generate-threshold-helper"
            />
            <p id="auto-generate-threshold-helper" className="text-sm text-slate-400">
              Resume and cover letter one tap generate triggers at or above this score.
            </p>
          </div>
        </div>
      </section>

      <section style={sectionStyle} className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-400">Defaults</p>
          <h2 className="text-xl font-semibold text-slate-100">Defaults</h2>
          <p className="text-sm text-slate-300">No editable defaults are available yet.</p>
        </div>
        <div className="space-y-3">{renderRows(defaultRows)}</div>
      </section>

      <section style={sectionStyle} className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-400">System status</p>
          <h2 className="text-xl font-semibold text-slate-100">System status</h2>
          <p className="text-sm text-slate-300">Health and sync counts are read-only where available.</p>
        </div>
        <div className="space-y-3">{renderRows(systemRows)}</div>
      </section>

      <section style={sectionStyle} className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-400">
            Trust and legal
          </p>
          <h2 className="text-xl font-semibold text-slate-100">Trust and legal</h2>
          <p className="text-sm text-slate-300">Administrative links and policies.</p>
        </div>
        <div className="space-y-3">{renderRows(trustRows)}</div>
      </section>
    </div>
  );
}
