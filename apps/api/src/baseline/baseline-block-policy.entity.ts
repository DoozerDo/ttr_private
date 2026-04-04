import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaselineSection } from './baseline-section.entity';
import type { BaselineIncludePolicy } from './baseline-section.entity';
import { BaselineVersion } from './baseline-version.entity';

@Entity({ name: 'baseline_block_policies' })
export class BaselineBlockPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => BaselineVersion, (version) => version.blockPolicies, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'baselineVersionId' })
  baselineVersion!: BaselineVersion;

  @Column()
  baselineVersionId!: string;

  @ManyToOne(() => BaselineSection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'baselineSectionId' })
  baselineSection!: BaselineSection;

  @Column()
  baselineSectionId!: string;

  @Column({ type: 'varchar', default: 'optional' })
  includePolicy!: BaselineIncludePolicy;

  @Column({ name: 'orderIndex', type: 'int', default: 0 })
  order!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  get orderIndex(): number {
    return this.order;
  }

  set orderIndex(value: number) {
    this.order = value;
  }
}
