"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { LandingAnalyticsTracker } from "@/src/components/landing/LandingAnalyticsTracker";
import { LandingCompatibilityInputSection } from "@/src/components/landing/LandingCompatibilityInputSection";
import { LandingFinalCta } from "@/src/components/landing/LandingFinalCta";
import { LandingNav } from "@/src/components/landing/LandingNav";
import { DemoAnalysisPreviewSection } from "@/src/components/landing/DemoAnalysisPreviewSection";
import { trackEvent } from "@/src/lib/analytics";

type LandingPageProps = {
  isAuthenticated: boolean;
};

function CtaButton({
  children,
  authenticated,
  footer,
}: {
  children: ReactNode;
  authenticated: boolean;
  footer?: boolean;
}) {
  const router = useRouter();

  const destination = useMemo(() => (authenticated ? "/baseline" : "/auth/signup?next=%2Fbaseline"), [authenticated]);

  const handleClick = () => {
    trackEvent(footer ? "landing_cta_footer_click" : "landing_cta_click", {
      destination: authenticated ? "/baseline" : "/auth/signup",
      authenticated,
    });
    router.push(destination);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center justify-center rounded-[var(--button-radius)] bg-[var(--accent-primary)] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[var(--accent-primary-hover)]"
    >
      {children}
    </button>
  );
}

function MockPanel() {
  return (
    <div className="rounded-[22px] border border-slate-700/60 bg-slate-950/70 p-4">
      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Compatibility readout</p>
      <div className="mt-3 space-y-2.5 rounded-[18px] border border-slate-800/60 bg-black/10 p-3.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-300">Fit score</span>
          <span className="text-sm font-medium text-white">Shown after upload</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-300">Where you match</span>
          <span className="text-sm font-medium text-white">Strengths</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-300">What may hurt you</span>
          <span className="text-sm font-medium text-white">Gaps</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-300">Best next step</span>
          <span className="text-sm font-medium text-white">Decide whether to apply</span>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ isAuthenticated }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#050816_0%,_#070b14_60%,_#050816_100%)] text-slate-100">
      <LandingAnalyticsTracker />
      <LandingNav isAuthenticated={isAuthenticated} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3 md:px-6 md:py-4 lg:px-8">
        <section className="rounded-[30px] border border-white/12 bg-slate-950/70 px-5 py-5 md:px-8 md:pb-4 md:pt-7">
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
            <div className="max-w-2xl">
              <h1 className="mt-0 text-3xl md:text-4xl leading-[1.1] font-semibold max-w-2xl text-white">
                Know if you qualify before you apply.
              </h1>
              <p className="mt-3.5 max-w-xl text-[0.98rem] leading-7 text-slate-200 md:text-[1.02rem]">
                Check your fit before you apply, so you can decide with evidence instead of guesswork.
              </p>
              <div className="mt-4.5 flex flex-wrap items-center gap-3">
                <CtaButton authenticated={isAuthenticated}>Get your score</CtaButton>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center justify-center text-sm font-medium text-slate-300 underline decoration-white/20 decoration-1 underline-offset-4 transition hover:text-white hover:decoration-white/45"
                >
                  See how it works
                </Link>
              </div>
            </div>

            <div className="hidden md:block">
              <MockPanel />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-[26px] border border-white/10 bg-white/[0.025] p-4 md:p-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Positioning</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Most tools help you look qualified. This shows whether you actually are.
            </h2>
          </div>
          <ul className="space-y-3 text-sm leading-6 text-slate-200">
            <li>Built on verified baseline evidence.</li>
            <li>Designed to reflect reality, not recruiter theater.</li>
            <li>Helps you decide whether to apply or keep building.</li>
          </ul>
        </section>

        <DemoAnalysisPreviewSection />

        <div id="how-it-works" className="scroll-mt-24">
          <LandingCompatibilityInputSection />
        </div>

        <LandingFinalCta isAuthenticated={isAuthenticated} />
      </main>
    </div>
  );
}
