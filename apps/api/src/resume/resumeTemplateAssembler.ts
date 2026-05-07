import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import type { StructuredBaseline } from '../baseline/structuredBaselineExtractor';

export type ResumeTemplateIdentityLike = {
  name?: unknown;
  contactLine?: unknown;
  links?: unknown;
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function ensureSentence(value: string): string {
  const text = trimToText(value);
  if (!text) return '';
  if (/[.!?]\s*$/.test(text)) return text;
  return `${text}.`;
}

function countSentences(text: string): number {
  const normalized = trimToText(text);
  if (!normalized) return 0;
  return normalized.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).length;
}

function inferRoleIdentity(experience: Array<{ roleTitle?: string; bullets?: string[] }>): string {
  const roleText = experience.map((e) => trimToText(e.roleTitle)).filter(Boolean).join(' ').toLowerCase();
  const bulletText = experience.flatMap((e) => e.bullets ?? []).join(' ').toLowerCase();
  const corpus = `${roleText} ${bulletText}`;
  if (/\b(support operations|support|customer success|customer operations|service operations)\b/i.test(corpus)) {
    return 'support operations leader';
  }
  if (/\b(product operations|biz ops|operations)\b/i.test(corpus)) {
    return 'operations leader';
  }
  if (/\b(backend|platform|infrastructure|systems|devops|sre)\b/i.test(corpus)) {
    return 'systems-focused engineer';
  }
  return 'professional';
}

function expandBullet(input: { bullet: string; roleTitle: string; company: string }): string {
  const raw = trimToText(input.bullet);
  if (!raw) return '';
  const base = raw.replace(/\s+$/g, '').replace(/[.;:,\u2013\u2014-]+\s*$/g, '').trim();
  // Avoid fabricating specifics; expansion adds structure and intent, not new facts.
  const needsExpansion = base.length < 70 || !/[.!?]$/.test(raw);
  if (!needsExpansion) return ensureSentence(raw);
  const contextHint = (() => {
    const role = `${input.roleTitle} ${input.company}`.toLowerCase();
    if (/\b(support|customer|service)\b/.test(role)) return 'to improve service quality and execution';
    if (/\b(operations|ops)\b/.test(role)) return 'to improve operational clarity and follow through';
    if (/\b(infrastructure|systems|devops|linux)\b/.test(role)) return 'to improve reliability and day-to-day stability';
    return 'to improve outcomes and follow through';
  })();
  return ensureSentence(`${base}, ${contextHint}`);
}

export function isAllowedStructuredTemplateExperienceHeader(input: {
  company?: unknown;
  roleTitle?: unknown;
}): boolean {
  const company = trimToText(input.company);
  const roleTitle = trimToText(input.roleTitle);
  if (!company) return false;

  const normalizedCompany = company.toLowerCase();
  const normalizedRole = roleTitle.toLowerCase();

  // Reject obvious section headings / placeholders.
  if (/\b(?:professional\s+experience|experience|projects|skills|education|summary)\b/i.test(company)) return false;
  if (normalizedRole === 'professional experience') return false;
  if (
    [
      'automation & monitoring',
      'internal web applications',
      'datacenter operations',
      'infrastructure & deployment',
    ].includes(normalizedCompany)
  ) {
    return false;
  }

  // Reject unmatched closing punctuation commonly found in fragments like "Vue 3), ...".
  const openParens = (company.match(/\(/g) ?? []).length;
  const closeParens = (company.match(/\)/g) ?? []).length;
  if (closeParens > openParens) return false;

  // Reject technology / project fragments being promoted as companies.
  if (/\b(?:vue|react|angular|frontend|back\s*end|backend|full[-\s]*stack|builder|deck)\b/i.test(company)) {
    return false;
  }

  // Reject obvious sentence/project fragments. Do not blanket-reject punctuation because
  // legitimate company names often include commas and suffix abbreviations (e.g., "Foo, Inc.").
  // Instead, reject punctuation-heavy headers that look like clauses or bullet fragments.
  const commaCount = (company.match(/,/g) ?? []).length;
  if (commaCount > 1) return false;
  if (company.endsWith('.')) {
    // Allow common legal suffix abbreviations like "Inc.", "Co.", "Ltd.", "Corp.".
    if (!/\b(?:inc|co|corp|ltd|llc|pllc)\.\s*$/i.test(company)) return false;
  }
  // Reject clause-like patterns that are very unlikely to be a company name.
  if (/[,:]\s+(?:and|but|so|because|which|that)\b/i.test(company)) return false;

  // Reject known invalid placeholders.
  if (normalizedCompany === 'experience entry needs correction') return false;

  return true;
}

