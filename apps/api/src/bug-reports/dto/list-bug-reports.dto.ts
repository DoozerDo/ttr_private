import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BugReportSeverity, BugReportStatus } from '../bug-report.entity';

function toInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class ListBugReportsDto {
  @IsOptional()
  @IsEnum(BugReportStatus)
  status?: BugReportStatus;

  @IsOptional()
  @IsEnum(BugReportSeverity)
  severity?: BugReportSeverity;

  @Transform(({ value }) => toInt(value, 1))
  page = 1;

  @Transform(({ value }) => toInt(value, 25))
  pageSize = 25;

  @IsOptional()
  @IsString()
  query?: string;
}
