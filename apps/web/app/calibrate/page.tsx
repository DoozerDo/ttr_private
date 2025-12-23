// apps/web/app/calibrate/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";

type BuiltInProfileKey = "default" | "support-ops" | "leadership" | "strict";
type ProfileKey = BuiltInProfileKey | string;

type CalibrationWeights = {
  dimensionA: number;
  dimensionB: number;
  dimensionC: number;
  dimensionD: number;
  dimensionE: number;
};

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
  const [profileName, setProfileName] = useState("default");
  const [customProfiles, setCustomProfiles] = useState<Profile[]>([]);
  const [weights, setWeights] = useState<CalibrationWeights>({
    dimensionA: PROFILES[0].sliders.roleScope,
    dimensionB: PROFILES[0].sliders.domainFit,
    dimensionC: PROFILES[0].sliders.platformFit,
    dimensionD: 50,
    dimensionE: 50,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isErrorStatus = status ? /fail|unable|incomplete/i.test(status) : false;

  useEffect(() => {
    const cachedProfiles = window.localStorage.getItem("ttr-custom-calibration-profiles");

    if (cachedProfiles) {
      try {
        const parsed = JSON.parse(cachedProfiles) as Profile[];
        setCustomProfiles(parsed);
      } catch (error) {
        console.warn("Unable to parse cached calibration profiles", error);
      }
    }
  }, []);

  useEffect(() => {
    if (customProfiles.length === 0) {
      window.localStorage.removeItem("ttr-custom-calibration-profiles");
      return;
    }

    window.localStorage.setItem("ttr-custom-calibration-profiles", JSON.stringify(customProfiles));
  }, [customProfiles]);

  const availableProfiles = useMemo(
    () => [...PROFILES, ...customProfiles],
    [customProfiles],
  );

  const profile = useMemo(() => {
    const matchedProfile = availableProfiles.find((p) => p.key === profileKey);

    if (matchedProfile) {
      return matchedProfile;
    }

    return {
      key: profileKey,
      label: profileName,
      description: "Loaded calibration profile.",
      sliders: {
        // VERIFY: Align custom profile slider mapping with backend dimensions.
        roleScope: weights.dimensionA,
        domainFit: weights.dimensionB,
        platformFit: weights.dimensionC,
      },
    } satisfies Profile;
  }, [availableProfiles, profileKey, profileName, weights]);

  useEffect(() => {
    const fetchCalibration = async () => {
      try {
        const response = await fetch("/api/calibration", { cache: "no-store" });

        if (!response.ok) {
          setStatus("Unable to load calibration.");
          return;
        }

        const data = (await response.json()) as {
          ok?: boolean;
          profileName?: string;
          weights?: CalibrationWeights;
        };

        if (!data?.ok || !data.profileName || !data.weights) {
          setStatus("Calibration response was incomplete.");
          return;
        }

        const profileName = data.profileName;
        const weights = data.weights;
        const isBuiltIn = PROFILES.some((p) => p.key === profileName);

        setProfileName(profileName);
        setProfileKey(profileName as ProfileKey);
        setWeights(weights);
        if (!isBuiltIn) {
          setCustomProfiles((current) => {
            if (current.some((p) => p.key === profileName)) {
              return current;
            }

            return [
              ...current,
              {
                key: profileName,
                label: profileName,
                description: "Saved custom calibration profile.",
                sliders: {
                  roleScope: weights.dimensionA,
                  domainFit: weights.dimensionB,
                  platformFit: weights.dimensionC,
                },
              },
            ];
          });
        }
        setStatus(null);
      } catch (error) {
        console.error("Failed to load calibration", error);
        setStatus("Failed to load calibration.");
      }
    };

    fetchCalibration();
  }, []);

  const applyProfile = (nextKey: ProfileKey) => {
    setProfileKey(nextKey);

    const nextProfile = availableProfiles.find((p) => p.key === nextKey);

    if (!nextProfile) {
      return;
    }

    const profileNameValue = PROFILES.some((p) => p.key === nextProfile.key)
      ? nextProfile.key
      : nextProfile.label;
    setProfileName(profileNameValue);
    setWeights((current) => ({
      dimensionA: nextProfile.sliders.roleScope,
      dimensionB: nextProfile.sliders.domainFit,
      dimensionC: nextProfile.sliders.platformFit,
      // VERIFY: Keep untouched dimensions aligned with prior state when applying presets.
      dimensionD: current.dimensionD,
      dimensionE: current.dimensionE,
    }));
  };

  const addOrUpdateCustomProfile = (name: string, currentWeights: CalibrationWeights) => {
    setCustomProfiles((profiles) => {
      const nextProfile: Profile = {
        key: name,
        label: name,
        description: "Saved custom calibration profile.",
        sliders: {
          roleScope: currentWeights.dimensionA,
          domainFit: currentWeights.dimensionB,
          platformFit: currentWeights.dimensionC,
        },
      };

      if (profiles.some((p) => p.key === name)) {
        return profiles.map((p) => (p.key === name ? nextProfile : p));
      }

      return [...profiles, nextProfile];
    });
  };

  const removeCustomProfile = async (keyToRemove: ProfileKey) => {
    setCustomProfiles((profiles) => profiles.filter((p) => p.key !== keyToRemove));

    if (profileKey === keyToRemove) {
      const defaultProfile = PROFILES.find((p) => p.key === "default");

      if (defaultProfile) {
        setProfileName(defaultProfile.key);
        setProfileKey(defaultProfile.key);
        setWeights((current) => ({
          dimensionA: defaultProfile.sliders.roleScope,
          dimensionB: defaultProfile.sliders.domainFit,
          dimensionC: defaultProfile.sliders.platformFit,
          dimensionD: current.dimensionD,
          dimensionE: current.dimensionE,
        }));

        // Persist reverting to default so the removed profile does not reload.
        await saveCalibration({
          profileNameOverride: defaultProfile.key,
          weightsOverride: {
            dimensionA: defaultProfile.sliders.roleScope,
            dimensionB: defaultProfile.sliders.domainFit,
            dimensionC: defaultProfile.sliders.platformFit,
            dimensionD: weights.dimensionD,
            dimensionE: weights.dimensionE,
          },
        });
      }
    }

    setStatus("Custom profile removed.");
  };

  const saveCalibration = async ({
    profileNameOverride,
    weightsOverride,
  }: {
    profileNameOverride?: string;
    weightsOverride?: CalibrationWeights;
  } = {}) => {
    setIsSaving(true);
    setStatus(null);

    try {
      const trimmedName = profileNameOverride ?? (profileName.trim() || profile.label || profile.key);
      setProfileName(trimmedName);
      const nextProfileKey: ProfileKey = PROFILES.some((p) => p.key === trimmedName)
        ? (trimmedName as BuiltInProfileKey)
        : trimmedName;
      setProfileKey(nextProfileKey);

      const weightsToSave = weightsOverride ?? weights;

      const response = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileName: trimmedName,
          weights: weightsToSave,
        }),
      });

      if (!response.ok) {
        setStatus("Unable to save calibration.");
        return;
      }

      if (!PROFILES.some((p) => p.key === trimmedName)) {
        addOrUpdateCustomProfile(trimmedName, weights);
      }

      setStatus("Calibration saved.");
    } catch (error) {
      console.error("Failed to save calibration", error);
      setStatus("Failed to save calibration.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <InstrumentShell
      kicker="Signal configuration"
      title="Calibrate"
      subtitle="Define how the analyzer should interpret and prioritize different signals."
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
          </div>

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={ttrComponents.fieldLabel} htmlFor="cal-profile">
                Calibration profile
              </label>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select
                  id="cal-profile"
                  value={profileKey}
                  onChange={(e) => applyProfile(e.target.value as ProfileKey)}
                  style={{ ...ttrComponents.input, flex: 1 }}
                >
                  {availableProfiles.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>

                {!PROFILES.some((p) => p.key === profileKey) && (
                  <button
                    style={{ ...ttrComponents.quietButton, whiteSpace: "nowrap" }}
                    onClick={() => removeCustomProfile(profileKey)}
                    disabled={isSaving}
                  >
                    Delete
                  </button>
                )}
              </div>

              <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                {profile.description}
              </p>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={ttrComponents.fieldLabel}>Role scope weighting</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={weights.dimensionA}
                  onChange={(e) =>
                    setWeights((current) => ({
                      ...current,
                      dimensionA: Number(e.target.value),
                    }))
                  }
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
                  value={weights.dimensionB}
                  onChange={(e) =>
                    setWeights((current) => ({
                      ...current,
                      dimensionB: Number(e.target.value),
                    }))
                  }
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
                  value={weights.dimensionC}
                  onChange={(e) =>
                    setWeights((current) => ({
                      ...current,
                      dimensionC: Number(e.target.value),
                    }))
                  }
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
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(241,245,249,0.92)" }}>
                  Profile name
                </div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Saved calibrations are applied to future Analyze runs.
                </div>
              </div>

              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                style={{ ...ttrComponents.input, maxWidth: 180 }}
                aria-label="Calibration profile name"
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
                  Save calibration
                </div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Persist the selected profile and weights for future analysis runs.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button
                  style={ttrComponents.primaryButton}
                  onClick={() => saveCalibration()}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save calibration"}
                </button>
                <Link href="/analyze" style={ttrComponents.quietButton}>
                  Back to Analyze
                </Link>
              </div>
            </div>

            {status && (
              <div style={isErrorStatus ? ttrComponents.dangerBox : ttrComponents.successBox}>
                {status}
              </div>
            )}
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
              <span style={ttrTypography.subtleLabel}>Calibration</span>
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
              Live
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
                Current weighting
              </p>

              <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                Saved calibration weights will be applied when running Analyze. Adjust sliders to tune emphasis areas
                before saving.
              </p>

              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap" }}>
                <span style={ttrComponents.chip}>Role scope: {weights.dimensionA}</span>
                <span style={ttrComponents.chip}>Domain fit: {weights.dimensionB}</span>
                <span style={ttrComponents.chip}>Platform fit: {weights.dimensionC}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}

