import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-800/80">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-8 text-sm text-slate-300 md:px-10 lg:px-16 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold uppercase tracking-[0.25em] text-slate-300">Target This Role</p>
        <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-200">
          <a href="#product" className="transition-colors hover:text-white">
            Product
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-white">
            How It Works
          </a>
          <a href="#truth-first" className="transition-colors hover:text-white">
            Trust
          </a>
        </div>
        <div className="flex items-center gap-4 text-slate-300">
          <Link href="/auth/login" className="transition-colors hover:text-slate-100">
            Log In
          </Link>
          <Link href="/auth/signup" className="transition-colors hover:text-slate-100">
            Sign Up
          </Link>
        </div>
      </div>
    </footer>
  );
}
