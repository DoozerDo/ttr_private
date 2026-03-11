import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PreviewCompatibilityScoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  resumeText?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  jobDescriptionText!: string;

  @IsOptional()
  @IsIn(['live-preview', 'final-preview'])
  mode?: 'live-preview' | 'final-preview';
}
