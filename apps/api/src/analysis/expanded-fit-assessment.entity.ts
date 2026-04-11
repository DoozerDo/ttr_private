import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { FitDimensionScores } from './fit-assessment.entity';

@Entity({ name: 'expanded_fit_assessments' })
@Index(['userId', 'jobId'])
@Index(['userId', 'baselineId'])
@Index(['userId', 'interviewId', 'requestHash'])
export class ExpandedFitAssessment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  jobId!: string;

  @Column({ type: 'uuid' })
  baselineId!: string;

  @Column({ type: 'int', nullable: true })
  baselineVersion!: number | null;

  @Column({ type: 'uuid', nullable: true })
  fitAssessmentId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  interviewId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  requestHash!: string | null;

  @Column({ type: 'int' })
  originalScore!: number;

  @Column({ type: 'int' })
  expandedScore!: number;

  @Column({ type: 'int' })
  delta!: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  additions!: string[];

  @Column({ type: 'jsonb' })
  expandedDimensionScores!: FitDimensionScores;

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
