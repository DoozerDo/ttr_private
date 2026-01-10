import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  RealityCheckAnswer,
  RealityCheckOutcome,
  RealityCheckQuestion,
} from './reality-check.types';

@Entity({ name: 'reality_checks' })
export class RealityCheck {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  jobId!: string;

  @Column()
  baselineId!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  triggeredBy!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  questions!: RealityCheckQuestion[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  answers!: RealityCheckAnswer[];

  @Column({
    type: 'enum',
    enum: RealityCheckOutcome,
  })
  outcome!: RealityCheckOutcome;

  @Column({ default: false })
  baselineUpdateSuggested!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  suggestedBaselineSections!: string[];

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
