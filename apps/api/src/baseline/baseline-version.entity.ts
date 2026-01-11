import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Baseline } from './baseline.entity';
import { BaselineBlockPolicy } from './baseline-block-policy.entity';

@Entity({ name: 'baseline_versions' })
export class BaselineVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Baseline, (baseline) => baseline.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'baselineId' })
  baseline!: Baseline;

  @Column()
  baselineId!: string;

  @Column({ type: 'int' })
  versionNumber!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileHash!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  allowedCompanies!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  allowedRoles!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  allowedTechnologies!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  allowedMetricTokens!: string[];

  get hash(): string | null {
    return this.fileHash;
  }

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  verifiedAdditions!: string[];

  @Column({ type: 'jsonb', nullable: true })
  additionDiff!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  promotedFromInterviewId!: string | null;

  @OneToMany(() => BaselineBlockPolicy, (policy) => policy.baselineVersion, {
    cascade: true,
  })
  blockPolicies!: BaselineBlockPolicy[];

  // VERIFY: Confirm that the stored path matches the persisted upload location.
  @Column({ type: 'varchar' })
  storagePath!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
