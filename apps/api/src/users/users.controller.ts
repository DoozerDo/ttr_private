import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { UpdateSubscriptionTierDto } from './dto/update-subscription-tier.dto';
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
