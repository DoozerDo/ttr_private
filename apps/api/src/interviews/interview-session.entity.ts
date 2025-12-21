import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InterviewResponse } from './interview-response.entity';

@Entity({ name: 'interview_sessions' })
export class InterviewSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column()
  baselineId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  jobId!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'active' })
  status!: string;

  @OneToMany(() => InterviewResponse, (response) => response.session)
  responses!: InterviewResponse[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
