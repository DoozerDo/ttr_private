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
import { InterviewsService } from './interviews.service';
import { CreateInterviewResponseDto } from './dto/create-interview-response.dto';

@Controller('interviews')
@UseGuards(AuthGuard('jwt'))
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  async createInterview(
    @Body() body: any,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewsService.createInterview(userId, body);
  }

  @Get()
  async listInterviews(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewsService.listInterviewsForUser(userId);
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

    return this.interviewsService.getInterviewForUser(id, userId);
  }

  @Post('start')
  async startInterviewFromFitReview(
    @Body() body: { jobId?: string; baselineId?: string },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewsService.startInterviewFromFitReview(userId, {
      jobId: body.jobId,
      baselineId: body.baselineId,
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

    return this.interviewsService.updateInterview(id, userId, body);
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

    return this.interviewsService.deleteInterview(id, userId);
  }

  @Post(':id/responses')
  async createInterviewResponse(
    @Param('id') id: string,
    @Body() body: { responses?: CreateInterviewResponseDto[] },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const responses = (body?.responses?.length ? body.responses : []).filter(
      (response): response is CreateInterviewResponseDto =>
        Boolean(response?.question && response?.response),
    );

    if (responses.length === 0) {
      throw new BadRequestException('No responses provided');
    }

    const createdResponses = await Promise.all(
      responses.map((response) =>
        this.interviewsService.createInterviewResponse(id, userId, response),
      ),
    );

    return createdResponses.length === 1
      ? createdResponses[0]
      : createdResponses;
  }
}
