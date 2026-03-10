export type OpportunityEntry = {
  industry: string;
  score: number;
};

export type RadarOpportunityEntry = OpportunityEntry & {
  signals: string[];
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

export const radarScores: RadarOpportunityEntry[] = [
  {
    industry: "Enterprise SaaS",
    score: 93,
    signals: [
      "Customer operations leadership",
      "Operational process rigor",
      "Escalation management",
    ],
  },
  {
    industry: "Fintech",
    score: 90,
    signals: [
      "Incident management discipline",
      "Regulated support cadence",
      "Cross team escalation workflow",
    ],
  },
  {
    industry: "Cybersecurity",
    score: 86,
    signals: [
      "Critical issue ownership",
      "High urgency support patterns",
      "Operational resilience mindset",
    ],
  },
  {
    industry: "Healthcare Tech",
    score: 78,
    signals: [
      "Process governance",
      "Cross functional coordination",
      "Customer lifecycle oversight",
    ],
  },
  {
    industry: "Logistics Tech",
    score: 74,
    signals: [
      "Operational throughput focus",
      "Service queue management",
      "Complex support orchestration",
    ],
  },
  {
    industry: "Travel Platforms",
    score: 49,
    signals: [
      "Consumer demand variance",
      "Seasonal support constraints",
      "Domain context gap",
    ],
  },
  {
    industry: "Retail Platforms",
    score: 52,
    signals: [
      "Consumer journey mismatch",
      "Platform commerce depth gap",
      "Pricing and merchandising context",
    ],
  },
];
