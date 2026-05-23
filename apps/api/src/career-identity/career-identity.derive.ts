import type { StructuredBaseline } from '../baseline/structuredBaselineExtractor';
import type { CareerDomain, CareerIdentitySnapshot, LeadershipDomain } from './career-identity.models';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseYearRange(text: string): { startYear: number | null; endYear: number | null } {
  const t = trimToText(text).toLowerCase();
  const years = (t.match(/\b(19|20)\d{2}\b/g) ?? []).map((y) => Number(y)).filter((y) => Number.isFinite(y));
  if (!years.length) return { startYear: null, endYear: null };
  const startYear = years[0] ?? null;
  const endYear = years.length > 1 ? years[years.length - 1] ?? null : /\b(present|current)\b/i.test(t) ? new Date().getFullYear() : startYear;
  return { startYear, endYear };
}

function durationYearsApprox(dates: string): number {
  const { startYear, endYear } = parseYearRange(dates);
  if (!startYear) return 0;
  const end = endYear ?? startYear;
  return clamp(end - startYear + 1, 0, 25);
}

function countRegexHits(text: string, patterns: RegExp[]): number {
  const t = trimToText(text).toLowerCase();
  if (!t) return 0;
  let hits = 0;
  for (const re of patterns) {
    if (re.test(t)) hits += 1;
  }
  return hits;
}

function leadershipScopeScore(roleTitle: string): number {
  const t = trimToText(roleTitle).toLowerCase();
  if (!t) return 0;
  if (/\b(vp|vice president|head of|director)\b/i.test(t)) return 6;
  if (/\b(manager|management)\b/i.test(t)) return 4;
  if (/\b(lead|principal|staff)\b/i.test(t)) return 2;
  return 0;
}

