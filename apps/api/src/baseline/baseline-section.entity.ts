import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Baseline } from './baseline.entity';

export type BaselineSectionType =
  | 'summary'
  | 'experience'
  | 'skills'
  | 'education'
  | 'other';

export type BaselineIncludePolicy = 'always' | 'optional' | 'never';

@Entity({ name: 'baseline_sections' })
export class BaselineSection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Baseline, (baseline) => baseline.sections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'baselineId' })
  baseline!: Baseline;

  @Column()
  baselineId!: string;

  @Column({ type: 'varchar' })
  type!: BaselineSectionType;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', default: 'optional' })
  includePolicy!: BaselineIncludePolicy;

  @Column({ type: 'int', default: 0 })
  orderIndex!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
