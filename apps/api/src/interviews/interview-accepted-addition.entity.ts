import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Interview } from './interview.entity';

export type InterviewAcceptedAdditionStatus = 'RECOMMENDED' | 'ACCEPTED';

@Entity({ name: 'interview_accepted_additions' })
export class InterviewAcceptedAddition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  interviewId!: string;

  @ManyToOne(() => Interview, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'interviewId' })
  interview!: Interview;

  @Column({ type: 'varchar', length: 255 })
  gapId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  category!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  domain!: string | null;

  @Column({ type: 'text' })
  suggestion!: string;

  @Column({ type: 'varchar', length: 20, default: 'ACCEPTED' })
  status!: InterviewAcceptedAdditionStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recommendedAdditionId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
