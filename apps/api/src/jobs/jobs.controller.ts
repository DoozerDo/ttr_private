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
import { CreateJobInput, JobsService } from './jobs.service';

@Controller('jobs')
@UseGuards(AuthGuard('jwt'))
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  async createJob(
    @Body() body: Partial<CreateJobInput>,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const rawDescription = body.rawDescription?.trim();

    if (!rawDescription) {
      throw new BadRequestException('Job description is required');
    }

    return this.jobsService.createJob(userId, {
      title: body.title,
      company: body.company,
      rawDescription,
    });
  }

  @Get()
  async listJobs(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.jobsService.listJobsForUser(userId);
  }

  @Get(':id')
  async getJob(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.jobsService.getJobForUser(id, userId);
  }
}
