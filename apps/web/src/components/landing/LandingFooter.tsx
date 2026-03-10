import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-800/80">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold uppercase tracking-[0.25em] text-slate-300">Target This Role</p>
        <div className="flex items-center gap-4">
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
