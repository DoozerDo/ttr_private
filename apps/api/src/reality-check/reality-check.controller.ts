import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CreateRealityCheckDto } from './dto/create-reality-check.dto';
import { GenerateRealityCheckDto } from './dto/generate-reality-check.dto';
import { RealityCheckService } from './reality-check.service';

@Controller('reality-check')
@UseGuards(AuthGuard('jwt'))
export class RealityCheckController {
  constructor(private readonly realityCheckService: RealityCheckService) {}

  @Get()
  async getLatestRealityCheck(
    @Query('jobId') jobId: string | undefined,
    @Query('baselineId') baselineId: string | undefined,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const trimmedJobId = jobId?.trim();
    const trimmedBaselineId = baselineId?.trim();

    if (!trimmedJobId || !trimmedBaselineId) {
      throw new BadRequestException('jobId and baselineId are required');
    }

    return this.realityCheckService.getLatestRealityCheck(
      userId,
      trimmedJobId,
      trimmedBaselineId,
    );
  }

  @Post()
  async createRealityCheck(
    @Body() body: CreateRealityCheckDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const jobId = body.jobId?.trim();
    const baselineId = body.baselineId?.trim();

    if (!jobId || !baselineId) {
      throw new BadRequestException('jobId and baselineId are required');
    }

    const answers = body.answers ?? [];

    return this.realityCheckService.createRealityCheck(
      userId,
      jobId,
      baselineId,
      answers,
    );
  }

  @Post('questions')
  async generateRealityCheckQuestions(
    @Body() body: GenerateRealityCheckDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const jobId = body.jobId?.trim();
    const baselineId = body.baselineId?.trim();

    if (!jobId || !baselineId) {
      throw new BadRequestException('jobId and baselineId are required');
    }

    return this.realityCheckService.prepareQuestionSet(
      userId,
      jobId,
      baselineId,
    );
  }
}
