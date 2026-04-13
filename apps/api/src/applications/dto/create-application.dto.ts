import {
  ApplicationStage,
  ApplicationTrackerStatus,
} from '../application.entity';

export class CreateApplicationDto {
  jobId?: string | null;
  company!: string;
  title!: string;
  analysisId?: string | null;
  baselineId?: string | null;
  baselineVersionId?: string | null;
  applicationStatus?: ApplicationTrackerStatus | null;
  appliedDate?: Date | string | null;
  fitScore?: number | null;
  stage?: ApplicationStage;
  notes?: string | null;
  sourceUrl?: string | null;
  externalApplicationUrl?: string | null;
  verificationCoverageSnapshot?: Record<string, unknown> | null;
  outcomeLinkageSnapshot?: Record<string, unknown> | null;
}
