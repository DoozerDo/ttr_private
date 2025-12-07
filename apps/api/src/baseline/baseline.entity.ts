import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaselineSection } from './baseline-section.entity';

@Entity({ name: 'baselines' })
export class Baseline {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ default: 1 })
  version!: number;

  @Column()
  originalFilename!: string;

  @Column()
  mimeType!: string;

  @Column()
  storagePath!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hash!: string | null;

  @OneToMany(() => BaselineSection, (section) => section.baseline, {
    cascade: true,
  })
  sections!: BaselineSection[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
