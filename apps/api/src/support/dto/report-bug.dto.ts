import { Transform } from 'class-transformer';
import {
  IsBase64,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

function trimValue(value: unknown): string | unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export class ReportBugDto {
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  tryingToDo?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  expected?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsEmail()
  @MaxLength(256)
  email?: string;

  @IsOptional()
  @IsBase64()
  @MaxLength(5000000)
  screenshotBase64?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  screenshotMimeType?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(256)
  route?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  pageUrl?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  userAgent?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  baselineId?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  jobId?: string;

  @Transform(({ value }) => toNumber(value))
  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsObject()
  analysisContext?: Record<string, unknown>;
}
