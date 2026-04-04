import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateJobTrackerEntryDto {
  @IsString()
  @IsNotEmpty()
  company!: string;

  @IsString()
  @IsNotEmpty()
  roleTitle!: string;

  @IsString()
  @IsNotEmpty()
  stage!: string;

  @IsInt()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  cxFitScore!: number;

  @IsOptional()
  @IsDateString()
  dateAdded?: string;

  @IsOptional()
  @IsDateString()
  dateApplied?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;
}
