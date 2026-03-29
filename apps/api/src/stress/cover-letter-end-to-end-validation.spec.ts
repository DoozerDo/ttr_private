import { DataSource } from 'typeorm';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { ComplianceAction } from '../compliance/compliance.types';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { assertCoverLetterArtifactIntegrity } from './artifact-validation.harness';
import { dirtyResumeFixture, jdHeavyCoverLetterFixture } from './artifact-validation.fixtures';

const createRepo = (value: unknown) => ({
  findOne: jest.fn().mockResolvedValue(value),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((payload: Record<string, unknown>) => payload),
  save: jest.fn(async (payload: Record<string, unknown>) => ({ ...payload, id: 'saved-1' })),
  remove: jest.fn(async (payload: unknown) => payload),
});

function buildCoverLettersService(fixture = jdHeavyCoverLetterFixture) {
  const baseline: Partial<Baseline> = {
    id: fixture.baselineId,
    userId: 'user-1',
    sections: fixture.allowedBaselineBlocks.map((block) => ({
      id: block.id,
      title: block.title,
      content: block.content,
      includePolicy: block.includePolicy,
      order: block.order,
      sectionType: block.sectionType,
    })) as never,
    parsedRecords: [],
  };

  const baselineVersion: Partial<BaselineVersion> = {
    id: 'baseline-version-1',
    baselineId: fixture.baselineId,
    hash: 'hash-1',
  };

  const assessment: Partial<FitAssessment> = {
    id: 'analysis-1',
    userId: 'user-1',
    jobId: fixture.jobId,
    baselineId: fixture.baselineId,
    overallScore: 88,
    baselineVersion: 1,
  };

  const job: Partial<Job> = {
    id: fixture.job.id,
    userId: 'user-1',
    title: fixture.job.title,
    company: fixture.job.company,
    normalizedResponsibilities: fixture.job.responsibilities,
    normalizedRequirements: fixture.job.requirements,
  };

  const dataSource = {
    getRepository: jest.fn((entity) => {
      switch (entity?.name) {
        case 'CoverLetter':
          return createRepo(null);
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

  const complianceService = {
    normalizeText: jest.fn((value: string) => value),
    enforceResumeWritingRules: jest.fn().mockReturnValue([]),
    detectScopeInflation: jest.fn().mockResolvedValue([]),
    validateAndAudit: jest.fn().mockResolvedValue({
      complianceFlags: [],
      blocked: false,
      audit: {
        id: 'audit-1',
        baselineVersionHash: 'hash-1',
        action: ComplianceAction.COVER_LETTER_GENERATION,
      },
    }),
    normalizeSectionsForOutput: jest.fn().mockImplementation((sections) => sections),
  };

  const gapAnalysis = {
    analyze: jest.fn().mockReturnValue({ strengths: [], criticalGaps: [] }),
  } as unknown as GapAnalysisService;

  return new CoverLettersService(dataSource, complianceService as never, gapAnalysis);
}

describe('cover letter end-to-end artifact validation', () => {
  it('rejects the JD-heavy cover letter fixture as unsupported under the current envelope', async () => {
    const service = buildCoverLettersService();
    await expect(
      service.generateCoverLetter('user-1', {
        baselineId: jdHeavyCoverLetterFixture.baselineId,
        baselineVersionId: 'baseline-version-1',
        jobId: jdHeavyCoverLetterFixture.jobId,
        analysisId: 'analysis-1',
      } as never),
    ).rejects.toMatchObject({
      status: 422,
    });
  });

  it('flags trace failures when a cover letter line is missing evidence', () => {
    const audit = assertCoverLetterArtifactIntegrity({
      traceMap: { opening: [] },
      debugTrace: {
        passed: false,
        failures: ['Line opening has no source evidence.'],
        traceCoverage: 0,
        unusedEvidence: [],
        selectedEvidence: [],
      },
      preview: {
        coverLetter: {
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.', 'Body three.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
      },
    });

    expect(audit.passed).toBe(false);
    expect(audit.failures.join(' ')).toContain('no trace mapping');
  });

  it('keeps unsupported cover letter failure behavior deterministic across repeated runs', async () => {
    const service = buildCoverLettersService(jdHeavyCoverLetterFixture);
    const request = {
      baselineId: jdHeavyCoverLetterFixture.baselineId,
      baselineVersionId: 'baseline-version-1',
      jobId: jdHeavyCoverLetterFixture.jobId,
      analysisId: 'analysis-1',
    } as never;
    await expect(service.generateCoverLetter('user-1', request)).rejects.toMatchObject({ status: 422 });
    await expect(service.generateCoverLetter('user-1', request)).rejects.toMatchObject({ status: 422 });
  });
});
