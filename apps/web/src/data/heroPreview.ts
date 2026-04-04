export type HeroTier = "ELITE FIT" | "STRONG FIT" | "COMPETITIVE" | "EMERGING FIT" | "MISALIGNED";

export type HeroOpportunity = {
  industry: string;
  score: number;
};

export type HeroScenario = {
  id: "high" | "mid" | "low";
  jobTitle: string;
  score: number;
  tier: HeroTier;
  strengths: string[];
  gaps: string[];
  opportunities?: HeroOpportunity[];
};

const scenarioCatalog: HeroScenario[] = [
  {
    id: "high",
    jobTitle: "Director of Customer Support",
    score: 92,
    tier: "STRONG FIT",
    strengths: [
      "Experience alignment in multi-site support operations",
      "Leadership level matches team ownership requirements",
      "Tooling fit across CRM and help desk systems",
    ],
    gaps: ["Limited payments workflow ownership", "Less direct fintech context"],
  },
  {
    id: "mid",
    jobTitle: "VP Customer Experience",
    score: 78,
    tier: "COMPETITIVE",
    strengths: [
      "Strong customer journey ownership",
      "Leadership coverage for support and onboarding",
      "Operational rigor in cross-functional programs",
    ],
    gaps: ["Enterprise account depth", "Regulated environment exposure"],
  },
  {
    id: "low",
    jobTitle: "Head of Customer Operations",
    score: 64,
    tier: "EMERGING FIT",
    strengths: [
      "Operational process ownership",
      "Escalation and incident triage discipline",
      "Customer-facing leadership foundation",
    ],
    gaps: ["Platform depth for the target stack", "Domain context for the current role"],
    opportunities: [
      { industry: "Enterprise SaaS", score: 91 },
      { industry: "Cybersecurity Platforms", score: 87 },
      { industry: "B2B Services", score: 84 },
    ],
  },
];

export const defaultHeroJobDescription =
  "Director of Customer Support. Own global support operations, improve SLA performance, and lead tooling strategy across Zendesk, Salesforce, and analytics workflows.";

export function getHeroScenarioForComparison(input: {
  jobDescription: string;
  hasResume: boolean;
  scoreOverride?: number | null;
}): HeroScenario {
  const scenario = (() => {
    const normalized = input.jobDescription.trim().toLowerCase();
    if (!normalized) return scenarioCatalog[1];
    if (!input.hasResume) return scenarioCatalog[2];

    if (normalized.includes("director")) return scenarioCatalog[0];
    if (normalized.includes("vp")) return scenarioCatalog[1];
    if (normalized.includes("head")) return scenarioCatalog[2];
    if (normalized.includes("zendesk") || normalized.includes("salesforce")) return scenarioCatalog[0];
    if (normalized.includes("journey") || normalized.includes("experience")) return scenarioCatalog[1];
    if (normalized.includes("operations") || normalized.includes("incident")) return scenarioCatalog[2];
    return scenarioCatalog[1];
  })();

  const score =
    typeof input.scoreOverride === "number" && Number.isFinite(input.scoreOverride)
      ? Math.max(25, Math.min(92, Math.round(input.scoreOverride)))
      : scenario.score;

  const tier: HeroTier =
    score >= 90
      ? "ELITE FIT"
      : score >= 85
        ? "STRONG FIT"
        : score >= 70
          ? "COMPETITIVE"
          : score >= 55
            ? "EMERGING FIT"
            : "MISALIGNED";

  return {
    ...scenario,
    score,
    tier,
  };
}
