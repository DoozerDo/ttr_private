import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Baseline } from './baseline.entity';

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

  // VERIFY: Confirm that the stored path matches the persisted upload location.
  @Column({ type: 'varchar' })
  storagePath!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
