"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import { resolveUnlockPathState, type UnlockPathInput, type UnlockPathModuleState } from "@/src/lib/unlockPath";

type ModuleMeta = {
  id: "baseline" | "analysis" | "fitReview" | "studio" | "opportunities";
  title: string;
  subtitle: string;
  href: string;
  lockedReason: string;
};

const MODULES: ModuleMeta[] = [
  {
    id: "baseline",
    title: "Baseline",
    subtitle: "Create your baseline.",
    href: "/baseline",
    lockedReason: "Baseline setup is required first.",
  },
  {
    id: "analysis",
    title: "Target",
    subtitle: "Run fit analysis for a target role.",
    href: "/analyze",
    lockedReason: "Complete your baseline before targeting.",
  },
  {
    id: "fitReview",
    title: "Fit Review",
    subtitle: "Review fit gaps before generation.",
    href: "/fit-review",
    lockedReason: "Fit Review unlocks Studio when readiness is not ready at 70+ score.",
  },
  {
    id: "studio",
    title: "Studio",
    subtitle: "Generate resume and cover letter.",
    href: "/studio",
    lockedReason: "Studio unlocks when score is 70+ and readiness is ready.",
  },
  {
    id: "opportunities",
    title: "Opportunities",
    subtitle: "Track saved roles and next actions.",
    href: "/job-tracker",
    lockedReason: "Opportunities unlock after Studio is available.",
  },
];

const STATE_LABEL: Record<UnlockPathModuleState, string> = {
  LOCKED: "Locked",
  CURRENT: "CURRENT",
  UNLOCKED: "Unlocked",
  COMPLETE: "Complete",
};

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M7.5 10V8.5a4.5 4.5 0 1 1 9 0V10m-8.25 0h7.5A1.75 1.75 0 0 1 17.5 11.75v6.5A1.75 1.75 0 0 1 15.75 20H8.25A1.75 1.75 0 0 1 6.5 18.25v-6.5A1.75 1.75 0 0 1 8.25 10Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type UnlockPathBarProps = UnlockPathInput & {
  className?: string;
  onNavigate?: (href: string) => void;
};

export function UnlockPathBar(props: UnlockPathBarProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const resolved = useMemo(
    () => resolveUnlockPathState({ ...props, currentPathname: props.currentPathname ?? pathname }),
    [pathname, props],
  );

  const navigate = (href: string) => {
    if (props.onNavigate) {
      props.onNavigate(href);
      return;
    }
    router.push(href);
  };

  return (
    <nav className={props.className ?? "w-full"} aria-label="Unlock Path">
      <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
        {MODULES.map((module) => {
          const state = resolved[module.id];
          const visibleState = state as UnlockPathModuleState;

          const isLocked = visibleState === "LOCKED";
          const isCurrent = visibleState === "CURRENT";
          const isComplete = visibleState === "COMPLETE";
          const isClickable = !isLocked;
          const badge = STATE_LABEL[visibleState];
          const title = isLocked ? `${module.title}: ${module.lockedReason}` : module.title;

          return (
            <button
              key={module.id}
              type="button"
              className={[
                "group flex min-h-[92px] min-w-[180px] flex-col justify-between rounded-2xl border px-4 py-3 text-left transition",
                isCurrent
                  ? "border-emerald-300/60 bg-emerald-500/12 shadow-[0_0_0_1px_rgba(110,231,183,0.18)]"
                  : isComplete
                    ? "border-white/10 bg-white/5"
                    : isLocked
                      ? "border-white/5 bg-white/3 opacity-60"
                      : "border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-white/6",
              ].join(" ")}
              onClick={() => {
                if (!isClickable) return;
                navigate(module.href);
              }}
              title={title}
              aria-disabled={isLocked}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    {module.title}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-slate-200">{module.subtitle}</p>
                </div>
                {isLocked ? <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> : null}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span
                  className={[
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
                    isCurrent
                      ? "bg-emerald-400/15 text-emerald-200"
                      : isComplete
                        ? "bg-white/10 text-emerald-200"
                        : isLocked
                          ? "bg-white/5 text-slate-400"
                          : "bg-slate-800/70 text-slate-200",
                  ].join(" ")}
                >
                  {badge}
                </span>
                {isLocked ? (
                  <span className="text-[11px] leading-4 text-slate-400">{module.lockedReason}</span>
                ) : !isCurrent ? (
                  <span className="text-[11px] leading-4 text-slate-400">
                    {isComplete ? "Completed" : "Available"}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
