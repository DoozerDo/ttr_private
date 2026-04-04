import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyntheticCleanupService } from './synthetic-cleanup.service';

@Injectable()
export class SyntheticCleanupScheduler {
  private readonly logger = new Logger(SyntheticCleanupScheduler.name);

  constructor(private readonly syntheticCleanupService: SyntheticCleanupService) {}

  @Cron(process.env.SYNTHETIC_CLEANUP_CRON ?? '0 * * * *')
  async runScheduledCleanup() {
    const config = this.syntheticCleanupService.getCleanupConfig();
    if (!config.cleanupEnabled) {
      return;
    }

    try {
      await this.syntheticCleanupService.runCleanup({
        dryRun: config.dryRunDefault,
        triggerSource: 'cron',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown failure';
      this.logger.error(`Scheduled synthetic cleanup failed: ${message}`);
    }
  }
}
