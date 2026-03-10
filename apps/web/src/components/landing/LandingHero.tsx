import Link from "next/link";

import { HeroAnalysisConsole } from "@/src/components/landing/HeroAnalysisConsole";

type LandingHeroProps = {
  analyzeHref: string;
};

export function LandingHero({ analyzeHref }: LandingHeroProps) {
  return (
    <section id="product" className="border-b border-slate-800/70">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Career Intelligence</p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            Know your chances before you apply
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-300">
            Target This Role analyzes your verified experience against any job description and shows how competitive
            you are before you apply.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={analyzeHref}
              className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
            >
              Analyze a Role
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Log In
            </Link>
          </div>
        </div>
        <HeroAnalysisConsole />
      </div>
    </section>
  );
}
