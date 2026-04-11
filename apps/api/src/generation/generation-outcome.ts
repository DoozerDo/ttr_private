import { HttpException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isTimeoutResponseBody } from '../common/timeout';

export type GenerationArtifactType = 'resume' | 'cover_letter';

export type GenerationSuccessCode =
  | 'generation_ready'
  | 'draft_generated'
  | 'artifact_updated'
  | 'duplicate_request_reused';

export type GenerationErrorCode =
  | 'generation_blocked'
  | 'insufficient_verified_evidence'
  | 'invalid_pair_state'
  | 'studio_not_ready'
  | 'generation_timeout'
  | 'generation_failed'
  | 'unsupported_input'
  | 'artifact_persistence_failed'
  | 'baseline_not_found'
  | 'target_context_missing'
  | 'baseline_version_mismatch'
  | 'computation_timeout'
  | 'computation_failed'
  | 'generation_in_flight'
  | 'stale_request_ignored'
  | 'artifact_write_conflict';

export type GenerationNextAction =
  | 'review_draft'
  | 'retry_generation'
  | 'retry_later'
  | 'review_results'
  | 'fix_input'
  | 'return_to_baseline'
  | 'return_to_results';

export type GenerationOutcomeBase = {
  artifactType: GenerationArtifactType;
  runId: string;
  message: string;
  retryable: boolean;
  nextAction: GenerationNextAction;
};

export type GenerationSuccessOutcome<TPayload = unknown> = GenerationOutcomeBase & {
  status: 'success';
  code: GenerationSuccessCode;
  payload: TPayload;
};

export type GenerationErrorOutcome = GenerationOutcomeBase & {
  status: 'error';
  code: GenerationErrorCode;
  payload?: Record<string, unknown>;
};

export type GenerationOutcome<TPayload = unknown> =
  | GenerationSuccessOutcome<TPayload>
  | GenerationErrorOutcome;

export function createGenerationRunId() {
  return randomUUID();
}

export function isGenerationOutcomePayload(value: unknown): value is GenerationOutcome {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    (record.status === 'success' || record.status === 'error') &&
    typeof record.code === 'string' &&
    typeof record.message === 'string' &&
    typeof record.runId === 'string' &&
    typeof record.artifactType === 'string'
  );
}

function readExceptionResponse(error: HttpException): Record<string, unknown> | null {
  const response = error.getResponse();
  if (!response || typeof response !== 'object') return null;
  return response as Record<string, unknown>;
}

function readNestedRecord(
  value: unknown,
  keys: string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (candidate && typeof candidate === 'object') {
      return candidate as Record<string, unknown>;
    }
  }
  return record;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isDatabaseFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const message = `${readString(record.message)} ${readString(record.detail)} ${readString(record.code)}`.toLowerCase();
  return /sql|typeorm|database|unique constraint|duplicate key|foreign key|deadlock|econnreset|etimedout|persist/i.test(
    message,
  );
}

