import type { AuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';
import type { CareerIdentitySnapshot } from '../career-identity/career-identity.models';
import { ExecutiveSummaryComposer } from './executive-summary-composer';
import { RoleNarrativeShaper } from './role-narrative-shaper';
import { NarrativeQualityEvaluator } from './narrative-quality-evaluator';

export type ResumeCompositionInput = {
  renderPlan: AuthoritativeRenderPlan | null;
  summaryFallback: string;
  careerIdentity?: CareerIdentitySnapshot | null;
  experience: Array<{
    company: string;
    roleTitle: string;
    dateRange?: string;
    bullets: Array<string | { text: string; sourceRoleKey: string; id?: string; sourceEvidenceIds?: string[]; source?: { sourceEvidenceIds?: string[] } }>;
  }>;
};

function normalizeToken(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

type RankingCandidate = {
  theme: string;
  sourceEmployerRoleKey?: string | null;
  derivedFromRoleKey?: string | null;
};

function normalizeRankingCandidate(value: unknown): RankingCandidate | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const theme = String(value ?? '').trim();
    return theme ? { theme } : null;
  }
  if (typeof value !== 'object') return null;
  const theme = String((value as any).theme ?? '').trim();
  if (!theme) return null;
  const sourceEmployerRoleKey =
    typeof (value as any).sourceEmployerRoleKey === 'string' ? String((value as any).sourceEmployerRoleKey) : null;
  const derivedFromRoleKey =
    typeof (value as any).derivedFromRoleKey === 'string' ? String((value as any).derivedFromRoleKey) : null;
  return { theme, sourceEmployerRoleKey, derivedFromRoleKey };
}

export class NarrativeCompositionEngine {
  private summaryComposer = new ExecutiveSummaryComposer();
  private roleShaper = new RoleNarrativeShaper();
  private evaluator = new NarrativeQualityEvaluator();

  private determineTargetAngle(input: ResumeCompositionInput): string {
    const thesis = String(input.renderPlan?.summaryNarrative ?? '').trim();
    if (thesis) return thesis;
    const roleCorpus = input.experience.map((r) => `${r.roleTitle} ${r.company}`).join(' ');
    const evidence = (input.renderPlan?.evidencePriorities ?? []).join(' ');
    // Keep this heuristic small: it only produces a concise angle label to anchor the summary.
    const lowered = `${roleCorpus} ${evidence}`.toLowerCase();
    if (/\b(customer operations|customer success|support operations)\b/.test(lowered)) {
      return 'Customer Operations / Support Strategy leader';
    }
    if (/\b(incident|escalation|sla|service delivery)\b/.test(lowered)) {
      return 'Technical support operations leader with SaaS escalation depth';
    }
    if (/\b(program|operating rhythm|process|workflow)\b/.test(lowered)) {
      return 'Program-oriented CX operations leader';
    }
    return '';
  }

