import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { PreviewCompatibilityScoreDto } from './dto/preview-compatibility-score.dto';
import { PreviewService } from './preview.service';

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
  constructor(private readonly previewService: PreviewService) {}

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
}
