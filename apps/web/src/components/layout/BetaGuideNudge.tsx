"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function BetaGuideNudge() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  if (pathname.startsWith("/beta")) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-400 transition hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="beta-guide-link"
      >
        <span aria-hidden="true">?</span>
        <span>How this works</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="How this works"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Beta guide</p>
                <h2 className="mt-1 text-lg font-semibold text-white">How this works</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-2 py-1 text-sm text-slate-400 hover:text-white"
                aria-label="Close guide"
              >
                Close
              </button>
            </div>

            <ol className="mt-4 space-y-3 text-sm text-slate-200">
              <li>1. Upload your resume and we structure your experience automatically.</li>
              <li>2. Your structured baseline becomes the source of truth for your profile.</li>
              <li>3. Run Career Compatibility Analysis to see your score.</li>
              <li>4. Use the score to unlock Studio and generate resumes and cover letters from the same source.</li>
            </ol>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/beta"
                className="rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
              >
                View full guide
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Back to product
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
