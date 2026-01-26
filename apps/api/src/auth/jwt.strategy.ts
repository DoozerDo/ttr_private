import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { getEntitlementsForTier } from '../features/feature-gates';
import type { AuthUserDto } from './dto/auth-response.dto';
import type { Request } from 'express';

type JwtPayload = {
  sub: string;
  email: string;
  subscriptionTier?: string;
};

const AUTH_COOKIE_NAME = 'ttr_token';

function extractTokenFromCookie(
  req: Request | undefined | null,
): string | null {
  if (!req) {
    return null;
  }

  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    if (name !== AUTH_COOKIE_NAME) continue;
    const value = trimmed.slice(separatorIndex + 1);
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

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
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractTokenFromCookie,
      ]),
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
