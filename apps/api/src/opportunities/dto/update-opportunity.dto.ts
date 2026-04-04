import { IsIn, IsOptional, IsString } from 'class-validator';
import { SIMPLE_OPPORTUNITY_STATUSES } from './list-opportunities.dto';

export class UpdateOpportunityDto {
  @IsOptional()
  @IsIn(SIMPLE_OPPORTUNITY_STATUSES)
  status?: (typeof SIMPLE_OPPORTUNITY_STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}