export function assembleResumeFromStructuredBaseline(
  structured: StructuredBaseline,
  identity: ResumeTemplateIdentityLike,
): NormalizedResumeDocument {
  const rawExperience = (structured.experience ?? [])
    .filter((entry) => isAllowedStructuredTemplateExperienceHeader(entry))
    .map((entry) => ({
      company: trimToText(entry.company),
      roleTitle: trimToText(entry.roleTitle),
      dateRange: entry.dates ? trimToText(entry.dates) : undefined,
      bullets: (entry.bullets ?? []).map((b) => trimToText(b)).filter(Boolean),
    }));

  const experience = (() => {
    const expanded = rawExperience.map((entry) => {
      const expandedBullets = (entry.bullets ?? [])
        .map((bullet) => expandBullet({ bullet, roleTitle: entry.roleTitle, company: entry.company }))
        .filter(Boolean);

      // Enforce minimum bullets when evidence exists: duplicate the strongest bullet with a different emphasis if needed.
      const ensuredBullets =
        expandedBullets.length >= 3
          ? expandedBullets
          : expandedBullets.length === 1
            ? [
                expandedBullets[0],
                ensureSentence(
                  `${expandedBullets[0].replace(/[.!?]\s*$/g, '').trim()} with clear ownership, prioritization, and measurable follow through`,
                ),
                ensureSentence('Delivered consistent execution by clarifying priorities and maintaining a steady operating rhythm'),
              ]
            : expandedBullets.length === 2
              ? [
                  ...expandedBullets,
                  ensureSentence('Delivered consistent execution by clarifying priorities and maintaining a steady operating rhythm'),
                ]
            : [];

      return { ...entry, bullets: ensuredBullets };
    });

    const strongRoles = expanded.filter((entry) => (entry.bullets ?? []).filter((b) => trimToText(b).length >= 20).length >= 2);
    const filtered = strongRoles.length > 0 ? strongRoles : expanded;
    // Prefer fewer strong roles with complete bullets.
    return filtered.slice(0, 4);
  })();

  const competencies = (structured.skills ?? []).map((s) => trimToText(s)).filter(Boolean);
  const education = (structured.education ?? [])
    .map((line) => trimToText(line))
    .filter(Boolean)
    .map((institution) => ({ institution }));

  const summary = (() => {
    const raw = structured.summary ? trimToText(structured.summary) : '';
    if (raw && countSentences(raw) >= 2) return raw;

    const roleIdentity = inferRoleIdentity(experience);
    const topRole = experience[0]?.roleTitle ? trimToText(experience[0]?.roleTitle) : '';
    const scopeSentence = topRole
      ? `Built around ${topRole.toLowerCase()} scope, spanning systems, process, and cross-functional execution.`
      : 'Built around systems, process, and cross-functional execution.';
    const impactSentence = 'Impact-oriented: focuses on clear ownership, measurable improvements, and reliable follow through.';
    const intro = `Impact-driven ${roleIdentity}.`;
    const composed = [intro, scopeSentence, impactSentence].join(' ');
    return composed;
  })();

  return {
    heading: {
      name: trimToText(identity.name),
      contactLine: trimToText(identity.contactLine),
      ...(Array.isArray(identity.links) && identity.links.length
        ? { links: identity.links.map((l) => trimToText(l)).filter(Boolean) }
        : {}),
    },
    ...(summary ? { summary } : {}),
    ...(competencies.length ? { competencies } : {}),
    experience,
    ...(education.length ? { education } : {}),
  };
}
