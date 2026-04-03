"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { LandingAnalyticsTracker } from "@/src/components/landing/LandingAnalyticsTracker";
import { DemoAnalysisPreviewSection } from "@/src/components/landing/DemoAnalysisPreviewSection";
import { LandingCompatibilityInputSection } from "@/src/components/landing/LandingCompatibilityInputSection";
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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3 md:px-6 md:py-4 lg:px-8">
        <section className="rounded-[30px] border border-white/12 bg-slate-950/70 px-5 py-5 md:px-8 md:pb-4 md:pt-7">
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
            <div className="max-w-2xl">
              <h1 className="mt-0 text-3xl md:text-4xl leading-[1.1] font-semibold max-w-2xl text-white">
                Know if you qualify before you apply.
              </h1>
              <p className="mt-3.5 max-w-xl text-[0.98rem] leading-7 text-slate-200 md:text-[1.02rem]">
                Most people apply to roles they were never going to get. This shows you where you actually stand before you waste the time.
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
              <p className="mt-2 text-sm text-slate-400">Takes under 60 seconds. No fluff. Just a real answer.</p>
              {!isAuthenticated && (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm md:hidden">
                  <Link href="/auth/signup?next=%2Fbaseline" className="font-semibold text-white underline underline-offset-4">
                    Sign up
                  </Link>
                  <Link href="/auth/login?next=%2Fbaseline" className="font-semibold text-slate-300 underline underline-offset-4">
                    Log in
                  </Link>
                </div>
              )}
            </div>

            <div className="hidden md:block">
              <MockPanel />
            </div>
          </div>
        </section>

        <div className="-mt-4 hidden md:block">
          <LandingCompatibilityInputSection />
        </div>

        {!isAuthenticated && (
          <section className="rounded-[24px] border border-white/10 bg-slate-950/60 px-5 py-4 text-sm text-slate-300 md:hidden">
            Full compatibility analysis is currently optimized for desktop. You can still create your account now.
          </section>
        )}

        <section className="grid gap-4 rounded-[26px] border border-white/10 bg-white/[0.025] p-4 md:p-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Positioning</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Most tools try to make you look qualified. This tells you if you actually are.
            </h2>
          </div>
          <ul className="space-y-3 text-sm leading-6 text-slate-200">
            <li>No inflated experience. No pretending you're qualified when you're not.</li>
            <li>Built on verified baseline evidence</li>
            <li>Designed to reflect reality, not impress recruiters</li>
          </ul>
        </section>

        <DemoAnalysisPreviewSection />

        <section id="how-it-works" className="grid gap-3 md:grid-cols-3">
          {["Upload your resume", "Paste the job description", "Get your real fit score and breakdown"].map((step, index) => (
            <div key={step} className="rounded-[22px] border border-white/10 bg-slate-950/55 p-[18px]">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">{index + 1}</p>
              <p className="mt-3 text-base font-semibold text-white">{step}</p>
            </div>
          ))}
        </section>

        <section className="rounded-[26px] border border-white/10 bg-white/[0.02] p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">What you get</p>
          <ul className="mt-4 grid gap-3 text-sm leading-6 text-slate-200 md:grid-cols-2">
            <li>Where you actually match</li>
            <li>What&apos;s missing and how big the gap is</li>
            <li>Whether it&apos;s worth applying</li>
            <li>What to fix to compete</li>
          </ul>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-slate-950/75 px-5 py-6 text-center md:px-8 md:py-7">
          <p className="text-lg font-semibold tracking-tight text-white md:text-2xl">
            Know where you stand in under 60 seconds.
          </p>
        </section>

        <section className="rounded-[30px] border border-white/12 bg-slate-950/72 px-5 py-6 md:px-8 md:py-7">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Final step</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Get your score in under 60 seconds
              </h2>
            </div>
            <CtaButton authenticated={isAuthenticated} footer>
              Get your score
            </CtaButton>
          </div>
        </section>
      </main>
    </div>
  );
}
