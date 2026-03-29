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

describe('cx-fit-scoring-v2 vector precision', () => {
  it('detects product operations vectors and prevents generic ops buckets from fully covering the JD', () => {
    const result = scoreCxFitV2(
      {
        job: microsoftProductOpsJob,
        baselineSections: microsoftBaselineSections,
        jobTitle: 'Senior Product Operations Manager',
      },
      { debugBundle: true },
    );

    expect(result.debug.jobVectors).toEqual(
      expect.arrayContaining([
        'operating_model',
        'product_lifecycle',
        'product_launch_readiness',
        'roadmap_management',
        'portfolio_operations',
        'cross_functional_product_rhythm',
        'product_health_metrics',
        'data_science_partnership',
        'gtm_alignment',
        'release_planning',
      ]),
    );
    expect(result.debug.baselineVectors).not.toEqual(
      expect.arrayContaining([
        'product_lifecycle',
        'product_launch_readiness',
        'roadmap_management',
        'portfolio_operations',
        'cross_functional_product_rhythm',
        'product_health_metrics',
        'data_science_partnership',
        'gtm_alignment',
        'release_planning',
      ]),
    );
    expect(result.debug.responsibilityOverlapPercent).toBeLessThan(95);
    expect(result.score).toBeLessThan(90);
  });

  it('still scores a true support operations JD strongly against the same baseline', () => {
    const result = scoreCxFitV2(
      {
        job: supportOpsJob,
        baselineSections: microsoftBaselineSections,
        jobTitle: 'Director of Customer Operations',
      },
      { debugBundle: true },
    );

    expect(result.debug.jobVectors).toEqual(
      expect.arrayContaining([
        'incident_management',
        'escalation_governance',
        'service_delivery',
        'service_reliability',
        'automation_workflow',
        'contact_center_ops',
        'dashboards_kpis',
      ]),
    );
    expect(result.debug.responsibilityOverlapPercent).toBeGreaterThanOrEqual(90);
    expect(result.score).toBeGreaterThan(85);
  });
});
