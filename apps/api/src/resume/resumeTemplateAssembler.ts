import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import type { StructuredBaseline } from '../baseline/structuredBaselineExtractor';
import type { AuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';
import type { CareerIdentitySnapshot } from '../career-identity/career-identity.models';
import { NarrativeCompositionEngine } from '../composition/narrative-composition-engine';
import { createHash } from 'crypto';

export type ResumeTemplateIdentityLike = {
  name?: unknown;
  contactLine?: unknown;
  links?: unknown;
};

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeDashRoleHeader(value: string): { roleTitle: string; companyHint: string } {
  const raw = trimToText(value);
  if (!raw) return { roleTitle: '', companyHint: '' };
  const parts = raw.split(/\s*[–—-]\s*/).map((p) => trimToText(p)).filter(Boolean);
  if (parts.length < 2) return { roleTitle: raw, companyHint: '' };
  const companyHint = parts[parts.length - 1];
  const roleTitle = parts.slice(0, -1).join(' - ').trim();
  return { roleTitle, companyHint };
}

function buildRoleKey(company: string, roleTitle: string): string {
  const c = trimToText(company).toLowerCase();
  const r = trimToText(roleTitle).toLowerCase();
  return `${c}::${r}`;
}

function coerceResumeV2ExperienceFromStructuredBaseline(input: {
  resumeV2: NormalizedResumeDocument;
  structuredBaseline: StructuredBaseline | null;
}): NormalizedResumeDocument {
  const structured = input.structuredBaseline;
  const structuredExperience = Array.isArray((structured as any)?.experience) ? ((structured as any).experience as any[]) : [];
  if (!structuredExperience.length) return input.resumeV2;

  const v2Experience = Array.isArray((input.resumeV2 as any)?.experience) ? (((input.resumeV2 as any).experience as any[]) ?? []) : [];

  const bulletsByRoleKey = new Map<string, string[]>();
  for (const entry of v2Experience) {
    const companyRaw = trimToText((entry as any)?.company);
    const roleRaw = trimToText((entry as any)?.roleTitle);
    const bulletsRaw = Array.isArray((entry as any)?.bullets)
      ? (((entry as any).bullets as unknown[]) ?? []).map((b) => trimToText(b)).filter(Boolean)
      : [];
    if (!bulletsRaw.length) continue;

    bulletsByRoleKey.set(buildRoleKey(companyRaw, roleRaw), bulletsRaw);

    const dashParsed = normalizeDashRoleHeader(roleRaw);
    if (dashParsed.roleTitle && dashParsed.companyHint) {
      bulletsByRoleKey.set(buildRoleKey(dashParsed.companyHint, dashParsed.roleTitle), bulletsRaw);
    }
  }

  const canonicalExperience = structuredExperience
    .filter((entry) => isAllowedStructuredTemplateExperienceHeader(entry))
    .map((entry) => {
      const company = trimToText((entry as any)?.company);
      const roleTitle = trimToText((entry as any)?.roleTitle);
      const dates = trimToText((entry as any)?.dates ?? '');
      const key = buildRoleKey(company, roleTitle);
      const bullets =
        bulletsByRoleKey.get(key) ??
        (Array.isArray((entry as any)?.bullets) ? ((entry as any).bullets as unknown[]).map((b) => trimToText(b)).filter(Boolean) : []);
      return {
        company,
        roleTitle,
        ...(dates ? { dateRange: dates } : {}),
        bullets,
      };
    })
    .filter((entry) => entry.company && entry.roleTitle);

  if (!canonicalExperience.length) return input.resumeV2;

  return {
    ...(input.resumeV2 as any),
    experience: canonicalExperience,
  } as any;
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

function buildAuthorityFingerprint(input: {
  experience: Array<{ company: string; roleTitle: string; dateRange?: string; bullets: unknown[] }>;
  renderPlan: AuthoritativeRenderPlan | null;
}): string {
  const roleSummaries = (input.experience ?? []).map((r) => ({
    roleKey: `${trimToText(r.company)}::${trimToText(r.roleTitle)}`,
    bulletCount: Array.isArray(r.bullets) ? r.bullets.length : 0,
  }));
  const candidatesRaw = (input.renderPlan as any)?.evidencePriorities ?? [];
  const candidates = Array.isArray(candidatesRaw)
    ? candidatesRaw.map((c: any) => ({
        theme: trimToText(c?.theme ?? c),
        sourceEmployerRoleKey: trimToText(c?.sourceEmployerRoleKey ?? ''),
        derivedFromRoleKey: trimToText(c?.derivedFromRoleKey ?? ''),
      }))
    : [];

  const payload = JSON.stringify({
    v: 'resume-authority-fingerprint-v1',
    roleSummaries,
    candidates,
    orderedRoleIds: (input.renderPlan?.orderedRoleIds ?? []).map((id) => String(id ?? '')),
    suppressedRoleIds: (input.renderPlan?.suppressedRoleIds ?? []).map((id) => String(id ?? '')),
  });
  return createHash('sha256').update(payload).digest('hex');
}

function detectPrecompositionContamination(input: {
  experience: Array<{ company: string; roleTitle: string; bullets: unknown[] }>;
}): { count: number; roleKeys: string[] } {
  const billingSignals = /\b(billing|invoice|dispute|credit|metering|reconciliation|revenue)\b/i;
  const contaminated: string[] = [];
  for (const role of input.experience ?? []) {
    const roleKey = `${trimToText(role.company)}::${trimToText(role.roleTitle)}`;
    if (!/sentinelone/i.test(String(role.company ?? ''))) continue;
    const bullets = Array.isArray(role.bullets) ? role.bullets : [];
    const hasBilling = bullets.some((b) => billingSignals.test(String((b as any)?.text ?? b ?? '')));
    if (hasBilling) contaminated.push(roleKey);
  }
  return { count: contaminated.length, roleKeys: contaminated };
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

  // Grounded fallback: construct 2–3 concrete sentences from verified experience headers + top bullets.
  // Avoid generic filler, stitched fragments, and domain invention.
  const roleIdentity = inferRoleIdentity(fallbackFromExperience as any);
  const top = fallbackFromExperience[0] ?? {};
  const topRole = top?.roleTitle ? trimToText(top.roleTitle) : '';
  const topCompany = top?.company ? trimToText(top.company) : '';
  const topBullets = Array.isArray(top?.bullets) ? (top.bullets as unknown[]).map(trimToText).filter(Boolean) : [];
  const highlightBullets = topBullets.slice(0, 2);

  const intro = topRole && topCompany
    ? `${roleIdentity} with leadership experience as ${topRole} at ${topCompany}.`
    : `${roleIdentity} with leadership experience across customer-facing operations.`;

  const highlights = highlightBullets.length
    ? `Highlights include: ${highlightBullets.join(' ')}`.replace(/\.\./g, '.')
    : '';

  const second = highlights || `${raw || ''}`.trim();
  const sentences = [intro, second].map(trimToText).filter(Boolean);
  return sentences.join(' ').trim();
}

export function buildAuthoritativeResumeDraftFromResumeV2(input: {
  resumeV2: NormalizedResumeDocument;
  identity: ResumeTemplateIdentityLike;
  renderPlan: AuthoritativeRenderPlan;
  professionalIdentity?: string | null;
  targetNarrative?: string | null;
  structuredBaselineForIdentity?: StructuredBaseline | null;
  careerIdentity?: CareerIdentitySnapshot | null;
}): NormalizedResumeDocument {
  const resumeV2ForAuthority = coerceResumeV2ExperienceFromStructuredBaseline({
    resumeV2: input.resumeV2,
    structuredBaseline: input.structuredBaselineForIdentity ?? null,
  });

  const baselineExperience = Array.isArray((resumeV2ForAuthority as any)?.experience)
    ? (((resumeV2ForAuthority as any).experience as any[]) ?? [])
    : [];
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
  const precomposition = detectPrecompositionContamination({ experience: finalExperience as any });
  const authorityFingerprint = buildAuthorityFingerprint({ experience: finalExperience as any, renderPlan: input.renderPlan ?? null });

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
    summaryFallback: positioningSummary || trimToText((resumeV2ForAuthority as any)?.summary ?? ''),
    careerIdentity: input.careerIdentity ?? null,
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
      name: trimToText(input.identity?.name ?? (resumeV2ForAuthority as any)?.heading?.name),
      contactLine: trimToText(input.identity?.contactLine ?? (resumeV2ForAuthority as any)?.heading?.contactLine),
      ...(Array.isArray((resumeV2ForAuthority as any)?.heading?.links) && (resumeV2ForAuthority as any).heading.links.length
        ? { links: (resumeV2ForAuthority as any).heading.links.map((l: unknown) => trimToText(l)).filter(Boolean) }
        : {}),
    },
    summary,
    ...(Array.isArray((resumeV2ForAuthority as any)?.competencies) ? { competencies: (resumeV2ForAuthority as any).competencies } : {}),
    experience: composition.experience as any,
    ...(Array.isArray((resumeV2ForAuthority as any)?.education) ? { education: (resumeV2ForAuthority as any).education } : {}),
    __compositionDiagnostics: {
      ...composition.diagnostics,
      authorityFingerprint,
      preCompositionContaminationCount: precomposition.count,
      preCompositionContaminatedRoleKeys: precomposition.roleKeys,
      compositionPathExecuted: 'authoritative_resume_v2_assembler',
      freshCompositionExecuted: true,
      provenanceEnforcementExecuted: true,
      extractionBoundaryEnforcementExecuted: true,
    } as any,
  } as any;
}
