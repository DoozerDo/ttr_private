import { BulletNarrativeRewriter } from './bullet-narrative-rewriter';

describe('BulletNarrativeRewriter', () => {
  it('preserves truth (no new metrics) when none exist', () => {
    const rewriter = new BulletNarrativeRewriter();
    const input = 'Managed tickets and worked with teams';
    const result = rewriter.rewrite({ bullet: input, roleTitle: 'Support Lead', company: 'Acme' });
    expect(result.rewritten).toBeTruthy();
    expect(result.rewritten).toContain('Coordinated');
    expect(/\d/.test(result.rewritten)).toBe(false);
  });

  it('reduces keyword inventories and caps bullet length without inventing facts', () => {
    const rewriter = new BulletNarrativeRewriter();
    const input =
      'Responsible for support operations, incident response, escalation management, customer communication, stakeholder alignment, tooling improvements, and reporting across teams';
    const result = rewriter.rewrite({ bullet: input, roleTitle: 'Director of Support', company: 'Acme' });

    expect(result.rewritten).toMatch(/^(Owned|Led|Drove|Delivered|Built|Created|Improved|Reduced|Standardized|Partnered|Coordinated|Supported)\b/);
    // Avoid raw comma inventories in recruiter-facing bullets.
    expect((result.rewritten.match(/,/g) ?? []).length).toBeLessThanOrEqual(2);
    // Keep bullets concise (no run-on fragments).
    const words = result.rewritten.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(32);
    // No invented numbers.
    expect(/\d/.test(result.rewritten)).toBe(false);
  });

  it('does not introduce billing-domain terms when the original bullet does not contain them', () => {
    const rewriter = new BulletNarrativeRewriter();
    const input = 'Managed escalations and incident communications across teams';
    const result = rewriter.rewrite({ bullet: input, roleTitle: 'Support Lead', company: 'Acme' });
    expect(result.rewritten.toLowerCase()).not.toMatch(/\b(billing|invoice|entitlement|reconciliation|metering|credit|dispute|revenue)\b/);
  });
});
