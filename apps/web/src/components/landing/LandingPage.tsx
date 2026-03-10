import { CompatibilityPrestigeSection } from "@/src/components/landing/CompatibilityPrestigeSection";
import { HowItWorksSection } from "@/src/components/landing/HowItWorksSection";
import { LandingFinalCta } from "@/src/components/landing/LandingFinalCta";
import { LandingFooter } from "@/src/components/landing/LandingFooter";
import { LandingHero } from "@/src/components/landing/LandingHero";
import { LandingNav } from "@/src/components/landing/LandingNav";
import { OpportunityPreviewSection } from "@/src/components/landing/OpportunityPreviewSection";
import { TruthFirstSection } from "@/src/components/landing/TruthFirstSection";

type LandingPageProps = {
  analyzeHref: string;
};

export function LandingPage({ analyzeHref }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#06090f] text-slate-100">
      <LandingNav />
      <main>
        <LandingHero analyzeHref={analyzeHref} />
        <CompatibilityPrestigeSection />
        <HowItWorksSection />
        <section id="opportunity" className="mx-auto w-full max-w-7xl px-4 py-14">
          <OpportunityPreviewSection />
        </section>
        <TruthFirstSection />
        <LandingFinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
