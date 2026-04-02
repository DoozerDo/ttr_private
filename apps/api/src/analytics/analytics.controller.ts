import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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

  @Post('product-signal/snapshots')
  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  async saveProductSignalSnapshot(@Query('days') daysRaw?: string) {
    const days =
      typeof daysRaw === 'string' && daysRaw.trim()
        ? Number(daysRaw)
        : 30;
    if (!Number.isFinite(days) || days < 1) {
      throw new BadRequestException('days must be greater than 0');
    }
    return this.analyticsService.saveProductSignalSnapshot(days);
  }

  @Get('product-signal/snapshots')
  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  async listProductSignalSnapshots(@Query('limit') limitRaw?: string) {
    const limit =
      typeof limitRaw === 'string' && limitRaw.trim()
        ? Number(limitRaw)
        : 10;
    if (!Number.isFinite(limit) || limit < 1) {
      throw new BadRequestException('limit must be greater than 0');
    }
    return this.analyticsService.listProductSignalSnapshots(limit);
  }

  @Post('product-signal/snapshots/:snapshotId/review')
  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  async updateProductSignalSnapshotReview(
    @Param('snapshotId') snapshotId: string,
    @Body() body: { reviewStatus?: string; reviewNote?: string },
  ) {
    return this.analyticsService.updateProductSignalSnapshot(snapshotId, {
      reviewStatus: body.reviewStatus as any,
      reviewNote: body.reviewNote,
    });
  }

  @Get('product-signal/snapshots/compare')
  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  async compareProductSignalSnapshot(
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
    return this.analyticsService.compareProductSignalSnapshot(days, {
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
