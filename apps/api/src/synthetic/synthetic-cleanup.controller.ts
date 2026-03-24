import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminBypassGuard } from '../admin-users/admin-bypass.guard';
import { TriggerSyntheticCleanupDto } from './dto/trigger-synthetic-cleanup.dto';
import { SyntheticCleanupService } from './synthetic-cleanup.service';

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin/synthetic-cleanup')
export class SyntheticCleanupController {
  constructor(private readonly syntheticCleanupService: SyntheticCleanupService) {}

  @Get('config')
  getConfig() {
    return this.syntheticCleanupService.getCleanupConfig();
  }

  @Get('runs')
  listRuns(@Query('limit') limitRaw?: string) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 25;
    if (!Number.isFinite(limit) || limit < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return this.syntheticCleanupService.listRecentRuns(limit);
  }

  @Get('summary')
  getSummary() {
    return this.syntheticCleanupService.getSyntheticDataSummary();
  }

  @Post('run')
  async triggerCleanup(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    payload: TriggerSyntheticCleanupDto,
  ) {
    if (typeof payload.dryRun !== 'boolean') {
      throw new BadRequestException('dryRun must be explicitly provided');
    }

    const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';
    if (isProduction && payload.dryRun !== false) {
      throw new BadRequestException(
        'Production manual cleanup requires dryRun=false explicitly',
      );
    }

    return this.syntheticCleanupService.runCleanup({
      dryRun: payload.dryRun,
      triggerSource: 'manual',
      scenarioKey: payload.scenarioKey ?? null,
      syntheticRunId: payload.syntheticRunId ?? null,
    });
  }
}
