"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";

import { useEntitlements } from "@/src/lib/entitlements";
import { ReportBugTrigger } from "../support/ReportBugProvider";

type ResumeFocusOption =
  | "Auto (recommended)"
  | "Operational Leadership"
  | "Technical Depth"
  | "Customer Experience Strategy"
  | "Scaling Operations";

type SettingsProfile = {
  firstName: string;
  lastName: string;
  company: string;
  linkedinUrl: string;
  roleTitle: string;
  intendedUse: string;
  studioResumeFocusDefault: ResumeFocusOption | "";
};

const EMPTY_PROFILE: SettingsProfile = {
  firstName: "",
  lastName: "",
  company: "",
  linkedinUrl: "",
  roleTitle: "",
  intendedUse: "",
  studioResumeFocusDefault: "",
};

const RESUME_FOCUS_OPTIONS: Array<{ value: ResumeFocusOption; label: string }> = [
  { value: "Auto (recommended)", label: "Auto" },
  { value: "Operational Leadership", label: "Leadership emphasis" },
  { value: "Technical Depth", label: "Technical depth" },
  { value: "Customer Experience Strategy", label: "Customer strategy" },
  { value: "Scaling Operations", label: "Operational execution" },
];

type SettingsPanelProps = {
  onClose?: () => void;
  compact?: boolean;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function SettingsPanel({ onClose, compact = false }: SettingsPanelProps) {
  const { tier, source } = useEntitlements();
  const [profile, setProfile] = useState<SettingsProfile>(EMPTY_PROFILE);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

        const data = (await response.json()) as Partial<SettingsProfile>;
        if (cancelled) return;

        setProfile({
          firstName: data.firstName ?? "",
          lastName: data.lastName ?? "",
          company: data.company ?? "",
          linkedinUrl: data.linkedinUrl ?? "",
          roleTitle: data.roleTitle ?? "",
          intendedUse: data.intendedUse ?? "",
          studioResumeFocusDefault:
            (RESUME_FOCUS_OPTIONS.some((option) => option.value === data.studioResumeFocusDefault)
              ? (data.studioResumeFocusDefault as ResumeFocusOption)
              : "") ?? "",
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

  const isBetaOverride = source === "beta" || source === "beta_override";
  const planLabel = isBetaOverride ? `${tier} (Beta)` : tier;
  const canSubmitProfile = useMemo(() => !isSavingProfile && !isLoadingProfile, [isLoadingProfile, isSavingProfile]);
  const canSubmitPassword = useMemo(
    () => !isSavingPassword && currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword,
    [confirmPassword, currentPassword.length, isSavingPassword, newPassword],
  );

  const handleProfileChange = (field: keyof SettingsProfile, value: string) => {
    setStatusMessage(null);
    setStatusError(null);
    setProfile((prev) => ({ ...prev, [field]: value as never }));
  };

  const onProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitProfile) return;

    setIsSavingProfile(true);
    setStatusMessage(null);
    setStatusError(null);

    try {
      const response = await fetch("/api/users/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          company: profile.company.trim() || undefined,
          linkedinUrl: profile.linkedinUrl.trim() || undefined,
          roleTitle: profile.roleTitle.trim() || undefined,
          intendedUse: profile.intendedUse.trim() || undefined,
          studioResumeFocusDefault:
            profile.studioResumeFocusDefault && profile.studioResumeFocusDefault !== "Auto (recommended)"
              ? profile.studioResumeFocusDefault
              : undefined,
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
      setIsSavingProfile(false);
    }
  };

  const onChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitPassword) return;

    setIsSavingPassword(true);
    setStatusMessage(null);
    setStatusError(null);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
        throw new Error(payload?.message ?? payload?.error ?? "Unable to change password.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatusMessage("Password updated.");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div
      className={[
        "flex flex-col gap-5 rounded-2xl border border-white/10 bg-slate-950/70",
        compact ? "p-5" : "p-6",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">Profile, support, preferences, and security.</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/35 hover:bg-slate-800/80"
          >
            Close
          </button>
        ) : null}
      </div>

      <Section title="Profile" description="Edit the profile fields already stored on your account.">
        <form className="space-y-4" onSubmit={onProfileSubmit}>
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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-200">
              <span>Role title</span>
              <input
                value={profile.roleTitle}
                onChange={(event) => handleProfileChange("roleTitle", event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
                placeholder="Founder, product lead, operator..."
                autoComplete="organization-title"
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
            <span>Intended use</span>
            <textarea
              value={profile.intendedUse}
              onChange={(event) => handleProfileChange("intendedUse", event.target.value)}
              className="h-24 w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
              placeholder="What do you want to use Target This Role for?"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <label className="space-y-1 text-sm text-slate-200">
              <span>Studio resume focus default</span>
              <select
                value={profile.studioResumeFocusDefault}
                onChange={(event) =>
                  handleProfileChange("studioResumeFocusDefault", event.target.value as SettingsProfile["studioResumeFocusDefault"])
                }
                className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
              >
                <option value="">Auto (recommended)</option>
                {RESUME_FOCUS_OPTIONS.filter((option) => option.value !== "Auto (recommended)").map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3 text-xs text-slate-400">
              Saved here as the Studio starting value. Users can still change it per session.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!canSubmitProfile}
              className="rounded-xl border border-amber-300/50 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300/80 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingProfile ? "Saving..." : "Save profile"}
            </button>
            {isLoadingProfile ? <span className="text-xs text-slate-400">Loading profile...</span> : null}
          </div>
        </form>
      </Section>

      <Section title="Support" description="Ask for help in Discord, report bugs here, or review prior reports.">
        <div className="grid gap-3 md:grid-cols-3">
          <SupportCard
            title="Get help on Discord"
            description="Need help using the product? Ask in Discord."
            cta={
              process.env.NEXT_PUBLIC_BETA_DISCORD_URL?.trim() ? (
                <a
                  href={process.env.NEXT_PUBLIC_BETA_DISCORD_URL.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-amber-300/50 bg-amber-400/20 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300/80 hover:bg-amber-400/30"
                >
                  Open Discord
                </a>
              ) : (
                <span className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm font-semibold text-slate-500">
                  Discord unavailable
                </span>
              )
            }
          />
          <SupportCard
            title="Report a bug"
            description="Something broken? Use the existing bug report flow."
            cta={<ReportBugTrigger className="w-full" label="Report a bug" />}
          />
          <SupportCard
            title="View bug history"
            description="Review the bugs you have already submitted."
            cta={
              <Link
                href="/support/history"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-slate-900/40 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-slate-800/70"
              >
                Open history
              </Link>
            }
          />
        </div>
      </Section>

      <Section title="Preferences" description="Choose the default Studio behavior for your account.">
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-300">
          Studio uses this value as the starting focus when a new session opens.
        </div>
      </Section>

      <Section title="Security" description="Change your password or request a reset if you are locked out.">
        <form className="space-y-4" onSubmit={onChangePassword}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm text-slate-200">
              <span>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
                autoComplete="current-password"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-200">
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
                autoComplete="new-password"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-200">
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-amber-300/70"
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!canSubmitPassword}
              className="rounded-xl border border-amber-300/50 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300/80 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingPassword ? "Updating..." : "Change password"}
            </button>
            <Link
              href="/auth/forgot-password"
              className="text-sm font-semibold text-slate-300 transition hover:text-white"
            >
              Forgot password?
            </Link>
          </div>
        </form>
      </Section>

      <div className="space-y-3 text-sm text-slate-200">
        <div className="flex justify-between">
          <span>Plan</span>
          <span className="font-semibold">{planLabel}</span>
        </div>
      </div>

      {statusMessage ? <p className="text-sm text-emerald-300">{statusMessage}</p> : null}
      {statusError ? <p className="text-sm text-red-300">{statusError}</p> : null}
    </div>
  );
}

function SupportCard({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta: ReactNode;
}) {
  return (
    <article className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      {cta}
    </article>
  );
}
