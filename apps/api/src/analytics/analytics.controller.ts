import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminBypassGuard } from '../admin-users/admin-bypass.guard';
import { AnalyticsService } from './analytics.service';
import { TrackAnalyticsEventDto } from './dto/track-analytics-event.dto';

@Controller('analytics')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('event')
  async trackEvent(@Body() body: TrackAnalyticsEventDto) {
    await this.analyticsService.ingestEvent(body);
    return { ok: true };
  }

  @Get('summary')
  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  async summary(
    @Query('days') daysRaw?: string,
    @Query('includeSynthetic') includeSyntheticRaw?: string,
  ) {
    const days =
      typeof daysRaw === 'string' && daysRaw.trim()
        ? Number(daysRaw)
        : 30;
    if (!Number.isFinite(days) || days < 1) {
      throw new BadRequestException('days must be greater than 0');
    }
    return this.analyticsService.getSummary(days, {
      includeSynthetic: includeSyntheticRaw === 'true',
    });
  }

  @Get('metrics')
  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  async metrics(
    @Query('range') rangeRaw?: string,
    @Query('includeSynthetic') includeSyntheticRaw?: string,
  ) {
    const normalizedRange =
      typeof rangeRaw === 'string' && rangeRaw.trim()
        ? rangeRaw.trim().toLowerCase()
        : '7d';
    if (!['7d', '14d', '30d', 'all'].includes(normalizedRange)) {
      throw new BadRequestException('range must be one of 7d, 14d, 30d, all');
    }
    return this.analyticsService.getFounderMetrics({
      rangeKey: normalizedRange as '7d' | '14d' | '30d' | 'all',
      includeSynthetic: includeSyntheticRaw === 'true',
    });
  }

  @Get('beta-command-center')
  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  async betaCommandCenter(@Query('includeSynthetic') includeSyntheticRaw?: string) {
    return this.analyticsService.getBetaCommandCenter({
      includeSynthetic: includeSyntheticRaw === 'true',
    });
  }
}
