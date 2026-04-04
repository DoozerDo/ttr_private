import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { OpportunityStatus } from '../opportunity.entity';

export class UpdateOpportunityStatusDto {
  @IsEnum(OpportunityStatus)
  status!: OpportunityStatus;

  @IsOptional()
  @IsBoolean()
  manualReset?: boolean;
}

