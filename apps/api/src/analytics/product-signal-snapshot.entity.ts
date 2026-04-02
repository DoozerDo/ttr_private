import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ProductSignalSnapshotReviewStatus {
  OPEN = 'open',
  MONITORING = 'monitoring',
  RESOLVED = 'resolved',
}

export type ProductSignalTone = 'neutral' | 'informative' | 'caution' | 'urgent';

export type ProductSignalPrimaryFocus =
  | 'no_signal'
  | 'weak_step_monitor'
  | 'weak_step_action'
  | 'positive_recovery'
  | 'stable_funnel';

export type ProductSignalSnapshotReviewStatusValue =
  | ProductSignalSnapshotReviewStatus.OPEN
  | ProductSignalSnapshotReviewStatus.MONITORING
  | ProductSignalSnapshotReviewStatus.RESOLVED;

@Entity({ name: 'product_signal_snapshots' })
export class ProductSignalSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'integer', name: 'selected_window_days' })
  selectedWindowDays!: number;

  @Column({ type: 'text' })
  headline!: string;

  @Column({ type: 'varchar', length: 32 })
  tone!: ProductSignalTone;

  @Column({ type: 'varchar', length: 64, name: 'primary_focus' })
  primaryFocus!: ProductSignalPrimaryFocus;

  @Column({ type: 'text', name: 'weakest_step_label', nullable: true })
  weakestStepLabel!: string | null;

  @Column({ type: 'numeric', name: 'weakest_step_rate', precision: 18, scale: 8 })
  weakestStepRate!: string;

  @Column({ type: 'varchar', length: 32, name: 'weakest_step_direction' })
  weakestStepDirection!: string;

  @Column({ type: 'varchar', length: 32, name: 'watchlist_status' })
  watchlistStatus!: string;

  @Column({ type: 'varchar', length: 32, name: 'watchlist_priority' })
  watchlistPriority!: string;

  @Column({ type: 'varchar', length: 32 })
  severity!: string;

  @Column({ type: 'varchar', length: 32 })
  confidence!: string;

  @Column({ type: 'text', name: 'recommended_action_title', nullable: true })
  recommendedActionTitle!: string | null;

  @Column({ type: 'text', name: 'recommended_action_body' })
  recommendedActionBody!: string;

  @Column({ type: 'text', name: 'release_context_summary' })
  releaseContextSummary!: string;

  @Column({ type: 'text', name: 'export_payload_json' })
  exportPayloadJson!: string;

  @Column({
    type: 'enum',
    enum: ProductSignalSnapshotReviewStatus,
    name: 'review_status',
    default: ProductSignalSnapshotReviewStatus.OPEN,
  })
  reviewStatus!: ProductSignalSnapshotReviewStatusValue;

  @Column({ type: 'text', name: 'review_note', default: '' })
  reviewNote!: string;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt!: Date | null;
}
