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
  baselineVersionId: string;
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
  const normalizedBaselineVersionId = baselineVersionId?.trim() ?? '';
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
          baselineVersionId: normalizedBaselineVersionId || null,
        },
      ),
    );
  }

  const assessment = await analysisRepository.findOne({
    where: { id: normalizedAnalysisId },
  });

  if (!assessment) {
    throwTypedError(
      'analysis_not_found',
      'Referenced analysis was not found.',
      { analysisId: normalizedAnalysisId },
    );
  }

  if (assessment.userId !== userId) {
    throwTypedError(
      'analysis_not_owned',
      'Referenced analysis does not belong to this user.',
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
    baselineVersionId: normalizedBaselineVersionId || null,
  };

  const baselineIdMismatch =
    Boolean(normalizedBaselineId) && assessment.baselineId !== normalizedBaselineId;
  const contextMismatch =
    assessment.jobId !== normalizedJobId ||
    analyzedBaselineVersion?.id !== normalizedBaselineVersionId ||
    baselineIdMismatch;

  if (contextMismatch) {
    throwTypedError(
      'analysis_context_mismatch',
      'Generation request does not match the analyzed context.',
      buildContextDetails(expectedContext, receivedContext),
    );
  }

  return assessment;
}
