import { ServiceUnavailableException } from '@nestjs/common';

export type TimeoutOperation =
  | 'analysis'
  | 'generation'
  | 'compute-expanded-fit'
  | 'request';

export type TimeoutResponseBody = {
  status: 'timeout';
  operation: TimeoutOperation;
  message: string;
  retryable: true;
};

export const GLOBAL_REQUEST_TIMEOUT_MS = 12_000;
export const OPERATION_TIMEOUT_MESSAGE =
  'This is taking longer than expected. Please try again.';

export function buildTimeoutResponseBody(
  operation: TimeoutOperation,
): TimeoutResponseBody {
  return {
    status: 'timeout',
    operation,
    message: OPERATION_TIMEOUT_MESSAGE,
    retryable: true,
  };
}

export function createTimeoutException(operation: TimeoutOperation) {
  return new ServiceUnavailableException({
    error: buildTimeoutResponseBody(operation),
  });
}

export async function withTimeout<T>(
  operation: TimeoutOperation,
  task: () => Promise<T>,
  timeoutMs = GLOBAL_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(createTimeoutException(operation));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function isTimeoutResponseBody(
  value: unknown,
): value is TimeoutResponseBody {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.status === 'timeout' &&
    typeof record.operation === 'string' &&
    typeof record.message === 'string' &&
    record.retryable === true
  );
}

export function resolveTimeoutOperation(path: string): TimeoutOperation {
  const normalized = path.toLowerCase();

  if (normalized.includes('/compute-expanded-fit')) {
    return 'compute-expanded-fit';
  }

  if (
    normalized.includes('/analysis/') ||
    normalized.endsWith('/analysis') ||
    normalized.includes('/analysis')
  ) {
    return 'analysis';
  }

  if (
    normalized.includes('/generate') ||
    normalized.includes('/resume/') ||
    normalized.includes('/cover-letters/')
  ) {
    return 'generation';
  }

  return 'request';
}
