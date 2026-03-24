import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FeedbackSeverity } from './feedback-item.entity';

export enum FrictionEventType {
  BASELINE_ABANDONED = 'baseline_abandoned',
  LOW_SCORE_NO_RECOVERY = 'low_score_no_recovery',
  REANALYSIS_AVAILABLE_NOT_USED = 'reanalysis_available_not_used',
  GENERATION_ATTEMPT_FAILED = 'generation_attempt_failed',
  REPEATED_GENERATION_RETRY = 'repeated_generation_retry',
  OPPORTUNITY_NOT_CREATED_AFTER_HIGH_SCORE = 'opportunity_not_created_after_high_score',
  FIT_REVIEW_STARTED_NOT_COMPLETED = 'fit_review_started_not_completed',
  REPEATED_RESULTS_VIEW_NO_ACTION = 'repeated_results_view_no_action',
}

export enum FrictionResolutionStatus {
  OPEN = 'open',
  REVIEWED = 'reviewed',
  RESOLVED = 'resolved',
  IGNORED = 'ignored',
}

@Entity({ name: 'friction_events' })
@Index('IDX_friction_events_user_type_created', ['userId', 'eventType', 'createdAt'])
export class FrictionEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  analysisId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  jobId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  baselineId!: string | null;

  @Column({ type: 'enum', enum: FrictionEventType })
  eventType!: FrictionEventType;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'enum', enum: FrictionResolutionStatus, default: FrictionResolutionStatus.OPEN })
  resolutionStatus!: FrictionResolutionStatus;

  @Column({ type: 'enum', enum: FeedbackSeverity, default: FeedbackSeverity.MEDIUM })
  severity!: FeedbackSeverity;

  @Column({ type: 'boolean', default: false })
  requiresFounderFollowup!: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  linkedIssueKey!: string | null;

  @Column({ type: 'text', nullable: true })
  adminNotes!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

