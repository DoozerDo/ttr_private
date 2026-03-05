import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
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
export class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 255, name: 'company_name' })
  companyName!: string;

  @Column({ type: 'varchar', length: 255, name: 'job_title' })
  jobTitle!: string;

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
}

