import { BulletNarrativeRewriter } from './bullet-narrative-rewriter';

export type RoleNarrativeShapeInput = {
  company: string;
  roleTitle: string;
  dateRange?: string;
  bullets: string[];
  evidencePriorities?: string[] | null;
};

export class RoleNarrativeShaper {
  private rewriter = new BulletNarrativeRewriter();

  shapeRole(input: RoleNarrativeShapeInput): {
    company: string;
    roleTitle: string;
    dateRange?: string;
    bullets: string[];
    rewrittenBulletCount: number;
    genericLanguageFlags: Array<{ role: string; flags: ReturnType<BulletNarrativeRewriter['rewrite']>['genericLanguageFlags'] }>;
  } {
    let rewrittenBulletCount = 0;
    const genericLanguageFlags: Array<{ role: string; flags: ReturnType<BulletNarrativeRewriter['rewrite']>['genericLanguageFlags'] }> =
      [];

    const bullets = (input.bullets ?? [])
      .map((bullet) => {
        const result = this.rewriter.rewrite({
          bullet,
          roleTitle: input.roleTitle,
          company: input.company,
          positioningThemes: input.evidencePriorities,
        });
        if (result.changed) rewrittenBulletCount += 1;
        if (result.genericLanguageFlags.length) {
          genericLanguageFlags.push({ role: `${input.company}::${input.roleTitle}`, flags: result.genericLanguageFlags });
        }
        return result.rewritten;
      })
      .filter(Boolean);

    return {
      company: input.company,
      roleTitle: input.roleTitle,
      ...(input.dateRange ? { dateRange: input.dateRange } : {}),
      bullets,
      rewrittenBulletCount,
      genericLanguageFlags,
    };
  }
}

