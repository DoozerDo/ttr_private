import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class TriggerSyntheticCleanupDto {
  @IsBoolean()
  dryRun!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : undefined))
  scenarioKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : undefined))
  syntheticRunId?: string;
}
