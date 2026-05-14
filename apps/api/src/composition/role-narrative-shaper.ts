import { BulletNarrativeRewriter } from './bullet-narrative-rewriter';

export type RoleNarrativeShapeInput = {
  company: string;
  roleTitle: string;
  dateRange?: string;
  bullets: Array<string | { text: string; sourceRoleKey: string; id?: string }>;
  evidencePriorities?: string[] | null;
};

export class RoleNarrativeShaper {
  private rewriter = new BulletNarrativeRewriter();

  private scoreBullet(input: {
    bullet: string;
    roleTitle: string;
    company: string;
    positioningThemes?: string[] | null;
  }): number {
    const text = input.bullet.toLowerCase();
    if (!text.trim()) return -1000;

    const themes = (input.positioningThemes ?? []).map((t) => String(t ?? '').toLowerCase()).filter(Boolean);
    const themeHits = themes.filter((t) => t.length >= 4 && text.includes(t)).length;

    const outcomeSignals =
      /\b(improv(?:e|ed|ing)|reduce(?:d|s)|increase(?:d|s)|scale(?:d|s|ing)|reliabilit(?:y|ies)|incident|sla|latency|uptime|on-call|customer|retention|conversion|throughput|cost|risk)\b/.test(
        text,
      ) ? 2 : 0;
    const ownershipSignals = /\b(owned|led|drove|shipped|launched|ran|operated|partnered|coordinated|accountable)\b/.test(text)
      ? 2
      : 0;
    const hasDigits = /\d/.test(text) ? 1 : 0;

    const roleContext = `${input.roleTitle} ${input.company}`.toLowerCase();
    const roleLooksTechnical = /\b(engineer|developer|devops|sre|platform|infrastructure|systems)\b/.test(roleContext);

    // Penalize inventory tone (comma-heavy stacks) unless the role is explicitly technical.
    const commaCount = (text.match(/,/g) ?? []).length;
    const inventoryPenalty = !roleLooksTechnical && commaCount >= 3 ? 2 : 0;
    const servicesIncludePenalty = !roleLooksTechnical && /\b(including|services include)\b/.test(text) ? 1 : 0;

    return themeHits * 2 + outcomeSignals + ownershipSignals + hasDigits - inventoryPenalty - servicesIncludePenalty;
  }

  shapeRole(input: RoleNarrativeShapeInput): {
    company: string;
    roleTitle: string;
    dateRange?: string;
    bullets: string[];
    bulletSourceRoleKeys: string[];
    rewrittenBulletCount: number;
    genericLanguageFlags: Array<{ role: string; flags: ReturnType<BulletNarrativeRewriter['rewrite']>['genericLanguageFlags'] }>;
  } {
    let rewrittenBulletCount = 0;
    const genericLanguageFlags: Array<{ role: string; flags: ReturnType<BulletNarrativeRewriter['rewrite']>['genericLanguageFlags'] }> =
      [];

    const bulletsWithProvenance = (input.bullets ?? [])
      .map((bulletValue) => {
        const bullet =
          typeof bulletValue === 'string'
            ? bulletValue
            : String((bulletValue as any)?.text ?? '');
        const sourceRoleKey =
          typeof bulletValue === 'string'
            ? `${input.company}::${input.roleTitle}`
            : String((bulletValue as any)?.sourceRoleKey ?? `${input.company}::${input.roleTitle}`);
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
        const rewritten = result.rewritten;
        return {
          rewritten,
          sourceRoleKey,
          score: this.scoreBullet({
            bullet: rewritten,
            roleTitle: input.roleTitle,
            company: input.company,
            positioningThemes: input.evidencePriorities,
          }),
        };
      })
      .filter((item) => Boolean(item.rewritten))
      // Prioritize recruiter-facing proof points first; keep all verified bullets, just reorder prominence.
      .sort((a, b) => b.score - a.score)
      ;

    const bullets = bulletsWithProvenance.map((item) => item.rewritten);
    const bulletSourceRoleKeys = bulletsWithProvenance.map((item) => item.sourceRoleKey);

    return {
      company: input.company,
      roleTitle: input.roleTitle,
      ...(input.dateRange ? { dateRange: input.dateRange } : {}),
      bullets,
      bulletSourceRoleKeys,
      rewrittenBulletCount,
      genericLanguageFlags,
    };
  }
}
