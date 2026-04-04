import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { CreateOpportunityFromFitReviewDto } from './dto/create-opportunity-from-fit-review.dto';
import { CreateOpportunityFromStudioDto } from './dto/create-opportunity-from-studio.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { ListOpportunitiesDto } from './dto/list-opportunities.dto';
import { RescoreOpportunitiesDto } from './dto/rescore-opportunities.dto';
import { UpdateOpportunityStatusDto } from './dto/update-opportunity-status.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

@Controller('opportunities')
@UseGuards(AuthGuard('jwt'))
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  async create(
    @Body() body: CreateOpportunityDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.upsertOpportunity(userId, body);
  }

  @Post('from-resume-studio')
  async createFromResumeStudio(
    @Body() body: CreateOpportunityFromStudioDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.createFromResumeStudio(userId, body);
  }

  @Post('from-fit-review-override')
  async createFromFitReviewOverride(
    @Body() body: CreateOpportunityFromFitReviewDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.createFromFitReviewOverride(userId, body);
  }

  @Get()
  async list(
    @Req() request: Request & { user?: { id?: string } },
    @Query() query: ListOpportunitiesDto,
  ) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.listSimpleForUser(userId, query);
  }

  @Get('grouped')
  async listGrouped(@Req() request: Request & { user?: { id?: string } }) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.listGroupedByCompany(userId);
  }

  @Get('actions-needed')
  async actionsNeeded(@Req() request: Request & { user?: { id?: string } }) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.getActionsNeeded(userId);
  }

  @Post('rescore')
  async rescore(
    @Req() request: Request & { user?: { id?: string } },
    @Body() body: RescoreOpportunitiesDto,
  ) {
    const userId = this.resolveUserId(request);
    const scoreByOpportunityId = Object.fromEntries(
      (body.scores ?? []).map((entry) => [entry.opportunityId, entry.score]),
    ) as Record<string, number>;

    return this.opportunitiesService.runBoundaryRescoreFromOverrides(
      userId,
      scoreByOpportunityId,
      body.baselineVersionUsed,
    );
  }

  @Post('dormancy/sweep')
  async runDormancySweep(@Req() request: Request & { user?: { id?: string } }) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.runDormancySweep(userId);
  }

  @Get('export')
  async export(
    @Req() request: Request & { user?: { id?: string } },
    @Query('format') format: string | undefined,
    @Res() response: Response,
  ) {
    const userId = this.resolveUserId(request);
    const normalized = (format ?? 'csv').trim().toLowerCase();
    if (normalized !== 'csv' && normalized !== 'json') {
      throw new BadRequestException('format must be csv or json');
    }

    const payload = await this.opportunitiesService.exportForUser(
      userId,
      normalized as 'csv' | 'json',
    );

    if (normalized === 'json') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="opportunities.json"',
      );
      response.send(payload);
      return;
    }

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="opportunities.csv"',
    );
    response.send(payload);
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.getByIdForUser(id, userId);
  }

  @Patch(':id/status')
  async transitionStatus(
    @Param('id') id: string,
    @Body() body: UpdateOpportunityStatusDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.transitionStatus(id, userId, body.status, {
      manualReset: body.manualReset,
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateOpportunityDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = this.resolveUserId(request);
    return this.opportunitiesService.updateOpportunity(id, userId, body);
  }

  private resolveUserId(request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }
    return userId;
  }
}

