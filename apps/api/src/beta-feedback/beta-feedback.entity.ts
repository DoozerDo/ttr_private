import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum BetaFeedbackSeverity {
  BLOCKER = 'blocker',
  MAJOR = 'major',
  MINOR = 'minor',
}

export enum BetaFeedbackCategory {
  SCORING_ISSUE = 'scoring_issue',
  HALLUCINATION = 'hallucination',
  FORMATTING_RESUME = 'formatting_resume',
  FORMATTING_COVER_LETTER = 'formatting_cover_letter',
  UX_CONFUSION = 'ux_confusion',
  NAVIGATION_BREAK = 'navigation_break',
  DATA_MISSING = 'data_missing',
  OTHER = 'other',
}

@Entity({ name: 'beta_feedback' })
@Index('IDX_beta_feedback_created_at', ['createdAt'])
@Index('IDX_beta_feedback_severity', ['severity'])
@Index('IDX_beta_feedback_category', ['category'])
export class BetaFeedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255 })
  where!: string;

  @Column({ type: 'text' })
  actual!: string;

  @Column({ type: 'text' })
  expected!: string;

  @Column({
    type: 'enum',
    enum: BetaFeedbackSeverity,
  })
  severity!: BetaFeedbackSeverity;

  @Column({
    type: 'enum',
    enum: BetaFeedbackCategory,
  })
  category!: BetaFeedbackCategory;

  @Column({ type: 'text', nullable: true, name: 'job_description' })
  jobDescription!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true, name: 'screenshot_url' })
  screenshotUrl!: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}

