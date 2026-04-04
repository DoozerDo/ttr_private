import { IsIn, IsOptional, IsString } from 'class-validator';

export const SIMPLE_OPPORTUNITY_STATUSES = [
  'saved',
  'ready_to_apply',
  'applied',
  'improving_fit',
  'passed',
] as const;

export type SimpleOpportunityStatus = (typeof SIMPLE_OPPORTUNITY_STATUSES)[number];

export class ListOpportunitiesDto {
  @IsOptional()
  @IsIn(SIMPLE_OPPORTUNITY_STATUSES)
  status?: SimpleOpportunityStatus;

  @IsOptional()
  @IsString()
  analysisId?: string;

  @IsOptional()
  @IsString()
  minScore?: string;

  @IsOptional()
  @IsString()
  maxScore?: string;
}

