import type { AuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';
import { ExecutiveSummaryComposer } from './executive-summary-composer';
import { RoleNarrativeShaper } from './role-narrative-shaper';
import { NarrativeQualityEvaluator } from './narrative-quality-evaluator';

export type ResumeCompositionInput = {
  renderPlan: AuthoritativeRenderPlan | null;
  summaryFallback: string;
  experience: Array<{
    company: string;
    roleTitle: string;
    dateRange?: string;
    bullets: Array<string | { text: string; sourceRoleKey: string; id?: string }>;
  }>;
};

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
    };
  } {
    const renderPlan = input.renderPlan;
    const evidencePriorities = renderPlan?.evidencePriorities ?? [];
    const targetAngle = this.determineTargetAngle(input);
    let rewrittenBulletCount = 0;
    const genericLanguageFlags: unknown[] = [];
    const evidenceToNarrativeMappings: Array<{ role: string; bulletIndex: number }> = [];

    const shapedExperience = input.experience.map((role) => {
      const shaped = this.roleShaper.shapeRole({
        company: role.company,
        roleTitle: role.roleTitle,
        dateRange: role.dateRange,
        bullets: role.bullets,
        evidencePriorities,
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
      experienceSnippets: shapedExperience.flatMap((r) => [r.roleTitle, ...(r.bullets ?? []).slice(0, 2)]),
      evidencePriorities,
    });

    const combined = [summaryResult.summary, ...shapedExperience.flatMap((r) => r.bullets)].join(' ');
    const quality = this.evaluator.evaluate({
      text: combined,
      positioningThesis: renderPlan?.summaryNarrative,
      evidenceKeywords: evidencePriorities,
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
      },
    };
  }
}
