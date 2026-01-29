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
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DevUserGuard } from '../auth/dev-user.guard';
import { JobTrackerService } from './job-tracker.service';
import { CreateJobTrackerEntryDto } from './dto/create-job-tracker-entry.dto';
import { UpdateJobTrackerEntryDto } from './dto/update-job-tracker-entry.dto';

@Controller('job-tracker')
@UseGuards(DevUserGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class JobTrackerController {
  constructor(private readonly jobTrackerService: JobTrackerService) {}

  @Post()
  async createEntry(
    @Body() dto: CreateJobTrackerEntryDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.jobTrackerService.createEntry(userId, dto);
  }

  @Get()
  async listEntries(@Req() request: Request & { user?: { id?: string } }) {
    const userId = this.resolveUserId(request);
    return this.jobTrackerService.listEntriesForUser(userId);
  }

  @Get('export.csv')
  async exportEntries(
    @Req() request: Request & { user?: { id?: string } },
    @Res() response: Response,
  ) {
    const userId = this.resolveUserId(request);
    const result = await this.jobTrackerService.exportEntries(userId);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="job-tracker-export.csv"',
    );
    if (result.auditId) {
      response.setHeader('X-Compliance-Audit-Id', result.auditId);
    }
    response.send(result.csv);
  }

  @Get(':id')
  async getEntry(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.jobTrackerService.getEntryForUser(id, userId);
  }

  @Patch(':id')
  async updateEntry(
    @Param('id') id: string,
    @Body() dto: UpdateJobTrackerEntryDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.jobTrackerService.updateEntry(id, userId, dto);
  }

  @Delete(':id')
  async deleteEntry(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.jobTrackerService.deleteEntry(id, userId);
  }

  private resolveUserId(request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }
    return userId;
  }
}
