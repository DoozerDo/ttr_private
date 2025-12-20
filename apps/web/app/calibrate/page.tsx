// apps/web/app/calibrate/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";

import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";

type ProfileKey = "default" | "support-ops" | "leadership" | "strict";

type Profile = {
  key: ProfileKey;
  label: string;
  description: string;
  sliders: {
    roleScope: number;
    domainFit: number;
    platformFit: number;
  };
};

const PROFILES: Profile[] = [
  {
    key: "default",
    label: "Default",
    description: "Balanced weighting intended for most role evaluations.",
    sliders: { roleScope: 65, domainFit: 55, platformFit: 45 },
  },
  {
    key: "support-ops",
    label: "Support Operations",
    description: "Prioritizes operational execution, tooling, and process rigor.",
    sliders: { roleScope: 60, domainFit: 50, platformFit: 65 },
  },
  {
    key: "leadership",
    label: "Leadership Heavy",
    description: "Weights scope, cross-functional leadership, and organizational impact more strongly.",
    sliders: { roleScope: 75, domainFit: 55, platformFit: 40 },
  },
  {
    key: "strict",
    label: "Strict Match",
    description: "Applies more conservative scoring with higher alignment requirements.",
    sliders: { roleScope: 55, domainFit: 70, platformFit: 70 },
  },
];

export default function CalibratePage() {
  const basePanelStyle: CSSProperties = ttrComponents.basePanel;

  const [profileKey, setProfileKey] = useState<ProfileKey>("default");
  const [applyToAnalyze, setApplyToAnalyze] = useState(false);

  const profile = useMemo(
    () => PROFILES.find((p) => p.key === profileKey) ?? PROFILES[0],
    [profileKey],
  );

  return (
    <InstrumentShell
      kicker="Signal configuration"
      title="Calibrate"
      subtitle="Define how the analyzer should interpret and prioritize different signals. Configuration is preview-only for now."
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...basePanelStyle, flex: 1.05 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Calibration</span>
              <h2 style={ttrTypography.h2}>Profiles and weighting</h2>
            </div>

            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(226,232,240,0.65)",
                border: "1px dashed rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.04)",
              }}
              title="Preview only"
            >
              Preview mode
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={ttrComponents.fieldLabel} htmlFor="cal-profile">
                Calibration profile
              </label>

              <select
                id="cal-profile"
                value={profileKey}
                onChange={(e) => setProfileKey(e.target.value as ProfileKey)}
                style={ttrComponents.input}
              >
                {PROFILES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>

              <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                {profile.description}
              </p>
            </div>

            <div
              style={{
                border: "1px dashed rgba(251,191,36,0.35)",
                borderRadius: 14,
                padding: "14px 14px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                  color: "rgba(251,191,36,0.75)",
                  fontWeight: 800,
                }}
              >
                Staged capability
              </p>
              <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                These controls define how calibration will work. They are visible now to establish intent, but are not yet
                active or applied to analysis.
              </p>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={ttrComponents.fieldLabel}>Role scope weighting</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={profile.sliders.roleScope}
                  disabled
                  style={{ width: "100%" }}
                />
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Intended to influence how strongly level, ownership, and scope alignment affect scoring.
                </p>
              </div>

              <div>
                <label style={ttrComponents.fieldLabel}>Domain fit weighting</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={profile.sliders.domainFit}
                  disabled
                  style={{ width: "100%" }}
                />
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Intended to weight industry, market, and problem-space familiarity.
                </p>
              </div>

              <div>
                <label style={ttrComponents.fieldLabel}>Platform fit weighting</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={profile.sliders.platformFit}
                  disabled
                  style={{ width: "100%" }}
                />
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Intended to reflect tooling, systems, and platform alignment.
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.18)",
              }}
              title="Not active yet"
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(241,245,249,0.92)" }}>
                  Apply to Analyze
                </div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  When enabled, Analyze will use this calibration profile.
                </div>
              </div>

              <input
                type="checkbox"
                checked={applyToAnalyze}
                onChange={() => setApplyToAnalyze((prev) => !prev)}
                disabled
                style={{ width: 18, height: 18 }}
                aria-label="Apply calibration to Analyze (not active yet)"
              />
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(241,245,249,0.92)" }}>
                  Ready to score a role
                </div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Return to Analyze to run a fit check. Calibration will be wired in later.
                </div>
              </div>

              <Link href="/analyze" style={ttrComponents.quietButton}>
                Back to Analyze
              </Link>
            </div>
          </div>
        </section>

        <section style={{ ...basePanelStyle, flex: 0.95, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 20% 0%, rgba(251,191,36,0.08), transparent 35%), radial-gradient(circle at 90% 20%, rgba(255,255,255,0.05), transparent 30%)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Preview</span>
              <h2 style={ttrTypography.h2}>Impact view</h2>
            </div>

            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(226,232,240,0.9)",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.06)",
              }}
            >
              Informational
            </div>
          </div>

          <div style={{ position: "relative", marginTop: 20 }}>
            <div
              style={{
                border: "1px dashed rgba(255,255,255,0.16)",
                borderRadius: 14,
                padding: "28px 18px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                  color: "rgba(226,232,240,0.65)",
                  fontWeight: 800,
                }}
              >
                Planned behavior
              </p>

              <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                This panel will preview how calibration changes scoring outcomes before they are applied. For now, it
                reflects the selected profile’s intent.
              </p>

              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap" }}>
                <span style={ttrComponents.chip}>Role scope: {profile.sliders.roleScope}</span>
                <span style={ttrComponents.chip}>Domain fit: {profile.sliders.domainFit}</span>
                <span style={ttrComponents.chip}>Platform fit: {profile.sliders.platformFit}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}

