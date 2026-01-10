import { scoreCxFitV2 } from './cx-fit-scoring-v2';

const nearMirrorBaselineSections = [
  {
    type: 'EXPERIENCE',
    content: `
      Senior Director of Customer Operations who led incident management, service delivery, escalation governance, and service reliability.
      Owned ITSM process maturity, automation and workflow design, runbooks, dashboards, and KPIs while directing global coverage.
      Managed managers across contact center ops, chaired governance forums, and reported to the executive committee for SaaS and enterprise IT customers.
    `,
  },
  {
    type: 'SKILLS',
    content:
      'ServiceNow, AWS, Grafana, automation roadmaps, capacity planning, KPI frameworks, governance creation, dashboards',
  },
];

const nearMirrorJob = {
  rawDescription: `
    Senior Director responsible for operating model design, governance creation, capacity planning, and KPI frameworks in global SaaS operations.
    Directs incident management, escalation governance, and service delivery while owning automation and workflow design, dashboards, KPIs, and contact center ops.
    Demonstrates execution through MTTR, SLA, and NPS improvements, incident command, CAB chaired, dashboards built, and automation delivered.
  `,
  normalizedResponsibilities: [
    'Lead incident management, escalation governance, service delivery, and service reliability across SaaS and enterprise IT clients',
    'Direct automation and workflow design, runbooks, dashboards, KPIs, and governance creation for global contact center ops',
  ],
  normalizedRequirements: [
    'Deep expertise with ServiceNow, AWS, Grafana, and automation roadmaps along with KPI frameworks and capacity planning',
  ],
};

const stretchBaselineSections = [
  {
    type: 'EXPERIENCE',
    content: `
      Director of Service Delivery overseeing internal SaaS and enterprise IT operations.
      Drives service delivery while establishing governance and operational excellence for internal programs, including capacity planning and MTTR reporting.
    `,
  },
  {
    type: 'SKILLS',
    content: 'Service Delivery, ITSM',
  },
];

const stretchJob = {
  rawDescription: `
    VP of Service Delivery for an MSP charter. Owns budget authority and field services org oversight while guiding service delivery discipline and automation workflows.
    Guides managed service provider delivery while shaping capacity planning and MTTR improvements.
    Sets governance creation and operating model design while reporting outcomes to the executive team.
  `,
  normalizedResponsibilities: [
    'Own service delivery oversight for MSP clients while guiding capacity planning and automation workflows',
    'Handle budget authority and field services org oversight across managed services operations',
  ],
  normalizedRequirements: [
    'Experience with managed service provider operations, governance creation, operating model design, and capacity planning for MSP revenue',
  ],
};

const toolingBaselineSections = [
  {
    type: 'EXPERIENCE',
    content: `
      Customer operations leader for global SaaS service delivery, overseeing incident management, automation, contact center ops, and governance.
      Owned dashboards and KPI frameworks while leading reliability and service delivery across global teams.
    `,
  },
  {
    type: 'SKILLS',
    content: 'AWS, Grafana, automation, dashboards, ITSM, runbooks',
  },
];

const toolingJob = {
  rawDescription: `
    Lead incident management, service delivery, and automation across global teams.
    Manages managers, reports to the executive team, and defines operating model design, tooling roadmap, and KPI frameworks for regulated reliability.
    ServiceNow is required along with Service Desk automation to deliver dashboards and KPIs for critical programs.
  `,
  normalizedResponsibilities: [
    'Lead incident management, service delivery, and automation for global regulated coverage',
    'Direct tooling roadmap, operating model design, and KPI frameworks with a focus on dashboards and reliability while managing managers',
  ],
  normalizedRequirements: [
    'Hands-on ServiceNow experience plus Salesforce or Service Desk automation knowledge',
  ],
};

describe('scoreCxFitV2', () => {
  it('scores a near mirror role in the 88-93 range with self similarity applied', () => {
    const result = scoreCxFitV2({
      job: nearMirrorJob,
      baselineSections: nearMirrorBaselineSections,
    });

    expect(result.score).toBeGreaterThanOrEqual(88);
    expect(result.score).toBeLessThanOrEqual(93);
    expect(result.adjustments.selfSimilarityApplied).toBe(true);
  });

  it('applies stretch dampener for a VP MSP scenario and keeps domain below 100', () => {
    const result = scoreCxFitV2({
      job: stretchJob,
      baselineSections: stretchBaselineSections,
    });

    expect(result.adjustments.stretchDampenerApplied).toBe(true);
    expect(result.adjustments.stretchDampenerPoints).toBeGreaterThanOrEqual(5);
    expect(result.adjustments.stretchDampenerPoints).toBeLessThanOrEqual(12);
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.score).toBeLessThanOrEqual(65);
    expect(result.components.domain).toBeLessThan(100);
  });

  it('enforces tooling floor when scope and leadership are strong despite tooling gaps', () => {
    const result = scoreCxFitV2({
      job: toolingJob,
      baselineSections: toolingBaselineSections,
    });

    expect(result.components.scope).toBeGreaterThanOrEqual(70);
    expect(result.components.leadership).toBeGreaterThanOrEqual(70);
    expect(result.adjustments.toolingFloorApplied).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });
});
