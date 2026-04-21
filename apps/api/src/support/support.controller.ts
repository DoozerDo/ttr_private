import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { AutoErrorDto } from './dto/auto-error.dto';
import { bugReportValidationExceptionFactory } from './bug-report-validation';
import { CriticalFlowTrackerService } from './critical-flow-tracker.service';
import { ReportBugDto } from './dto/report-bug.dto';
import { StillSeeingDto } from './dto/still-seeing.dto';
import { SupportService } from './support.service';

type SupportRequest = {
  user: AuthUserDto;
};

const reportBugValidationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  exceptionFactory: bugReportValidationExceptionFactory,
});

@Controller('support')
export class SupportController {
  private readonly logger = new Logger(SupportController.name);

  constructor(
    private readonly supportService: SupportService,
    private readonly criticalFlowTrackerService: CriticalFlowTrackerService,
  ) {}

  @Post('report-bug')
  @UsePipes(reportBugValidationPipe)
  async reportBug(@Body() payload: ReportBugDto, @Req() request: SupportRequest) {
    const rawBody = (request as unknown as { body?: unknown })?.body;
    const payloadKeys =
      rawBody && typeof rawBody === 'object' ? Object.keys(rawBody as Record<string, unknown>) : [];
    const hasLegacyDescription = payloadKeys.includes('description') && !payloadKeys.includes('message');
    const canonicalMessage = payload.message ?? payload.description ?? '';
    const normalizedPayload = {
      ...payload,
      message: canonicalMessage,
    } as ReportBugDto & { message: string };
    const messageLength = canonicalMessage ? canonicalMessage.trim().length : null;

    this.logger.log({
      event: 'support_report_bug_hit',
      userId: request.user?.id,
      payloadKeys,
      hasLegacyDescription,
      messageLength,
    });

    const result = await this.supportService.reportBug(normalizedPayload, request.user);
    this.logger.log({
      event: 'support_report_bug_success',
      userId: request.user?.id,
      issueNumber: result.issueNumber ?? null,
      storedReportId: result.storedReportId ?? null,
      deliveredToGithub: result.deliveredToGithub,
      sentryEventId: result.sentryEventId ?? null,
    });

    const reportId = result.issueNumber ? String(result.issueNumber) : (result.storedReportId ?? 'unknown');
    const message = result.issueNumber
      ? `Bug reported successfully. Reference: #${result.issueNumber}.`
      : result.storedReportId
        ? `Bug report received. Reference: ${result.storedReportId}.`
        : 'Bug report received.';
    return {
      status: 'submission_success',
      message,
      reportId,
      storedReportId: result.storedReportId,
      deliveredToGithub: result.deliveredToGithub,
      issueNumber: result.issueNumber ?? null,
      issueUrl: result.issueUrl ?? null,
      sentryEventId: result.sentryEventId,
    };
  }

  @Get('status')
  async getStatus() {
    return this.supportService.getSupportStatus();
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
