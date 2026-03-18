import { Body, Controller, Get, Post, Query, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { ReportBugDto } from './dto/report-bug.dto';
import { SupportService } from './support.service';

type SupportRequest = {
  user: AuthUserDto;
};

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

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

  @Get('history')
  async getHistory(@Req() request: SupportRequest, @Query('page') page?: string) {
    const parsedPage = Number.parseInt(page ?? '1', 10);
    const pageNumber = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const items = await this.supportService.getUserHistory(request.user.id, { page: pageNumber });
    return { items, page: pageNumber };
  }

  @Get('config')
  async getConfig() {
    return this.supportService.getConfiguration();
  }
}
