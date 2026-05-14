import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import type { StructuredBaseline } from '../baseline/structuredBaselineExtractor';
import type { AuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';
import { NarrativeCompositionEngine } from '../composition/narrative-composition-engine';

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
  // Backwards-compatible helper: existing flows expect expanded bullets for StructuredBaseline-only path.
  // NarrativeCompositionEngine will perform the main rewrite pass for resume_v2 composition.
  const raw = trimToText(input.bullet);
  if (!raw) return '';
  return ensureSentence(raw);
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

function isWeakFragmentRole(entry: { company?: string; roleTitle?: string }): boolean {
  const company = trimToText(entry.company).toLowerCase();
  const roleTitle = trimToText(entry.roleTitle).toLowerCase();
  if (!company && !roleTitle) return true;
  // Weak fragment roles sometimes land in either company or roleTitle depending on upstream parsing.
  if (/\b(vue|react|deck builder|frontend)\b/i.test(`${company} ${roleTitle}`)) return true;
  if (company.includes('experience entry needs correction')) return true;
  if (/\bcontractor\b/i.test(roleTitle) && /\b(linux|infrastructure|sysadmin)\b/i.test(roleTitle)) return true;
  return false;
}

function ensureSummaryMinimum(summary: string, fallbackFromExperience: Array<{ roleTitle?: string; company?: string; bullets?: string[] }>): string {
  const raw = trimToText(summary);
  if (raw && countSentences(raw) >= 2) return raw;
  const roleIdentity = inferRoleIdentity(fallbackFromExperience as any);
  const topRole = fallbackFromExperience[0]?.roleTitle ? trimToText(fallbackFromExperience[0]?.roleTitle) : '';
  const scopeSentence = topRole
    ? `Built around ${topRole.toLowerCase()} scope, spanning systems, process, and cross-functional execution.`
    : 'Built around systems, process, and cross-functional execution.';
  const impactSentence = 'Impact-oriented: focuses on clear ownership, measurable improvements, and reliable follow through.';
  const intro = `Impact-driven ${roleIdentity}.`;
  return [intro, scopeSentence, impactSentence].join(' ');
}

export function buildAuthoritativeResumeDraftFromResumeV2(input: {
  resumeV2: NormalizedResumeDocument;
  identity: ResumeTemplateIdentityLike;
  renderPlan: AuthoritativeRenderPlan;
  professionalIdentity?: string | null;
  targetNarrative?: string | null;
}): NormalizedResumeDocument {
  const baselineExperience = Array.isArray((input.resumeV2 as any)?.experience) ? ((input.resumeV2 as any).experience as any[]) : [];
  const idToEntry = new Map<string, any>();
  baselineExperience.forEach((entry, index) => idToEntry.set(`resume_v2_exp_${index}`, entry));

  const suppressed = new Set((input.renderPlan?.suppressedRoleIds ?? []).map((id) => String(id ?? '')));
  const ranked = (input.renderPlan?.orderedRoleIds ?? []).map((id) => String(id ?? '')).filter(Boolean);
  const strictPlanMode = ranked.length > 0;

  const selected = (() => {
    if (strictPlanMode) {
      // Single render authority: when a positioning plan provides emphasizeRoleIds,
      // the preview must render ONLY those roles, in that exact order.
      const planned = ranked
        .map((id) => ({ id, entry: idToEntry.get(id) }))
        .filter((x) => x.entry)
        .filter((x) => !suppressed.has(x.id))
        .filter((x) => !suppressed.has(x.id));

      const weakInPlan = planned.filter((x) =>
        isWeakFragmentRole({ company: x.entry?.company, roleTitle: x.entry?.roleTitle }),
      );
      const hasNonWeak = planned.some((x) => !isWeakFragmentRole({ company: x.entry?.company, roleTitle: x.entry?.roleTitle }));
      if (hasNonWeak && weakInPlan.length > 0) {
        // Drop weak fragment roles entirely when any stronger emphasized roles exist.
        return planned.filter((x) => !isWeakFragmentRole({ company: x.entry?.company, roleTitle: x.entry?.roleTitle }));
      }
      return planned;
    }

    // Fallback: if no explicit role order is available, render a conservative subset of baseline roles
    // while still enforcing suppression/weak-fragment filtering.
    const fallback = baselineExperience.map((entry, index) => ({ id: `resume_v2_exp_${index}`, entry }));
    const allowed = fallback.filter((x) => x.entry).filter((x) => !suppressed.has(x.id));
    const weakFiltered = allowed.filter(
      (x) => !isWeakFragmentRole({ company: x.entry?.company, roleTitle: x.entry?.roleTitle }),
    );
    return (weakFiltered.length ? weakFiltered : allowed).slice(0, 4);
  })();

  const selectedExperience = selected.map((x) => {
    const company = trimToText(x.entry?.company);
    const roleTitle = trimToText(x.entry?.roleTitle);
    const dateRange = trimToText(x.entry?.dateRange) || trimToText(x.entry?.dates);
    const bulletsRaw = Array.isArray(x.entry?.bullets) ? (x.entry.bullets as unknown[]).map(trimToText).filter(Boolean) : [];

    return {
      company,
      roleTitle,
      ...(dateRange ? { dateRange } : {}),
      bullets: bulletsRaw,
    };
  });

  const finalExperience = selectedExperience;

  const positioningSummary = (() => {
    const pro = trimToText(input.professionalIdentity ?? '');
    const narrative = trimToText(input.targetNarrative ?? '');
    const thesis = trimToText(input.renderPlan?.summaryNarrative ?? '');
    if (thesis) return thesis;
    if (!pro && !narrative) return '';
    return `${pro ? `${pro}.` : ''} ${narrative}`.trim();
  })();

  const composition = new NarrativeCompositionEngine().composeResume({
    renderPlan: input.renderPlan ?? null,
    summaryFallback: positioningSummary || trimToText((input.resumeV2 as any)?.summary ?? ''),
    experience: (finalExperience as any).map((e: any) => ({
      company: trimToText(e.company),
      roleTitle: trimToText(e.roleTitle),
      ...(e.dateRange ? { dateRange: trimToText(e.dateRange) } : {}),
      bullets: Array.isArray(e.bullets)
        ? e.bullets
            .map(trimToText)
            .filter(Boolean)
            .map((text: string, idx: number) => ({
              text,
              id: `exp_${trimToText(e.company)}_${trimToText(e.roleTitle)}_${idx}`,
              sourceRoleKey: `${trimToText(e.company)}::${trimToText(e.roleTitle)}`,
            }))
        : [],
    })),
  });

  const summary = ensureSummaryMinimum(composition.summary, composition.experience as any);
  if (process.env.DOCGEN_DIAGNOSTICS === 'true') {
    try {
      const renderedRoleIds = selected.map((x) => x.id);
      const suppressed = new Set((input.renderPlan?.suppressedRoleIds ?? []).map((id) => String(id ?? '')));
      const leakedRoleIds = renderedRoleIds.filter((id) => suppressed.has(id));
      // eslint-disable-next-line no-console
      console.log('[DOCGEN][resume_render_authority]', {
        authoritativeRenderPlan: input.renderPlan,
        renderedRoleIds,
        leakedRoleIds,
        suppressedRoleLeakDetected: leakedRoleIds.length > 0,
        renderedSummarySource: input.renderPlan?.summaryNarrative ? 'authoritative_render_plan' : 'fallback',
        rewrittenBulletCount: composition.diagnostics.rewrittenBulletCount,
        narrativeQualityScore: composition.diagnostics.narrativeQualityScore,
        genericLanguageFlags: composition.diagnostics.genericLanguageFlags,
        evidenceToNarrativeMappings: composition.diagnostics.evidenceToNarrativeMappings,
      });
    } catch {
      // ignore
    }
  }

  return {
    heading: {
      name: trimToText(input.identity?.name ?? (input.resumeV2 as any)?.heading?.name),
      contactLine: trimToText(input.identity?.contactLine ?? (input.resumeV2 as any)?.heading?.contactLine),
      ...(Array.isArray((input.resumeV2 as any)?.heading?.links) && (input.resumeV2 as any).heading.links.length
        ? { links: (input.resumeV2 as any).heading.links.map((l: unknown) => trimToText(l)).filter(Boolean) }
        : {}),
    },
    summary,
    ...(Array.isArray((input.resumeV2 as any)?.competencies) ? { competencies: (input.resumeV2 as any).competencies } : {}),
    experience: composition.experience as any,
    ...(Array.isArray((input.resumeV2 as any)?.education) ? { education: (input.resumeV2 as any).education } : {}),
  };
}
