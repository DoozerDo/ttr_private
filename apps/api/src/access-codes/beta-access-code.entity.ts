import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity({ name: 'beta_access_codes' })
export class BetaAccessCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'character varying', length: 128, unique: true })
  codeHash!: string;

  @Column({ type: 'character varying', length: 16, nullable: true })
  codePrefix!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  assignedUserId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  redeemedByUserId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  redeemedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  revokedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  revokedByUserId!: string | null;

  @Column({ type: 'character varying', length: 255, nullable: true })
  notes!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy?: User | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedUserId' })
  assignedUser?: User | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'redeemedByUserId' })
  redeemedBy?: User | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'revokedByUserId' })
  revokedBy?: User | null;
}