const DOMAIN_PATTERNS: Record<CareerDomain, { roleTitle: RegExp[]; evidence: RegExp[] }> = {
  customer_operations: {
    roleTitle: [/\bcustomer operations\b/i, /\bcustomer success operations\b/i, /\bcx operations\b/i],
    evidence: [/\bcustomer operations\b/i, /\bcustomer success\b/i, /\bcustomer experience\b/i, /\bcsat\b/i, /\bnps\b/i],
  },
  support_operations: {
    roleTitle: [/\bsupport operations\b/i, /\bservice operations\b/i, /\bsupport ops\b/i],
    evidence: [/\b(escalation|escalations|triage|queue|sla)\b/i, /\b(zendesk|servicenow|salesforce)\b/i, /\b(root cause|rca|incident)\b/i],
  },
  saas_operations: {
    roleTitle: [/\bsaas\b/i, /\bsubscription\b/i, /\brenewals?\b/i],
    evidence: [/\b(subscription|renewal|churn|retention)\b/i, /\b(entitlement)\b/i],
  },
  technical_support_leadership: {
    roleTitle: [/\b(technical support|support engineering)\b/i],
    evidence: [/\b(technical support|support engineering)\b/i, /\b(troubleshoot|debug|reproduction)\b/i],
  },
  general_operations: {
    roleTitle: [/\boperations\b/i, /\bprogram manager\b/i],
    evidence: [/\b(process|playbook|workflow|operating rhythm|governance)\b/i, /\b(cross[-\s]?functional|stakeholder)\b/i],
  },
  billing_operations: {
    roleTitle: [/\bbilling operations\b/i, /\bbilling analyst\b/i],
    evidence: [/\b(billing|invoice|invoicing)\b/i, /\b(dispute|credit|reconciliation)\b/i],
  },
  revenue_operations: {
    roleTitle: [/\brevops\b/i, /\brevenue operations\b/i],
    evidence: [/\b(revenue operations|revops|pipeline)\b/i, /\b(forecast|quota|crm)\b/i],
  },
  finance_operations: {
    roleTitle: [/\bfinance operations\b/i, /\baccounting operations\b/i],
    evidence: [/\b(accounts payable|accounts receivable|close)\b/i, /\b(gl|general ledger|sox)\b/i],
  },
  engineering: {
    roleTitle: [/\b(software engineer|engineer|developer|backend|frontend|full[- ]?stack)\b/i],
    evidence: [/\b(typescript|javascript|python|java|golang|c\\+\\+|c#)\b/i, /\b(api|microservices)\b/i],
  },
  infrastructure: {
    roleTitle: [/\b(devops|sre|sysadmin|systems administrator|infrastructure)\b/i],
    evidence: [/\b(terraform|kubernetes|aws|linux|docker)\b/i, /\b(ci\/cd|deployment)\b/i],
  },
  unknown: { roleTitle: [], evidence: [] },
};

function domainFromDominantOperational(d: CareerDomain): LeadershipDomain {
  switch (d) {
    case 'customer_operations':
      return 'customer_operations_leadership';
    case 'support_operations':
      return 'support_operations_leadership';
    case 'saas_operations':
      return 'saas_operations_leadership';
    case 'technical_support_leadership':
      return 'technical_support_leadership';
    case 'general_operations':
      return 'general_operations_leadership';
    default:
      return 'unknown';
  }
}

export function deriveCareerIdentityFromStructuredBaseline(structured: StructuredBaseline): CareerIdentitySnapshot {
  const roleTitleHits: Record<CareerDomain, number> = Object.create(null);
  const evidenceHits: Record<CareerDomain, number> = Object.create(null);
  const weightedScores: Record<CareerDomain, number> = Object.create(null);
  for (const domain of Object.keys(DOMAIN_PATTERNS) as CareerDomain[]) {
    roleTitleHits[domain] = 0;
    evidenceHits[domain] = 0;
    weightedScores[domain] = 0;
  }

  const experience = Array.isArray(structured?.experience) ? structured.experience : [];
  const total = experience.length || 1;

  let leadershipScore = 0;
  let recencyWeightedEvidenceCount = 0;

  for (let index = 0; index < experience.length; index++) {
    const entry = experience[index] as any;
    const company = trimToText(entry?.company);
    const roleTitle = trimToText(entry?.roleTitle);
    const dates = trimToText(entry?.dates);
    const bullets = Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]).map(trimToText).filter(Boolean) : [];
    const text = [company, roleTitle, dates, ...bullets].join(' ').trim();

    const recency = total > 1 ? index / (total - 1) : 1;
    const recencyWeight = 1 + 0.6 * recency;
    const durationWeight = 1 + 0.15 * clamp(durationYearsApprox(dates), 0, 10);

    const leadership = leadershipScopeScore(roleTitle);
    leadershipScore += leadership * recencyWeight;

    for (const domain of Object.keys(DOMAIN_PATTERNS) as CareerDomain[]) {
      if (domain === 'unknown') continue;
      const patterns = DOMAIN_PATTERNS[domain];
      const titleHits = countRegexHits(roleTitle, patterns.roleTitle);
      const evidence = countRegexHits(text, patterns.evidence);

      if (titleHits > 0) roleTitleHits[domain] += titleHits;
      if (evidence > 0) evidenceHits[domain] += evidence;

      const weight =
        titleHits * 8 * durationWeight * recencyWeight +
        evidence * 3 * durationWeight * recencyWeight +
        (leadership > 0 ? (domain.includes('operations') || domain === 'technical_support_leadership' ? leadership * 1.2 : 0) : 0);
      weightedScores[domain] += weight;
      if (evidence > 0) recencyWeightedEvidenceCount += recencyWeight;
    }
  }

  const opsDomains: CareerDomain[] = [
    'customer_operations',
    'support_operations',
    'saas_operations',
    'technical_support_leadership',
    'general_operations',
    'billing_operations',
    'revenue_operations',
    'finance_operations',
  ];

  const ranked = [...opsDomains]
    .map((d) => ({ d, score: Number(weightedScores[d] ?? 0) }))
    .sort((a, b) => b.score - a.score);

  const dominantOperationalDomain = ranked[0]?.score ? ranked[0]!.d : 'unknown';
  const secondScore = ranked[1]?.score ?? 0;
  const dominantScore = ranked[0]?.score ?? 0;

  const supportingDomains = ranked
    .filter((r) => r.score > 0)
    .filter((r) => r.d !== dominantOperationalDomain)
    .filter((r) => r.score >= Math.max(6, dominantScore * 0.25) || r.score >= secondScore)
    .map((r) => r.d)
    .slice(0, 4);

  const driftCandidates: CareerDomain[] = ['billing_operations', 'revenue_operations', 'finance_operations'];
  const prohibitedDriftDomains = driftCandidates.filter((d) => {
    if (d === dominantOperationalDomain) return false;
    const score = Number(weightedScores[d] ?? 0);
    const titleHits = Number(roleTitleHits[d] ?? 0);
    const evidence = Number(evidenceHits[d] ?? 0);
    const isolated = titleHits === 0 && evidence <= 1;
    const weakRelative = dominantScore > 0 ? score < dominantScore * 0.18 : score < 8;
    return isolated || weakRelative;
  });

  const dominantLeadershipDomain =
    leadershipScore >= 6 ? domainFromDominantOperational(dominantOperationalDomain) : 'unknown';

  return {
    version: 1,
    dominantOperationalDomain,
    dominantLeadershipDomain,
    supportingDomains,
    prohibitedDriftDomains,
    signals: {
      derivedFrom: 'baseline_structured',
      roleTitleHits,
      evidenceHits,
      weightedScores,
      leadershipScore: Math.round(leadershipScore * 10) / 10,
      recencyWeightedEvidenceCount: Math.round(recencyWeightedEvidenceCount * 10) / 10,
    },
  };
}