function mapReasonFromHttpStatus(status: number, message: string, payload: Record<string, unknown> | null): GenerationErrorCode {
  const loweredMessage = message.toLowerCase();
  const loweredCode = readString(payload?.code).toLowerCase();
  const loweredStatus = readString(payload?.status).toLowerCase();
  const loweredErrorCode = readString(payload?.error && typeof payload.error === 'object' ? (payload.error as Record<string, unknown>).code : undefined).toLowerCase();

  if (loweredStatus === 'timeout' || loweredErrorCode === 'timeout') {
    return 'generation_timeout';
  }
  if (loweredCode === 'generation_timeout') {
    return 'generation_timeout';
  }
  if (loweredCode === 'unsupported_input' || loweredErrorCode === 'unsupported_input') {
    return 'unsupported_input';
  }
  if (loweredCode === 'generation_blocked' || loweredErrorCode === 'generation_blocked') {
    return 'generation_blocked';
  }
  if (loweredCode === 'generation_in_flight' || loweredErrorCode === 'generation_in_flight') {
    return 'generation_in_flight';
  }
  if (loweredCode === 'stale_request_ignored' || loweredErrorCode === 'stale_request_ignored') {
    return 'stale_request_ignored';
  }
  if (loweredCode === 'artifact_persistence_failed') {
    return 'artifact_persistence_failed';
  }
  if (loweredCode === 'artifact_write_conflict' || loweredErrorCode === 'artifact_write_conflict') {
    return 'artifact_write_conflict';
  }
  if (loweredCode === 'analysis_context_mismatch' || loweredErrorCode === 'analysis_context_mismatch') {
    return 'invalid_pair_state';
  }
  if (loweredCode === 'studio_not_ready' || loweredErrorCode === 'studio_not_ready') {
    return 'studio_not_ready';
  }
  if (loweredCode === 'target_context_missing' || loweredErrorCode === 'target_context_missing') {
    return 'target_context_missing' as GenerationErrorCode;
  }
  if (loweredMessage.includes('baseline version') && loweredMessage.includes('not found')) {
    return 'baseline_version_mismatch';
  }
  if (loweredMessage.includes('baseline not found')) {
    return 'baseline_not_found';
  }
  if (loweredMessage.includes('job not found')) {
    return 'target_context_missing';
  }
  if (loweredMessage.includes('baselineid is required') || loweredMessage.includes('baselineversionid is required')) {
    return 'studio_not_ready';
  }
  if (loweredMessage.includes('jobid is required')) {
    return 'target_context_missing';
  }
  if (loweredMessage.includes('analysisid is required') || loweredMessage.includes('does not match the analyzed context')) {
    return 'invalid_pair_state';
  }
  if (loweredMessage.includes('invalid user context')) {
    return 'studio_not_ready';
  }
  if (status === 404) {
    return 'invalid_pair_state';
  }
  if (isDatabaseFailure({ message, code: loweredCode, detail: '' })) {
    return 'artifact_persistence_failed';
  }
  return 'generation_failed';
}

function buildErrorOutcomeBase(
  artifactType: GenerationArtifactType,
  runId: string,
  code: GenerationErrorCode,
  message: string,
  retryable: boolean,
  nextAction: GenerationNextAction,
  payload?: Record<string, unknown>,
): GenerationErrorOutcome {
  return {
    status: 'error',
    code,
    message,
    retryable,
    nextAction,
    artifactType,
    runId,
    ...(payload ? { payload } : {}),
  };
}

export function buildGenerationSuccessOutcome<TPayload>(params: {
  artifactType: GenerationArtifactType;
  runId?: string;
  code?: GenerationSuccessCode;
  message: string;
  nextAction: GenerationNextAction;
  payload: TPayload;
}): GenerationSuccessOutcome<TPayload> {
  return {
    status: 'success',
    code: params.code ?? 'draft_generated',
    message: params.message,
    retryable: false,
    nextAction: params.nextAction,
    artifactType: params.artifactType,
    runId: params.runId ?? createGenerationRunId(),
    payload: params.payload,
  };
}

