import { DataSource } from 'typeorm';
import { ResumeService } from '../resume/resume.service';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
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
import { TemplateCoverLetterGenerator } from '../cover-letters/generators/template-cover-letter.generator';
import { assertCoverLetterArtifactIntegrity, assertResumeArtifactIntegrity } from './artifact-validation.harness';
import {
  dirtyResumeFixture,
  jdHeavyCoverLetterFixture,
  jdHeavyResumeFixture,
  minimalResumeFixture,
  overloadedResumeFixture,
  paragraphOnlyResumeFixture,
} from './artifact-validation.fixtures';

type MockRepo<T> = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
} & Partial<Record<keyof import('typeorm').Repository<T>, jest.Mock>>;

const createRepo = (value: unknown) => ({
  findOne: jest.fn().mockResolvedValue(value),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((payload: Record<string, unknown>) => payload),
  save: jest.fn(async (payload: Record<string, unknown>) => ({ ...payload, id: 'saved-1' })),
  remove: jest.fn(async (payload: unknown) => payload),
});

function buildResumeService(fixture: typeof dirtyResumeFixture) {
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
    verdict: 'APPLY' as never,
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

  const dataSource = {
    getRepository: jest.fn((entity) => {
      switch (entity?.name) {
        case 'Baseline':
          return createRepo(baseline);
        case 'BaselineVersion':
          return createRepo(baselineVersion);
        case 'BaselineBlockPolicy':
          return createRepo([]);
        case 'Job':
          return createRepo(job);
        case 'FitAssessment':
          return createRepo(assessment);
        default:
          throw new Error(`Unexpected repository request: ${entity?.name}`);
      }
    }),
  } as unknown as DataSource;

  const applicationsService = {
    upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({ id: 'tracker-1', status: 'Ready' }),
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
    createRepo(baseline) as never,
    createRepo(baselineVersion) as never,
    createRepo([]) as never,
    createRepo(job) as never,
    createRepo(assessment) as never,
    complianceService,
    applicationsService,
    opportunitiesService,
    gapAnalysisService,
    criticalFlowTrackerService,
  );
}

async function generateResume(fixture: typeof dirtyResumeFixture) {
  const service = buildResumeService(fixture);
  return service.generateResume(
    fixture.userId,
    {
      baselineId: fixture.baselineId,
      baselineVersionId: fixture.baselineVersionId,
      jobId: fixture.jobId,
      analysisId: fixture.analysisId,
      oneTap: false,
    },
    {
      enforceOneTap: false,
      skipReadinessGate: true,
    },
  );
}

function buildCleanCoverLetterArtifact() {
  return {
    preview: {
      coverLetter: {
        salutation: 'Dear Hiring Team,',
        opening: 'I am applying for the role.',
        bodyParagraphs: [
          'I have led support operations programs with grounded ownership and repeatable execution.',
          'I have improved escalation workflows and partnered with product and engineering teams on clear follow through.',
          'I would welcome the opportunity to discuss how this experience supports the role.',
        ],
        closingParagraph: 'Thank you for your consideration.',
        signoff: 'Sincerely,',
        signatureName: 'Jordan Lee',
      },
    },
    traceMap: {
      opening: ['e1'],
      body_1: ['e2'],
      body_2: ['e3'],
      closing: ['e4'],
    },
    debugTrace: {
      passed: true,
      failures: [],
      traceCoverage: 100,
      selectedEvidence: ['e1', 'e2', 'e3', 'e4'],
      unusedEvidence: [],
    },
  };
}

describe('artifact acceptance harness', () => {
  it('keeps adjacent resume roles isolated and bullets attached to the correct role', async () => {
    const result = await generateResume(dirtyResumeFixture);
    const audit = assertResumeArtifactIntegrity(result, {
      minimumBulletCount: 2,
      jdText: dirtyResumeFixture.jobDescription,
      forbiddenPhrases: ['Summary | Summary'],
    });

    expect(audit.passed).toBe(true);
    expect(result.preview.resume.experience).toHaveLength(2);
    expect(result.preview.resume.experience[0]?.bullets?.every((bullet) => !bullet.includes('\n'))).toBe(true);
    expect(result.preview.resume.experience[1]?.bullets?.every((bullet) => !bullet.includes('\n'))).toBe(true);
  });

  it('keeps minimal resume output structurally clean', async () => {
    const result = await generateResume(minimalResumeFixture);
    const audit = assertResumeArtifactIntegrity(result, {
      minimumBulletCount: 1,
      jdText: minimalResumeFixture.jobDescription,
    });

    expect(audit.passed).toBe(true);
    expect(result.preview.resume.experience.length).toBeGreaterThan(0);
  });

  it('keeps overloaded resume output free of duplicated or merged structures', async () => {
    const result = await generateResume(overloadedResumeFixture);
    const audit = assertResumeArtifactIntegrity(result, {
      minimumBulletCount: 3,
      jdText: overloadedResumeFixture.jobDescription,
    });

    expect(audit.passed).toBe(true);
    expect(audit.failures).toEqual([]);
    expect(result.preview.resume.experience?.[0]?.bullets?.length ?? 0).toBeGreaterThan(0);
  });

  it('keeps paragraph-only resume inputs unsupported', async () => {
    await expect(generateResume(paragraphOnlyResumeFixture as never)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('suppresses education duplication and token soup in the resume export path', async () => {
    const result = await generateResume(dirtyResumeFixture);
    expect(JSON.stringify(result.preview.resume.education ?? [])).not.toContain('| |');
    expect(JSON.stringify(result.preview.resume.education ?? [])).not.toMatch(/(?:Master of Science|B.S\.) \| \1/i);
  });

  it('accepts a clean cover letter structure with one greeting and one closing', () => {
    const artifact = buildCleanCoverLetterArtifact();
    const audit = assertCoverLetterArtifactIntegrity(artifact as never, {
      jdText: 'Support operations and escalation workflows.',
      maxJdOverlap: 8,
    });

    expect(audit.passed).toBe(true);
    expect(artifact.preview.coverLetter?.salutation).toBe('Dear Hiring Team,');
    expect(artifact.preview.coverLetter?.signoff).toBe('Sincerely,');
  });

  it('rejects the unsupported cover letter envelope cleanly', () => {
    const generator = new TemplateCoverLetterGenerator();
    expect(() => generator.generate(jdHeavyCoverLetterFixture)).toThrow(/unsupported_input/i);
  });

  it('keeps the JD-heavy resume fixture deterministic across runs', async () => {
    const first = await generateResume(jdHeavyResumeFixture);
    const second = await generateResume(jdHeavyResumeFixture);

    expect(JSON.stringify(first.traceMap)).toBe(JSON.stringify(second.traceMap));
    expect(JSON.stringify(first.debugTrace)).toBe(JSON.stringify(second.debugTrace));
  });
});
