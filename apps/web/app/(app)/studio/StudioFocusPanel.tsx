"use client";

export type FocusAction = {
  testId: string;
  title: string;
  description: string;
  onClick: () => void;
};

type Props = {
  primary: FocusAction;
  secondary?: FocusAction[];
};

export function StudioFocusPanel({ primary, secondary }: Props) {
  const other = (secondary ?? []).filter(Boolean);
  return (
    <section
      className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3"
      data-testid="studio-focus-panel"
    >
      <div className="space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Recommended next moves
        </p>
        <p className="text-sm text-slate-200">
          Start here to make the resume stronger, faster.
        </p>
      </div>

      <div className="mt-3 space-y-2.5" data-testid="studio-focus-primary">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Primary recommendation
        </p>
        <button
          key={primary.testId}
          type="button"
          onClick={primary.onClick}
          className="w-full rounded-2xl border border-sky-300/25 bg-sky-500/8 p-3.5 text-left transition hover:bg-sky-500/12"
          data-testid={primary.testId}
        >
          <p className="text-sm font-semibold text-slate-50">{primary.title}</p>
          <p className="mt-1 text-sm text-slate-200">{primary.description}</p>
        </button>
      </div>

      {other.length ? (
        <div className="mt-3 space-y-2" data-testid="studio-focus-secondary">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Other improvements
          </p>
          <div className="grid gap-2">
            {other.map((action) => (
          <button
            key={action.testId}
            type="button"
            onClick={action.onClick}
            className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
            data-testid={action.testId}
          >
            <p className="text-sm font-semibold text-slate-100">{action.title}</p>
            <p className="mt-1 text-sm text-slate-300">{action.description}</p>
          </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
