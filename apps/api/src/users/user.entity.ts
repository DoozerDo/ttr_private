import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { AccountType } from './account-type.enum';

export type CalibrationWeights = {
  dimensionA: number;
  dimensionB: number;
  dimensionC: number;
  dimensionD: number;
  dimensionE: number;
};

export type UserRole = 'user' | 'coach' | 'admin';

// VERIFY: Confirm calibration dimension labels and structure.

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ unique: true })
  email!: string;

  @Column({ type: 'character varying', length: 100, default: '' })
  firstName!: string;

  @Column({ type: 'character varying', length: 100, default: '' })
  lastName!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: 'boolean', default: false })
  emailConfirmed!: boolean;

  @Column({ type: 'character varying', length: 255, nullable: true })
  calibrationProfileName!: string | null;

  // VERIFY: Ensure null defaults are acceptable for calibration weights.
  @Column({ type: 'jsonb', nullable: true })
  calibrationWeights!: CalibrationWeights | null;

  @Column({ type: 'character varying', length: 150, nullable: true })
  roleTitle?: string | null;

  @Column({ type: 'character varying', length: 150, nullable: true })
  company?: string | null;

  @Column({ type: 'character varying', length: 255, nullable: true })
  linkedinUrl?: string | null;

  @Column({ type: 'character varying', length: 255, nullable: true })
  intendedUse?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  profileCompletedAt?: Date | null;

  @Column({ type: 'character varying', length: 50, default: 'user' })
  role!: UserRole;

  @Column({
    type: 'enum',
    enum: SubscriptionTier,
    default: SubscriptionTier.FREE,
  })
  subscriptionTier!: SubscriptionTier;

  @Column({
    type: 'enum',
    enum: AccountType,
    default: AccountType.FREE,
  })
  accountType!: AccountType;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
