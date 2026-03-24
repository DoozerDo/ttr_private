import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  InterviewGap,
  InterviewQuestion,
  RecommendedAddition,
} from './interview-types';

@Entity({ name: 'interviews' })
export class Interview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  baselineId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  baselineVersionId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  jobId!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  gapList!: InterviewGap[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  questions!: InterviewQuestion[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  responses!: string[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  validationResults!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  recommendedAdditions!: RecommendedAddition[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  acceptedAdditionIds!: string[];

  @Column({ type: 'jsonb', nullable: true })
  expandedFitAssessment?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  promotedBaselineVersionId!: string | null;

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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
