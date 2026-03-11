import { CareerIntelligenceEngineSection } from "@/src/components/landing/CareerIntelligenceEngineSection";
import { CompatibilityPrestigeSection } from "@/src/components/landing/CompatibilityPrestigeSection";
import { HowItWorksSection } from "@/src/components/landing/HowItWorksSection";
import { LandingFinalCta } from "@/src/components/landing/LandingFinalCta";
import { LandingFooter } from "@/src/components/landing/LandingFooter";
import { LandingHero } from "@/src/components/landing/LandingHero";
import { LandingNav } from "@/src/components/landing/LandingNav";
import { OpportunitySnapshotSection } from "@/src/components/landing/OpportunitySnapshotSection";
import { DecisionIntelligenceSection } from "@/src/components/landing/DecisionIntelligenceSection";
import { OpportunityPreviewSection } from "@/src/components/landing/OpportunityPreviewSection";
import { TruthFirstSection } from "@/src/components/landing/TruthFirstSection";
import { LandingAnalyticsTracker } from "@/src/components/landing/LandingAnalyticsTracker";

type LandingPageProps = {
  isAuthenticated: boolean;
};

export function LandingPage({ isAuthenticated }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#06090f] text-slate-100">
      <LandingAnalyticsTracker />
      <LandingNav isAuthenticated={isAuthenticated} />
      <main>
        <LandingHero isAuthenticated={isAuthenticated} />
        <OpportunitySnapshotSection />
        <DecisionIntelligenceSection />
        <CompatibilityPrestigeSection />
        <HowItWorksSection />
        <CareerIntelligenceEngineSection />
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
