import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InterviewGap, InterviewQuestion } from './interview-types';

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
  recommendedAdditions!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
