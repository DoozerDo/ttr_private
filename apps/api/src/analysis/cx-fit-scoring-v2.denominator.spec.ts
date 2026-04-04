import { scoreCxFitV2 } from './cx-fit-scoring-v2';

describe('cx-fit-scoring-v2 denominator regression', () => {
  it('keeps raw job text in the scoring mix so the Microsoft Product Operations case does not saturate early', () => {
    const baselineSections = [
      {
        type: 'EXPERIENCE',
        content:
          'Senior Director of Customer Operations who led incident management, service delivery, escalation governance, and service reliability.\nOwned ITSM process maturity, automation and workflow design, runbooks, dashboards, and KPIs while directing global coverage.\nManaged managers across contact center ops, chaired governance forums, and reported to the executive committee for SaaS and enterprise IT customers.',
      },
      {
        type: 'SKILLS',
        content:
          'ServiceNow, AWS, Grafana, automation roadmaps, capacity planning, KPI frameworks, governance creation, dashboards',
      },
    ];

    const job = {
      rawDescription:
        'Senior Director responsible for operating model design, governance creation, capacity planning, and KPI frameworks in global SaaS operations. Directs incident management, escalation governance, and service delivery while owning automation and workflow design, dashboards, KPIs, and contact center ops. Demonstrates execution through MTTR, SLA, and NPS improvements, incident command, CAB chaired, dashboards built, and automation delivered.',
      normalizedResponsibilities: [
        'Lead incident management, escalation governance, service delivery, and service reliability across SaaS and enterprise IT clients',
        'Direct automation and workflow design, runbooks, dashboards, KPIs, and governance creation for global contact center ops',
      ],
      normalizedRequirements: [
        'Deep expertise with ServiceNow, AWS, Grafana, and automation roadmaps along with KPI frameworks and capacity planning',
      ],
    };

    const result = scoreCxFitV2(
      {
        job,
        baselineSections,
        jobTitle: 'Senior Product Operations Manager',
      },
      { debugBundle: true },
    );

    expect(result.debug.jobTextForScoring).toContain('operating model');
    expect(result.debug.strategyMatchesJob).toBeGreaterThan(3);
    expect(result.debug.jobVectorsLength).toBeGreaterThan(7);
    expect(result.debug.responsibilityOverlapPercent).toBeLessThan(100);
    expect(result.score).toBeLessThan(90);
  });
});
