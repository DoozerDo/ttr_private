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
import { Request } from 'express';
import {
  CreateInterviewResponseInput,
  CreateInterviewSessionInput,
  InterviewsService,
} from './interviews.service';

@Controller('interviews')
@UseGuards(AuthGuard('jwt'))
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  async createSession(
    @Body() body: Partial<CreateInterviewSessionInput>,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const baselineId = body.baselineId?.trim();

    if (!baselineId) {
      throw new BadRequestException('Baseline ID is required');
    }

    return this.interviewsService.createSession(userId, {
      baselineId,
      jobId: body.jobId,
    });
  }

  @Post(':id/responses')
  async addResponses(
    @Param('id') id: string,
    @Body()
    body: {
      responses?: CreateInterviewResponseInput[];
    },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const responses = body.responses?.filter(
      (entry) => entry.question?.trim() && entry.response?.trim(),
    );

    if (!responses || responses.length === 0) {
      throw new BadRequestException('Responses are required');
    }

    return this.interviewsService.addResponses(id, userId, responses);
  }

  @Get(':id')
  async getSession(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewsService.getSessionWithResponses(id, userId);
  }
}
