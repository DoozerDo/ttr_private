import type { AuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';
import { ExecutiveSummaryComposer } from './executive-summary-composer';
import { RoleNarrativeShaper } from './role-narrative-shaper';
import { NarrativeQualityEvaluator } from './narrative-quality-evaluator';

export type ResumeCompositionInput = {
  renderPlan: AuthoritativeRenderPlan | null;
  summaryFallback: string;
  experience: Array<{ company: string; roleTitle: string; dateRange?: string; bullets: string[] }>;
};

export class NarrativeCompositionEngine {
  private summaryComposer = new ExecutiveSummaryComposer();
  private roleShaper = new RoleNarrativeShaper();
  private evaluator = new NarrativeQualityEvaluator();

  composeResume(input: ResumeCompositionInput): {
    summary: string;
    experience: ResumeCompositionInput['experience'];
    diagnostics: {
      rewrittenBulletCount: number;
      genericLanguageFlags: unknown[];
      narrativeQualityScore: unknown;
      summaryCompositionSource: string;
      evidenceToNarrativeMappings: Array<{ role: string; bulletIndex: number }>;
    };
  } {
    const renderPlan = input.renderPlan;
    const evidencePriorities = renderPlan?.evidencePriorities ?? [];
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
      return { company: shaped.company, roleTitle: shaped.roleTitle, ...(shaped.dateRange ? { dateRange: shaped.dateRange } : {}), bullets: shaped.bullets };
    });

    const summaryResult = this.summaryComposer.compose({
      positioningThesis: renderPlan?.summaryNarrative ?? null,
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
      },
    };
  }
}

