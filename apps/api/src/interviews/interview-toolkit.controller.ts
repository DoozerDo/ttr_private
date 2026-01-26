import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { InterviewToolkitService } from './interview-toolkit.service';

@UseGuards(AuthGuard('jwt'))
@Controller('interview-toolkit')
export class InterviewToolkitController {
  constructor(
    private readonly interviewToolkitService: InterviewToolkitService,
  ) {}

  @Get(':jobId/study-packet')
  async getStudyPacket(
    @Param('jobId') jobId: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    if (!jobId?.trim()) {
      throw new BadRequestException('jobId is required');
    }

    return this.interviewToolkitService.buildStudyPacket(userId, jobId.trim());
  }

  @Post(':jobId/follow-up')
  async generateFollowUp(
    @Param('jobId') jobId: string,
    @Body() body: { notes?: string; baselineVersionId?: string },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    if (!jobId?.trim()) {
      throw new BadRequestException('jobId is required');
    }

    return this.interviewToolkitService.generateFollowUp(
      userId,
      jobId.trim(),
      body?.baselineVersionId,
      body?.notes,
    );
  }
}
