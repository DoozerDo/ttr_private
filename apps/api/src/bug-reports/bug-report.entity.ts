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

export enum BugReportStatus {
  OPEN = 'OPEN',
  TRIAGED = 'TRIAGED',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum BugReportSeverity {
  NEW = 'NEW',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

@Entity({ name: 'bug_reports' })
@Index('IDX_bug_reports_created_at', ['createdAt'])
@Index('IDX_bug_reports_status', ['status'])
@Index('IDX_bug_reports_severity', ['severity'])
@Index('IDX_bug_reports_user_id', ['userId'])
export class BugReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ type: 'varchar', length: 256, nullable: true, name: 'reporter_email' })
  reporterEmail!: string | null;

  @Column({ type: 'text', name: 'what_happened' })
  whatHappened!: string;

  @Column({ type: 'text', nullable: true, name: 'attempted_action' })
  attemptedAction!: string | null;

  @Column({ type: 'text', nullable: true, name: 'expected_behavior' })
  expectedBehavior!: string | null;

  @Column({ type: 'text' })
  route!: string;

  @Column({ type: 'text', nullable: true, name: 'page_label' })
  pageLabel!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, name: 'app_version' })
  appVersion!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, name: 'git_sha' })
  gitSha!: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'baseline_id' })
  baselineId!: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'assessment_id' })
  assessmentId!: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, name: 'fit_score' })
  fitScore!: string | null;

  @Column({ type: 'text', nullable: true, name: 'browser_info' })
  browserInfo!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  viewport!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => "'{}'" , name: 'runtime_context' })
  runtimeContext!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true, name: 'screenshot_storage_path' })
  screenshotStoragePath!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'screenshot_original_filename' })
  screenshotOriginalFilename!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, name: 'screenshot_mime_type' })
  screenshotMimeType!: string | null;

  @Column({ type: 'integer', nullable: true, name: 'screenshot_size_bytes' })
  screenshotSizeBytes!: number | null;

  @Column({
    type: 'enum',
    enum: BugReportStatus,
    default: BugReportStatus.OPEN,
  })
  status!: BugReportStatus;

  @Column({
    type: 'enum',
    enum: BugReportSeverity,
    default: BugReportSeverity.NEW,
  })
  severity!: BugReportSeverity;

  @Column({ type: 'text', nullable: true, name: 'triage_notes' })
  triageNotes!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'resolved_at' })
  resolvedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'resolved_by_user_id' })
  resolvedByUserId!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
