import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreCxFitV2 } from './cx-fit-scoring-v2';

const fixturesDir = join(__dirname, '__fixtures__');

const microsoftProductOpsBaselineText = readFileSync(
  join(fixturesDir, 'michael-baseline-microsoft-product-ops.baseline.txt'),
  'utf8',
).trim();

const microsoftProductOpsJobText = readFileSync(
  join(fixturesDir, 'microsoft-product-ops.jd.txt'),
  'utf8',
).trim();

const microsoftProductOpsBaselineSections = [
  {
    type: 'SUMMARY',
    content:
      'Service Delivery and Operations leader with 15 plus years driving global incident management, service reliability, contact center optimization, and customer operations across SaaS.',
  },
  {
    type: 'EXPERIENCE',
    content: microsoftProductOpsBaselineText,
  },
];

const microsoftProductOpsJob = {
  rawDescription: microsoftProductOpsJobText,
  normalizedResponsibilities: [
    'Designing the operating model for how products ship, from incubation to global rollout',
    'Building the unified metrics framework for AI monetization, partnering with data science',
    'Leading cross-org product reviews with senior leadership and strategic tradeoffs',
    'Orchestrating multi-team launch readiness for major capabilities',
    'Establish and maintain a predictable rhythm for product releases and strategic planning',
    'Partner with data science to build and maintain dashboards to monitor product health and performance',
  ],
  normalizedRequirements: [
    'Microsoft AI mission and consumer product context',
    'Bachelor\'s Degree in relevant field AND 8+ years experience in business-related roles',
    'Master\'s Degree in relevant field AND 12+ years experience in business-related roles',
    'OR Bachelor\'s Degree in relevant field AND 15+ years experience in business-related roles',
    'Consistent history of working directly with product, engineering, and GTM leadership managing multiple complex, large-scale product launches',
    '5+ years of experience with product roadmap management and strategic planning for product releases',
  ],
};

describe('cx-fit-scoring-v2 microsoft product ops regression', () => {
  it('proves the exact Microsoft Product Ops case against the role-fit anchor', () => {
    const result = scoreCxFitV2(
      {
        job: microsoftProductOpsJob,
        baselineSections: microsoftProductOpsBaselineSections,
        jobTitle: 'Senior Product Operations Manager',
      },
      { debugBundle: true },
    );

    const roleFitAnchor = result.debug.adjustedResponsibilityOverlapPercent;
    const proof = {
      responsibilityOverlapPercent: result.debug.responsibilityOverlapPercent,
      adjustedResponsibilityOverlapPercent: result.debug.adjustedResponsibilityOverlapPercent,
      role_scope_and_seniority: result.rubric.dimensionPercents.role_scope_and_seniority,
      support_operations_and_process_rigor:
        result.rubric.dimensionPercents.support_operations_and_process_rigor,
      tooling_and_platform_experience:
        result.rubric.dimensionPercents.tooling_and_platform_experience,
      domain_and_business_context: result.rubric.dimensionPercents.domain_and_business_context,
      change_leadership_and_customer_advocacy:
        result.rubric.dimensionPercents.change_leadership_and_customer_advocacy,
      finalScore: result.score,
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(proof, null, 2));

    expect(result.debug.responsibilityOverlapPercent).toBeGreaterThan(50);
    expect(result.debug.responsibilityOverlapPercent).toBeLessThan(70);
    expect(result.debug.adjustedResponsibilityOverlapPercent).toBeGreaterThanOrEqual(
      result.debug.responsibilityOverlapPercent,
    );
    expect(result.rubric.dimensionPercents.role_scope_and_seniority).toBeLessThanOrEqual(
      roleFitAnchor + 5,
    );
    expect(
      result.rubric.dimensionPercents.support_operations_and_process_rigor,
    ).toBeLessThanOrEqual(roleFitAnchor + 5);
    expect(result.rubric.dimensionPercents.tooling_and_platform_experience).toBeLessThanOrEqual(
      75,
    );
    expect(result.score).toBeGreaterThanOrEqual(73);
    expect(result.score).toBeLessThanOrEqual(76);
  });
});
