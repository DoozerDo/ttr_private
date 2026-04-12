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

import { SyntheticReliabilityIngestDto } from './synthetic-reliability.dto';
import { SyntheticIngestGuard } from './synthetic-ingest.guard';
import { SyntheticReliabilityService } from './synthetic-reliability.service';

@Controller('admin/synthetics')
export class SyntheticReliabilityController {
  constructor(private readonly syntheticReliabilityService: SyntheticReliabilityService) {}

  @UseGuards(AuthGuard('jwt'), AdminBypassGuard)
  @Get()
  async getReliability(@Query('limit') limitRaw?: string) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 5;
    if (!Number.isFinite(limit) || limit < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return this.syntheticReliabilityService.getReliabilityReport(limit);
  }

  @UseGuards(SyntheticIngestGuard)
  @Post('runs')
  async recordRun(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    payload: SyntheticReliabilityIngestDto,
  ) {
    return this.syntheticReliabilityService.recordRun(payload);
  }
}
