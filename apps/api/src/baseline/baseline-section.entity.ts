import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Baseline } from './baseline.entity';

export enum BaselineSectionType {
  RAW = 'RAW',
  SUMMARY = 'SUMMARY',
  EXPERIENCE = 'EXPERIENCE',
  PROJECT = 'PROJECT',
  SKILLS = 'SKILLS',
  EDUCATION = 'EDUCATION',
  OTHER = 'OTHER',
}

export enum BaselineIncludePolicy {
  ALWAYS = 'always',
  OPTIONAL = 'optional',
  NEVER = 'never',
}

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

  @Column({
    name: 'type',
    type: 'enum',
    enum: BaselineSectionType,
    default: BaselineSectionType.OTHER,
  })
  sectionType!: BaselineSectionType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'vector', length: 1536, nullable: true })
  embedding?: number[] | null;

  @Column({ type: 'varchar', default: BaselineIncludePolicy.OPTIONAL })
  includePolicy!: BaselineIncludePolicy;

  @Column({ name: 'orderIndex', type: 'int', default: 0 })
  order!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  get type(): BaselineSectionType {
    return this.sectionType;
  }

  set type(value: BaselineSectionType) {
    this.sectionType = value;
  }

  get orderIndex(): number {
    return this.order;
  }

  set orderIndex(value: number) {
    this.order = value;
  }
}
