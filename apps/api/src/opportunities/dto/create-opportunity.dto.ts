import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateOpportunityDto {
  @IsUUID()
  jobId!: string;

  @IsUUID()
  analysisId!: string;

  @IsUUID()
  baselineId!: string;

  @IsNumber()
  score!: number;

  @IsString()
  @MaxLength(255)
  company!: string;

  @IsString()
  @MaxLength(255)
  roleTitle!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  generationCompleted?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  savedEvidenceSummary?: string[];
}

