import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'interviews' })
export class Interview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  jobId!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  gapList!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  questions!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  responses!: string[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  validationResults!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  recommendedAdditions!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
