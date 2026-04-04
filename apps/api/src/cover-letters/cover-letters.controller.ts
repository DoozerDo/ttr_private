import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { CoverLettersService } from './cover-letters.service';
import type { CoverLetterGenerationResponse } from './cover-letters.service';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';
import {
  Entitlements,
  FeatureKey,
  assertFeatureAvailable,
  resolveEntitlementsFromUser,
} from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { ensureExportTierAvailable } from '../tiers/export-tier-helpers';

type TieredRequest = Request & {
  user?: {
    id?: string;
    subscriptionTier?: SubscriptionTier;
    entitlements?: Entitlements;
  };
};

type CoverLetterExportFormat = 'docx' | 'pdf';

@Controller('cover-letters')
@UseGuards(AuthGuard('jwt'))
export class CoverLettersController {
  constructor(private readonly coverLettersService: CoverLettersService) {}

  @Post('generate')
  async generate(
    @Body() body: GenerateCoverLetterDto,
    @Req() request: TieredRequest,
  ): Promise<CoverLetterGenerationResponse> {
    const userId = this.requireUserId(request);

    const entitlements = resolveEntitlementsFromUser(request.user);
    assertFeatureAvailable(entitlements, FeatureKey.COVER_LETTER_EXPORT);

    return this.coverLettersService.generateCoverLetter(userId, body);
  }

  @Get()
  async list(@Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    return this.coverLettersService.listCoverLetters(userId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    return this.coverLettersService.getCoverLetter(userId, id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    return this.coverLettersService.deleteCoverLetter(userId, id);
  }

  @Post('export')
  async exportCoverLetter(
    @Body() body: GenerateCoverLetterDto,
    @Req() request: TieredRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.handleExport(body, request, res, 'docx');
  }

  @Post('export/:format')
  async exportCoverLetterWithFormat(
    @Param('format') formatParam: string,
    @Body() body: GenerateCoverLetterDto,
    @Req() request: TieredRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const format = this.normalizeFormat(formatParam);
    return this.handleExport(body, request, res, format);
  }

  @Post('readiness')
  async getGenerationReadiness(
    @Body() body: GenerateCoverLetterDto,
    @Req() request: TieredRequest,
  ) {
    const userId = this.requireUserId(request);
    return this.coverLettersService.getGenerationReadiness(userId, body);
  }

  private normalizeFormat(value: string): CoverLetterExportFormat {
    const normalized = (value ?? '').toLowerCase().trim();
    if (normalized === 'pdf') return 'pdf';
    if (normalized === 'docx') return 'docx';
    throw new BadRequestException('Invalid format. Use docx or pdf.');
  }

  private async handleExport(
    body: GenerateCoverLetterDto,
    request: TieredRequest,
    res: Response,
    format: CoverLetterExportFormat,
  ): Promise<StreamableFile> {
    const userId = this.requireUserId(request);

    const entitlements = resolveEntitlementsFromUser(request.user);
    ensureExportTierAvailable(entitlements, FeatureKey.COVER_LETTER_EXPORT, 'EXPORT_COVER');

    const file = await this.coverLettersService.exportCoverLetter(
      userId,
      body,
      format,
    );

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.setHeader('Content-Length', String(file.buffer.byteLength));
    res.setHeader('X-Compliance-Audit-Id', file.auditId);
    if (file.baselineVersionHash) {
      res.setHeader('X-Baseline-Version-Hash', file.baselineVersionHash);
    }
    res.status(HttpStatus.CREATED);

    return new StreamableFile(file.buffer);
  }

  private requireUserId(request: TieredRequest) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return userId;
  }
}
