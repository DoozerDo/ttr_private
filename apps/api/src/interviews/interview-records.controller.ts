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
import { CreateInterviewRecordDto } from './dto/create-interview.dto';
import { ApplyAdditionDecisionsDto } from './dto/apply-addition-decisions.dto';
import { CreateInterviewAcceptedAdditionDto } from './dto/create-accepted-addition.dto';
import { UpdateInterviewRecordDto } from './dto/update-interview.dto';
import { UpdateAcceptedAdditionsDto } from './dto/update-accepted-additions.dto';
import { InterviewRecordsService } from './interview-records.service';

@Controller('interview-records')
@UseGuards(AuthGuard('jwt'))
export class InterviewRecordsController {
  constructor(private readonly interviewRecordsService: InterviewRecordsService) {}

  @Post()
  async createInterviewRecord(
    @Body() body: CreateInterviewRecordDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.createInterviewRecord(userId, body);
  }

  @Get()
  async listInterviewRecords(
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.listInterviewRecordsForUser(userId);
  }

  @Get(':id')
  async getInterviewRecord(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.getInterviewRecordForUserResponse(id, userId);
  }

  @Get(':id/recommended-additions')
  async getRecommendedAdditions(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.listRecommendedAdditions(id, userId);
  }

  @Get(':id/accepted-additions')
  async getAcceptedAdditions(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.listAcceptedAdditions(id, userId);
  }

  @Post(':id/accepted-additions')
  async acceptAddition(
    @Param('id') id: string,
    @Body() body: CreateInterviewAcceptedAdditionDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.acceptRecommendation(id, userId, body);
  }

  @Patch(':id')
  async updateInterviewRecord(
    @Param('id') id: string,
    @Body() body: UpdateInterviewRecordDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.updateInterviewRecord(id, userId, body);
  }

  @Post(':id/decisions')
  async applyAdditionDecisions(
    @Param('id') id: string,
    @Body() body: ApplyAdditionDecisionsDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.applyAdditionDecisions(id, userId, body);
  }

  @Patch(':id/accepted-additions')
  async updateAcceptedAdditions(
    @Param('id') id: string,
    @Body() body: UpdateAcceptedAdditionsDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.updateAcceptedAdditions(
      id,
      userId,
      body?.acceptedAdditionIds ?? [],
    );
  }

  @Post(':id/compute-expanded-fit')
  async computeExpandedFit(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.computeExpandedFit(id, userId);
  }

  @Post(':id/promote-accepted-additions')
  async promoteAcceptedAdditions(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.promoteAcceptedAdditions(id, userId);
  }

  @Delete(':id')
  async deleteInterviewRecord(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.interviewRecordsService.deleteInterviewRecord(id, userId);
  }
}
