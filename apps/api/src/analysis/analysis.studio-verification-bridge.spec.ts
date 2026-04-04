import { AnalysisService } from './analysis.service';
import { BaselineIncludePolicy } from '../baseline/baseline-section.entity';
import { JobIngestionMethod } from '../jobs/job.entity';
import { FitAssessmentVerdict } from './fit-assessment.entity';

describe('AnalysisService Studio verification payload bridge', () => {
  it('returns refreshed tooling claims so Salesforce is verified and not unresolved in fit-assessment payload', async () => {
    const baselineRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'b-1',
        userId: 'user-1',
        sections: [
          {
            id: 's-1',
            baselineId: 'b-1',
            sectionType: 'EXPERIENCE',
            type: 'EXPERIENCE',
            title: 'Experience',
            content: 'Owned case routing and administration in Salesforce Service Cloud.',
            includePolicy: BaselineIncludePolicy.OPTIONAL,
            order: 0,
          },
        ],
        parsedRecords: [],
      }),
    };
    const baselineSectionRepository = {
      find: jest.fn().mockResolvedValue([
        {
          baselineId: 'b-1',
          sectionType: 'EXPERIENCE',
          type: 'EXPERIENCE',
          title: 'Experience',
          content: 'Owned case routing and administration in Salesforce Service Cloud.',
          includePolicy: BaselineIncludePolicy.OPTIONAL,
          order: 0,
        },
      ]),
    };
    const baselineBlockPolicyRepository = { find: jest.fn() };
    const baselineVersionRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const jobRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'job-1',
        userId: 'user-1',
        rawDescription: 'Must have Salesforce experience for this role.',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        jdIngestionMethod: JobIngestionMethod.PASTE,
      }),
    };
    const interviewRepository = { findOne: jest.fn() };
    const fitAssessmentRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'fit-1',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: 1,
        overallScore: 80,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 80,
          leadershipLevel: 80,
          technicalPlatformFit: 80,
          industryContext: 80,
          strategicTacticalFit: 80,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        confidenceScore: null,
        confidenceReasons: [],
        createdAt: new Date(),
        scoringV2: {
          score: 80,
          rubric: {
            id: 'scoring_contract_v1',
            weights: {
              role_scope_and_seniority: 25,
              support_operations_and_process_rigor: 25,
              tooling_and_platform_experience: 20,
              domain_and_business_context: 15,
              change_leadership_and_customer_advocacy: 15,
            },
            dimensionPercents: {
              role_scope_and_seniority: 80,
              support_operations_and_process_rigor: 80,
              tooling_and_platform_experience: 80,
              domain_and_business_context: 80,
              change_leadership_and_customer_advocacy: 80,
            },
            dimensionPoints: {
              role_scope_and_seniority: 20,
              support_operations_and_process_rigor: 20,
              tooling_and_platform_experience: 16,
              domain_and_business_context: 12,
              change_leadership_and_customer_advocacy: 12,
            },
            subtotal: 80,
            penalties: [],
            finalBeforeClamp: 80,
            rounding: 'round_half_up_final_only',
          },
          debug: {
            jobScoringTextSource: 'raw',
            baselineBand: 'L4',
            roleBand: 'L4',
            bandDelta: 0,
            domainTagsBaseline: [],
            domainTagsRole: [],
            responsibilityOverlapPercent: 0,
            baselineCoveragePercent: 0,
            toolingCoverage: {
              requiredCoverage: 0,
              preferredCoverage: 0,
              claims: [
                {
                  key: 'salesforce',
                  label: 'salesforce',
                  category: 'platform',
                  sourceType: 'job_required',
                  status: 'UNVERIFIED',
                  evidenceRefs: [],
                  generationBlocking: true,
                  scoreWeight: 0,
                },
              ],
            },
          },
        },
      }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const expandedFitAssessmentRepository = { create: jest.fn(), save: jest.fn() };
    const usersRepository = { findOne: jest.fn(), update: jest.fn() };
    const fitScoringService = { score: jest.fn() };
    const complianceService = {
      normalizeSectionsForOutput: jest.fn().mockImplementation((sections: unknown) => sections),
      validateAndAudit: jest.fn(),
    };
    const gapAnalysisService = {
      analyze: jest.fn().mockResolvedValue({
        strengths: [],
        criticalGaps: [],
        recommendedActions: [],
        positioningSuggestions: [],
        interviewRisks: [],
      }),
    };

    const service = new AnalysisService(
      baselineRepository as any,
      baselineSectionRepository as any,
      baselineBlockPolicyRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      interviewRepository as any,
      fitAssessmentRepository as any,
      expandedFitAssessmentRepository as any,
      usersRepository as any,
      fitScoringService as any,
      complianceService as any,
      gapAnalysisService as any,
    );

    const payload = await service.getFitAssessmentById('user-1', 'fit-1');
    const claims = payload.scoring_v2?.debug?.toolingCoverage?.claims ?? [];
    const salesforce = claims.find((claim: { key: string }) => claim.key === 'salesforce');

    expect(salesforce?.status).toBe('VERIFIED');
    const unresolved = claims.filter((claim: { status: string }) => claim.status !== 'VERIFIED');
    expect(unresolved.some((claim: { key: string }) => claim.key === 'salesforce')).toBe(false);
    const verifiedClaims = claims.filter((claim: { status: string }) => claim.status === 'VERIFIED').length;
    expect(verifiedClaims).toBeGreaterThan(0);
  });
});
