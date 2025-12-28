import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

interface ResumeRequestBody {
  baselineId?: string;
  jobId?: string;
}

@Controller('resume')
@UseGuards(AuthGuard('jwt'))
export class ResumeController {
  @Post()
  async createResumeRequest(
    @Body() body: ResumeRequestBody,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const baselineId = body.baselineId?.trim();
    const jobId = body.jobId?.trim();

    if (!baselineId) {
      throw new BadRequestException('baselineId is required');
    }

    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }

    return {
      ok: true,
      baselineId,
      jobId,
      message: 'Resume generation request received',
    };
  }
}
