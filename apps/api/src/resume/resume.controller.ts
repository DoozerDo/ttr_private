import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ResumeService } from './resume.service';

@Controller('resume')
@UseGuards(AuthGuard('jwt'))
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('generate')
  async generate(
    @Body()
    body: {
      baselineId?: string;
      baselineVersionId?: string;
      jobId?: string;
    },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    if (!body.baselineId) {
      throw new BadRequestException('baselineId is required');
    }

    if (!body.baselineVersionId) {
      throw new BadRequestException('baselineVersionId is required');
    }

    return this.resumeService.generateResume(userId, {
      baselineId: body.baselineId,
      baselineVersionId: body.baselineVersionId,
      jobId: body.jobId ?? null,
    });
  }
}
