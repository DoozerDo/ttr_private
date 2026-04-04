import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BetaFeedbackSeverity } from '../beta-feedback.entity';

export class CreateBetaFeedbackDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsString()
  @MaxLength(255)
  where!: string;

  @IsString()
  actual!: string;

  @IsString()
  expected!: string;

  @IsEnum(BetaFeedbackSeverity)
  severity!: BetaFeedbackSeverity;

  @IsOptional()
  @IsString()
  jobDescription?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  screenshotUrl?: string;
}

