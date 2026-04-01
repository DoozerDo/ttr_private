import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { UpdateSubscriptionTierDto } from './dto/update-subscription-tier.dto';
import { UpdateLastAssessmentDto } from './dto/update-last-assessment.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { UserRole } from './user.entity';
import { Entitlements } from '../features/feature-gates';

type UserRequest = Request & {
  user?: {
    id?: string;
    email?: string;
    role?: UserRole;
    subscriptionTier?: SubscriptionTier;
    entitlements?: Entitlements;
  };
};

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@Req() request: UserRequest) {
    const user = request.user;

    if (!user) {
      throw new BadRequestException('Invalid user context');
    }

    return user;
  }

  @Get('me/last-assessment')
  async getLastAssessment(@Req() request: UserRequest) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { lastAssessmentId: user.lastAssessmentId ?? null };
  }

  @Patch('me/last-assessment')
  async updateLastAssessment(
    @Body() body: UpdateLastAssessmentDto,
    @Req() request: UserRequest,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const updated = await this.usersService.updateLastAssessmentId(
      userId,
      body.assessmentId ?? null,
    );

    return { lastAssessmentId: updated.lastAssessmentId ?? null };
  }


  @Patch('me/profile')
  async updateMyProfile(
    @Body() body: UpdateProfileDto,
    @Req() request: UserRequest,
  ) {
    const user = request.user;

    if (!user?.id) {
      throw new BadRequestException('Invalid user context');
    }

    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const company = body.company?.trim();
    const roleTitle = body.roleTitle?.trim();
    const linkedinUrl = body.linkedinUrl?.trim();
    const intendedUse = body.intendedUse?.trim();
    const studioResumeFocusDefault = body.studioResumeFocusDefault?.trim();

    const updated = await this.usersService.updateMyProfile(user.id, {
      firstName,
      lastName,
      roleTitle,
      company,
      linkedinUrl,
      intendedUse,
      studioResumeFocusDefault,
    });

    const { passwordHash, ...sanitized } = updated;
    return sanitized;
  }

  @Patch('me/subscription-tier')
  async updateSubscriptionTier(
    @Body() body: UpdateSubscriptionTierDto,
    @Req() request: UserRequest,
  ) {
    const user = request.user;

    if (!user?.id) {
      throw new BadRequestException('Invalid user context');
    }

    const isProd = process.env.NODE_ENV === 'production';
    const isAdmin = user.role === 'admin';

    if (isProd && !isAdmin) {
      throw new ForbiddenException(
        'Subscription tier updates are disabled in production.',
      );
    }

    const requested = (body.tier ?? '').trim().toUpperCase();

    if (
      !Object.values(SubscriptionTier).includes(requested as SubscriptionTier)
    ) {
      throw new BadRequestException('Invalid subscription tier');
    }

    const updated = await this.usersService.updateSubscriptionTier(
      user.id,
      requested as SubscriptionTier,
    );

    const { passwordHash, ...sanitized } = updated;
    return sanitized;
  }
}
