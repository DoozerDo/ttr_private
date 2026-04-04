import { UnprocessableEntityException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ResumeService } from '../resume/resume.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineIncludePolicy, BaselineSection, BaselineSectionType } from '../baseline/baseline-section.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { ComplianceAction } from '../compliance/compliance.types';
import { ApplicationsService } from '../applications/applications.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { CriticalFlowTrackerService } from '../support/critical-flow-tracker.service';
import {
  assertResumeArtifactIntegrity,
  compareArtifactDeterminism,
} from './artifact-validation.harness';
import {
  dirtyResumeFixture,
  jdHeavyResumeFixture,
  minimalResumeFixture,
  overloadedResumeFixture,
  paragraphOnlyResumeFixture,
} from './artifact-validation.fixtures';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>> & {
  findOne: jest.Mock;
  find: jest.Mock;
};

const buildRepo = <T>(findOneValue: unknown): MockRepo<T> => ({
  findOne: jest.fn().mockResolvedValue(findOneValue),
  find: jest.fn().mockResolvedValue([]),
});

function buildService(fixture: typeof dirtyResumeFixture) {
  const baseline: Baseline = {
    id: fixture.baselineId,
    userId: fixture.userId,
    version: 1,
    originalFilename: 'resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    storagePath: '/tmp/resume.docx',
    hash: null,
    status: 'ACTIVE' as never,
    archivedAt: null,
    sections: fixture.baselineSections as BaselineSection[],
    parsedRecords: [],
    versions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baselineVersion: BaselineVersion = {
    id: fixture.baselineVersionId,
    baseline,
    baselineId: baseline.id,
    versionNumber: 1,
    fileHash: 'hash-1',
    hash: 'hash-1',
    allowedCompanies: [],
    allowedRoles: [],
    allowedTechnologies: [],
    allowedMetricTokens: [],
    verifiedAdditions: [],
    additionDiff: null,
    promotedFromInterviewId: null,
    blockPolicies: [],
    storagePath: '/tmp/version-1',
    createdAt: new Date(),
  };

  const job: Job = {
    id: fixture.jobId,
    userId: fixture.userId,
    title: fixture.job.title,
    company: fixture.job.company,
    rawDescription: fixture.job.rawDescription,
    sourceUrl: null,
    sourceProviderId: null,
    sourceExternalId: null,
    canonicalUrl: null,
    dedupeHash: null,
    normalizedResponsibilities: fixture.job.normalizedResponsibilities,
    normalizedRequirements: fixture.job.normalizedRequirements,
    jdIngestionMethod: JobIngestionMethod.PASTE,
    jdParsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    isArchived: false,
  };

  const assessment: FitAssessment = {
    id: fixture.assessment.id,
    userId: fixture.userId,
    jobId: fixture.jobId,
    baselineId: fixture.baselineId,
    baselineVersion: 1,
    overallScore: fixture.assessment.overallScore,
    verdict: 'APPLY' as any,
    dimensionScores: {
      experienceAlignment: 85,
      leadershipLevel: 88,
      technicalPlatformFit: 80,
      industryContext: 78,
      strategicTacticalFit: 82,
    },
    strengths: [],
    gaps: [],
    complianceFlags: [],
    scoringV2: null,
    inputsHash: null,
    isSynthetic: false,
    syntheticScenarioKey: null,
    syntheticRunId: null,
    syntheticCreatedAt: null,
    preserveFromCleanup: false,
    createdAt: new Date(),
  };

  const baselineRepo = buildRepo<Baseline>(baseline);
  const versionRepo = buildRepo<BaselineVersion>(baselineVersion);
  const policyRepo = buildRepo<BaselineBlockPolicy>([]);
  const jobRepo = buildRepo<Job>(job);
  const assessmentRepo = buildRepo<FitAssessment>(assessment);

  const complianceService = {
    normalizeSectionsForOutput: jest.fn().mockImplementation((sections) => sections),
    enforceResumeWritingRules: jest.fn().mockReturnValue([]),
    detectScopeInflation: jest.fn().mockResolvedValue([]),
    validateAndAudit: jest.fn().mockResolvedValue({
      complianceFlags: [],
      blocked: false,
      audit: {
        id: 'audit-1',
        baselineVersionId: baselineVersion.id,
        baselineVersionHash: baselineVersion.hash,
        outputHash: 'hash-output',
        action: ComplianceAction.RESUME_GENERATION,
        actorId: fixture.userId,
        jobId: fixture.jobId,
        createdAt: new Date().toISOString(),
      },
    }),
  } as never;

  const applicationsService = {
    upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({ id: 'tracker-1', status: 'Prepared' }),
  } as unknown as ApplicationsService;

  const opportunitiesService = {
    createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opp-1' }),
  } as unknown as OpportunitiesService;

  const gapAnalysisService = {
    analyze: jest.fn().mockReturnValue(null),
  } as unknown as GapAnalysisService;

  const criticalFlowTrackerService = {
    recordCriticalFlowEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as CriticalFlowTrackerService;

  return new ResumeService(
    baselineRepo as Repository<Baseline>,
    versionRepo as Repository<BaselineVersion>,
    policyRepo as Repository<BaselineBlockPolicy>,
    jobRepo as Repository<Job>,
    assessmentRepo as Repository<FitAssessment>,
    complianceService,
    applicationsService,
    opportunitiesService,
    gapAnalysisService,
    criticalFlowTrackerService,
  );
}

async function generateResume(fixture: typeof dirtyResumeFixture) {
  const service = buildService(fixture);
  return service.generateResume(fixture.userId, {
    baselineId: fixture.baselineId,
    baselineVersionId: fixture.baselineVersionId,
    jobId: fixture.jobId,
    analysisId: fixture.analysisId,
    oneTap: false,
  }, {
    enforceOneTap: false,
    skipReadinessGate: true,
  });
}

describe('resume end-to-end artifact validation', () => {
  it('passes the dirty resume fixture through the shared artifact harness', async () => {
    let result;
    try {
      result = await generateResume(dirtyResumeFixture);
    } catch (error) {
      const response = (error as UnprocessableEntityException & { getResponse?: () => unknown })
        .getResponse?.();
      // Diagnostic output for the failing trace path.
      // eslint-disable-next-line no-console
      console.log('resume-trace-debug', JSON.stringify(response, null, 2));
      throw error;
    }
    const audit = assertResumeArtifactIntegrity(result, {
      minimumBulletCount: 2,
      jdText: dirtyResumeFixture.jobDescription,
      forbiddenPhrases: ['Summary | Summary'],
    });

    expect(audit.passed).toBe(true);
    expect(result.traceMap).toBeDefined();
    expect(result.debugTrace.passed).toBe(true);
    expect(result.debugTrace.selectedEvidence.length).toBeGreaterThan(0);
  });

  it('passes the minimal resume fixture and preserves trace coverage', async () => {
    const result = await generateResume(minimalResumeFixture);
    const audit = assertResumeArtifactIntegrity(result, {
      minimumBulletCount: 1,
      jdText: minimalResumeFixture.jobDescription,
    });

    expect(audit.passed).toBe(true);
    expect(audit.traceCoverage).toBeGreaterThan(0);
  });

  it('passes the overloaded resume fixture while keeping traceability intact', async () => {
    const result = await generateResume(overloadedResumeFixture);
    const audit = assertResumeArtifactIntegrity(result, {
      minimumBulletCount: 3,
      jdText: overloadedResumeFixture.jobDescription,
    });

    expect(audit.passed).toBe(true);
    expect(Object.keys(result.traceMap).length).toBeGreaterThan(0);
  });

  it('rejects the paragraph-only resume fixture as structurally unsupported', async () => {
    await expect(generateResume(paragraphOnlyResumeFixture)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('keeps trace audit deterministic across repeated runs', async () => {
    const first = await generateResume(jdHeavyResumeFixture);
    const second = await generateResume(jdHeavyResumeFixture);

    expect(compareArtifactDeterminism(first.traceMap, second.traceMap)).toBe(true);
    expect(compareArtifactDeterminism(first.debugTrace, second.debugTrace)).toBe(true);
  });

  it('rejects invalid output when trace mapping is missing', () => {
    const audit = assertResumeArtifactIntegrity({
      traceMap: { 'experience:0:0': [] },
      debugTrace: {
        passed: false,
        failures: ['Line experience:0:0 has no source evidence.'],
        traceCoverage: 0,
        unusedEvidence: [],
        selectedEvidence: [],
      },
      preview: {
        resume: {
          experience: [{ bullets: ['Missing mapping'] }],
          education: [],
          competencies: [],
          coreCompetencies: [],
          additionalSections: [],
        },
      },
    });

    expect(audit.passed).toBe(false);
    expect(audit.failures.join(' ')).toContain('no trace mapping');
  });
});
