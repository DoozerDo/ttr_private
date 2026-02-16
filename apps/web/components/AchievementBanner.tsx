"use client";

import { useMemo } from "react";
import type { Achievement } from "@/types/achievement";

const TIER_ACCENT_COLORS: Record<string, string> = {
  gold: "#facc15",
  silver: "#cbd5f5",
  bronze: "#fb923c",
};

const LOCAL_ACCENT = "#22c55e";

export type AchievementBannerProps = {
  achievements: Achievement[];
};

export function AchievementBanner({ achievements }: AchievementBannerProps) {
  const achievement = achievements?.[0];
  const accentColor = achievement
    ? TIER_ACCENT_COLORS[achievement.tier.toLowerCase()] ?? LOCAL_ACCENT
    : LOCAL_ACCENT;

  const tierLabel = achievement?.tier?.toUpperCase() ?? "";

  const timestampLabel = useMemo(() => {
    if (!achievement?.unlockedAt) return null;
    try {
      const date = new Date(achievement.unlockedAt);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    } catch {
      // ignore
    }
    return null;
  }, [achievement?.unlockedAt]);

  if (!achievement) {
    return null;
  }

  return (
    <section
      className="relative overflow-hidden rounded-3xl border bg-emerald-900/60 p-5 text-left"
      style={{
        borderColor: `${accentColor}80`,
        boxShadow: `0 0 35px rgba(34, 197, 94, 0.25)`,
        animation: "achievementFadeIn 600ms ease-out forwards, achievementGlow 2200ms ease-in-out 1.2s infinite alternate",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-emerald-600/10 to-transparent opacity-0" />
      <div className="relative flex items-center gap-4">
        <div
          className="grid h-14 w-14 place-items-center rounded-2xl border bg-emerald-500/10 text-2xl font-semibold text-emerald-200"
          style={{ borderColor: `${accentColor}80` }}
        >
          <span>{achievement.iconKey ?? "★"}</span>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.4em] text-emerald-200">{tierLabel}</p>
          <p className="text-lg font-semibold text-white">{achievement.title}</p>
          <p className="text-sm text-slate-200">{achievement.description}</p>
        </div>
      </div>
      {timestampLabel ? (
        <p className="mt-3 text-xs uppercase tracking-[0.3em] text-emerald-200">
          Unlocked {timestampLabel}
        </p>
      ) : null}
    </section>
  );
}
