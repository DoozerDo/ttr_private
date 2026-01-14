import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SearchSetRunSourceSnapshot = {
  sourceUrl: string | null;
  providerId: string;
  listingCount: number;
  fetchedAt: string;
};

export type SearchSetRunResultSummary = {
  jobId: string;
  fitScore: number | null;
  verdict: string | null;
};

@Entity({ name: 'search_set_runs' })
export class SearchSetRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  searchSetId!: string;

  @Column()
  baselineVersionId!: string;

  @Column({ type: 'jsonb', nullable: true })
  sourceSnapshot!: SearchSetRunSourceSnapshot | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  runInputHash!: string | null;

@Column({ type: 'jsonb', nullable: true })
topResults!: SearchSetRunResultSummary[] | null;

  @Column({ type: 'int', default: 0 })
  failureCount!: number;

  @Column({ type: 'boolean', default: false })
  usedProviderDiscovery!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  executedAt!: Date;
}
