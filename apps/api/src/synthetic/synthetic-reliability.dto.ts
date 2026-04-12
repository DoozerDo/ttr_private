import { IsArray, IsIn, IsISO8601, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

import type { SyntheticReliabilityStatus } from './synthetic-reliability.types';

const RELIABILITY_STATUSES: SyntheticReliabilityStatus[] = ['pass', 'fail', 'running', 'unknown'];

export class SyntheticReliabilityIngestDto {
  @IsString()
  suiteKey!: string;

  @IsIn(RELIABILITY_STATUSES)
  status!: SyntheticReliabilityStatus;

  @IsISO8601()
  startedAt!: string;

  @IsOptional()
  @IsISO8601()
  completedAt?: string | null;

  @IsOptional()
  @IsISO8601()
  finishedAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number | null;

  @IsOptional()
  @IsObject()
  summary?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  stepResults?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsObject()
  environment?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  validatedJourneys?: string[];

  @IsOptional()
  @IsString()
  errorMessage?: string | null;

  @IsOptional()
  @IsString()
  failureReason?: string | null;

  @IsOptional()
  @IsString()
  runId?: string | null;

  @IsOptional()
  @IsString()
  source?: string | null;
}
