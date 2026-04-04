import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessCodesService } from '../../access-codes/access-codes.service';
import { isFounderEmail } from '../founder-access';

function isPublicRoute(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<{
    method?: string;
    originalUrl?: string;
    url?: string;
  }>();

  const method = request?.method?.toUpperCase() ?? '';
  if (method === 'OPTIONS') {
    return true;
  }

  const url = (request?.originalUrl ?? request?.url ?? '').split('?')[0];

  if (url === '/' || url === '/health' || url === '/status' || url === '/version') {
    return true;
  }

  return (
    url === '/auth/register' ||
    url === '/auth/login' ||
    url === '/auth/forgot-password' ||
    url === '/auth/reset-password' ||
    url === '/auth/redeem-access-code-and-login' ||
    url === '/auth/confirm' ||
    url === '/auth/resend-confirmation' ||
    url === '/auth/logout' ||
    url === '/analytics/event' ||
    url === '/preview/compatibility-score'
  );
}

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly accessCodesService: AccessCodesService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { userId?: string; id?: string; sub?: string; email?: string };
    }>();
    const userId =
      request?.user?.userId?.trim() ||
      request?.user?.id?.trim() ||
      request?.user?.sub?.trim() ||
      '';
    const email = request?.user?.email?.trim() || '';

    if (
      isFounderEmail(
        email,
        this.configService.get<string>('FOUNDER_EMAILS'),
      )
    ) {
      return true;
    }

    if (!userId) {
      throw new ForbiddenException('Access code required');
    }

    const hasActiveAccess =
      await this.accessCodesService.userHasActiveAccess(userId);

    if (!hasActiveAccess) {
      throw new ForbiddenException('Access code required');
    }

    return true;
  }
}
