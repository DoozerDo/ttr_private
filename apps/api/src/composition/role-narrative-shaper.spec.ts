import { RoleNarrativeShaper } from './role-narrative-shaper';

function openingWord(text: string): string {
  return (String(text ?? '').trim().split(/\s+/)[0] ?? '').toLowerCase();
}

describe('RoleNarrativeShaper', () => {
  it('avoids repetitive verb openings across shaped bullets', () => {
    const shaper = new RoleNarrativeShaper();
    const shaped = shaper.shapeRole({
      company: 'Acme',
      roleTitle: 'Support Operations Lead',
      bullets: [
        'Managed escalations and handoffs between teams',
        'Managed incident response communications and updates',
        'Managed queue health and operational reviews',
      ],
      evidencePriorities: ['incident response', 'escalations', 'queue health'],
    });

    expect(shaped.bullets.length).toBeGreaterThanOrEqual(3);
    const starts = shaped.bullets.slice(0, 3).map(openingWord).filter(Boolean);
    expect(new Set(starts).size).toBeGreaterThan(1);
  });
});

