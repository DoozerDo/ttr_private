import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ApplicationStage {
  SAVED = 'SAVED',
  APPLIED = 'APPLIED',
  SCREENING = 'SCREENING',
  INTERVIEWING = 'INTERVIEWING',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum ApplicationTrackerStatus {
  PREPARED = 'Prepared',
  APPLIED = 'Applied',
}

export type ResumeArtifactRecord = {
  resumeArtifactId: string;
  type: 'resume' | 'cover';
  createdAt: string;
  exportFormat?: string | null;
};

@Entity({ name: 'applications' })
@Index('IDX_applications_userId', ['userId'])
@Index('IDX_applications_jobId', ['jobId'])
@Index('IDX_applications_status', ['status'])
@Index('IDX_applications_lastTouchedAt', ['lastTouchedAt'])
@Index('UQ_applications_user_fingerprint', ['userId', 'fingerprint'], {
  unique: true,
})
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  jobId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  company!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  jobUrl!: string | null;

  @Column({ type: 'varchar', length: 255 })
  fingerprint!: string;

  @Column({
    type: 'enum',
    enum: ApplicationTrackerStatus,
    default: ApplicationTrackerStatus.PREPARED,
  })
  status!: ApplicationTrackerStatus;

  @Column({ type: 'timestamptz' })
  preparedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  appliedAt!: Date | null;

  @Column({ type: 'timestamptz' })
  lastTouchedAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  baselineVersionId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  appliedDate!: Date | null;

  @Column({ type: 'integer', nullable: true })
  fitScore!: number | null;

  @Column({
    type: 'enum',
    enum: ApplicationStage,
    default: ApplicationStage.SAVED,
  })
  stage!: ApplicationStage;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  sourceUrl!: string | null;

  @Column({
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  cxFitScoreSnapshot!: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  resumeArtifacts!: ResumeArtifactRecord[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
