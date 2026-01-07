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
import { Request } from 'express';
import { CreateSearchSetDto } from './dto/create-search-set.dto';
import { UpdateSearchSetDto } from './dto/update-search-set.dto';
import { SearchSetsRunnerService } from './search-sets-runner.service';
import { SearchSetsService } from './search-sets.service';

@Controller('search-sets')
@UseGuards(AuthGuard('jwt'))
export class SearchSetsController {
  constructor(
    private readonly searchSetsService: SearchSetsService,
    private readonly searchSetsRunnerService: SearchSetsRunnerService,
  ) {}

  @Post()
  async createSearchSet(
    @Body() body: CreateSearchSetDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.searchSetsService.createSearchSet(userId, body);
  }

  @Get()
  async listSearchSets(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.searchSetsService.listSearchSetsForUser(userId);
  }

  @Get(':id')
  async getSearchSet(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.searchSetsService.getSearchSetForUser(id, userId);
  }

  @Patch(':id')
  async updateSearchSet(
    @Param('id') id: string,
    @Body() body: UpdateSearchSetDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.searchSetsService.updateSearchSet(id, userId, body);
  }

  @Delete(':id')
  async deleteSearchSet(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.searchSetsService.deleteSearchSet(id, userId);
  }

  @Post(':id/run')
  async runSearchSet(
    @Param('id') id: string,
    @Body() body: { limit?: number; baselineVersionId?: string },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const baselineVersionId = body?.baselineVersionId?.trim();
    if (!baselineVersionId) {
      throw new BadRequestException(
        'baselineVersionId is required to run a search set',
      );
    }

    const limit = typeof body?.limit === 'number' ? body.limit : undefined;

    return this.searchSetsRunnerService.runSearchSet(
      id,
      userId,
      baselineVersionId,
      limit,
    );
  }

  @Post('parse-url')
  async parseSearchSetUrl(
    @Body() body: { url?: string },
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const rawUrl = body?.url?.trim();
    if (!rawUrl) {
      throw new BadRequestException('url is required');
    }

    return this.searchSetsService.parseSearchSetUrl(rawUrl);
  }
}
