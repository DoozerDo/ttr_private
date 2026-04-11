import { WorkflowIdempotencyService } from './workflow-idempotency.service';
import type { Repository } from 'typeorm';
import type { WorkflowOperationRun } from './workflow-operation-run.entity';

describe('WorkflowIdempotencyService', () => {
  const buildRepo = () =>
    ({
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn((value) => value),
    }) as unknown as jest.Mocked<Repository<WorkflowOperationRun>>;

  it('reserves a new request when no duplicate exists', async () => {
    const repo = buildRepo();
    repo.findOne.mockResolvedValue(null);
    repo.save.mockResolvedValue({
      id: 'run-row-1',
      userId: 'user-1',
      operationName: 'analysis.run',
      dedupeKey: 'dedupe-1',
      runId: 'run-1',
      status: 'IN_FLIGHT',
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as WorkflowOperationRun);

    const service = new WorkflowIdempotencyService(repo);
    const result = await service.reserve({
      userId: 'user-1',
      operationName: 'analysis.run',
      dedupeKey: 'dedupe-1',
      runId: 'run-1',
    });

    expect(result.status).toBe('accepted_new');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('reuses a completed request instead of accepting a duplicate', async () => {
    const repo = buildRepo();
    repo.findOne.mockResolvedValue({
      id: 'run-row-1',
      userId: 'user-1',
      operationName: 'analysis.run',
      dedupeKey: 'dedupe-1',
      runId: 'run-1',
      status: 'COMPLETED',
      responseBody: { status: 'success', code: 'ok' },
      errorCode: null,
      errorMessage: null,
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as WorkflowOperationRun);

    const service = new WorkflowIdempotencyService(repo);
    const result = await service.reserve({
      userId: 'user-1',
      operationName: 'analysis.run',
      dedupeKey: 'dedupe-1',
      runId: 'run-2',
    });

    expect(result.status).toBe('existing_completed');
    expect(result.responseBody).toEqual({ status: 'success', code: 'ok' });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('marks completion only when the request run matches', async () => {
    const repo = buildRepo();
    repo.update.mockResolvedValue({ affected: 1 } as never);

    const service = new WorkflowIdempotencyService(repo);
    const result = await service.complete({
      userId: 'user-1',
      operationName: 'generation.resume',
      dedupeKey: 'dedupe-1',
      runId: 'run-1',
      responseBody: { ok: true },
    });

    expect(result.status).toBe('completed');
    expect(repo.update).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        operationName: 'generation.resume',
        dedupeKey: 'dedupe-1',
        runId: 'run-1',
      },
      expect.objectContaining({
        status: 'COMPLETED',
      }),
    );
  });
});
