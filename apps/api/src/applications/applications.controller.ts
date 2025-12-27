import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import {
  ApplicationsService,
  ListApplicationsFilters,
} from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationStage } from './application.entity';

@Controller('applications')
@UseGuards(AuthGuard('jwt'))
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  async createApplication(
    @Body() body: CreateApplicationDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.applicationsService.createApplication(userId, body);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="applications.csv"')
  async exportApplications(
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.applicationsService.exportApplicationsToCsv(userId);
  }

  @Get()
  async listApplications(
    @Req() request: Request & { user?: { id?: string } },
    @Query('stage') stage?: ApplicationStage,
    @Query('company') company?: string,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const filters: ListApplicationsFilters = {};

    if (stage) {
      filters.stage = stage;
    }

    if (company) {
      filters.company = company;
    }

    return this.applicationsService.listApplicationsForUser(userId, filters);
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
    @Body() body: UpdateApplicationDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.applicationsService.updateApplication(id, userId, body);
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
