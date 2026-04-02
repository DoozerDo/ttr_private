import Link from "next/link";

const authNext = "/baseline";

type LandingFinalCtaProps = {
  isAuthenticated: boolean;
};

export function LandingFinalCta({ isAuthenticated }: LandingFinalCtaProps) {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 py-16 md:px-10 lg:px-16">
      <div className="rounded-2xl bg-slate-900/80 p-8 shadow-[0_20px_56px_rgba(15,23,42,0.34)]">
        <h2 className="text-2xl font-semibold text-white lg:text-[1.75rem]">Run your compatibility analysis.</h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300">
          Create your beta account, redeem access if needed, and compare your resume against real job descriptions.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {isAuthenticated ? (
            <Link
              href="/baseline"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
            >
              Continue to baseline
            </Link>
          ) : (
            <>
              <Link
                href={`/auth/signup?next=${encodeURIComponent(authNext)}`}
                className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
              >
                Get beta access
              </Link>
              <Link
                href={`/auth/login?next=${encodeURIComponent(authNext)}`}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Log In
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
