"use client";

import Link from "next/link";

type GuidedOverlayProps = {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref?: string;
  onCtaClick?: () => void;
};

export function GuidedOverlay({ headline, body, ctaLabel, ctaHref, onCtaClick }: GuidedOverlayProps) {
  return (
    <section data-testid="guided-overlay" className="rounded-2xl border border-sky-300/30 bg-sky-500/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Guided mode</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-100">{headline}</h2>
      <p className="mt-1 text-sm text-slate-200">{body}</p>
      <div className="mt-3">
        {onCtaClick ? (
          <button
            type="button"
            onClick={onCtaClick}
            className="inline-flex min-h-[40px] min-w-[180px] items-center justify-center rounded-[var(--button-radius)] bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
          >
            {ctaLabel}
          </button>
        ) : (
          <Link
            href={ctaHref ?? "#"}
            className="inline-flex min-h-[40px] min-w-[180px] items-center justify-center rounded-[var(--button-radius)] bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
          >
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
