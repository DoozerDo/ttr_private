import type { NormalizedResumeDocument } from '../documents/normalized-document.models';

export type PositioningRoleFamily =
  | 'support_operations'
  | 'customer_operations'
  | 'technical_support_leadership'
  | 'saas_operations'
  | 'engineering_heavy'
  | 'infrastructure_heavy'
  | 'general_operations'
  | 'unknown';

export type PositioningSeniorityLevel = 'ic' | 'lead' | 'manager' | 'director';

export type PositioningSummaryStrategy = 'leadership_first' | 'operations_first' | 'technical_first' | 'customer_first';

export type PositioningLanguageTone = 'recruiter_friendly' | 'technical' | 'executive';

export type PositioningPlan = {
  targetRoleFamily: PositioningRoleFamily;
  positioningThesis: string;
  seniorityLevel: PositioningSeniorityLevel;
  topEvidenceThemes: string[];
  emphasizeRoleIds: string[];
  suppressRoleIds: string[];
  candidateStrengths: string[];
  candidateRisks: string[];
  summaryStrategy: PositioningSummaryStrategy;
  resumeStrategy: string;
  coverLetterStrategy: {
    openingAngle: string;
    evidenceAlignment: string[];
    riskMitigation: string[];
  };
  languageTone: PositioningLanguageTone;
};

