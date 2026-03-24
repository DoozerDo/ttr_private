import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type UserTriggerType =
  | 'invite_reminder'
  | 'baseline_completion_nudge'
  | 'first_analysis_nudge'
  | 'low_score_recovery'
  | 'reanalysis_prompt'
  | 'apply_prompt'
  | 'reengagement_ping';

export type UserTriggerPriority = 'low' | 'medium' | 'high';

@Entity({ name: 'user_triggers' })
@Index('IDX_user_triggers_user_type_created', ['userId', 'triggerType', 'createdAt'])
export class UserTriggerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 64 })
  triggerType!: UserTriggerType;

  @Column({ type: 'varchar', length: 16 })
  priority!: UserTriggerPriority;

  @Column({ type: 'text' })
  reason!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

