import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowOperationRun } from './workflow-operation-run.entity';
import { WorkflowIdempotencyService } from './workflow-idempotency.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowOperationRun])],
  providers: [WorkflowIdempotencyService],
  exports: [WorkflowIdempotencyService],
})
export class WorkflowIdempotencyModule {}
