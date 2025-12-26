import { ApplicationStage } from '../application.entity';

export class CreateApplicationDto {
  jobId?: string | null;
  company!: string;
  title!: string;
  appliedDate?: Date | string | null;
  fitScore?: number | null;
  stage?: ApplicationStage;
  notes?: string | null;
  sourceUrl?: string | null;
}
