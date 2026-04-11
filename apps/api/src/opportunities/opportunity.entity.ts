import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum OpportunityFitBand {
  FIT_REVIEW = 'FIT_REVIEW',
  VIABLE = 'VIABLE',
  STRONG = 'STRONG',
  ELITE = 'ELITE',
}

export enum OpportunityStatus {
  SAVED = 'SAVED',
  APPLIED = 'APPLIED',
  RECRUITER_SCREEN = 'RECRUITER_SCREEN',
  HIRING_MANAGER = 'HIRING_MANAGER',
  LOOP = 'LOOP',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  IN_FIT_REVIEW = 'IN_FIT_REVIEW',
  DORMANT = 'DORMANT',
}

@Entity({ name: 'opportunities' })
@Index('IDX_opportunities_user_id', ['userId'])
@Index('IDX_opportunities_company_name', ['companyName'])
@Index('IDX_opportunities_current_band', ['currentBand'])
@Index('IDX_opportunities_last_status_change', ['lastStatusChange'])
@Index('UQ_opportunities_user_pair', ['userId', 'baselineId', 'jobId'], {
  unique: true,
  where: '"baseline_id" IS NOT NULL AND "job_id" IS NOT NULL',
})
export class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 255, name: 'company_name' })
  companyName!: string;

  @Column({ type: 'varchar', length: 255, name: 'job_title' })
  jobTitle!: string;

  @Column({ type: 'uuid', name: 'job_id', nullable: true })
  jobId!: string | null;

  @Column({ type: 'uuid', name: 'saved_job_id', nullable: true })
  savedJobId!: string | null;

  @Column({ type: 'uuid', name: 'analysis_id', nullable: true })
  analysisId!: string | null;

  @Column({ type: 'uuid', name: 'baseline_id', nullable: true })
  baselineId!: string | null;

  @Column({ type: 'uuid', name: 'saved_baseline_id', nullable: true })
  savedBaselineId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  salary!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'date_created' })
  dateCreated!: Date;

  @Column({
    type: 'timestamptz',
    name: 'last_status_change',
    default: () => 'now()',
  })
  lastStatusChange!: Date;

  @Column({
    type: 'enum',
    enum: OpportunityStatus,
  })
  status!: OpportunityStatus;

  @Column({ type: 'integer', name: 'initial_score' })
  initialScore!: number;

  @Column({ type: 'integer', name: 'saved_fit_score', nullable: true })
  savedFitScore!: number | null;

  @Column({ type: 'integer', name: 'current_score' })
  currentScore!: number;

  @Column({
    type: 'enum',
    enum: OpportunityFitBand,
    name: 'initial_band',
  })
  initialBand!: OpportunityFitBand;

  @Column({
    type: 'enum',
    enum: OpportunityFitBand,
    name: 'current_band',
  })
  currentBand!: OpportunityFitBand;

  @Column({ type: 'varchar', nullable: true, name: 'baseline_version_used' })
  baselineVersionUsed!: string | null;

  @Column({ type: 'boolean', default: false })
  dormant!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'boolean', name: 'saved_generation_completed', default: false })
  savedGenerationCompleted!: boolean;

  @Column({ type: 'text', name: 'saved_evidence_summary', array: true, nullable: true })
  savedEvidenceSummary!: string[] | null;

  @Column({ type: 'boolean', default: false })
  isSynthetic!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  syntheticScenarioKey!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  syntheticRunId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  syntheticCreatedAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  preserveFromCleanup!: boolean;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}

