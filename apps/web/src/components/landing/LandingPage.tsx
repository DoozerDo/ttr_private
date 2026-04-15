"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import { LandingAnalyticsTracker } from "@/src/components/landing/LandingAnalyticsTracker";
import { DemoAnalysisPreviewSection } from "@/src/components/landing/DemoAnalysisPreviewSection";
import { LandingAdjacencyRadarTeaser } from "@/src/components/landing/LandingAdjacencyRadarTeaser";
import { LandingCompatibilityInputSection } from "@/src/components/landing/LandingCompatibilityInputSection";
import { LandingNav } from "@/src/components/landing/LandingNav";
import { LandingTrustStrip } from "@/src/components/landing/LandingTrustStrip";

type LandingPageProps = {
  isAuthenticated: boolean;
};

function CtaButton({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  const handleClick = () => {
    const anchor = document.getElementById("check-compatibility");
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Trigger the next action (resume upload) instead of a passive scroll.
    window.setTimeout(() => {
      const uploadButton = document.querySelector(
        '[data-testid="landing-upload-resume-button"]',
      ) as HTMLButtonElement | null;
      const jdField = document.querySelector(
        '[data-testid="landing-job-description-input"]',
      ) as HTMLTextAreaElement | null;

      if (uploadButton) {
        uploadButton.click();
        return;
      }
      jdField?.focus();
    }, 120);
  };

  return (
    <button
      data-testid={testId}
      type="button"
      onClick={handleClick}
      className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/14 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/25 hover:bg-white/[0.06] hover:text-white"
    >
      {children}
    </button>
  );
}

function MockPanel() {
  return (
    <div className="hidden md:block border-l border-white/10 pl-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">What the result shows</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
        <li>Canonical fit score</li>
        <li>Strengths, gaps, and adjacent lanes</li>
        <li>Clear next move</li>
      </ul>
    </div>
  );
}

export function LandingPage({ isAuthenticated }: LandingPageProps) {
  const [hasScoreRevealed, setHasScoreRevealed] = useState(false);

  useEffect(() => {
    const handler = () => setHasScoreRevealed(true);
    window.addEventListener("ttr:landing-score-revealed", handler);
    return () => window.removeEventListener("ttr:landing-score-revealed", handler);
  }, []);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#050816_0%,_#070b14_60%,_#050816_100%)] text-slate-100">
      <LandingAnalyticsTracker />
      <LandingNav isAuthenticated={isAuthenticated} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 md:px-6 md:py-7 lg:px-8">
        <section
          data-testid="landing-hero"
          className="rounded-[28px] border border-white/8 bg-white/[0.02] px-5 py-6 md:px-8 md:py-8"
        >
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Resume-to-role fit
              </p>
              <h1 className="mt-3 max-w-2xl pt-0.5 text-3xl font-semibold leading-[1.08] text-white md:text-[2.95rem]">
                Know before you apply.
              </h1>
              <div className="mt-4.5 flex flex-wrap items-center gap-3">
                <CtaButton testId="landing-hero-primary-action">Get your fit score</CtaButton>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Takes under 60 seconds. No fluff. Just a real answer.
              </p>
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

        <div className="-mt-2 hidden md:block">
          <LandingCompatibilityInputSection isAuthenticated={isAuthenticated} />
        </div>

        <LandingTrustStrip />

        {!isAuthenticated && (
          <p className="px-5 text-sm leading-6 text-slate-400 md:hidden">
            Full compatibility analysis is currently optimized for desktop. You can still create your account now.
          </p>
        )}

        {!hasScoreRevealed ? (
          <>
            <DemoAnalysisPreviewSection />
            <LandingAdjacencyRadarTeaser />
          </>
        ) : null}

      </main>
    </div>
  );
}
