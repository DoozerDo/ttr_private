import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UsePipes,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { PreviewCompatibilityScoreDto } from './dto/preview-compatibility-score.dto';
import { PreviewCanonicalFitScoreDto } from './dto/preview-canonical-fit-score.dto';
import { PreviewService } from './preview.service';
import { PreviewCanonicalFitScoreService } from './preview-canonical-fit-score.service';
import { BaselineTextExtractor } from '../baseline/baseline-text-extractor.service';

function resolveIpAddress(request: Request): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.ip ?? 'unknown';
}

@Controller('preview')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class PreviewController {
  constructor(
    private readonly previewService: PreviewService,
    private readonly canonicalFitScoreService: PreviewCanonicalFitScoreService,
    private readonly baselineTextExtractor: BaselineTextExtractor,
  ) {}

  @Post('compatibility-score')
  async compatibilityScore(
    @Body() body: PreviewCompatibilityScoreDto,
    @Req() request: Request,
  ) {
    const resumeText = body.resumeText?.trim() ?? '';
    const jobDescriptionText = body.jobDescriptionText.trim();
    if (!jobDescriptionText) {
      throw new BadRequestException('jobDescriptionText is required');
    }

    const totalChars = resumeText.length + jobDescriptionText.length;
    if (totalChars > 100_000) {
      throw new BadRequestException('Request exceeds 100k characters');
    }

    const score = await this.previewService.computeCompatibilityScore({
      resumeText,
      jobDescriptionText,
      ipAddress: resolveIpAddress(request),
      mode: body.mode ?? 'final-preview',
    });

    return { score };
  }

  @Post('extract-resume-text')
  @UseInterceptors(FileInterceptor('file'))
  async extractResumeText(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const resumeText = (await this.baselineTextExtractor.extractText(file)).trim();
    return {
      resumeText,
      resumeChars: resumeText.length,
      filename: file.originalname ?? null,
      mimetype: file.mimetype ?? null,
    };
  }

  @Post('canonical-fit-score')
  async canonicalFitScore(@Body() body: PreviewCanonicalFitScoreDto) {
    const resumeText = body.resumeText?.trim() ?? '';
    const jobDescriptionText = body.jobDescriptionText.trim();
    if (!jobDescriptionText) {
      throw new BadRequestException('jobDescriptionText is required');
    }

    const totalChars = resumeText.length + jobDescriptionText.length;
    if (totalChars > 200_000) {
      throw new BadRequestException('Request exceeds 200k characters');
    }

    return this.canonicalFitScoreService.compute({
      resumeText,
      jobDescriptionText,
    });
  }
}