function trimToText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : String(value ?? '').replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return trimToText(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function isWeakFragmentRole(company: string, roleTitle: string): boolean {
  const c = company.toLowerCase();
  const r = roleTitle.toLowerCase();
  if (/\b(vue|react|deck builder|frontend)\b/i.test(`${c} ${r}`)) return true;
  if (c.includes('experience entry needs correction')) return true;
  if (/\b(contractor|freelance|consultant)\b/i.test(r) && /\b(linux|infrastructure|sysadmin)\b/i.test(r)) return true;
  return false;
}

function inferSeniorityFromExperience(experience: any[]): PositioningSeniorityLevel {
  const titles = experience.map((e) => `${trimToText(e?.roleTitle)} ${trimToText(e?.company)}`.toLowerCase());
  if (titles.some((t) => /\b(vp|vice president|head of|director)\b/i.test(t))) return 'director';
  if (titles.some((t) => /\b(manager|management)\b/i.test(t))) return 'manager';
  if (titles.some((t) => /\b(lead|principal|staff)\b/i.test(t))) return 'lead';
  return 'ic';
}

function detectRoleFamily(jobText: string): PositioningRoleFamily {
  const t = jobText.toLowerCase();
  if (/\b(technical support|support engineering|support leader|support manager|director of support)\b/i.test(t)) return 'technical_support_leadership';
  if (/\b(support operations|service operations|cx operations|customer experience operations)\b/i.test(t)) return 'support_operations';
  if (/\b(customer operations|customer success operations|customer operations manager)\b/i.test(t)) return 'customer_operations';
  if (/\b(saas|subscription|renewal|churn)\b/i.test(t)) return 'saas_operations';
  if (/\b(infrastructure|sysadmin|linux|kubernetes|terraform|aws|sre|devops)\b/i.test(t)) return 'infrastructure_heavy';
  if (/\b(software engineer|backend|frontend|full[- ]?stack|engineering)\b/i.test(t)) return 'engineering_heavy';
  if (/\b(operations|program manager|operational|process)\b/i.test(t)) return 'general_operations';
  return 'unknown';
}

function inferThemes(input: { jobText: string; experienceText: string }): string[] {
  const text = `${input.jobText} ${input.experienceText}`.toLowerCase();
  const candidates: Array<[string, RegExp]> = [
    ['escalation management', /\b(escalation|escalations|triage|queue|sla)\b/i],
    ['incident response', /\b(incident|on[-\s]?call|rca|root cause)\b/i],
    ['operational process improvement', /\b(process|playbook|workflow|operating review|operating rhythm|governance)\b/i],
    ['cross-functional leadership', /\b(cross[-\s]?functional|stakeholder|partnered|collaborated)\b/i],
    ['systems reliability', /\b(reliability|uptime|latency|availability)\b/i],
    ['reporting & dashboards', /\b(dashboard|reporting|metrics|kpi)\b/i],
    ['customer experience', /\b(customer experience|cx|csat)\b/i],
    ['infrastructure & deployment', /\b(terraform|kubernetes|docker|aws|linux|deployment)\b/i],
  ];
  const hits = candidates.filter(([, re]) => re.test(text)).map(([theme]) => theme);
  return hits.slice(0, 5);
}

function buildThesis(family: PositioningRoleFamily, seniority: PositioningSeniorityLevel, themes: string[]): string {
  const themeClause = themes.length ? `focused on ${themes.slice(0, 3).join(', ')}.` : 'focused on measurable outcomes.';
  const seniorityLabel =
    seniority === 'director'
      ? 'senior'
      : seniority === 'manager'
        ? 'experienced'
        : seniority === 'lead'
          ? 'experienced'
          : 'hands-on';
  switch (family) {
    case 'support_operations':
    case 'customer_operations':
      return `${seniorityLabel} customer/support operations leader ${themeClause}`.replace(/\s+/g, ' ').trim();
    case 'technical_support_leadership':
      return `${seniorityLabel} technical support leader ${themeClause}`.replace(/\s+/g, ' ').trim();
    case 'infrastructure_heavy':
      return `${seniorityLabel} infrastructure-focused operator ${themeClause}`.replace(/\s+/g, ' ').trim();
    case 'engineering_heavy':
      return `${seniorityLabel} engineering operator ${themeClause}`.replace(/\s+/g, ' ').trim();
    case 'general_operations':
      return `${seniorityLabel} operations leader ${themeClause}`.replace(/\s+/g, ' ').trim();
    default:
      return `${seniorityLabel} professional ${themeClause}`.replace(/\s+/g, ' ').trim();
  }
}

export class PositioningPlanService {
  buildPlan(input: {
    job: { title: string | null; company: string | null; description: string | null };
    resumeV2: NormalizedResumeDocument;
  }): PositioningPlan {
    const jobText = [input.job.title ?? '', input.job.company ?? '', input.job.description ?? ''].join(' ').trim();
    const roleFamily = detectRoleFamily(jobText);

    const experience = Array.isArray((input.resumeV2 as any)?.experience) ? ((input.resumeV2 as any).experience as any[]) : [];
    const experienceText = experience
      .map((e) => [trimToText(e?.company), trimToText(e?.roleTitle), trimToText(e?.dateRange || e?.dates), ...(Array.isArray(e?.bullets) ? e.bullets.map(trimToText) : [])].join(' '))
      .join(' ')
      .trim();

    const themes = inferThemes({ jobText, experienceText });
    const seniority = inferSeniorityFromExperience(experience);

    const tokens = new Set(tokenize(jobText));
    const scoreRole = (entry: any) => {
      const company = trimToText(entry?.company);
      const roleTitle = trimToText(entry?.roleTitle);
      const bullets = Array.isArray(entry?.bullets) ? entry.bullets.map(trimToText).filter(Boolean) : [];
      const headerText = `${company} ${roleTitle}`.toLowerCase();
      const text = `${company} ${roleTitle} ${bullets.join(' ')}`.toLowerCase();
      const overlap = tokenize(text).filter((t) => tokens.has(t)).length;
      const bulletPenalty = bullets.length < 2 ? 3 : 0;
      const fragmentPenalty = isWeakFragmentRole(company, roleTitle) ? 100 : 0;
      const infraBias = roleFamily === 'infrastructure_heavy' ? (/\b(terraform|kubernetes|aws|linux|infra|deployment)\b/i.test(text) ? 6 : 0) : 0;
      const opsBias =
        roleFamily === 'support_operations' || roleFamily === 'customer_operations' || roleFamily === 'technical_support_leadership'
          ? (/\b(escalation|triage|incident|sla|playbook|process|stakeholder|cross[-\s]?functional)\b/i.test(text) ? 6 : 0)
          : 0;
      const seniorityBoost = /\b(director|head of|manager|lead)\b/i.test(headerText) ? 2 : 0;
      return overlap + infraBias + opsBias + seniorityBoost - bulletPenalty - fragmentPenalty;
    };

    const scored = experience.map((entry, index) => ({ id: `resume_v2_exp_${index}`, entry, score: scoreRole(entry) }));
    const allSameCompany =
      scored.length > 1 &&
      scored.every(
        (s) =>
          trimToText(s.entry?.company).toLowerCase() === trimToText(scored[0]?.entry?.company).toLowerCase(),
      );
    const sorted = [...scored].sort((a, b) => {
      if (allSameCompany) return a.id.localeCompare(b.id);
      return b.score - a.score;
    });
    const emphasize = sorted.filter((s) => s.score > -50).slice(0, 4).map((s) => s.id);
    const suppress = scored
      .filter((s) => {
        const company = trimToText(s.entry?.company);
        const roleTitle = trimToText(s.entry?.roleTitle);
        return isWeakFragmentRole(company, roleTitle);
      })
      .map((s) => s.id);

    const thesis = buildThesis(roleFamily, seniority, themes);

    const strengths = themes.length ? themes.map((t) => `Demonstrated ${t}.`).slice(0, 4) : ['Demonstrated reliable execution.'];
    const risks: string[] = [];
    if (scored.some((s) => isWeakFragmentRole(trimToText(s.entry?.company), trimToText(s.entry?.roleTitle)))) {
      risks.push('Some baseline experience entries look like weak fragments; suppress them unless role-relevant.');
    }
    if (experience.every((e) => (Array.isArray((e as any)?.bullets) ? (e as any).bullets.length : 0) < 2)) {
      risks.push('Many roles have thin evidence; avoid overstating scope and keep claims tightly grounded.');
    }

    const summaryStrategy: PositioningSummaryStrategy =
      roleFamily === 'infrastructure_heavy'
        ? 'technical_first'
        : roleFamily === 'engineering_heavy'
          ? 'technical_first'
          : roleFamily === 'support_operations'
            ? 'operations_first'
            : roleFamily === 'customer_operations'
              ? 'customer_first'
              : 'leadership_first';

    const tone: PositioningLanguageTone =
      seniority === 'director' ? 'executive' : roleFamily === 'engineering_heavy' || roleFamily === 'infrastructure_heavy' ? 'technical' : 'recruiter_friendly';

    return {
      targetRoleFamily: roleFamily,
      positioningThesis: thesis,
      seniorityLevel: seniority,
      topEvidenceThemes: themes,
      emphasizeRoleIds: emphasize,
      suppressRoleIds: suppress,
      candidateStrengths: strengths,
      candidateRisks: risks,
      summaryStrategy,
      resumeStrategy: `Emphasize ${themes.slice(0, 3).join(', ') || 'core outcomes'}; lead with strongest roles and keep bullets impact-oriented without inventing scope.`,
      coverLetterStrategy: {
        openingAngle: thesis,
        evidenceAlignment: themes.slice(0, 3),
        riskMitigation: risks.slice(0, 3),
      },
      languageTone: tone,
    };
  }
}
