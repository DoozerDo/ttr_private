import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';

type ValidateAnalysisContextInput = {
  analysisRepository: Repository<FitAssessment>;
  baselineVersionRepository: Repository<BaselineVersion>;
  analysisId: string;
  userId: string;
  jobId: string;
  baselineVersionId?: string | null;
  baselineId?: string | null;
};

type ContextDetails = {
  expected: {
    jobId: string | null;
    baselineId: string | null;
    baselineVersionId: string | null;
  };
  received: {
    jobId: string | null;
    baselineId: string | null;
    baselineVersionId: string | null;
  };
};

export type PersistedFitAssessmentReadModel = Pick<
  FitAssessment,
  | 'id'
  | 'userId'
  | 'jobId'
  | 'baselineId'
  | 'baselineVersion'
  | 'overallScore'
  | 'verdict'
  | 'dimensionScores'
  | 'strengths'
  | 'gaps'
  | 'complianceFlags'
  | 'confidenceScore'
  | 'confidenceReasons'
  | 'scoringReliability'
  | 'scoringReliabilityReason'
  | 'scoringV2'
  | 'inputsHash'
  | 'createdAt'
> & {
  jobAnalysis: null;
};

const persistedFitAssessmentReadModelSelect: string[] = [
  'assessment.id',
  'assessment.userId',
  'assessment.jobId',
  'assessment.baselineId',
  'assessment.baselineVersion',
  'assessment.overallScore',
  'assessment.verdict',
  'assessment.dimensionScores',
  'assessment.strengths',
  'assessment.gaps',
  'assessment.complianceFlags',
  'assessment.confidenceScore',
  'assessment.confidenceReasons',
  'assessment.scoringReliability',
  'assessment.scoringReliabilityReason',
  'assessment.scoringV2',
  'assessment.inputsHash',
  'assessment.createdAt',
] as const;

export function buildPersistedFitAssessmentReadModelQuery(
  repository: Repository<FitAssessment>,
  assessmentId: string,
  userId: string,
  jobId?: string,
  baselineId?: string,
) {
  const query = repository
    .createQueryBuilder('assessment')
    .select(persistedFitAssessmentReadModelSelect)
    .where('assessment.userId = :userId', { userId });

  if (assessmentId?.trim()) {
    query.andWhere('assessment.id = :assessmentId', { assessmentId });
  } else {
    query.orderBy('assessment.createdAt', 'DESC');
  }

  if (jobId) {
    query.andWhere('assessment.jobId = :jobId', { jobId });
  }

  if (baselineId) {
    query.andWhere('assessment.baselineId = :baselineId', { baselineId });
  }

  return query;
}

export async function loadPersistedFitAssessmentReadModel(
  repository: Repository<FitAssessment>,
  assessmentId: string,
  userId: string,
  jobId?: string,
  baselineId?: string,
): Promise<PersistedFitAssessmentReadModel | null> {
  const hasQueryBuilder = typeof (repository as any)?.createQueryBuilder === 'function';
  const assessment = hasQueryBuilder
    ? await buildPersistedFitAssessmentReadModelQuery(
        repository,
        assessmentId,
        userId,
        jobId,
        baselineId,
      ).getOne()
    : await repository.findOne?.({
        where: {
          ...(assessmentId?.trim() ? { id: assessmentId.trim() } : {}),
          userId,
          ...(jobId ? { jobId } : {}),
          ...(baselineId ? { baselineId } : {}),
        } as any,
      });

  return assessment ? { ...assessment, jobAnalysis: null } : null;
}

function throwTypedError(
  code:
    | 'analysis_context_mismatch'
    | 'analysis_not_found'
    | 'analysis_not_owned',
  message: string,
  details?: unknown,
): never {
  throw new BadRequestException({
    error: {
      code,
      message,
      details: details ?? null,
    },
  });
}

function buildContextDetails(
  expected: {
    jobId: string | null;
    baselineId: string | null;
    baselineVersionId: string | null;
  },
  received: {
    jobId: string | null;
    baselineId: string | null;
    baselineVersionId: string | null;
  },
): ContextDetails {
  return { expected, received };
}

export async function validateAnalysisContext({
  analysisRepository,
  baselineVersionRepository,
  analysisId,
  userId,
  jobId,
  baselineVersionId,
  baselineId,
}: ValidateAnalysisContextInput): Promise<FitAssessment> {
  const normalizedAnalysisId = analysisId.trim();
  const normalizedJobId = jobId?.trim() ?? '';
  const normalizedBaselineVersionId = baselineVersionId?.trim() ?? null;
  const normalizedBaselineId = baselineId?.trim() ?? null;
  if (!normalizedAnalysisId) {
    throwTypedError(
      'analysis_context_mismatch',
      'Generation request does not match the analyzed context.',
      buildContextDetails(
        {
          jobId: null,
          baselineId: null,
          baselineVersionId: null,
        },
        {
          jobId: normalizedJobId || null,
          baselineId: normalizedBaselineId,
          baselineVersionId: normalizedBaselineVersionId,
        },
      ),
    );
  }

  const assessment = await loadPersistedFitAssessmentReadModel(
    analysisRepository,
    normalizedAnalysisId,
    userId,
  );

  if (!assessment) {
    throwTypedError(
      'analysis_not_found',
      'Referenced analysis was not found.',
      { analysisId: normalizedAnalysisId },
    );
  }

  const analyzedBaselineVersion =
    typeof assessment.baselineVersion === 'number'
      ? await baselineVersionRepository.findOne({
          where: {
            baselineId: assessment.baselineId,
            versionNumber: assessment.baselineVersion,
          },
        })
      : null;

  const expectedContext = {
    jobId: assessment.jobId ?? null,
    baselineId: assessment.baselineId ?? null,
    baselineVersionId: analyzedBaselineVersion?.id ?? null,
  };
  const receivedContext = {
    jobId: normalizedJobId || null,
    baselineId: normalizedBaselineId,
    baselineVersionId: normalizedBaselineVersionId,
  };

  const baselineIdMismatch =
    Boolean(normalizedBaselineId) && assessment.baselineId !== normalizedBaselineId;
  const shouldCompareBaselineVersionId = Boolean(normalizedBaselineVersionId);
  const contextMismatch =
    assessment.jobId !== normalizedJobId ||
    (shouldCompareBaselineVersionId &&
      analyzedBaselineVersion?.id !== normalizedBaselineVersionId) ||
    baselineIdMismatch;

  if (contextMismatch) {
    throwTypedError(
      'analysis_context_mismatch',
      'Generation request does not match the analyzed context.',
      buildContextDetails(expectedContext, receivedContext),
    );
  }

  return assessment as FitAssessment;
}
