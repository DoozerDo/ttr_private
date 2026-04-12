import Link from "next/link";

const authNext = "/baseline";

type LandingNavProps = {
  isAuthenticated: boolean;
};

export function LandingNav({ isAuthenticated }: LandingNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-4 py-3 md:px-10 lg:px-16">
        <Link href="/" className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-100">
          Target This Role
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <a href="#product" className="transition-colors hover:text-white">
            Product
          </a>
          <a href="#check-compatibility" className="transition-colors hover:text-white">
            Check Compatibility
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-white">
            How It Works
          </a>
          <a href="#truth-first" className="transition-colors hover:text-white">
            Trust
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link
              href="/baseline"
              data-testid="landing-nav-go-to-app"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
            >
              Go to App
            </Link>
          ) : (
            <>
              <Link
                href={`/auth/login?next=${encodeURIComponent(authNext)}`}
                data-testid="landing-nav-login"
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href={`/auth/signup?next=${encodeURIComponent(authNext)}`}
                data-testid="landing-nav-signup"
                className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
              >
                Get beta access
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
