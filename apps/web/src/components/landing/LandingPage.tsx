import { DemoAnalysisPreviewSection } from "@/src/components/landing/DemoAnalysisPreviewSection";
import { HowItWorksSection } from "@/src/components/landing/HowItWorksSection";
import { LandingCompatibilityInputSection } from "@/src/components/landing/LandingCompatibilityInputSection";
import { LandingFooter } from "@/src/components/landing/LandingFooter";
import { LandingHero } from "@/src/components/landing/LandingHero";
import { LandingNav } from "@/src/components/landing/LandingNav";
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
        <LandingHero />
        <LandingCompatibilityInputSection />
        <HowItWorksSection />
        <DemoAnalysisPreviewSection />
        <TruthFirstSection />
      </main>
      <LandingFooter />
    </div>
  );
}
