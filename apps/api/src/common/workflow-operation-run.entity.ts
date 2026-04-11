import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WorkflowOperationName =
  | 'analysis.run'
  | 'analysis.expanded_fit'
  | 'generation.resume'
  | 'generation.cover_letter';

export type WorkflowOperationStatus =
  | 'IN_FLIGHT'
  | 'COMPLETED'
  | 'FAILED'
  | 'STALE'
  | 'PERSISTENCE_CONFLICT';

@Entity({ name: 'workflow_operation_runs' })
@Index('UQ_workflow_operation_runs_scope', ['userId', 'operationName', 'dedupeKey'], {
  unique: true,
})
export class WorkflowOperationRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 64 })
  operationName!: WorkflowOperationName;

  @Column({ type: 'varchar', length: 255 })
  dedupeKey!: string;

  @Column({ type: 'varchar', length: 128 })
  runId!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: WorkflowOperationStatus;

  @Column({ type: 'jsonb', nullable: true })
  responseBody!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  errorCode!: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
