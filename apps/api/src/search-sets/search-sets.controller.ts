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
import {
  assertFeatureAvailable,
  Entitlements,
  FeatureKey,
  resolveEntitlementsFromUser,
} from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

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
    @Req() request: TieredRequest,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const entitlements = resolveEntitlementsFromUser(request.user);
    assertFeatureAvailable(entitlements, FeatureKey.SEARCH_SET_RUN);

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
type TieredRequest = Request & {
  user?: {
    id?: string;
    subscriptionTier?: SubscriptionTier;
    entitlements?: Entitlements;
  };
};
