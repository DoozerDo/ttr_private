import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PreviewCanonicalFitScoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  resumeText?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  jobDescriptionText!: string;
}

