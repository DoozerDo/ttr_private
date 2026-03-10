export type HeroTier = "ELITE FIT" | "STRONG FIT" | "COMPETITIVE" | "EMERGING FIT" | "MISALIGNED";

export type HeroOpportunity = {
  industry: string;
  score: number;
};

export type HeroScenario = {
  id: "high" | "mid" | "low";
  role: string;
  score: number;
  tier: HeroTier;
  strengths: string[];
  gaps: string[];
  opportunities?: HeroOpportunity[];
};

const scenarioCatalog: HeroScenario[] = [
  {
    id: "high",
    role: "Director of Customer Support",
    score: 92,
    tier: "STRONG FIT",
    strengths: [
      "Customer operations leadership",
      "Support infrastructure experience",
      "Escalation management",
    ],
    gaps: ["Payments platform exposure", "Industry context"],
  },
  {
    id: "mid",
    role: "VP Customer Experience",
    score: 78,
    tier: "COMPETITIVE",
    strengths: [
      "Customer journey ownership",
      "Multi channel support orchestration",
      "Operational process leadership",
    ],
    gaps: ["Enterprise buyer depth", "Regulated sector context"],
  },
  {
    id: "low",
    role: "Head of Customer Operations",
    score: 64,
    tier: "EMERGING FIT",
    strengths: [
      "Operational process ownership",
      "Team coordination discipline",
      "Escalation triage",
    ],
    gaps: ["Deep platform domain specialization", "Industry adjacent leadership history"],
    opportunities: [
      { industry: "Enterprise SaaS", score: 91 },
      { industry: "Cybersecurity Platforms", score: 87 },
      { industry: "B2B Services", score: 84 },
    ],
  },
];

export const defaultHeroRole = "Director of Customer Support";

export function getHeroScenarioForRole(rawRole: string): HeroScenario {
  const normalized = rawRole.trim().toLowerCase();
  if (!normalized) return scenarioCatalog[0];

  if (normalized.includes("head")) return scenarioCatalog[2];
  if (normalized.includes("vp")) return scenarioCatalog[1];
  if (normalized.includes("director")) return scenarioCatalog[0];
  if (normalized.includes("support")) return scenarioCatalog[0];
  if (normalized.includes("operations")) return scenarioCatalog[2];
  if (normalized.includes("experience")) return scenarioCatalog[1];
  return scenarioCatalog[1];
}
