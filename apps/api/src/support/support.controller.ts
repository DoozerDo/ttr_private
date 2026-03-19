import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { AutoErrorDto } from './dto/auto-error.dto';
import { CriticalFlowTrackerService } from './critical-flow-tracker.service';
import { ReportBugDto } from './dto/report-bug.dto';
import { StillSeeingDto } from './dto/still-seeing.dto';
import { SupportService } from './support.service';

type SupportRequest = {
  user: AuthUserDto;
};

@Controller('support')
export class SupportController {
  constructor(
    private readonly supportService: SupportService,
    private readonly criticalFlowTrackerService: CriticalFlowTrackerService,
  ) {}

  @Post('report-bug')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async reportBug(@Body() payload: ReportBugDto, @Req() request: SupportRequest) {
    const result = await this.supportService.reportBug(payload, request.user);
    return {
      message: 'Bug reported successfully.',
      issueNumber: result.issueNumber,
      issueUrl: result.issueUrl,
      sentryEventId: result.sentryEventId,
    };
  }

  @Post('auto-error')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async reportAutoError(@Body() payload: AutoErrorDto, @Req() request: SupportRequest) {
    return this.supportService.ingestAutoError(payload, request.user);
  }

  @Get('error-health')
  async getErrorHealth(@Req() request: SupportRequest, @Query('limit') limit?: string) {
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    const parsedLimit = Number.parseInt(limit ?? '100', 10);
    const safeLimit = Number.isNaN(parsedLimit) ? 100 : parsedLimit;
    return { items: this.supportService.getErrorHealth({ limit: safeLimit }) };
  }

  @Get('critical-flow-health')
  async getCriticalFlowHealth(@Req() request: SupportRequest) {
    if (request.user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return { items: this.criticalFlowTrackerService.getCriticalFlowHealth() };
  }

  @Get('history')
  async getHistory(@Req() request: SupportRequest, @Query('page') page?: string) {
    const parsedPage = Number.parseInt(page ?? '1', 10);
    const pageNumber = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const items = await this.supportService.getUserHistory(request.user.id, { page: pageNumber });
    return { items, page: pageNumber };
  }

  @Post('history/still-seeing')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async markStillSeeing(@Body() payload: StillSeeingDto, @Req() request: SupportRequest) {
    return this.supportService.recordStillSeeingIssue(request.user.id, payload.issueNumber);
  }

  @Get('config')
  async getConfig() {
    return this.supportService.getConfiguration();
  }
}
