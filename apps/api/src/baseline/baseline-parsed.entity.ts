import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Baseline } from './baseline.entity';

@Entity({ name: 'baseline_parsed' })
export class BaselineParsed {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  baselineId!: string;

  @ManyToOne(() => Baseline, (baseline) => baseline.parsedRecords, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'baselineId' })
  baseline!: Baseline;

  @Column()
  sourceFileId!: string;

  @Column()
  schemaVersion!: string;

  @Column({
    type: 'varchar',
  })
  sourceFormat!: 'docx' | 'pdf';

  @Column({ type: 'timestamptz' })
  ingestedAt!: Date;

  @Column({ type: 'jsonb' })
  parsedJson!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  flagsJson!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
