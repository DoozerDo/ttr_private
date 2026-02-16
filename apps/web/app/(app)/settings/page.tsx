"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAutoGenerateThreshold } from "../lib/settings";
import { AUTO_GENERATE_THRESHOLD } from "../lib/autoGenerateThreshold";
import { ttrComponents } from "../ui/ttrStyles";
import { useEntitlements } from "@/src/lib/entitlements";

type SettingsProfile = {
  firstName: string;
  lastName: string;
  company: string;
  linkedinUrl: string;
};

const EMPTY_PROFILE: SettingsProfile = {
  firstName: "",
  lastName: "",
  company: "",
  linkedinUrl: "",
};

export default function SettingsPage() {
  const [autoGenerateThreshold] = useAutoGenerateThreshold();
  const { tier, source } = useEntitlements();
  const [profile, setProfile] = useState<SettingsProfile>(EMPTY_PROFILE);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        setIsLoadingProfile(true);
        setStatusError(null);
        const response = await fetch("/api/users/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Unable to load your profile.");
        }

        const data = (await response.json()) as {
          firstName?: string | null;
          lastName?: string | null;
          company?: string | null;
          linkedinUrl?: string | null;
        };

        if (cancelled) {
          return;
        }

        setProfile({
          firstName: data.firstName ?? "",
          lastName: data.lastName ?? "",
          company: data.company ?? "",
          linkedinUrl: data.linkedinUrl ?? "",
        });
      } catch (error) {
        if (!cancelled) {
          setStatusError(error instanceof Error ? error.message : "Unable to load your profile.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const thresholdValue =
    typeof autoGenerateThreshold === "number"
      ? autoGenerateThreshold
      : AUTO_GENERATE_THRESHOLD;
  const isBetaOverride = source === "beta" || source === "beta_override";
  const planLabel = isBetaOverride ? `${tier} (Beta)` : tier;

  const canSubmit = useMemo(() => !isSaving && !isLoadingProfile, [isLoadingProfile, isSaving]);

  const handleProfileChange = (field: keyof SettingsProfile, value: string) => {
    setStatusMessage(null);
    setStatusError(null);
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setStatusError(null);

    try {
      const response = await fetch("/api/users/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          company: profile.company.trim() || undefined,
          linkedinUrl: profile.linkedinUrl.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to save profile settings.");
      }

      setStatusMessage("Profile updated.");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Unable to save profile settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        ...ttrComponents.basePanel,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 720,
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Account capabilities, profile settings, and system defaults.
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-200">
            <span>First name</span>
            <input
              value={profile.firstName}
              onChange={(event) => handleProfileChange("firstName", event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
              placeholder="First name"
              autoComplete="given-name"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-200">
            <span>Last name</span>
            <input
              value={profile.lastName}
              onChange={(event) => handleProfileChange("lastName", event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
              placeholder="Last name"
              autoComplete="family-name"
            />
          </label>
        </div>

        <label className="space-y-1 text-sm text-slate-200">
          <span>LinkedIn URL</span>
          <input
            type="url"
            value={profile.linkedinUrl}
            onChange={(event) => handleProfileChange("linkedinUrl", event.target.value)}
            className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
            placeholder="https://www.linkedin.com/in/your-profile"
            autoComplete="url"
          />
        </label>

        <label className="space-y-1 text-sm text-slate-200">
          <span>Company</span>
          <input
            value={profile.company}
            onChange={(event) => handleProfileChange("company", event.target.value)}
            className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
            placeholder="Current company"
            autoComplete="organization"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl border border-amber-300/50 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300/80 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save profile"}
          </button>
          {isLoadingProfile ? <span className="text-xs text-slate-400">Loading profile…</span> : null}
          {statusMessage ? <span className="text-xs text-emerald-300">{statusMessage}</span> : null}
          {statusError ? <span className="text-xs text-red-300">{statusError}</span> : null}
        </div>

        <p className="text-xs text-slate-500">
          Password reset controls will be added here soon.
        </p>
      </form>

      <div className="space-y-3 text-sm text-slate-200">
        <div className="flex justify-between">
          <span>Auto generate threshold</span>
          <span className="font-semibold">{thresholdValue}</span>
        </div>
      </div>

      <div className="space-y-3 text-sm text-slate-200">
        <div className="flex justify-between">
          <span>Plan</span>
          <span className="font-semibold">{planLabel}</span>
        </div>
      </div>
    </div>
  );
}
