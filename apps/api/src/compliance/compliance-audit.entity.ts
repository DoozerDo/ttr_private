import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ComplianceAction, ComplianceFlag } from './compliance.types';

@Entity({ name: 'compliance_audits' })
export class ComplianceAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  actorId!: string;

  @Column({
    type: 'enum',
    enum: ComplianceAction,
  })
  action!: ComplianceAction;

  @Column({ type: 'uuid', nullable: true })
  baselineVersionId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  baselineVersionHash!: string | null;

  @Column({ type: 'uuid', nullable: true })
  jobId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  outputHash!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  complianceFlags!: ComplianceFlag[];

  @Column({ type: 'boolean', default: false })
  passFail!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
