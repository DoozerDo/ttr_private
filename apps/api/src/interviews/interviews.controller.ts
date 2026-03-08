import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { InterviewRecordsService } from './interview-records.service';

@Controller('interviews')
@UseGuards(AuthGuard('jwt'))
export class InterviewsController {
  // LEGACY COMPATIBILITY: not used by the active beta path.
  // This controller remains as a wrapper that delegates to InterviewRecordsService.
  constructor(
    private readonly interviewRecordsService: InterviewRecordsService,
  ) {}

  @Post()
  async createInterview(
    @Body() body: any,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.createInterview(userId, body);
  }

  @Get()
  async listInterviews(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.getInterviewsForUser(userId);
  }

  @Get(':id')
  async getInterview(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.getInterviewById(userId, id);
  }

  @Post('start')
  async startInterviewFromFitReview(
    @Body()
    body: {
      jobId?: string;
      baselineId?: string;
      baselineVersionId?: string;
    },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.startInterviewFromFitReview(userId, {
      jobId: body.jobId,
      baselineId: body.baselineId,
      baselineVersionId: body.baselineVersionId,
    });
  }

  @Patch(':id')
  async updateInterview(
    @Param('id') id: string,
    @Body() body: any,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.updateInterviewRecord(id, userId, body);
  }

  @Delete(':id')
  async deleteInterview(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.deleteInterviewRecord(id, userId);
  }

  @Post(':id/responses')
  async saveInterviewResponses(
    @Param('id') id: string,
    @Body() body: { responses?: unknown[] },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.saveInterviewResponses(id, userId, {
      responses: body?.responses,
    });
  }
}
