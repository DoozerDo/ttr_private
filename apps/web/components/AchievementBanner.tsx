"use client";

import { useMemo } from "react";
import type { Achievement } from "@/types/achievement";

export type AchievementBannerProps = {
  achievements: Achievement[];
};

export function AchievementBanner({ achievements }: AchievementBannerProps) {
  const achievement = achievements?.[0];
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
    <section className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-900/30 px-5 py-4 text-left">
      <div>
        <div className="relative flex items-center gap-4">
          <div
            className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-slate-900/60 text-2xl font-semibold text-white"
          >
            <span>{achievement.iconKey ?? "★"}</span>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400">{tierLabel}</p>
            <p className="text-lg font-semibold text-slate-100">{achievement.title}</p>
            <p className="text-sm text-slate-200">{achievement.description}</p>
          </div>
        </div>
        {timestampLabel ? (
          <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">
            Unlocked {timestampLabel}
          </p>
        ) : null}
      </div>
    </section>
  );
}
