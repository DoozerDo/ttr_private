import { IsEnum, IsOptional } from 'class-validator';
import {
  BetaFeedbackCategory,
  BetaFeedbackSeverity,
} from '../beta-feedback.entity';

export class ListBetaFeedbackDto {
  @IsOptional()
  @IsEnum(BetaFeedbackSeverity)
  severity?: BetaFeedbackSeverity;

  @IsOptional()
  @IsEnum(BetaFeedbackCategory)
  category?: BetaFeedbackCategory;
}

