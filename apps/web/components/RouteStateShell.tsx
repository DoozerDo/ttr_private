import { ReactNode } from "react";

type RouteStateShellTone = "neutral" | "warning" | "success";

type RouteStateShellProps = {
  title: string;
  body: ReactNode;
  cta?: ReactNode;
  eyebrow?: string;
  children?: ReactNode;
  testId?: string;
  tone?: RouteStateShellTone;
};

const TONE_CLASSES: Record<RouteStateShellTone, string> = {
  neutral: "border-white/10 bg-slate-900/40 text-slate-100",
  warning: "border-amber-300/30 bg-amber-500/10 text-amber-100",
  success: "border-emerald-300/30 bg-emerald-500/10 text-emerald-100",
};

export function RouteStateShell({
  title,
  body,
  cta,
  eyebrow,
  children,
  testId,
  tone = "neutral",
}: RouteStateShellProps) {
  return (
    <section className={`space-y-3 rounded-2xl border p-4 ${TONE_CLASSES[tone]}`} data-testid={testId}>
      <div className="space-y-1">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em]">{eyebrow}</p> : null}
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="text-sm">{body}</div>
      </div>
      {cta ? <div className="flex flex-wrap items-center gap-3">{cta}</div> : null}
      {children}
    </section>
  );
}
