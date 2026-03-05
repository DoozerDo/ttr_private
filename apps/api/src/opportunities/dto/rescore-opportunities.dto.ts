import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class OpportunityScoreOverrideDto {
  @IsString()
  @IsNotEmpty()
  opportunityId!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;
}

export class RescoreOpportunitiesDto {
  @IsOptional()
  @IsString()
  baselineVersionUsed?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpportunityScoreOverrideDto)
  scores!: OpportunityScoreOverrideDto[];
}

