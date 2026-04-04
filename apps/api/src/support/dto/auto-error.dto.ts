import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

function trimValue(value: unknown): string | unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export enum AutoErrorType {
  RUNTIME = 'runtime',
  PROMISE = 'promise',
  API = 'api',
}

export class AutoErrorDto {
  @IsEnum(AutoErrorType)
  errorType!: AutoErrorType;

  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MaxLength(600)
  message!: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(256)
  route?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  endpoint?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(16)
  method?: string;

  @Transform(({ value }) => toNumber(value))
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  status?: number;

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

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  analysisId?: string;

  @Transform(({ value }) => trimValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  releaseId?: string;

  @Transform(({ value }) => trimValue(value))
  @IsISO8601()
  timestamp!: string;

  @IsOptional()
  @IsObject()
  diagnostics?: Record<string, unknown>;
}
