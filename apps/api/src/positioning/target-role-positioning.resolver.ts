import type { NormalizedResumeDocument } from '../documents/normalized-document.models';

export type TargetRolePositioningInput = {
  job: { title: string | null; company: string | null; description: string | null };
  resumeV2: NormalizedResumeDocument;
};

export type TargetRolePositioningOutput = {
  professionalIdentity: string;
  targetNarrative: string;
  prioritizedExperienceIds: string[];
  suppressedExperienceIds: string[];
  evidenceThemes: string[];
  summaryDirection: string;
  coverLetterDirection: string;
  suppressionReasons: Record<string, string[]>;
};

function trimToText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : String(value ?? '').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function scoreSupportOpsAffinity(text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  const hits: Array<[RegExp, number]> = [
    [/\b(support operations|customer operations|cx operations|service operations)\b/i, 10],
    [/\b(support|customer success|customer experience|cx)\b/i, 5],
    [/\b(incident|escalation|root cause|rca|sla|queue|zendesk|triage|on[-\s]?call)\b/i, 4],
    [/\b(process|operating rhythm|operating review|workflow|playbook|governance)\b/i, 3],
    [/\b(cross[-\s]?functional|stakeholder|partnered|collaborated)\b/i, 2],
  ];
  for (const [re, weight] of hits) {
    if (re.test(t)) score += weight;
  }
  return score;
}

function scoreTechnicalFragmentPenalty(text: string): number {
  const t = text.toLowerCase();
  let penalty = 0;
  if (/\b(vue|react|frontend|deck builder)\b/i.test(t)) penalty += 8;
  if (/\b(linux|kubernetes|docker|terraform|aws)\b/i.test(t)) penalty += 2;
  if (/\b(contractor|freelance|consultant)\b/i.test(t)) penalty += 4;
  return penalty;
}

function isSupportOpsTarget(jobText: string): boolean {
  return /\b(support operations|customer operations|customer success|customer experience|cx|service operations|support manager|director of support)\b/i.test(
    jobText,
  );
}

export class TargetRolePositioningResolver {
  resolve(input: TargetRolePositioningInput): TargetRolePositioningOutput {
    const jobText = [input.job.title ?? '', input.job.company ?? '', input.job.description ?? ''].join(' ').trim();
    const supportOpsTarget = isSupportOpsTarget(jobText);
    const jobTokens = new Set(tokenize(jobText));

    const suppressionReasons: Record<string, string[]> = {};
    const scored = (Array.isArray(input.resumeV2.experience) ? input.resumeV2.experience : []).map((entry, index) => {
      const company = trimToText((entry as any)?.company);
      const roleTitle = trimToText((entry as any)?.roleTitle);
      const dateRange = trimToText((entry as any)?.dateRange);
      const bullets = Array.isArray((entry as any)?.bullets) ? ((entry as any).bullets as unknown[]).map(trimToText).filter(Boolean) : [];
      const text = [company, roleTitle, dateRange, ...bullets].join(' ');
      const tokenOverlap = tokenize(text).filter((t) => jobTokens.has(t)).length;
      const supportAffinity = scoreSupportOpsAffinity(text);
      const penalty = scoreTechnicalFragmentPenalty(`${company} ${roleTitle}`);
      const weakBulletsPenalty = bullets.length === 0 ? 6 : bullets.length === 1 ? 2 : 0;
      const base = tokenOverlap + (supportOpsTarget ? supportAffinity : 0) - penalty - weakBulletsPenalty;

      const id = `resume_v2_exp_${index}`;
      const reasons: string[] = [];
      if (supportOpsTarget && penalty >= 8) reasons.push('technical_fragment_deprioritized_for_support_ops');
      if (supportOpsTarget && /\b(linux|infrastructure|sysadmin)\b/i.test(`${company} ${roleTitle}`) && /\b(contractor|consultant|freelance)\b/i.test(`${roleTitle}`)) {
        reasons.push('contractor_infra_deprioritized_for_support_ops');
      }
      if (weakBulletsPenalty > 0) reasons.push('weak_or_missing_bullets');
      if (reasons.length) suppressionReasons[id] = reasons;

      return { id, index, base, tokenOverlap, supportAffinity, penalty, weakBulletsPenalty, company, roleTitle };
    });

    const prioritized = [...scored].sort((a, b) => b.base - a.base).map((s) => s.id);
    const suppressed = scored
      .filter((s) => (suppressionReasons[s.id]?.length ?? 0) > 0 && s.base < 3)
      .map((s) => s.id);

    const professionalIdentity = supportOpsTarget
      ? 'Support Operations / Customer Operations leader'
      : 'Professional';
    const targetNarrative = supportOpsTarget
      ? 'Operational leadership focused on scalable support systems, cross-functional execution, and escalation/root-cause rhythms.'
      : 'Target-aligned professional narrative.';
    const evidenceThemes = supportOpsTarget
      ? ['support operations', 'customer operations', 'cross-functional execution', 'escalation systems', 'process improvement']
      : [];
    const summaryDirection = supportOpsTarget
      ? 'Lead with support/customer operations identity, cross-functional systems/process scope, and impact orientation.'
      : 'Lead with role identity, scope, and impact.';
    const coverLetterDirection = supportOpsTarget
      ? 'Open with support/customer operations positioning; use 2+ concrete operational proof points; keep tone recruiter-friendly.'
      : 'Open with role positioning and 2+ proof points.';

    return {
      professionalIdentity,
      targetNarrative,
      prioritizedExperienceIds: prioritized,
      suppressedExperienceIds: suppressed,
      evidenceThemes,
      summaryDirection,
      coverLetterDirection,
      suppressionReasons,
    };
  }
}

