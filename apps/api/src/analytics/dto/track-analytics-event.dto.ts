import {
  IsIn,
  IsBoolean,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsEventName,
} from '../analytics.constants';

export class TrackAnalyticsEventDto {
  @IsIn(ANALYTICS_EVENT_NAMES)
  eventName!: AnalyticsEventName;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  sessionId!: string;

  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  path?: string | null;

  @IsOptional()
  @IsISO8601()
  createdAt?: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isSynthetic?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  syntheticScenarioKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  syntheticRunId?: string | null;
}
