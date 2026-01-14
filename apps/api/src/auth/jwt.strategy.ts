import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { getEntitlementsForTier } from '../features/feature-gates';
import type { AuthUserDto } from './dto/auth-response.dto';

type JwtPayload = {
  sub: string;
  email: string;
  subscriptionTier?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      // Fail fast if misconfigured instead of letting it be undefined
      throw new Error('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUserDto> {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const entitlements = getEntitlementsForTier(user.subscriptionTier);

    const { passwordHash, ...sanitizedUser } = user;

    return {
      ...sanitizedUser,
      entitlements,
    };
  }
}
