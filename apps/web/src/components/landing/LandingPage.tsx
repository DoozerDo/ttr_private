import { CompatibilityPrestigeSection } from "@/src/components/landing/CompatibilityPrestigeSection";
import { HowItWorksSection } from "@/src/components/landing/HowItWorksSection";
import { LandingFinalCta } from "@/src/components/landing/LandingFinalCta";
import { LandingFooter } from "@/src/components/landing/LandingFooter";
import { LandingHero } from "@/src/components/landing/LandingHero";
import { LandingNav } from "@/src/components/landing/LandingNav";
import { OpportunityPreviewSection } from "@/src/components/landing/OpportunityPreviewSection";
import { TruthFirstSection } from "@/src/components/landing/TruthFirstSection";

type LandingPageProps = {
  isAuthenticated: boolean;
};

export function LandingPage({ isAuthenticated }: LandingPageProps) {
  const analyzeHref = isAuthenticated ? "/analyze" : "/auth/signup";

  return (
    <div className="min-h-screen bg-[#06090f] text-slate-100">
      <LandingNav isAuthenticated={isAuthenticated} />
      <main>
        <LandingHero analyzeHref={analyzeHref} isAuthenticated={isAuthenticated} />
        <CompatibilityPrestigeSection />
        <HowItWorksSection />
        <section id="opportunity" className="mx-auto w-full max-w-7xl px-4 py-14">
          <OpportunityPreviewSection isAuthenticated={isAuthenticated} />
        </section>
        <TruthFirstSection />
        <LandingFinalCta isAuthenticated={isAuthenticated} />
      </main>
      <LandingFooter />
    </div>
  );
}
