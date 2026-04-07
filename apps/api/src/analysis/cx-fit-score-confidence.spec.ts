import type { CxFitV2DebugInfo } from './cx-fit-scoring-v2';
import { assessScoreConfidence } from './cx-fit-scoring-v2';

function buildDebug(overrides: Partial<CxFitV2DebugInfo>): CxFitV2DebugInfo {
  return {
    jobScoringTextSource: 'raw',
    jobTextForScoring: 'cloud network engineer with BGP and datacenter networking',
    jobTextForScoringLength: 60,
    jobVectorsLength: 4,
    jobVectors: ['bgp', 'networking', 'linux', 'datacenter'],
    baselineVectors: ['bgp', 'networking', 'linux', 'datacenter'],
    sharedVectors: ['bgp', 'networking', 'linux'],
    transferableMatches: [],
    transferableCoveragePercent: 50,
    transferableContributionApplied: 5,
    transferableVectors: [],
    droppedTransferableMatches: [],
    unmatchedVectors: [],
    adjustedResponsibilityOverlapPercent: 32,
    baselineBand: 'L3',
    roleBand: 'L6',
    bandDelta: 3,
    domainTagsBaseline: ['Enterprise IT'],
    domainTagsRole: ['Enterprise IT'],
    domainTagsBaselineOriginal: ['Enterprise IT'],
    domainTagsRoleOriginal: ['Enterprise IT'],
    domainPercent: 58,
    responsibilityOverlapPercent: 28,
    baselineCoveragePercent: 62,
    baselineRecallPercent: 45,
    roleImpliedStrategyFloorApplied: false,
    originalStrategyRatioPercent: 20,
    flooredStrategyRatioPercent: 20,
    strategyMatchesJob: 2,
    originalAdvocacyRatioPercent: 10,
    flooredAdvocacyRatioPercent: 10,
    changeLeadershipAndAdvocacyPercentFloored: 30,
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
      requiredCoverage: 0.7,
      preferredCoverage: 0.3,
      claims: [],
    },
    platformGroups: {
      totalBoost: 8,
      evidence: [],
    },
    strategicDensity: {
      baseline: 0.01,
      job: 0.01,
      appliedBoost: false,
    },
    executiveScopeDensity: {
      baseline: 0.01,
      job: 0.01,
      appliedBoost: false,
    },
    strategicGuard: {
      leadershipLevel: 40,
      baselineExecutiveScopeDensity: 0.01,
      executiveScopeThreshold: 0.002,
      leadershipThreshold: 85,
      guardEnabled: false,
      tacticalSuppressionSkipped: false,
    },
    industryBundles: { evidence: [] },
    heuristicInference: {
      usedHeuristicInference: true,
      heuristicLiftTotal: 6,
      heuristicLiftByDimension: {
        role_scope_and_seniority: 0,
        support_operations_and_process_rigor: 1,
        tooling_and_platform_experience: 4,
        domain_and_business_context: 1,
        change_leadership_and_customer_advocacy: 0,
      },
      heuristicConfidenceSummary: { low: 1, medium: 1, high: 0 },
      heuristics: [],
    },
    jobClusters: [],
    baselineClusters: [],
    sharedClusters: [],
    jobClusterHits: {},
    baselineClusterHits: {},
    bundle: undefined,
    ...overrides,
  } as CxFitV2DebugInfo;
}

describe('assessScoreConfidence', () => {
  it('marks an adjacent low score as fix_first', () => {
    const result = assessScoreConfidence({
      score: 54,
      debug: buildDebug({}),
    });

    expect(result.scoreConfidence).toBe('low');
    expect(result.likelyUnderestimatedFit).toBe(true);
    expect(result.scorePresentationMode).toBe('fix_first');
  });

  it('keeps a strong direct-fit score in normal mode', () => {
    const result = assessScoreConfidence({
      score: 88,
      debug: buildDebug({
        responsibilityOverlapPercent: 88,
        adjustedResponsibilityOverlapPercent: 90,
        bandDelta: 0,
        heuristicInference: {
          usedHeuristicInference: false,
          heuristicLiftTotal: 0,
          heuristicLiftByDimension: {
            role_scope_and_seniority: 0,
            support_operations_and_process_rigor: 0,
            tooling_and_platform_experience: 0,
            domain_and_business_context: 0,
            change_leadership_and_customer_advocacy: 0,
          },
          heuristicConfidenceSummary: { low: 0, medium: 0, high: 0 },
          heuristics: [],
        },
      }),
    });

    expect(result.scoreConfidence).toBe('high');
    expect(result.scorePresentationMode).toBe('normal');
    expect(result.likelyUnderestimatedFit).toBe(false);
  });

  it('keeps an ambiguous case in caution mode', () => {
    const result = assessScoreConfidence({
      score: 73,
      debug: buildDebug({}),
    });

    expect(result.scoreConfidence).toBe('medium');
    expect(result.scorePresentationMode).toBe('caution');
  });
});
