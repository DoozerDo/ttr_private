import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum FeedbackCategory {
  BUG = 'bug',
  CONFUSION = 'confusion',
  TRUST_ISSUE = 'trust_issue',
  SCORING_QUESTION = 'scoring_question',
  GENERATION_PROBLEM = 'generation_problem',
  UX_FRICTION = 'ux_friction',
  FEATURE_REQUEST = 'feature_request',
  OTHER = 'other',
}

export enum FeedbackTriageStatus {
  NEW = 'new',
  REVIEWED = 'reviewed',
  PLANNED = 'planned',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum FeedbackSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Entity({ name: 'feedback_items' })
@Index('IDX_feedback_items_user_created', ['userId', 'createdAt'])
export class FeedbackItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  analysisId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  baselineId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  opportunityId!: string | null;

  @Column({ type: 'enum', enum: FeedbackCategory, default: FeedbackCategory.OTHER })
  category!: FeedbackCategory;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pageContext!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: FeedbackTriageStatus, default: FeedbackTriageStatus.NEW })
  triageStatus!: FeedbackTriageStatus;

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

