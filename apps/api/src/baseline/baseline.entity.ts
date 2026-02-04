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
