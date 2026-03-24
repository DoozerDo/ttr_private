import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SyntheticCleanupConfig = {
  syntheticTestingEnabled: boolean;
  cleanupEnabled: boolean;
  retentionHours: number;
  failedRetentionHours: number;
  logRetentionDays: number;
  cleanupCron: string;
  dryRunDefault: boolean;
};

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.trim().toLowerCase() === 'true';
}

function parseNumber(
  value: string | undefined,
  defaultValue: number,
  min = 1,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    return defaultValue;
  }
  return parsed;
}

@Injectable()
export class SyntheticConfigService {
  constructor(private readonly configService: ConfigService) {}

  get cleanupConfig(): SyntheticCleanupConfig {
    return {
      syntheticTestingEnabled: parseBoolean(
        this.configService.get<string>('SYNTHETIC_TESTING_ENABLED'),
        false,
      ),
      cleanupEnabled: parseBoolean(
        this.configService.get<string>('SYNTHETIC_CLEANUP_ENABLED'),
        false,
      ),
      retentionHours: parseNumber(
        this.configService.get<string>('SYNTHETIC_RETENTION_HOURS'),
        72,
      ),
      failedRetentionHours: parseNumber(
        this.configService.get<string>('SYNTHETIC_FAILED_RETENTION_HOURS'),
        24,
      ),
      logRetentionDays: parseNumber(
        this.configService.get<string>('SYNTHETIC_LOG_RETENTION_DAYS'),
        7,
      ),
      cleanupCron: this.configService.get<string>('SYNTHETIC_CLEANUP_CRON') ?? '0 * * * *',
      dryRunDefault: parseBoolean(
        this.configService.get<string>('SYNTHETIC_DRY_RUN_DEFAULT'),
        true,
      ),
    };
  }
}
