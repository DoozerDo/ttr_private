import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

function trimValue(value: unknown): string | unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateBugReportDto {
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  whatHappened!: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  attemptedAction?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  expectedBehavior?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsEmail()
  @MaxLength(256)
  reporterEmail?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  route?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageLabel?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  appVersion?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  gitSha?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  baselineId?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  assessmentId?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  fitScore?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  browserInfo?: string;

  @IsOptional()
  viewport?: Record<string, unknown> | string;

  @IsOptional()
  runtimeContext?: Record<string, unknown> | string;
}
