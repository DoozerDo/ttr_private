import { BulletNarrativeRewriter } from './bullet-narrative-rewriter';

export type RoleNarrativeShapeInput = {
  company: string;
  roleTitle: string;
  dateRange?: string;
  bullets: Array<string | { text: string; sourceRoleKey: string; id?: string }>;
  evidencePriorities?: string[] | null;
  prohibitedDomainSignals?: RegExp[] | null;
};

export class RoleNarrativeShaper {
  private rewriter = new BulletNarrativeRewriter();

  private stripRepeatedTrailingIntentPhrases(bullets: string[]): string[] {
    const tailRe = /,\s*(to\s+[a-z][^.]*)\.\s*$/i;
    const seen = new Set<string>();
    return bullets.map((b) => {
      const m = String(b ?? '').match(tailRe);
      if (!m) return b;
      const tail = String(m[1] ?? '').toLowerCase().trim();
      if (!tail) return b;
      if (!seen.has(tail)) {
        seen.add(tail);
        return b;
      }
      return String(b).replace(tailRe, '.').replace(/\s{2,}/g, ' ').trim();
    });
  }

  private diversifyOpenings(bullets: string[]): string[] {
    const seen = new Map<string, number>();
    const variants: Array<[RegExp, string[]]> = [
      [/^\s*Coordinated\b/i, ['Coordinated', 'Owned', 'Led', 'Partnered with', 'Standardized']],
      [/^\s*Partnered with\b/i, ['Partnered with', 'Coordinated with', 'Aligned with']],
      // Avoid grammatically awkward replacements like "Enabled route...". Keep variants verb-compatible.
      [/^\s*Supported\b/i, ['Supported', 'Helped', 'Assisted']],
      [/^\s*Owned\b/i, ['Owned', 'Led', 'Drove', 'Improved']],
    ];

    return bullets.map((bullet) => {
      const first = (String(bullet ?? '').trim().split(/\s+/)[0] ?? '').toLowerCase();
      if (!first) return bullet;
      const count = (seen.get(first) ?? 0) + 1;
      seen.set(first, count);
      if (count <= 1) return bullet;

      for (const [pattern, words] of variants) {
        if (!pattern.test(bullet)) continue;
        const replacement = words[Math.min(words.length - 1, count - 1)] ?? words[0];
        return bullet.replace(pattern, replacement);
      }
      return bullet;
    });
  }

  private scoreBullet(input: {
    bullet: string;
    roleTitle: string;
    company: string;
    positioningThemes?: string[] | null;
    prohibitedDomainSignals?: RegExp[] | null;
  }): number {
    const text = input.bullet.toLowerCase();
    if (!text.trim()) return -1000;

    // Hard suppress generic filler bullets.
    if (/\bverified professional experience\b/.test(text)) return -500;

    // Suppress low-signal one-off task bullets (routing/forwarding/hand-off phrasing) when stronger bullets exist.
    // This is domain-agnostic: it targets weak task evidence, not specific billing terms.
    const oneOffTaskHardSuppression =
      /\bonce\b/.test(text) ||
      /\b(helped|assisted)\s+(route|forward|send|sent|escalate)\b/.test(text) ||
      /\b(route|routed|routing)\b/.test(text) && /\b(to|into)\s+the\s+(right|correct)\s+(owner|team)\b/.test(text) ||
      /\bforwarded\b/.test(text) ||
      /\bsent\b/.test(text) && /\bto\s+(the\s+)?(right|correct)\s+(owner|team)\b/.test(text)
        ? true
        : false;
    if (oneOffTaskHardSuppression) return -300;

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

    const prohibitedPenalty =
      (input.prohibitedDomainSignals ?? []).some((re) => re.test(text)) ? 25 : 0;

    const lowSignalOncePenalty = /\bonce\b/.test(text) && !/\d/.test(text) ? 2 : 0;
    const weakRoutingPenalty = /\b(route|routing)\b/.test(text) && ownershipSignals === 0 ? 1 : 0;

    return (
      themeHits * 2 +
      outcomeSignals +
      ownershipSignals +
      hasDigits -
      inventoryPenalty -
      servicesIncludePenalty -
      prohibitedPenalty -
      lowSignalOncePenalty -
      weakRoutingPenalty
    );
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
            prohibitedDomainSignals: input.prohibitedDomainSignals,
          }),
        };
      })
      .filter((item) => Boolean(item.rewritten))
      // Prioritize recruiter-facing proof points first; keep all verified bullets, just reorder prominence.
      .sort((a, b) => b.score - a.score)
      ;

    const bullets = bulletsWithProvenance.map((item) => item.rewritten);
    const dedupedIntent = this.stripRepeatedTrailingIntentPhrases(bullets);
    const diversifiedBullets = this.diversifyOpenings(dedupedIntent);
    const bulletSourceRoleKeys = bulletsWithProvenance.map((item) => item.sourceRoleKey);

    return {
      company: input.company,
      roleTitle: input.roleTitle,
      ...(input.dateRange ? { dateRange: input.dateRange } : {}),
      bullets: diversifiedBullets,
      bulletSourceRoleKeys,
      rewrittenBulletCount,
      genericLanguageFlags,
    };
  }
}
