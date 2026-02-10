import { scoreCxFitV2 } from './cx-fit-scoring-v2';

const seniorFloorBaselineSections = [
  {
    type: 'EXPERIENCE',
    content: `
      Senior Director of Global Operations leading governance creation and operating model design for SaaS and enterprise IT.
      Oversees customer advocacy councils and reports outcomes to the executive team while directing global operations.
    `,
  },
];

const seniorFloorJob = {
  rawDescription: `
    Senior Director responsible for operating model design, governance creation, capacity planning, and customer advocacy across global operations.
    Leads customer experience programs and directs global incident management while owning governance creation and strategic capacity planning.
  `,
  normalizedResponsibilities: [
    'Design operating model and governance creation for global operations and service delivery',
    'Lead customer advocacy and customer experience efforts across SaaS and enterprise IT',
  ],
  normalizedRequirements: [
    'Experience with customer advocacy, capacity planning, governance, and executive reporting for global operations',
  ],
};

const managerBaselineSections = [
  {
    type: 'EXPERIENCE',
    content: `
      Delivery manager overseeing regional service delivery teams and establishing governance for internal programs.
      Owns incident response, team management, and cohort-level operating model design.
    `,
  },
];

const managerJob = {
  rawDescription: `
    Service delivery manager leading service teams, runbooks, and operating model design for regional clients.
    Supports governance creation and customer advocacy forums while executing dashboards and operational runbooks.
  `,
  normalizedResponsibilities: [
    'Lead service delivery teams, dashboards, and runbooks in regional programs',
    'Support governance creation and customer advocacy forums while executing operational playbooks',
  ],
  normalizedRequirements: ['Experience with operating model design and governance creation at the manager level'],
};

describe('scoreCxFitV2 role implied strategy floor', () => {
  it('floors the strategy/advocacy ratios for a properly leveled senior role', () => {
    const result = scoreCxFitV2({
      job: seniorFloorJob,
      baselineSections: seniorFloorBaselineSections,
    });

    expect(result.debug.roleImpliedStrategyFloorApplied).toBe(true);
    expect(result.debug.flooredStrategyRatioPercent).toBe(65);
    expect(result.debug.flooredAdvocacyRatioPercent).toBe(60);
    const changePercent = result.rubric.dimensionPercents.change_leadership_and_customer_advocacy;
    expect(changePercent).toBeGreaterThanOrEqual(65);
    expect(changePercent).toBe(65);
    const changeSignals =
      result.debug.bundle?.evidence.change_leadership_and_customer_advocacy.signals ?? [];
    expect(changeSignals).toContain('change_percent=65.0%');
  });

  it('does not floor non-senior or misleveled roles and uses originals', () => {
    const result = scoreCxFitV2({
      job: managerJob,
      baselineSections: managerBaselineSections,
    });

    expect(result.debug.roleImpliedStrategyFloorApplied).toBe(false);
    const expectedChangePercent = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          result.debug.originalStrategyRatioPercent * 0.55 +
            result.debug.originalAdvocacyRatioPercent * 0.45,
        ),
      ),
    );
    expect(result.rubric.dimensionPercents.change_leadership_and_customer_advocacy).toBe(
      expectedChangePercent,
    );
    const changeSignals =
      result.debug.bundle?.evidence.change_leadership_and_customer_advocacy.signals ?? [];
    expect(changeSignals).toContain(`change_percent=${expectedChangePercent.toFixed(1)}%`);
  });
});
