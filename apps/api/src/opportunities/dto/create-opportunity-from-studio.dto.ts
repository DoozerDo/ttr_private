import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateOpportunityFromStudioDto {
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsNotEmpty()
  jobTitle!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  fitScore!: number;

  @IsOptional()
  @IsString()
  salary?: string;

  @IsOptional()
  @IsString()
  baselineVersionUsed?: string;
}

