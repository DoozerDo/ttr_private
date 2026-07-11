import { NarrativeCompositionEngine } from './narrative-composition-engine';
import { RoleNarrativeShaper } from './role-narrative-shaper';

describe('NarrativeCompositionEngine', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not reintroduce role-local fallback evidence when render-plan candidates are filtered out', () => {
    const shapeRoleSpy = jest.spyOn(RoleNarrativeShaper.prototype, 'shapeRole');
    const engine = new NarrativeCompositionEngine();

    const result = engine.composeResume({
      renderPlan: {
        summaryNarrative: 'Support operations leader',
        evidencePriorities: [
          {
            theme: 'billing operations',
            sourceEmployerRoleKey: 'Other Co::Other Role',
          },
        ],
      } as any,
      experience: [
        {
          company: 'Acme',
          roleTitle: 'Support Operations Lead',
          bullets: [
            'Helped route invoice disputes to the right owner',
            'Managed escalations and queue health for the team',
          ],
        },
      ],
    });

    expect(shapeRoleSpy).toHaveBeenCalledTimes(1);
    expect(shapeRoleSpy.mock.calls[0]?.[0]?.evidencePriorities).toEqual([]);
    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]?.bullets).toHaveLength(2);
    expect(result.diagnostics.crossEmployerRankingBlocks).toBeGreaterThan(0);
  });
});
