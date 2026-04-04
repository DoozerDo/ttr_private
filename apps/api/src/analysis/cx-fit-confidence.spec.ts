jest.mock('../scoring-v2/config/capability-clusters', () => ({
  getCapabilityClusterRegistry: () => ({
    clusters: [],
  }),
}));

import type { CxFitV2DebugInfo } from './cx-fit-scoring-v2';
import { computeConfidenceScore } from './cx-fit-scoring-v2';

describe('computeConfidenceScore', () => {
  it('applies each penalty and clamps at zero when coverage is weak', () => {
    const debug = {
      jobScoringTextSource: 'raw',
      baselineBand: 'L1',
      roleBand: 'L1',
      bandDelta: 3,
      responsibilityOverlapPercent: 20,
      baselineCoveragePercent: 40,
      baselineRecallPercent: 0,
      roleImpliedStrategyFloorApplied: true,
      originalStrategyRatioPercent: 0,
      flooredStrategyRatioPercent: 0,
      originalAdvocacyRatioPercent: 0,
      flooredAdvocacyRatioPercent: 0,
      changeLeadershipEligibility: 'eligible',
      effectiveWeights: {
        role_scope_and_seniority: 25,
        support_operations_and_process_rigor: 25,
        tooling_and_platform_experience: 20,
        domain_and_business_context: 15,
        change_leadership_and_customer_advocacy: 15,
      },
      redistributedWeightFrom: 0,
      toolingCoverage: {
        requiredCoverage: 0.4,
        preferredCoverage: 0,
      },
      platformGroups: {
        totalBoost: 0,
        evidence: [],
      },
      industryBundles: {
        evidence: [],
      },
      strategicDensity: {
        baseline: 0,
        job: 0,
        appliedBoost: false,
      },
      executiveScopeDensity: {
        baseline: 0,
        job: 0,
        appliedBoost: false,
      },
      strategicGuard: {
        leadershipLevel: 0,
        baselineExecutiveScopeDensity: 0,
        executiveScopeThreshold: 0,
        leadershipThreshold: 0,
        guardEnabled: false,
        tacticalSuppressionSkipped: false,
      },
      domainTagsBaselineOriginal: [],
      domainTagsRoleOriginal: [],
      domainTagsBaseline: [],
      domainTagsRole: ['SaaS'],
      baselineCoverageDetails: {
        originalBaselineChars: 1,
        includedBaselineChars: 0,
        coverageFormula: 'includedBaselineChars / originalBaselineChars',
        source: 'test',
        selectedSectionGateActive: false,
        selectedSectionCount: 0,
        normalizedBaselineChars: 12,
      },
      bundle: {
        evidence: {
          role_scope_and_seniority: {
            signals: ['shared_vectors=none'],
            snippets: [],
          },
        },
      },
      jobClusters: [],
      baselineClusters: [],
      sharedClusters: [],
      jobClusterHits: {},
      baselineClusterHits: {},
    } as unknown as CxFitV2DebugInfo;

    const result = computeConfidenceScore(debug);

    expect(result.confidenceScore).toBe(0);
    expect(result.confidenceReasons).toEqual([
      'baseline_text_insufficient',
      'baseline_coverage_very_low',
      'low_domain_overlap',
      'large_seniority_gap',
      'no_vectors',
    ]);
  });
});
