import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'job_tracker_entries' })
@Index('IDX_job_tracker_entries_userId', ['userId'])
@Index('IDX_job_tracker_entries_createdAt', ['createdAt'])
export class JobTrackerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  company!: string;

  @Column({ type: 'varchar', length: 255 })
  roleTitle!: string;

  @Column({ type: 'date' })
  dateAdded!: Date;

  @Column({ type: 'date', nullable: true })
  dateApplied!: Date | null;

  @Column({ type: 'integer' })
  cxFitScore!: number;

  @Column({ type: 'varchar', length: 255 })
  stage!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  sourceUrl!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
