import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StudioArtifactLifecycleStatus {
  MISSING = 'MISSING',
  IN_PROGRESS = 'IN_PROGRESS',
  FAILED = 'FAILED',
  COMPLETED = 'COMPLETED',
}

@Entity({ name: 'studio_artifacts' })
@Index('UQ_studio_artifacts_scope', ['userId', 'baselineId', 'jobId'], {
  unique: true,
})
export class StudioArtifact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  baselineId!: string;

  @Column({ type: 'uuid' })
  jobId!: string;

  @Column({ type: 'uuid', nullable: true })
  baselineVersionId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  baselineVersionHash!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  jobFingerprint!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  generationContractVersion!: string | null;

  @Column({
    type: 'enum',
    enum: StudioArtifactLifecycleStatus,
    default: StudioArtifactLifecycleStatus.MISSING,
  })
  resumeStatus!: StudioArtifactLifecycleStatus;

  @Column({
    type: 'enum',
    enum: StudioArtifactLifecycleStatus,
    default: StudioArtifactLifecycleStatus.MISSING,
  })
  coverLetterStatus!: StudioArtifactLifecycleStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resumeInputsHash!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  coverLetterInputsHash!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  resumeResponseBody!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  coverLetterResponseBody!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  resumeContent!: string | null;

  @Column({ type: 'text', nullable: true })
  coverLetterContent!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resumeFailureCode!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  coverLetterFailureCode!: string | null;

  @Column({ type: 'text', nullable: true })
  resumeFailureMessage!: string | null;

  @Column({ type: 'text', nullable: true })
  coverLetterFailureMessage!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resumeGenerationStartedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  coverLetterGenerationStartedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resumeGeneratedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  coverLetterGeneratedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resumeFailedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  coverLetterFailedAt!: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  resumeMetadata!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  coverLetterMetadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
