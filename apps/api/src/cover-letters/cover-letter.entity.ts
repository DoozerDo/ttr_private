import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'cover_letters' })
export class CoverLetter {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ type: 'uuid' })
  jobId!: string;

  @Index()
  @Column({ type: 'uuid' })
  baselineId!: string;

  @Column({ type: 'varchar', default: 'template' })
  generatorType!: string;

  @Column({ type: 'varchar', default: 'v1' })
  generatorVersion!: string;

  @Column({ type: 'varchar', length: 50, default: 'steady' })
  closingTemplateKey!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  generationInputsHash!: string | null;

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

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
