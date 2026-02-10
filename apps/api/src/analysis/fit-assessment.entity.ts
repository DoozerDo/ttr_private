// apps/api/src/analysis/fit-assessment.entity.ts

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { CxFitV2Result } from './cx-fit-scoring-v2';

export enum FitAssessmentVerdict {
  APPLY = 'APPLY',
  CONSIDER = 'CONSIDER',
  SKIP = 'SKIP',
}

export type FitDimensionScores = {
  experienceAlignment: number;
  leadershipLevel: number;
  technicalPlatformFit: number;
  industryContext: number;
  strategicTacticalFit: number;
};

@Entity({ name: 'fit_assessments' })
export class FitAssessment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column()
  jobId!: string;

  @Column()
  baselineId!: string;

  @Column({ type: 'int', nullable: true })
  baselineVersion!: number | null;

  /**
   * Canonical overall score. As of scoring_contract_v1 / cx-fit-scoring-v2,
   * this should represent the final CX Fit Score (0-100).
   */
  @Column({ type: 'int' })
  overallScore!: number;

  @Column({
    type: 'enum',
    enum: FitAssessmentVerdict,
  })
  verdict!: FitAssessmentVerdict;

  /**
   * Legacy per-dimension scores used by the UI. Keep this shape stable
   * until we introduce a v2 dimension schema and a migration path.
   */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  dimensionScores!: FitDimensionScores;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  strengths!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  gaps!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  complianceFlags!: string[];

  @Column({ type: 'jsonb', nullable: true })
  scoringV2!: CxFitV2Result | null;

  /**
   * Deterministic hash of the scoring inputs (job + baseline sections + weights).
   * Used to detect when a stored assessment no longer matches current inputs.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  inputsHash!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
