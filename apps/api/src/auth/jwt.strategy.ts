import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { getEntitlementsForUser } from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import type { AuthUserDto } from './dto/auth-response.dto';
import type { Request } from 'express';
import { AccessCodesService } from '../access-codes/access-codes.service';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { resolveAccountPrivileges } from './account-privileges';

type JwtPayload = {
  sub: string;
  email: string;
  subscriptionTier?: string;
  betaAccessApproved?: boolean;
};

const ACCESS_TOKEN_COOKIE = 'access_token';
const LEGACY_ACCESS_TOKEN_COOKIE = 'ttr_token'; // keep legacy name while rolling out the new cookie

function extractTokenFromCookie(
  req: Request | undefined | null,
): string | null {
  if (!req) {
    return null;
  }

  const cookieToken =
    (typeof req.cookies?.[ACCESS_TOKEN_COOKIE] === 'string' &&
      req.cookies?.[ACCESS_TOKEN_COOKIE]) ||
    (typeof req.cookies?.[LEGACY_ACCESS_TOKEN_COOKIE] === 'string' &&
      req.cookies?.[LEGACY_ACCESS_TOKEN_COOKIE]);
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
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
    if (
      name !== ACCESS_TOKEN_COOKIE &&
      name !== LEGACY_ACCESS_TOKEN_COOKIE
    ) {
      continue;
    }
    const value = trimmed.slice(separatorIndex + 1);
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly accessCodesService: AccessCodesService,
    private readonly adminUsersService: AdminUsersService,
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

    const privileges = await resolveAccountPrivileges({
      email: user.email,
      userId: user.id,
      founderEmailsRaw: this.configService.get<string>('FOUNDER_EMAILS'),
      isAdminUser: (userId) => this.adminUsersService.isAdmin(userId),
    });

    const betaAccessApproved = privileges.isPrivileged
      ? true
      : user?.id
        ? await this.accessCodesService.resolveBetaAccessApproved({
            userId: user.id,
            betaAccessApproved: user.betaAccessApproved,
          })
        : Boolean(user.betaAccessApproved);

    const entitlements = getEntitlementsForUser({
      subscriptionTier: privileges.isPrivileged
        ? SubscriptionTier.PRO
        : user.subscriptionTier,
      betaAccessApproved,
    });
    const resolvedTier = entitlements.effectiveTier;
    const resolvedRole = privileges.isPrivileged ? 'admin' : user.role;

    const { passwordHash, ...sanitizedUser } = user;

    return {
      ...sanitizedUser,
      role: resolvedRole,
      subscriptionTier: resolvedTier,
      entitlements,
      id: user.id,
      userId: user.id,
    };
  }
}

// Verification steps for jwt strategy:
// 1. Log in via the web UI and confirm `access_token` or legacy `ttr_token` cookie is set.
// 2. Request /admin/users; JwtStrategy should read the cookie and populate req.user.
// 3. AdminBypassGuard should then allow the request, returning the users list.
