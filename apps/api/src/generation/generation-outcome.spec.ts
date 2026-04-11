import { BadRequestException } from '@nestjs/common';
import { buildTimeoutResponseBody } from '../common/timeout';
import {
  buildGenerationErrorOutcome,
  mapGenerationExceptionToOutcome,
} from './generation-outcome';

describe('generation-outcome', () => {
  it('maps timeout exceptions to generation_timeout', () => {
    const outcome = mapGenerationExceptionToOutcome({
      artifactType: 'resume',
      error: new BadRequestException({
        error: buildTimeoutResponseBody('generation'),
      }),
      runId: 'run-1',
    });

    expect(outcome).toMatchObject({
      status: 'error',
      code: 'generation_timeout',
      retryable: true,
      nextAction: 'retry_generation',
      artifactType: 'resume',
      runId: 'run-1',
    });
  });

  it('maps invalid pair state requests to invalid_pair_state', () => {
    const outcome = mapGenerationExceptionToOutcome({
      artifactType: 'cover_letter',
      error: new BadRequestException({
        error: {
          code: 'invalid_pair_state',
          message: 'Generation request does not match the analyzed context.',
        },
      }),
      runId: 'run-2',
    });

    expect(outcome).toMatchObject({
      status: 'error',
      code: 'invalid_pair_state',
      retryable: true,
      nextAction: 'review_results',
      artifactType: 'cover_letter',
      runId: 'run-2',
    });
  });

  it('builds a stable typed error outcome', () => {
    expect(
      buildGenerationErrorOutcome({
        artifactType: 'resume',
        code: 'artifact_persistence_failed',
        message: 'Could not persist the draft.',
        retryable: true,
      }),
    ).toMatchObject({
      status: 'error',
      code: 'artifact_persistence_failed',
      retryable: true,
      nextAction: 'retry_generation',
      artifactType: 'resume',
    });
  });

  it('maps duplicate in-flight generation to retry later', () => {
    const outcome = buildGenerationErrorOutcome({
      artifactType: 'cover_letter',
      code: 'generation_in_flight',
      message: 'A generation is already running.',
    });

    expect(outcome).toMatchObject({
      status: 'error',
      code: 'generation_in_flight',
      retryable: true,
      nextAction: 'retry_later',
      artifactType: 'cover_letter',
    });
  });
});
