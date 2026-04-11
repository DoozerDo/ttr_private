import { ServiceUnavailableException } from '@nestjs/common';
import {
  buildTimeoutResponseBody,
  createTimeoutException,
  resolveTimeoutOperation,
  withTimeout,
} from './timeout';

describe('timeout helpers', () => {
  it('builds a typed timeout response body', () => {
    expect(buildTimeoutResponseBody('analysis')).toEqual({
      status: 'timeout',
      operation: 'analysis',
      message: 'This is taking longer than expected. Please try again.',
      retryable: true,
    });
  });

  it('maps request paths to timeout operations', () => {
    expect(resolveTimeoutOperation('/api/interview-records/abc/compute-expanded-fit')).toBe(
      'compute-expanded-fit',
    );
    expect(resolveTimeoutOperation('/api/analysis/run')).toBe('analysis');
    expect(resolveTimeoutOperation('/api/resume/generate')).toBe('generation');
  });

  it('throws a typed service unavailable exception on timeout', async () => {
    jest.useFakeTimers();

    const promise = withTimeout(
      'analysis',
      () => new Promise<never>(() => {}),
      5,
    );

    const assertion = expect(promise).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await jest.advanceTimersByTimeAsync(10);
    await assertion;

    await expect(promise).rejects.toMatchObject({
      response: {
        error: {
          status: 'timeout',
          operation: 'analysis',
          retryable: true,
        },
      },
    });

    jest.useRealTimers();
  });

  it('creates a typed timeout exception payload', () => {
    const exception = createTimeoutException('generation');
    expect(exception.getResponse()).toEqual({
      error: {
        status: 'timeout',
        operation: 'generation',
        message: 'This is taking longer than expected. Please try again.',
        retryable: true,
      },
    });
  });
});