  composeResume(input: ResumeCompositionInput): {
    summary: string;
    experience: ResumeCompositionInput['experience'];
    diagnostics: {
      rewrittenBulletCount: number;
      genericLanguageFlags: unknown[];
      narrativeQualityScore: unknown;
      summaryCompositionSource: string;
      evidenceToNarrativeMappings: Array<{ role: string; bulletIndex: number }>;
      targetAngle: string;
      employerScopedRankingEnabled: boolean;
      crossEmployerRankingBlocks: number;
      topRankedNarrativeCluster: string | null;
    };
  } {
    const renderPlan = input.renderPlan;
    const evidencePrioritiesRaw = (renderPlan as any)?.evidencePriorities ?? [];
    const evidencePriorities = (Array.isArray(evidencePrioritiesRaw) ? evidencePrioritiesRaw : [])
      .map(normalizeRankingCandidate)
      .filter(Boolean) as RankingCandidate[];

    const identity = input.careerIdentity ?? null;
    const prohibitedSignals = (() => {
      const prohibited = new Set((identity?.prohibitedDriftDomains ?? []).map((d) => String(d ?? '').trim()).filter(Boolean));
      const out: RegExp[] = [];
      if (prohibited.has('billing_operations')) out.push(/\b(billing|invoice|invoicing|reconciliation|credit|dispute|metering)\b/i);
      if (prohibited.has('revenue_operations')) out.push(/\b(revops|revenue operations|pipeline|forecast|quota)\b/i);
      if (prohibited.has('finance_operations')) out.push(/\b(accounts payable|accounts receivable|close|general ledger|sox)\b/i);
      return out;
    })();

    const identityAlignedSignals = (() => {
      const dominant = String(identity?.dominantOperationalDomain ?? '');
      if (!dominant) return [] as RegExp[];
      if (dominant === 'support_operations' || dominant === 'customer_operations' || dominant === 'saas_operations' || dominant === 'technical_support_leadership') {
        return [
          /\b(customer operations|customer experience|customer success|support operations|service operations|cx)\b/i,
          /\b(incident|escalation|triage|sla|queue|rca|root cause)\b/i,
          /\b(process|playbook|workflow|operating rhythm|governance)\b/i,
          /\b(cross[-\s]?functional|stakeholder|handoff|enablement)\b/i,
        ];
      }
      return [] as RegExp[];
    })();

    const prohibitTheme = (theme: string) => prohibitedSignals.some((re) => re.test(theme));
    const alignTheme = (theme: string) => identityAlignedSignals.some((re) => re.test(theme));

    const evidencePrioritiesGoverned = prohibitedSignals.length
      ? [...evidencePriorities].sort((a, b) => {
          const aProhibited = prohibitTheme(a.theme);
          const bProhibited = prohibitTheme(b.theme);
          if (aProhibited !== bProhibited) return aProhibited ? 1 : -1;
          const aAligned = alignTheme(a.theme);
          const bAligned = alignTheme(b.theme);
          if (aAligned !== bAligned) return aAligned ? -1 : 1;
          return 0;
        })
      : evidencePriorities;

    const evidencePriorityThemes = evidencePrioritiesGoverned.map((c) => c.theme);
    const targetAngle = this.determineTargetAngle(input);
    let rewrittenBulletCount = 0;
    let crossEmployerRankingBlocks = 0;
    const genericLanguageFlags: unknown[] = [];
    const evidenceToNarrativeMappings: Array<{ role: string; bulletIndex: number }> = [];

    const shapedExperience = input.experience.map((role) => {
      const roleBulletText = Array.isArray(role.bullets)
        ? role.bullets
            .map((b: any) => (typeof b === 'string' ? b : String(b?.text ?? '')))
            .map((t) => normalizeToken(t))
            .join(' ')
        : '';
      const targetRoleKey = `${String(role.company ?? '')}::${String(role.roleTitle ?? '')}`;
      const filteredCandidates: RankingCandidate[] = [];
      for (const candidate of evidencePrioritiesGoverned) {
        if (!candidate?.theme) continue;
        if (candidate.sourceEmployerRoleKey && candidate.sourceEmployerRoleKey !== targetRoleKey) {
          crossEmployerRankingBlocks += 1;
          continue;
        }
        // Allow unprovenanced candidates only when they are explicitly marked as locally-derived for this role.
        if (!candidate.sourceEmployerRoleKey && candidate.derivedFromRoleKey && candidate.derivedFromRoleKey !== targetRoleKey) {
          crossEmployerRankingBlocks += 1;
          continue;
        }
        filteredCandidates.push(candidate);
      }

      // Secondary fallback: role-local derivation from that role's bullet corpus.
      // This is not the primary guard (provenance checks above are).
      const roleScopedPriorities = filteredCandidates
        .map((c) => String(c.theme ?? '').trim())
        .filter(Boolean)
        .filter((theme) => {
          const needle = normalizeToken(theme);
          return needle.length >= 4 && roleBulletText.includes(needle);
        });

      const shaped = this.roleShaper.shapeRole({
        company: role.company,
        roleTitle: role.roleTitle,
        dateRange: role.dateRange,
        bullets: role.bullets,
        evidencePriorities: roleScopedPriorities.length ? roleScopedPriorities : filteredCandidates.map((c) => c.theme),
        prohibitedDomainSignals: prohibitedSignals.length ? prohibitedSignals : null,
      });
      rewrittenBulletCount += shaped.rewrittenBulletCount;
      if (shaped.genericLanguageFlags.length) genericLanguageFlags.push(...shaped.genericLanguageFlags);
      shaped.bullets.forEach((_, idx) => evidenceToNarrativeMappings.push({ role: `${role.company}::${role.roleTitle}`, bulletIndex: idx }));
      return {
        company: shaped.company,
        roleTitle: shaped.roleTitle,
        ...(shaped.dateRange ? { dateRange: shaped.dateRange } : {}),
        bullets: shaped.bullets as any,
        bulletSourceRoleKeys: shaped.bulletSourceRoleKeys,
      } as any;
    });

    const summaryResult = this.summaryComposer.compose({
      positioningThesis: renderPlan?.summaryNarrative ?? (targetAngle ? `${targetAngle}.` : null),
      experienceSnippets: shapedExperience.flatMap((r) => [
        r.roleTitle,
        ...(r.bullets ?? []).slice(0, 2).map((bullet) => (typeof bullet === 'string' ? bullet : bullet.text)),
      ]),
      evidencePriorities: evidencePriorityThemes,
    });

    const combined = [
      summaryResult.summary,
      ...shapedExperience.flatMap((r) => r.bullets).map((bullet) => (typeof bullet === 'string' ? bullet : bullet.text)),
    ].join(' ');
    const quality = this.evaluator.evaluate({
      text: combined,
      positioningThesis: renderPlan?.summaryNarrative,
      evidenceKeywords: evidencePriorityThemes,
    });

    return {
      summary: summaryResult.summary || input.summaryFallback,
      experience: shapedExperience,
      diagnostics: {
        rewrittenBulletCount,
        genericLanguageFlags: [...summaryResult.genericLanguageFlags, ...quality.genericLanguageFlags, ...genericLanguageFlags],
        narrativeQualityScore: quality.score,
        summaryCompositionSource: summaryResult.source,
        evidenceToNarrativeMappings,
        targetAngle,
        employerScopedRankingEnabled: true,
        crossEmployerRankingBlocks,
        topRankedNarrativeCluster: evidencePriorityThemes.length ? evidencePriorityThemes[0] ?? null : null,
      },
    };
  }
}
