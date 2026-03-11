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
  async summary(@Query('days') daysRaw?: string) {
    const days =
      typeof daysRaw === 'string' && daysRaw.trim()
        ? Number(daysRaw)
        : 30;
    if (!Number.isFinite(days) || days < 1) {
      throw new BadRequestException('days must be greater than 0');
    }
    return this.analyticsService.getSummary(days);
  }
}
