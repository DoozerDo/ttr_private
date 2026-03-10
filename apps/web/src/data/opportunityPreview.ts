export type OpportunityEntry = {
  industry: string;
  score: number;
};

export const signals = [
  "Customer Operations Leadership",
  "Support Infrastructure",
  "Incident Management",
  "Escalation Strategy",
] as const;

export const opportunities: {
  strong: OpportunityEntry[];
  emerging: OpportunityEntry[];
  low: OpportunityEntry[];
} = {
  strong: [
    { industry: "Enterprise SaaS", score: 93 },
    { industry: "Fintech", score: 90 },
    { industry: "Cybersecurity Platforms", score: 86 },
  ],
  emerging: [
    { industry: "Healthcare Technology", score: 78 },
    { industry: "Logistics Platforms", score: 74 },
  ],
  low: [
    { industry: "Consumer Retail Platforms", score: 52 },
    { industry: "Travel Platforms", score: 49 },
  ],
};

export const radarScores: OpportunityEntry[] = [
  { industry: "Enterprise SaaS", score: 93 },
  { industry: "Fintech", score: 90 },
  { industry: "Cybersecurity", score: 86 },
  { industry: "Healthcare Tech", score: 78 },
  { industry: "Logistics Tech", score: 74 },
  { industry: "Travel Platforms", score: 49 },
  { industry: "Retail Platforms", score: 52 },
];
