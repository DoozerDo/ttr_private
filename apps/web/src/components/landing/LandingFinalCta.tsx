import Link from "next/link";

export function LandingFinalCta() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-14">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-8">
        <h2 className="text-3xl font-semibold text-white">Stop applying blindly</h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300">
          Create your baseline, analyze roles with confidence, and discover where your experience creates real
          opportunity.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/auth/signup"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
          >
            Get Started
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Log In
          </Link>
        </div>
      </div>
    </section>
  );
}
