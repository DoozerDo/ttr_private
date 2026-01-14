import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum JobIngestionMethod {
  PASTE = 'PASTE',
  URL = 'URL',
  SOURCE_PROVIDER = 'SOURCE_PROVIDER',
}

@Entity({ name: 'jobs' })
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company!: string | null;

  @Column({ type: 'text' })
  rawDescription!: string;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceProviderId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceExternalId!: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  canonicalUrl!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  dedupeHash!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  normalizedResponsibilities!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  normalizedRequirements!: string[];

  @Column({
    type: 'enum',
    enum: JobIngestionMethod,
    default: JobIngestionMethod.PASTE,
  })
  jdIngestionMethod!: JobIngestionMethod;

  @Column({ type: 'timestamptz', nullable: true })
  jdParsedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
