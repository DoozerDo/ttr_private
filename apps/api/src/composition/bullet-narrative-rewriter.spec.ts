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
});

