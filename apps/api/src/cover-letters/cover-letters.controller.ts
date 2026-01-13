import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { CoverLettersService } from './cover-letters.service';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';
import {
  assertFeatureAvailable,
  Entitlements,
  FeatureKey,
  resolveEntitlementsFromUser,
} from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

type TieredRequest = Request & {
  user?: {
    id?: string;
    subscriptionTier?: SubscriptionTier;
    entitlements?: Entitlements;
  };
};

@Controller('cover-letters')
@UseGuards(AuthGuard('jwt'))
export class CoverLettersController {
  constructor(private readonly coverLettersService: CoverLettersService) {}

  @Post('generate')
  async generate(@Body() body: GenerateCoverLetterDto, @Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    const entitlements = resolveEntitlementsFromUser(request.user);
    assertFeatureAvailable(entitlements, FeatureKey.COVER_LETTER_EXPORT);

    return this.coverLettersService.generateCoverLetter(userId, body);
  }

  @Get()
  async list(@Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    return this.coverLettersService.listCoverLetters(userId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    return this.coverLettersService.getCoverLetter(userId, id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() request: TieredRequest) {
    const userId = this.requireUserId(request);

    return this.coverLettersService.deleteCoverLetter(userId, id);
  }

  private requireUserId(request: TieredRequest) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return userId;
  }
}
