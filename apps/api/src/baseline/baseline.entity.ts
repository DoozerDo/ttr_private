import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaselineParsed } from './baseline-parsed.entity';
import { BaselineSection } from './baseline-section.entity';
import { BaselineVersion } from './baseline-version.entity';

export enum BaselineStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

@Entity({ name: 'baselines' })
export class Baseline {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ default: 0 })
  version!: number;

  @Column()
  originalFilename!: string;

  @Column()
  mimeType!: string;

  @Column()
  storagePath!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hash!: string | null;

  @Column({
    type: 'enum',
    enum: BaselineStatus,
    default: BaselineStatus.ACTIVE,
  })
  status!: BaselineStatus;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ type: 'integer', nullable: true })
  originalBaselineScore!: number | null;

  @Column({ type: 'integer', nullable: true })
  latestBaselineScore!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  firstAnalyzedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastAnalyzedAt!: Date | null;

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

  @OneToMany(() => BaselineSection, (section) => section.baseline, {
    cascade: true,
  })
  sections!: BaselineSection[];

  @OneToMany(() => BaselineVersion, (version) => version.baseline, {
    cascade: true,
  })
  versions!: BaselineVersion[];

  @OneToMany(() => BaselineParsed, (parsed) => parsed.baseline)
  parsedRecords!: BaselineParsed[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
