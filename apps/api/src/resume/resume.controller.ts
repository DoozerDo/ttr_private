import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ResumeService } from './resume.service';

interface ResumeRequestBody {
  baselineId?: string;
  baselineVersionId?: string;
  jobId?: string;
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
    return this.handleResumeRequest(body, request);
  }

  @Post()
  async createResumeRequest(
    @Body() body: ResumeRequestBody,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    return this.handleResumeRequest(body, request);
  }

  private async handleResumeRequest(
    body: ResumeRequestBody,
    request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const baselineId = body.baselineId?.trim();
    const baselineVersionId = body.baselineVersionId?.trim();
    const jobId = body.jobId?.trim();

    if (!baselineId) {
      throw new BadRequestException('baselineId is required');
    }

    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }

    return this.resumeService.generateResume(userId, {
      baselineId,
      baselineVersionId: baselineVersionId ?? undefined,
      jobId,
    });
  }
}
