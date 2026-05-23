export type CareerDomain =
  | 'customer_operations'
  | 'support_operations'
  | 'saas_operations'
  | 'technical_support_leadership'
  | 'general_operations'
  | 'billing_operations'
  | 'revenue_operations'
  | 'finance_operations'
  | 'engineering'
  | 'infrastructure'
  | 'unknown';

export type LeadershipDomain =
  | 'customer_operations_leadership'
  | 'support_operations_leadership'
  | 'saas_operations_leadership'
  | 'technical_support_leadership'
  | 'general_operations_leadership'
  | 'unknown';

export type CareerIdentitySnapshot = {
  version: 1;
  dominantOperationalDomain: CareerDomain;
  dominantLeadershipDomain: LeadershipDomain;
  supportingDomains: CareerDomain[];
  prohibitedDriftDomains: CareerDomain[];
  signals: {
    derivedFrom: 'baseline_structured';
    roleTitleHits: Record<CareerDomain, number>;
    evidenceHits: Record<CareerDomain, number>;
    weightedScores: Record<CareerDomain, number>;
    leadershipScore: number;
    recencyWeightedEvidenceCount: number;
  };
};

