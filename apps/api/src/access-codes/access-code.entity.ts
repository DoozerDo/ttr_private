import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity({ name: 'access_codes' })
export class AccessCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'character varying', length: 64, unique: true })
  codeHash!: string;

  @Column({ type: 'character varying', length: 12 })
  codePrefix!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy!: User | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  assignedUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedUserId' })
  assignedUser!: User | null;

  @Column({ type: 'uuid', nullable: true })
  redeemedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'redeemedByUserId' })
  redeemedBy!: User | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  redeemedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  revokedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'revokedByUserId' })
  revokedBy!: User | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
