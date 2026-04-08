"use client";

import Link from "next/link";

type FirstRunClientProps = {
  archivedBaselineCount?: number;
};

export function FirstRunClient({ archivedBaselineCount = 0 }: FirstRunClientProps) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#050816_0%,_#070b14_60%,_#050816_100%)] px-4 py-6 text-slate-100 md:px-6 md:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section className="space-y-4 rounded-[28px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_18px_50px_rgba(2,6,23,0.28)] md:p-8">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
              Welcome
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Start with your active baseline
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-200">
              Upload the resume you want to work from. We’ll turn it into your active baseline so you can
              analyze roles, generate documents, and keep momentum in one place.
            </p>
          </div>

          {archivedBaselineCount > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
              You already have {archivedBaselineCount} archived baseline
              {archivedBaselineCount === 1 ? "" : "s"} in your library. You can restore them later from
              Baseline Studio if needed.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Link
              href="/baseline#baseline-upload"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] bg-[var(--accent-primary)] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
            >
              Start baseline upload
            </Link>
            <Link
              href="/baseline"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--button-radius)] border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/30 hover:bg-white/[0.04]"
            >
              Open Baseline Studio
            </Link>
          </div>
        </section>

        <section className="grid gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-6 md:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-white">1. Upload</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Add the resume you want TTR to use as your working baseline.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">2. Create</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              The baseline becomes your active workspace for scoring and generation.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">3. Continue</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Once the baseline exists, you’ll move into the normal baseline flow automatically.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
