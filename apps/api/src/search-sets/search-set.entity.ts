import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SearchSetSeniority {
  ENTRY = 'ENTRY',
  MID = 'MID',
  SENIOR = 'SENIOR',
  LEAD = 'LEAD',
  EXECUTIVE = 'EXECUTIVE',
  ANY = 'ANY',
}

export enum SearchSetWorkMode {
  REMOTE = 'REMOTE',
  HYBRID = 'HYBRID',
  ONSITE = 'ONSITE',
  ANY = 'ANY',
}

@Entity({ name: 'search_sets' })
export class SearchSet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  titlePatterns!: string[];

  @Column({
    type: 'enum',
    enum: SearchSetSeniority,
    default: SearchSetSeniority.ANY,
  })
  seniority!: SearchSetSeniority;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  industry!: string[];

  @Column({
    type: 'enum',
    enum: SearchSetWorkMode,
    default: SearchSetWorkMode.ANY,
  })
  workMode!: SearchSetWorkMode;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
