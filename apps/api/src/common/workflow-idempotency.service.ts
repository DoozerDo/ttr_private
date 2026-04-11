import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WorkflowOperationName,
  WorkflowOperationRun,
} from './workflow-operation-run.entity';

export type WorkflowIdempotencyOutcomeStatus =
  | 'accepted_new'
  | 'existing_in_flight'
  | 'existing_completed'
  | 'rejected_stale'
  | 'persistence_conflict';

export type WorkflowIdempotencyReservation<TResponse = unknown> = {
  status: WorkflowIdempotencyOutcomeStatus;
  runId: string;
  dedupeKey: string;
  recordId: string;
  responseBody?: TResponse;
};

export type WorkflowIdempotencyCompleteResult = {
  status: 'completed' | 'rejected_stale' | 'persistence_conflict';
  recordId?: string;
};

@Injectable()
export class WorkflowIdempotencyService {
  private readonly logger = new Logger(WorkflowIdempotencyService.name);

  constructor(
    @InjectRepository(WorkflowOperationRun)
    private readonly workflowRunRepository: Repository<WorkflowOperationRun>,
  ) {}

  async reserve<TResponse = unknown>(input: {
    userId: string;
    operationName: WorkflowOperationName;
    dedupeKey: string;
    runId: string;
  }): Promise<WorkflowIdempotencyReservation<TResponse>> {
    const existing = await this.workflowRunRepository.findOne({
      where: {
        userId: input.userId,
        operationName: input.operationName,
        dedupeKey: input.dedupeKey,
      },
    });

    if (existing) {
      if (existing.status === 'COMPLETED') {
        return {
          status: 'existing_completed',
          runId: existing.runId,
          dedupeKey: input.dedupeKey,
          recordId: existing.id,
          responseBody: existing.responseBody as TResponse,
        };
      }

      if (existing.status === 'IN_FLIGHT') {
        return {
          status: 'existing_in_flight',
          runId: existing.runId,
          dedupeKey: input.dedupeKey,
          recordId: existing.id,
          responseBody: existing.responseBody as TResponse,
        };
      }

      existing.status = 'IN_FLIGHT';
      existing.runId = input.runId;
      existing.responseBody = null;
      existing.errorCode = null;
      existing.errorMessage = null;
      existing.completedAt = null;
      const updated = await this.workflowRunRepository.save(existing);
      this.log('accepted_new', {
        operationName: input.operationName,
        runId: input.runId,
        dedupeKey: input.dedupeKey,
        recordId: updated.id,
      });
      return {
        status: 'accepted_new',
        runId: input.runId,
        dedupeKey: input.dedupeKey,
        recordId: updated.id,
      };
    }

    const record = this.workflowRunRepository.create({
      userId: input.userId,
      operationName: input.operationName,
      dedupeKey: input.dedupeKey,
      runId: input.runId,
      status: 'IN_FLIGHT',
      responseBody: null,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
    });

    try {
      const saved = await this.workflowRunRepository.save(record);
      this.log('accepted_new', {
        operationName: input.operationName,
        runId: input.runId,
        dedupeKey: input.dedupeKey,
        recordId: saved.id,
      });
      return {
        status: 'accepted_new',
        runId: input.runId,
        dedupeKey: input.dedupeKey,
        recordId: saved.id,
      };
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const retryExisting = await this.workflowRunRepository.findOne({
          where: {
            userId: input.userId,
            operationName: input.operationName,
            dedupeKey: input.dedupeKey,
          },
        });
        if (retryExisting?.status === 'COMPLETED') {
          return {
            status: 'existing_completed',
            runId: retryExisting.runId,
            dedupeKey: input.dedupeKey,
            recordId: retryExisting.id,
            responseBody: retryExisting.responseBody as TResponse,
          };
        }
        if (retryExisting?.status === 'IN_FLIGHT') {
          return {
            status: 'existing_in_flight',
            runId: retryExisting.runId,
            dedupeKey: input.dedupeKey,
            recordId: retryExisting.id,
            responseBody: retryExisting.responseBody as TResponse,
          };
        }
        return {
          status: 'persistence_conflict',
          runId: input.runId,
          dedupeKey: input.dedupeKey,
          recordId: retryExisting?.id ?? 'unknown',
        };
      }
      throw error;
    }
  }

  async complete<TResponse = unknown>(input: {
    userId: string;
    operationName: WorkflowOperationName;
    dedupeKey: string;
    runId: string;
    responseBody: TResponse;
  }): Promise<WorkflowIdempotencyCompleteResult> {
    const result = await this.workflowRunRepository.update(
      {
        userId: input.userId,
        operationName: input.operationName,
        dedupeKey: input.dedupeKey,
        runId: input.runId,
      },
      {
        status: 'COMPLETED',
        responseBody: input.responseBody as any,
        errorCode: null,
        errorMessage: null,
        completedAt: new Date(),
      } as any,
    );

    if (result.affected && result.affected > 0) {
      return { status: 'completed' };
    }

    return { status: 'rejected_stale' };
  }

  async markFailure(input: {
    userId: string;
    operationName: WorkflowOperationName;
    dedupeKey: string;
    runId: string;
    status: 'FAILED' | 'STALE' | 'PERSISTENCE_CONFLICT';
    errorCode: string;
    errorMessage: string;
  }): Promise<WorkflowIdempotencyCompleteResult> {
    const result = await this.workflowRunRepository.update(
      {
        userId: input.userId,
        operationName: input.operationName,
        dedupeKey: input.dedupeKey,
        runId: input.runId,
      },
      {
        status: input.status,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      },
    );

    if (result.affected && result.affected > 0) {
      return { status: input.status === 'STALE' ? 'rejected_stale' : 'persistence_conflict' };
    }

    return { status: 'rejected_stale' };
  }

  private isUniqueConflict(error: unknown): boolean {
    return this.isQueryUniqueViolation(error);
  }

  private isQueryUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as Record<string, unknown>;
    const code = String(record['code'] ?? '').trim();
    return code === '23505';
  }

  private log(
    status: WorkflowIdempotencyOutcomeStatus,
    input: {
      operationName: WorkflowOperationName;
      runId: string;
      dedupeKey: string;
      recordId: string;
    },
  ) {
    if (process.env.NODE_ENV === 'production') return;
    this.logger.debug('[workflow-idempotency] event', {
      timestamp: new Date().toISOString(),
      status,
      ...input,
    });
  }
}
