import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminBypassGuard } from '../admin-users/admin-bypass.guard';
import {
  CANONICAL_FUNNEL_STEPS,
  type FunnelStepName,
  FunnelMetricsService,
} from './funnel-metrics.service';

@UseGuards(AuthGuard('jwt'), AdminBypassGuard)
@Controller('admin')
export class AdminFunnelController {
  constructor(private readonly funnelMetricsService: FunnelMetricsService) {}

  @Get('funnel-metrics')
  getFunnelMetrics(@Query('includeSynthetic') includeSynthetic?: string) {
    return this.funnelMetricsService.getFunnelMetrics({
      includeSynthetic: includeSynthetic === 'true',
    });
  }

  @Get('funnel-users')
  getFunnelUsers(@Query('includeSynthetic') includeSynthetic?: string) {
    return this.funnelMetricsService.listUserFunnelStates({
      includeSynthetic: includeSynthetic === 'true',
    });
  }

  @Get('funnel-segments')
  getFunnelSegments(@Query('includeSynthetic') includeSynthetic?: string) {
    return this.funnelMetricsService.getSegmentBreakdown({
      includeSynthetic: includeSynthetic === 'true',
    });
  }

  @Get('funnel-step/:stepName')
  getUsersForStep(
    @Param('stepName') stepName: string,
    @Query('includeSynthetic') includeSynthetic?: string,
  ) {
    if (!CANONICAL_FUNNEL_STEPS.includes(stepName as FunnelStepName)) {
      return [];
    }
    return this.funnelMetricsService.getUsersForStep(stepName as FunnelStepName, {
      includeSynthetic: includeSynthetic === 'true',
    });
  }
}

