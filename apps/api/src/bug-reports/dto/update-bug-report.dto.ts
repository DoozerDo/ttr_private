import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BugReportSeverity, BugReportStatus } from '../bug-report.entity';

function trimValue(value: unknown): string | unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateBugReportDto {
  @IsOptional()
  @IsEnum(BugReportStatus)
  status?: BugReportStatus;

  @IsOptional()
  @IsEnum(BugReportSeverity)
  severity?: BugReportSeverity;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  triageNotes?: string;

  @IsOptional()
  @IsDateString()
  resolvedAt?: string | null;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  resolvedByUserId?: string | null;
}
