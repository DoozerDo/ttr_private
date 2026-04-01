import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

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
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    if (isPublicRoute(context)) {
      return true;
    }
    return super.canActivate(context);
  }
}
