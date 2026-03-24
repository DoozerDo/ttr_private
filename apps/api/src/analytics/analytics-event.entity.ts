import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AnalyticsEventName } from './analytics.constants';

@Entity({ name: 'analytics_events' })
@Index('IDX_analytics_events_event_name', ['eventName'])
@Index('IDX_analytics_events_session_id', ['sessionId'])
@Index('IDX_analytics_events_created_at', ['createdAt'])
@Index('IDX_analytics_events_user_id', ['userId'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', name: 'event_name', length: 64 })
  eventName!: AnalyticsEventName;

  @Column({ type: 'varchar', name: 'session_id', length: 128 })
  sessionId!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  path!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  properties!: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  isSynthetic!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  syntheticScenarioKey!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  syntheticRunId!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
