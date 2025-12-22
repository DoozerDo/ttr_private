import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

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

  @Column({ type: 'int' })
  overallScore!: number;

  @Column({
    type: 'enum',
    enum: FitAssessmentVerdict,
  })
  verdict!: FitAssessmentVerdict;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  dimensionScores!: FitDimensionScores;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  strengths!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  gaps!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  complianceFlags!: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  inputsHash!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
