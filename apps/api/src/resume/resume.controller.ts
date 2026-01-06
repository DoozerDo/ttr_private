import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { ResumeService } from './resume.service';

type ResumeExportFormat = 'docx' | 'pdf';

interface ResumeRequestBody {
  baselineId?: string;
  baselineVersionId?: string;
  jobId?: string;
  format?: ResumeExportFormat;
  oneTap?: boolean;
}

@Controller('resume')
@UseGuards(AuthGuard('jwt'))
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('generate')
  async generateResume(
    @Body() body: ResumeRequestBody,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    return this.handleGenerate(body, request);
  }

  @Post()
  async createResumeRequest(
    @Body() body: ResumeRequestBody,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    return this.handleGenerate(body, request);
  }

  @Post('export')
  async exportResume(
    @Body() body: ResumeRequestBody,
    @Req() request: Request & { user?: { id?: string } },
    @Res() res: Response,
  ) {
    const format: ResumeExportFormat = body.format ?? 'docx';
    return this.handleExport(body, request, res, format);
  }

  @Post('export/:format')
  async exportResumeWithFormat(
    @Param('format') formatParam: string,
    @Body() body: ResumeRequestBody,
    @Req() request: Request & { user?: { id?: string } },
    @Res() res: Response,
  ) {
    const format = this.normalizeFormat(formatParam);
    return this.handleExport(body, request, res, format);
  }

  private normalizeFormat(value: string): ResumeExportFormat {
    const normalized = (value ?? '').toLowerCase().trim();
    if (normalized === 'pdf') return 'pdf';
    if (normalized === 'docx') return 'docx';
    throw new BadRequestException('Invalid format. Use docx or pdf.');
  }

  private getUserId(request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;
    if (!userId) throw new BadRequestException('Invalid user context');
    return userId;
  }

  private parsePayload(body: ResumeRequestBody) {
    const baselineId = body.baselineId?.trim();
    const baselineVersionId = body.baselineVersionId?.trim();
    const jobId = body.jobId?.trim();
    const oneTap = Boolean(body.oneTap);

    if (!baselineId) throw new BadRequestException('baselineId is required');
    if (!baselineVersionId) throw new BadRequestException('baselineVersionId is required');
    if (!jobId) throw new BadRequestException('jobId is required');

    return {
      baselineId,
      baselineVersionId,
      jobId,
      oneTap,
    };
  }

  private async handleGenerate(
    body: ResumeRequestBody,
    request: Request & { user?: { id?: string } },
  ) {
    const userId = this.getUserId(request);
    const payload = this.parsePayload(body);
    return this.resumeService.generateResume(userId, payload);
  }

  private async handleExport(
    body: ResumeRequestBody,
    request: Request & { user?: { id?: string } },
    res: Response,
    format: ResumeExportFormat,
  ) {
    const userId = this.getUserId(request);
    const payload = this.parsePayload(body);

    const file = await this.resumeService.exportResume(userId, payload, format);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Length', String(file.buffer.byteLength));
    res.send(file.buffer);
  }
}
