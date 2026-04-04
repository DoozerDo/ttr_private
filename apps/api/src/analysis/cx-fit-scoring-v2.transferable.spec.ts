import { scoreCxFitV2 } from './cx-fit-scoring-v2';

const microsoftBaselineSections = [
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

const microsoftProductOpsJob = {
  rawDescription:
    'Product operations leader responsible for operating model design, product launch readiness, roadmap management, portfolio operations, product health metrics, data science partnership, GTM alignment, release planning, and product documentation source of truth. Leads cross-functional product rhythm and launch readiness for new initiatives while partnering with analytics on product health and managing product reviews.',
  normalizedResponsibilities: [
    'Own product lifecycle and product launch readiness across releases',
    'Run roadmap management and portfolio operations with cross-functional product rhythm',
  ],
  normalizedRequirements: [
    'Partner with data science on product health metrics and GTM alignment',
    'Maintain release planning and product documentation source of truth for launches',
  ],
};

const supportOpsJob = {
  rawDescription:
    'Lead support operations, incident management, escalation governance, service delivery, and global coverage. Own ITSM process maturity, automation workflows, dashboards, KPI frameworks, service reliability, and customer advocacy across enterprise support teams.',
  normalizedResponsibilities: [
    'Lead incident management, escalation governance, service delivery, and service reliability across SaaS and enterprise IT clients',
    'Direct automation and workflow design, runbooks, dashboards, KPIs, and governance creation for global contact center ops',
  ],
  normalizedRequirements: [
    'Deep expertise with ServiceNow, AWS, Grafana, and automation roadmaps along with KPI frameworks and capacity planning',
  ],
};

const unrelatedJob = {
  rawDescription:
    'Warehouse coordinator responsible for inventory reconciliation, shipping exceptions, forklift certification, and dock scheduling.',
  normalizedResponsibilities: [
    'Manage warehouse inventory reconciliation and shipping exceptions',
  ],
  normalizedRequirements: [
    'Coordinate dock scheduling and forklift certification',
  ],
};

const productOpsBaselineSections = [
  {
    type: 'EXPERIENCE',
    content:
      'Product operations manager who owned operating model design, product launch readiness, roadmap management, portfolio operations, release planning, and cross-functional product rhythm.\nPartnered with data science on product health metrics, GTM alignment, and product documentation source of truth while coordinating launch readiness across releases.',
  },
  {
    type: 'SKILLS',
    content:
      'Operating model, product lifecycle, roadmap management, release planning, product health metrics, GTM alignment, product documentation source of truth',
  },
];

describe('cx-fit-scoring-v2 transferable bridging', () => {
  it('adds bounded partial credit for adjacent Product Ops signals without saturating the score', () => {
    const result = scoreCxFitV2(
      {
        job: microsoftProductOpsJob,
        baselineSections: microsoftBaselineSections,
        jobTitle: 'Senior Product Operations Manager',
      },
      { debugBundle: true },
    );

    expect(result.debug.responsibilityOverlapPercent).toBeLessThan(70);
    expect(result.debug.transferableCoveragePercent).toBeGreaterThan(0);
    expect(result.debug.transferableMatches.length).toBeGreaterThan(0);
    expect(result.debug.transferableContributionApplied).toBeLessThan(
      result.debug.responsibilityOverlapPercent * 0.5,
    );
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.score).toBeLessThan(75);
  });

  it('keeps a true support operations role strong through direct matching', () => {
    const result = scoreCxFitV2(
      {
        job: supportOpsJob,
        baselineSections: microsoftBaselineSections,
        jobTitle: 'Director of Customer Operations',
      },
      { debugBundle: true },
    );

    expect(result.debug.transferableCoveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.debug.responsibilityOverlapPercent).toBeGreaterThanOrEqual(90);
    expect(result.score).toBeGreaterThan(85);
  });

  it('keeps bridging minimal when the baseline already directly matches Product Ops', () => {
    const result = scoreCxFitV2(
      {
        job: microsoftProductOpsJob,
        baselineSections: productOpsBaselineSections,
        jobTitle: 'Senior Product Operations Manager',
      },
      { debugBundle: true },
    );

    expect(result.debug.responsibilityOverlapPercent).toBeGreaterThanOrEqual(80);
    expect(result.debug.transferableContributionApplied).toBeLessThan(25);
    expect(result.score).toBeGreaterThan(75);
  });

  it('keeps a mismatched role low even when transfer mappings exist', () => {
    const result = scoreCxFitV2(
      {
        job: unrelatedJob,
        baselineSections: microsoftBaselineSections,
        jobTitle: 'Warehouse Coordinator',
      },
      { debugBundle: true },
    );

    expect(result.debug.transferableMatches.length).toBeLessThanOrEqual(1);
    expect(result.debug.transferableCoveragePercent).toBeLessThan(20);
    expect(result.score).toBeLessThan(70);
  });
});
