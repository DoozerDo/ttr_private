import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { BugReportsService } from './bug-reports.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { ListBugReportsDto } from './dto/list-bug-reports.dto';
import { UpdateBugReportDto } from './dto/update-bug-report.dto';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';

type BugReportRequest = {
  user: AuthUserDto;
  headers?: Record<string, string | string[] | undefined>;
};

const ALLOWED_SCREENSHOT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Controller('bug-reports')
@UseGuards(AuthGuard('jwt'))
export class BugReportsController {
  private readonly logger = new Logger(BugReportsController.name);

  constructor(private readonly bugReportsService: BugReportsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('screenshot'))
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(
    @Body() payload: CreateBugReportDto,
    @Req() request: BugReportRequest,
    @UploadedFile() screenshot?: Express.Multer.File,
  ) {
    if (!request.user?.id) {
      throw new BadRequestException('Invalid user context');
    }
    if (screenshot && !ALLOWED_SCREENSHOT_MIME_TYPES.includes(screenshot.mimetype)) {
      throw new BadRequestException('Screenshot must be png, jpeg, or webp');
    }

    const normalizedPayload = this.normalizeCreatePayload(payload, request);

    try {
      const report = await this.bugReportsService.createReport(normalizedPayload, request.user, screenshot);
      return {
        ok: true,
        reportId: report.id,
        status: report.status,
        severity: report.severity,
        createdAt: report.createdAt,
      };
    } catch (error) {
      this.logger.error('Bug report creation failed', {
        userId: request.user.id,
        hasScreenshot: Boolean(screenshot),
        parsedPayload: {
          route: normalizedPayload.route,
          hasRuntimeContext: Boolean(normalizedPayload.runtimeContext),
          hasViewport: Boolean(normalizedPayload.viewport),
        },
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Bug report failed to send');
    }
  }

  @Get()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async list(@Req() request: BugReportRequest, @Query() filters: ListBugReportsDto) {
    this.assertAdmin(request.user);
    return this.bugReportsService.listReports(filters);
  }

  @Get(':id')
  async getById(@Req() request: BugReportRequest, @Param('id') id: string) {
    this.assertAdmin(request.user);
    return this.bugReportsService.getReportById(id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async update(
    @Req() request: BugReportRequest,
    @Param('id') id: string,
    @Body() payload: UpdateBugReportDto,
  ) {
    this.assertAdmin(request.user);
    return this.bugReportsService.updateReport(id, payload, request.user);
  }

  @Get(':id/screenshot')
  @Header('Cache-Control', 'private, no-store')
  async getScreenshot(
    @Req() request: BugReportRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertAdmin(request.user);
    const report = await this.bugReportsService.getReportById(id);
    if (!report.screenshotStoragePath) {
      throw new BadRequestException('Screenshot not available for this report');
    }

    const absolutePath = this.bugReportsService.getScreenshotAbsolutePath(report.screenshotStoragePath);
    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('Screenshot file not found');
    }
    response.setHeader('Content-Type', report.screenshotMimeType ?? 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${report.screenshotOriginalFilename ?? 'screenshot'}"`,
    );
    return new StreamableFile(createReadStream(absolutePath));
  }

  private assertAdmin(user: AuthUserDto) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
  }

  private normalizeCreatePayload(payload: CreateBugReportDto, request: BugReportRequest & { headers?: Record<string, string | string[] | undefined> }): CreateBugReportDto {
    const normalizedRuntimeContext = this.parseJsonField(payload.runtimeContext, {});
    const routeFromPayload = this.asNullableTrimmed(payload.route);
    const routeFromReferer = this.extractRouteFromReferer(
      typeof request?.headers?.referer === 'string' ? request.headers.referer : undefined,
    );
    return {
      ...payload,
      route: routeFromPayload ?? routeFromReferer ?? '/unknown',
      runtimeContext: normalizedRuntimeContext,
      viewport: this.parseJsonField(payload.viewport, undefined),
    };
  }

  private parseJsonField(
    value: unknown,
    fallback: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!value) return fallback;
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  private asNullableTrimmed(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private extractRouteFromReferer(referer?: string): string | undefined {
    if (!referer) return undefined;
    try {
      const parsed = new URL(referer);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return undefined;
    }
  }
}
