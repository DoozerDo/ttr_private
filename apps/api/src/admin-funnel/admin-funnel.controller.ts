import { Controller, Get, Param, UseGuards } from '@nestjs/common';
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
  getFunnelMetrics() {
    return this.funnelMetricsService.getFunnelMetrics();
  }

  @Get('funnel-users')
  getFunnelUsers() {
    return this.funnelMetricsService.listUserFunnelStates();
  }

  @Get('funnel-segments')
  getFunnelSegments() {
    return this.funnelMetricsService.getSegmentBreakdown();
  }

  @Get('funnel-step/:stepName')
  getUsersForStep(@Param('stepName') stepName: string) {
    if (!CANONICAL_FUNNEL_STEPS.includes(stepName as FunnelStepName)) {
      return [];
    }
    return this.funnelMetricsService.getUsersForStep(stepName as FunnelStepName);
  }
}

