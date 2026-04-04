import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'star_stories' })
export class StarStory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  situation!: string;

  @Column({ type: 'text' })
  task!: string;

  @Column({ type: 'text' })
  action!: string;

  @Column({ type: 'text' })
  result!: string;

  @Column({ type: 'text', nullable: true })
  reflections!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  competencies!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
