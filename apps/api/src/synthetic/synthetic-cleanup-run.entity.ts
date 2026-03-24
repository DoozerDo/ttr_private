import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SyntheticRunType = 'cleanup' | 'synthetic_transaction';
export type SyntheticCleanupRunStatus =
  | 'started'
  | 'dry_run'
  | 'succeeded'
  | 'failed';
export type SyntheticCleanupTriggerSource = 'cron' | 'manual' | 'system';

@Entity({ name: 'synthetic_cleanup_runs' })
@Index('IDX_synthetic_cleanup_runs_started_at', ['startedAt'])
export class SyntheticCleanupRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  runType!: SyntheticRunType;

  @Column({ type: 'varchar', length: 128, nullable: true })
  scenarioKey!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  syntheticRunId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: SyntheticCleanupRunStatus;

  @Column({ type: 'varchar', length: 32 })
  triggerSource!: SyntheticCleanupTriggerSource;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'integer', nullable: true })
  durationMs!: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  summaryJson!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  stepResultsJson!: Array<Record<string, unknown>>;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;
}
