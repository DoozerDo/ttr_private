import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column()
  passwordHash!: string;

  @Column({ type: 'character varying', length: 255, nullable: true })
  calibrationProfileName!: string | null;

  // VERIFY: Ensure null defaults are acceptable for calibration weights.
  @Column({ type: 'jsonb', nullable: true })
  calibrationWeights!: CalibrationWeights | null;

  @Column({ type: 'character varying', length: 50, default: 'user' })
  role!: UserRole;

  @Column({ type: 'character varying', length: 50, default: 'free' })
  subscriptionTier!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