export function buildGenerationErrorOutcome(params: {
  artifactType: GenerationArtifactType;
  runId?: string;
  code: GenerationErrorCode;
  message: string;
  retryable?: boolean;
  nextAction?: GenerationNextAction;
  payload?: Record<string, unknown>;
}): GenerationErrorOutcome {
  const retryable =
    params.retryable ??
    [
      'generation_timeout',
      'artifact_persistence_failed',
      'artifact_write_conflict',
      'generation_failed',
      'computation_timeout',
      'computation_failed',
      'generation_in_flight',
      'stale_request_ignored',
    ].includes(params.code);
  return buildErrorOutcomeBase(
    params.artifactType,
    params.runId ?? createGenerationRunId(),
    params.code,
    params.message,
    retryable,
    params.nextAction ??
      (params.code === 'generation_timeout' ||
      params.code === 'generation_failed' ||
      params.code === 'artifact_persistence_failed' ||
      params.code === 'artifact_write_conflict' ||
      params.code === 'computation_timeout' ||
      params.code === 'computation_failed'
        ? 'retry_generation'
        : params.code === 'generation_blocked' || params.code === 'insufficient_verified_evidence' || params.code === 'studio_not_ready'
          ? 'review_results'
          : params.code === 'generation_in_flight' || params.code === 'stale_request_ignored'
            ? 'retry_later'
          : params.code === 'unsupported_input'
            ? 'fix_input'
            : params.code === 'baseline_not_found' || params.code === 'baseline_version_mismatch'
              ? 'return_to_baseline'
              : 'return_to_results'),
    params.payload,
  );
}

export function mapGenerationExceptionToOutcome(params: {
  artifactType: GenerationArtifactType;
  error: unknown;
  runId?: string;
}): GenerationOutcome {
  const runId = params.runId ?? createGenerationRunId();
  const error = params.error;

  if (isTimeoutResponseBody(error)) {
    return buildGenerationErrorOutcome({
      artifactType: params.artifactType,
      runId,
      code: 'generation_timeout',
      message: error.message,
      retryable: true,
      nextAction: 'retry_generation',
      payload: { error },
    });
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    const response = readExceptionResponse(error);
    const candidate = readNestedRecord(response, ['error', 'response', 'details']) ?? response;
    const responseError =
      response && typeof response.error === 'object'
        ? (response.error as Record<string, unknown>)
        : null;
    const nestedTimeout = responseError ? isTimeoutResponseBody(responseError) : false;
    if (nestedTimeout || isTimeoutResponseBody(candidate)) {
      const timeoutMessage =
        nestedTimeout && responseError
          ? String(responseError.message ?? 'This is taking longer than expected. Please try again.')
          : typeof candidate?.message === 'string'
            ? candidate.message
            : 'This is taking longer than expected. Please try again.';
      return buildGenerationErrorOutcome({
        artifactType: params.artifactType,
        runId,
        code: 'generation_timeout',
        message: timeoutMessage,
        retryable: true,
        nextAction: 'retry_generation',
        payload: response ?? undefined,
      });
    }
    const message = readString(candidate?.message) || error.message || 'Generation failed.';
    const code = mapReasonFromHttpStatus(status, message, response);

    return buildGenerationErrorOutcome({
      artifactType: params.artifactType,
      runId,
      code,
      message,
      retryable:
        code === 'generation_timeout' ||
        code === 'artifact_persistence_failed' ||
        code === 'generation_failed' ||
        code === 'invalid_pair_state',
      nextAction:
        code === 'generation_timeout' || code === 'generation_failed' || code === 'artifact_persistence_failed'
          ? 'retry_generation'
          : code === 'unsupported_input'
            ? 'fix_input'
            : code === 'baseline_not_found' || code === 'baseline_version_mismatch'
              ? 'return_to_baseline'
              : 'review_results',
      payload: response ?? undefined,
    });
  }

  if (isDatabaseFailure(error)) {
    const message = error instanceof Error && error.message ? error.message : 'Generation could not be saved.';
    return buildGenerationErrorOutcome({
      artifactType: params.artifactType,
      runId,
      code: 'artifact_persistence_failed',
      message,
      retryable: true,
      nextAction: 'retry_generation',
      payload: error instanceof Error ? { message: error.message, name: error.name } : undefined,
    });
  }

  const message = error instanceof Error && error.message ? error.message : 'Generation failed.';
  return buildGenerationErrorOutcome({
    artifactType: params.artifactType,
    runId,
    code: 'generation_failed',
    message,
    retryable: true,
    nextAction: 'retry_generation',
    payload: error instanceof Error ? { message: error.message, name: error.name } : undefined,
  });
}
