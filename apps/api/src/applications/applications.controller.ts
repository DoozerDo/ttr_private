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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { ApplicationsService } from './applications.service';

@Controller('applications')
@UseGuards(AuthGuard('jwt'))
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  async createApplication(
    @Body() dto: any,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }
    return this.applicationsService.createApplication(userId, dto);
  }

  @Get()
  async listApplications(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }
    return this.applicationsService.listApplicationsForUser(userId);
  }

  @Get('export')
  async exportApplications(
    @Req() request: Request & { user?: { id?: string } },
    @Res() response: Response,
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const file = await this.applicationsService.exportApplicationsToCsv(userId);

    response.setHeader('Content-Type', 'text/csv');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="applications.csv"',
    );
    response.setHeader('X-Compliance-Audit-Id', file.auditId);
    if (file.baselineVersionHash) {
      response.setHeader('X-Baseline-Version-Hash', file.baselineVersionHash);
    }
    response.send(file.csv);
  }

  @Get(':id')
  async getApplication(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }
    return this.applicationsService.getApplicationForUser(id, userId);
  }

  @Patch(':id')
  async updateApplication(
    @Param('id') id: string,
    @Body() dto: any,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }
    return this.applicationsService.updateApplication(id, userId, dto);
  }

  @Delete(':id')
  async deleteApplication(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }
    return this.applicationsService.deleteApplication(id, userId);
  }
}
