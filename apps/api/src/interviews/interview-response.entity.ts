import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InterviewSession } from './interview-session.entity';

@Entity({ name: 'interview_responses' })
export class InterviewResponse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  sessionId!: string;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'text' })
  response!: string;

  @ManyToOne(() => InterviewSession, (session) => session.responses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session!: InterviewSession;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
